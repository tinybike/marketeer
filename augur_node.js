var http = require("http");
var getopt = require("posix-getopt");
var chalk = require("chalk");
var express = require('express');
var mark = require("./");

var config = {
    ethereum: "http://localhost:8545",
    leveldb: "./data/marketsdb",
    limit: null,
    filtering: true,
    interval: null,
    scan: true,
}

function log(str) {
    console.log(chalk.cyan.dim("[augur]"), str);
}

var app = express();

function isPositiveInt(str) {
    var n = ~~Number(str);
    return String(n) === str && n >= 0;
}

app.get('/getMarkets', function (req, res) {
    mark.getMarkets(function (err, markets){
        if (err) console.log(err); //TODO: send error
        res.send(markets);
    });
});


function runserver(protocol, port) {
    app.listen(port, function() {
        log("Listening on port " + port);
    });
}

(function init(args) {
    var opt, port, protocol, parser;
    parser = new getopt.BasicParser("s(ssl)p:(port)", args);
    while ( (opt = parser.getopt()) !== undefined) {
        switch (opt.option) {
            case 's':
                protocol = "https";
                break;
            case 'p':
                port = opt.optarg;
                break;
        }
    }
    
    mark.scan(config, function (err, numUpdates) {
        if (err) throw err;
        log(numUpdates + " markets have been updated!");
    });

    runserver(protocol || "http", port || process.env.PORT || 8546);
})(process.argv);
