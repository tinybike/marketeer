#!/usr/bin/env node

"use strict";

var chalk = require("chalk");
var join = require("path").join;
var createWriteStream = require("fs").createWriteStream;
var mark = require("./");

var config = {
    ethereum: "http://localhost:8545",
    mongodb: "mongodb://localhost:27017/marketeer?poolSize=5&noDelay=true&connectTimeoutMS=0&socketTimeoutMS=0",
    limit: 0,
    filtering: true,
    interval: null,
    scan: true,
    ipfs: { host: "localhost", port: "5001" },
    ipcpath: join(process.env.HOME, ".ethereum-augur", "geth.ipc")
};

mark.debug = false;

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
    return chalk.cyan.dim((new Date()).toString() + ": ") + s;
}

log.write(timestamp("Marketeer started\n"));
log.write("Blockchain: " + chalk.white.dim(config.ethereum) + '\n');
log.write("Database:   " + chalk.white.dim(config.mongodb) + '\n');
log.write("Filtering:  " + chalk.white.dim(config.filtering) + '\n');
log.write("Scan:       " + chalk.white.dim(config.scan) + '\n');
log.write("Interval:   " + chalk.white.dim(config.interval) + '\n');
log.write("Limit:      " + chalk.white.dim(config.limit) + '\n');
log.write("IPC path:   " + chalk.white.dim(config.ipcpath) + '\n');
log.write("IPFS:       " + chalk.white.dim(JSON.stringify(config.ipfs)) + '\n');

mark.watch(config, function (err, code, data) {
    if (err) return log.write(timestamp(err) + '\n');
    if (code === -1) {
        log.write(timestamp(("[price] ") + chalk.white.dim(data.filtrate.outcome + " " + data.doc._id) + '\n'));
    } else if (code === -2) {
        log.write(timestamp(("[creation] ") + chalk.white.dim(data.filtrate.blockNumber + " " + data.doc._id) + '\n'));
    } else if (code === -3) {
        var contract = has_value(mark.augur.contracts[data.filtrate.address]);
        log.write(timestamp("[contracts:" + contract + "] " + chalk.white.dim(data.doc._id) + '\n'));
    } else {
        log.write(timestamp("[scan] " + chalk.white.dim(code + " markets updated\n")));
    }
});

process.on("uncaughtException", function (e) {
    log.write(timestamp(chalk.red("Uncaught exception\n")));
    try {
        log.write(e.toString());
        log.write(e.stack.toString());
    } catch (exc) {
        console.log(exc);
    }
    log.write('\n');
});

process.on("exit", function (code) {
    mark.unwatch();
    log.write(timestamp(chalk.red("Marketeer shut down (" + code.toString() + ")\n")));
});

process.on("SIGINT", function () {
    mark.unwatch();
    log.write(timestamp(chalk.red("Marketeer shut down (SIGINT)\n")));
    process.exit(2);
});
