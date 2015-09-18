#!/usr/bin/env node

"use strict";

var join = require("path").join;
var createWriteStream = require("fs").createWriteStream;
var mark = require("./");

var config = {
    ethereum: "http://127.0.0.1:8545",
    mongodb: "mongodb://localhost:27017/marketeer?poolSize=5&noDelay=true&connectTimeoutMS=0&socketTimeoutMS=0",
    limit: 0,
    filtering: true,
    scan: false
};

mark.debug = true;

// var log = createWriteStream(join(__dirname, "marketeer.log"), { flags : 'a' });
var log = process.stdout;

function has_value(o, v) {
    for (var p in o) {
        if (o.hasOwnProperty(p)) {
            if (o[p] === v) return p;
        }
    }
}

function timestamp(s) {
    return (new Date()).toString() + ": " + s.toString();
}

log.write(timestamp("Marketeer started\n"));
log.write(" - Blockchain: " + config.ethereum + '\n');
log.write(" - Database:   " + config.mongodb + '\n');
log.write(" - Filtering:  " + config.filtering + '\n');
log.write(" - Limit:      " + config.limit + '\n');

mark.watch(config, function (err, code, data) {
    if (err) return log.write(timestamp(err) + '\n');
    if (code === -1) {
        log.write(timestamp("[price] " + data.doc._id + '\n'));
    } else if (code === -2) {
        var contract = has_value(mark.augur.contracts[data.filtrate.address]);
        log.write(timestamp("[contracts:" + contract + "] " + data.doc._id + '\n'));
    } else {
        log.write(timestamp("[scan] " + code + " markets updated\n"));
    }
});

process.on("uncaughtException", function (e) {
    log.write(timestamp("Uncaught exception:\n"));
    log.write(e);
    log.write(e.stack);
    log.write('\n');
});

process.on("exit", function (code) {
    mark.unwatch();
    log.write(timestamp("Marketeer shut down (" + code.toString() + ")\n"));
});

process.on("SIGINT", function () {
    mark.unwatch();
    log.write(timestamp("Marketeer shut down (SIGINT)\n"));
    process.exit(2);
});
