var http = require("http");
var getopt = require("posix-getopt");
var chalk = require("chalk");
var express = require('express');
var join = require("path").join;
var mark = require("./");

var config = {

    http: "http://localhost:8545",
    ws: "http://127.0.0.1:8546",
    leveldb: "./data/marketsdb",
    //ipc: process.env.GETH_IPC || join(DATADIR, "geth.ipc"),
    limit: 5,
    filtering: true,
    interval: null,
    scan: false,
}

function log(str) {
    console.log(chalk.cyan.dim("[augur]"), str);
}

var app = express();

function isPositiveInt(str) {
    var n = ~~Number(str);
    return String(n) === str && n >= 0;
}

app.get('/getMarketsInfo', function (req, res) {
    mark.getMarketsInfo('0xf69b5', function (err, markets){
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
    //to be safe, rescan on every restart. Markets might have updated
    //when node was down.
    mark.watch(config, function (err, numUpdates) {
        if (err) throw err;
        log(numUpdates + " markets have been updated!");
        runserver(protocol || "http", port || process.env.PORT || 8547);
    });

})(process.argv);
