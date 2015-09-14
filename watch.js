#!/usr/bin/env node

"use strict";

var join = require("path").join;
var createWriteStream = require("fs").createWriteStream;
var mark = require("./");

var config = {
    ethereum: "http://127.0.0.1:8545",
    mongodb: "mongodb://localhost:27017/marketeer?poolSize=5&noDelay=true&connectTimeoutMS=0&socketTimeoutMS=0",
    filtering: true,
    interval: 0
};

mark.debug = false;

var log = createWriteStream(join(__dirname, "marketeer.log"), { flags : 'a' });

function timestamp(s) {
    return (new Date()).toString() + ": " + s.toString();
}

log.write(timestamp("watch.js started\n"));
log.write(" - Blockchain: " + config.ethereum + '\n');
log.write(" - Database:   " + config.mongodb + '\n');
log.write(" - Filtering:  " + config.filtering + '\n');

mark.watch(config, function (err, numUpdates, data) {
    if (err) return log.write(timestamp(err) + '\n');
    if (numUpdates === -1) {
        log.write(timestamp(data.update.marketId + " updated [price]\n"));
    } else if (numUpdates === -2) {
        log.write(timestamp(data.tx.topics[2] + " updated [contracts]\n"));
    } else {
        log.write(timestamp(numUpdates + " markets updated\n"));
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
    log.write(timestamp("watch.js shut down (" + code.toString() + ")\n"));
});

process.on("SIGINT", function () {
    mark.unwatch();
    log.write(timestamp("watch.js shut down (SIGINT)\n"));
    process.exit(2);
});
