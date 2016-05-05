#!/usr/bin/env node

var path = require("path");
var mark = require("./");
var abi = require("augur-abi");

mark.connect({
    ethereum: "http://127.0.0.1:8545",
    limit: 2,
    interval: 30000,
    scan: true,
    // ipfs: { host: "45.33.59.27", port: "8800" },
    // ipfs: { host: "ipfs1.augur.net", port: "80" },
    ipfs: { host: "127.0.0.1", port: "5001" },
    ipcpath: path.join(process.env.HOME, ".ethereum-of-the-moment", "geth.ipc")
});

mark.addDirectory(function (err, res) { console.log(res); });

// mark.publishMarketsToIpfs(function (err, res) { console.log(res); });
// mark.publishMarketsToContract(function (err, res) { console.log("published:", res); });

var ipfsName = "QmXbf8FzHBSW1i7CQRn6LWGhrdxqcjWpFghvRS1g8T32DK";
var ipfsDirHash = "QmaUJ4XspR3XhQ4fsjmqHSkkTHYiTJigKZSPa8i4xgVuAt";

var expected = "aUJ4XspR3XhQ4fsjmqHSkkTHYiTJigKZSPa8i4xgVuAt";

mark.getDirectoryHash("7", function (err, directoryHash) {
    console.log("directoryHash:", directoryHash);
    // mark.loadMarketIds(directoryHash, function (err, idToHash) {
    //     console.log("list:", JSON.stringify(idToHash, null, 2));
    // });
});

// mark.getDirectoryHash(ipfsName, function (err, directoryHash) {
//     console.log("directory hash:", directoryHash);
// });

// var directoryHash = "QmeWQshJxTpnvAq58A51KhBkEi6YGJDKRe7rssPFRnX2EX";

// mark.loadMarketIds(directoryHash, function (err, idToHash) {
//     console.log("list:", JSON.stringify(idToHash, null, 2));
// });
