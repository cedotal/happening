// require express and create express object
var express = require('express');
var app = express();

var fs = require('fs');

var indexRoute = function(req, res) {
    console.log('indexRoute running');
    fs.readFile('public/index.html', 'utf8', function(err, data) {
        req.path = '/';
        res.set('Content-Type', 'text/html');
        console.log(data)
        res.send(data);
    });
};

var themesSplatRoute = function(req, res) {
    res.send('<!DOCTYPE html><div>1</div><div>2</div>');
};

// TODO: return these with proper MIME type header for css files
app.use('/css', express.static(__dirname + '/public/css'));

// TODO: return these with proper MIME type header for js files
app.use('/js', express.static(__dirname + '/public/js'));

// TODO: doubling up these routes to get this to work is an ugly, reprehensible hack

// TODO: return these with proper MIME type header for css files
app.use('/themes/css', express.static(__dirname + '/public/css'));

// TODO: return these with proper MIME type header for js files
app.use('/themes/js', express.static(__dirname + '/public/js'));

app.get('/', indexRoute);

// TODO: when index.html looks for "js/app.js" on this route, it's getting index.html returned because of the above route
app.get('/themes/*', indexRoute);

app.listen(3001);
