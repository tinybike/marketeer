#!/usr/bin/env node

var path = require("path");
var mark = require("./");

mark.connect({
    ethereum: "http://127.0.0.1:8545",
    limit: 2,
    interval: 30000,
    scan: true,
    ipfs: { host: "127.0.0.1", port: "5001" },
    ipcpath: path.join(process.env.HOME, ".ethereum-augur", "geth.ipc")
});
mark.directoryHash(function (err, res) { console.log(res); });
mark.publishMarkets(function (err, res) { console.log(res); });
