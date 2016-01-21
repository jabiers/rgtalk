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

var waiting = [];
var connectionCount = 0;
var message = {};

upload.configure({
	uploadDir: __dirname + '/public/uploads',
	uploadUrl: '/uploads',
	imageVersions: {
		thumbnail: {
			width: 80,
			height: 80
		}
	}
});

upload.on("begin", function(fileInfo) {
  fileInfo.name = crypto.createHash('md5').update(fileInfo.originalName).digest('hex') + path.extname(fileInfo.originalName);
});

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

app.use('/upload', function(req, res, next){
    upload.fileHandler({
        uploadDir: function () {
            return __dirname + '/public/uploads/'
        },
        uploadUrl: function () {
            return '/uploads'
        }
    })(req, res, next);
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

http.listen(3000, function() {
	console.log('listening on *:3000');
});
