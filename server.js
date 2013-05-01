// require express and create express object
var express = require('express');
var app = express();

var fs = require('fs');

var indexRoute = function(req, res) {
    fs.readFile('public/index.html', 'utf8', function(err, data) {
        res.set('Content-Type', 'text/html');
        res.send(data);
    });
};

var themesSplatRoute = function(req, res) {
    res.send('themesSplatRoute');
};

app.use('/css', express.static(__dirname + '/public/css'));
app.use('/js', express.static(__dirname + '/public/js'));

app.get('/', indexRoute);
app.get('/themes/*', indexRoute);

app.listen(3001);
