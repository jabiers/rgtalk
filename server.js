var express = require('express');
var bodyParser = require('body-parser');

var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var ua = require('universal-analytics');
var visitor = ua('UA-72646153-1');
var upload = require('jquery-file-upload-middleware');
var crypto = require('crypto');
var path = require('path');
var azure = require('azure-storage');
var uuid = require('node-uuid');
var entityGen = azure.TableUtilities.entityGenerator;
var nconf = require('nconf');
var multiparty = require('multiparty');
var Busboy = require('busboy');

// nconf.env().file({ file: 'config.json', search: true });
// var tableName = nconf.get("TABLE_NAME");
// var partitionKey = nconf.get("PARTITION_KEY");
// var accountName = nconf.get("STORAGE_NAME");
// var accountKey = nconf.get("STORAGE_KEY");
// var accessKey = nconf.get("ACCESS_KEY");
// var connectingString = nconf.get("CONNECTING_STRING");


var waiting = [];
var connectionCount = 0;
var message = {};
//
// upload.configure({
// 	uploadDir: __dirname + '/public/uploads',
// 	uploadUrl: '/uploads',
// 	imageVersions: {
// 		thumbnail: {
// 			width: 80,
// 			height: 80
// 		}
// 	}
// });
//
// upload.on("begin", function(fileInfo) {
// 	fileInfo.name = crypto.createHash('md5').update(fileInfo.originalName).digest('hex') + path.extname(fileInfo.originalName);
// });

app.use(ua.middleware("UA-72646153-1", {cookieName: '_ga'}));
app.use(express.static('public'));
app.use(bodyParser.json());

/// Redirect all to home except post
app.get('/upload', function( req, res ){
	res.redirect('/');
});

app.put('/upload', function( req, res ){
	res.redirect('/');
});

app.delete('/upload', function( req, res ){
	res.redirect('/');
});


app.post('/upload', function(req, res, next){

	console.log('/upload');
	var blobSvc = azure.createBlobService();
	//create write stream for blob

	var date = new Date();
	var year = date.getFullYear();

	var month = date.getMonth() + 1;
	month = (month < 10 ? "0" : "") + month;

	var day  = date.getDate();
	day = (day < 10 ? "0" : "") + day;

	var containername = year + '-' + month + '-' + day;
	console.log(containername);
	blobSvc.createContainerIfNotExists(containername, {publicAccessLevel : 'blob'}, function (error, result, response) {

		if (!error) {
			// Container exists and allows
			// anonymous read access to blob
			// content and metadata within this container

			var busboy = new Busboy({ headers: req.headers });
			var newname;
			busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {

				filename = crypto.createHash('md5').update(filename).digest('hex') + path.extname(filename);
				newname = containername + '/' + filename;
				var stream = blobSvc.createWriteStreamToBlockBlob(
					containername,
					filename);
					//pipe req to Azure BLOB write stream
					file.pipe(stream);
				});

				busboy.on('finish', function () {
					console.log('finish');
					// res.redirect(redirect.replace(/%s/, encodeURIComponent(JSON.stringify(files))));
					res.set({
						'Content-Type': (req.headers.accept || '').indexOf('application/json') !== -1
						? 'application/json'
						: 'text/plain'
					});
					res.json(200, {"files":[{"name":newname}]});

					// res.writeHead(200, { 'Connection': 'close' });
					// res.end("That's all folks!");
				});

				req.pipe(busboy);

				req.on('error', function (error) {
					//KO - handle piping errors
					console.log('error: ' + error);
				});
				req.once('end', function () {
					//OK
				});
			}

		});
		//
		// upload.fileHandler({
		// 	uploadDir: function () {
		// 		return __dirname + '/public/uploads/'
		// 	},
		// 	uploadUrl: function () {
		// 		return '/uploads'
		// 	}
		// })(req, res, next);
	});

	app.get('/', function (req,res) {
		visitor.pageview("/").send();
		res.sendFile(__dirname + '/index.html');
	});

	io.on('connection', function(socket){
		connectionCount++;
		socket.on('chat message', function(msg) {
			io.to(msg.room).emit('chat message', { "name":msg.name, "msg":msg.msg } );
		});

		socket.on('send image', function(msg) {
			io.to(msg.room).emit('send image', { "imgUrl":msg.imgUrl,"name":msg.name } );
		});

		socket.on('disconnect', function() {
			connectionCount--;
			var index = waiting.indexOf(socket);
			if (index > -1) {
				waiting.splice(index, 1);
			}

			message['disconnect room'] = socket.room;
			if (socket.room) {
				io.to(socket.room).emit('destory room', socket.room);
			}
		});

		socket.on('waiting', function(name) {
			socket.name = name;
			if (socket.room) {
				socket.leave(socket.room);
			}

			var index = waiting.indexOf(socket);
			if (index < 0) {
				waiting.push(socket);
			}
		});

		socket.on('join', function(obj) {
			if(socket.room)
			socket.leave(socket.room);

			socket.name = obj.name;
			socket.room = obj.room;
			socket.join(obj.room);
			var index = waiting.indexOf(socket);
			if (index > -1) {
				waiting.splice(index, 1);
			}
		});

		socket.on('leave', function(room) {

			if (socket.room) {
				socket.leave(socket.room);
				io.to(socket.room).emit('destory room', socket.room);
			}
		});

		socket.on('destory room', function(room) {
			if (socket.room) {
				socket.leave(socket.room);
			}

			var index = waiting.indexOf(socket);
			if (index < 0) {
				waiting.push(socket);
			}
		});

		socket.on('get info', function() {
			socket.emit('info', {"waitingUser":waiting.length, "users":connectionCount, "total":100, "rooms":socket.adapter.rooms.length});

		});
	});

	//방 생성
	setInterval(function(){
		for(var i = 1; i < waiting.length; i = i + 2) {
			if (i > waiting.length) {
			} else {
				emitJoin(waiting[i - 1], waiting[i]);
			}
		}

		function emitJoin(soc1, soc2) {
			soc1.emit('join', {"room":"random:" + soc1.id + soc2.id, "name":soc2.name});
			soc2.emit('join', {"room":"random:" + soc1.id + soc2.id, "name":soc1.name});
		}
		message['waiting'] = waiting.length;
		message['rooms'] = io.sockets.adapter.rooms;
		io.sockets.emit("test", message);
	}, 1000);

	//정보 갱신
	setInterval(function(){
		var rooms = io.sockets.adapter.rooms;
		var roomCount = 0;
		for (var roomName in rooms) {
			if (stringStartsWith(roomName, "random")) {
				roomCount++;
			}
		}
		io.sockets.emit("info", {"waitingUser":waiting.length, "users":connectionCount, "total":100, "rooms":roomCount});

	}, 10000);

	function stringStartsWith (string, prefix) {
		return string.slice(0, prefix.length) == prefix;
	}

	http.listen(process.env.PORT || 8080, function() {
		console.log('listening on *:');
	});
