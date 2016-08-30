var http = require("http");
var getopt = require("posix-getopt");
var chalk = require("chalk");
var express = require('express');
var join = require("path").join;
var mark = require("./");

var dbname = "augur_cache_db";

var config = {
    http: "http://localhost:8545",
    //ws: "ws://127.0.0.1:8546",
    ws: null,
    db: "./" + dbname,
    //ipc: process.env.GETH_IPC || join(DATADIR, "geth.ipc"),
    limit: null,
    filtering: true,
    scan: true,
}

var app = express();

function log(str) {
     console.log(chalk.cyan.dim("[augur]"), str);
}

function timestamp(s) {
    return chalk.cyan.dim((new Date()).toString() + ": ") + s;
}

function isPositiveInt(str) {
    var n = ~~Number(str);
    return String(n) === str && n >= 0;
}

app.get('/getMarketsInfo', function (req, res) {
    var branch = req.query['branch'] || null;
    mark.getMarketsInfo(branch, function (err, markets){
        if (err){
            return res.status(500).send({ error: err });
        }
        return res.send(markets);
    });
});

app.get('/getMarketInfo', function (req, res) {
    var id = req.query['id']
    if (!id) res.status(500).send({ error: "You must specify an ID" });
    mark.getMarketInfo(id, function (err, market){
        if (err){
            return res.status(500).send({ error: err });
        }
        return res.send(market);
    });
});

app.get('/batchGetMarketInfo', function (req, res) {
    var idsParam = req.query['ids'];
    if (!idsParam) return res.status(500).send({ error: "You must specify a list of ids" });
    var ids = idsParam.split(',');
    mark.batchGetMarketInfo(ids, function (err, markets) {
        if (err){
            return res.status(500).send({ error: err });
        }
        return res.send(markets);
    });
});

app.get('/getMarketPriceHistory', function (req, res) {
    var id = req.query['id'];
    if (!id) res.status(500).send({ error: "You must specify an id" });

    //optional params
    var to = req.query['toBlock'];
    var from = req.query['fromBlock'];

    if (!to && !from){
        mark.getMarketPriceHistory(id, function (err, history) {
            if (err){
                return res.status(500).send({ error: err });
            }
            return res.send(history);
        });        
    }else{
        //if to/from aren't numbers, pass in null instaead
        to = parseInt(to);
        from = parseInt(from);
        if (isNaN(to)) to = null;
        if (isNaN(from)) from = null;

        var options = {
            toBlock: to,
            fromBlock: from
        }
        mark.getMarketPriceHistory(id, options, function (err, history) {
            if (err){
                return res.status(500).send({ error: err });
            }
            return res.send(history);
        });
    }
});

app.get('/getAccountTrades', function (req, res) {
    var id = req.query['id'];
    if (!id) res.status(500).send({ error: "You must specify an id" });

    //optional params
    var to = req.query['toBlock'];
    var from = req.query['fromBlock'];

    if (!to && !from){
        mark.getAccountTrades(id, function (err, trades) {
            if (err){
                return res.status(500).send({ error: err });
            }
            return res.send(trades);
        });        
    }else{
        //if to/from aren't numbers, pass in null instaead
        to = parseInt(to);
        from = parseInt(from);
        if (isNaN(to)) to = null;
        if (isNaN(from)) from = null;

        var options = {
            toBlock: to,
            fromBlock: from
        }
        mark.getAccountTrades(id, options, function (err, trades) {
            if (err){
                return res.status(500).send({ error: err });
            }
            return res.send(trades);
        });
    }
});

process.on("uncaughtException", function (e) {
    log(timestamp(chalk.red("Uncaught exception\n")));
    try {
        log(e.toString());
        log(e.stack.toString());
    } catch (exc) {
        console.log(exc);
    }
    log('\n');
    process.exit(1);
});

process.on("exit", function (code) {
     mark.unwatch( () => {
        mark.disconnect( () => {
            log(timestamp(chalk.red("Augur node shut down (" + code.toString() + ")\n")));
        });
    });
});

process.on("SIGINT", function () {
    mark.unwatch( () => {
        mark.disconnect( () => {
            log(timestamp(chalk.red("Augur node shut down (SIGINT)\n")));
            process.exit(2);
        })
    })    
});

function runserver(protocol, port) {
    app.listen(port, function() {
        log("Listening on port " + port);
    });
}

(function init(args) {
    var opt, port, protocol, parser;
    parser = new getopt.BasicParser("n(noscan)s(ssl)p:(port)d:(datadir)", args);
    while ( (opt = parser.getopt()) !== undefined) {
        switch (opt.option) {
            case 's':
                protocol = "https";
                break;
            case 'p':
                port = opt.optarg;
                break;
            case 'n':
                config.scan = null;
                break;
            case 'd':
                dir = opt.optarg;
                config.db = dir + dbname;
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