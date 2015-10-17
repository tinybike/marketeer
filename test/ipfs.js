(function () {
/**
 * Marketeer unit tests.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var path = require("path");
var cp = require("child_process");
var chalk = require("chalk");
var crypto = require("crypto");
var abi = require("augur-abi");
var assert = require("chai").assert;
var mark = require("../");

var example = {
    "_id": "0xfb48682c79c1317cec28c14944349fc13656debb23892fe4200476cbe5f7a0e",
    "branchId": "0xf69b5",
    "events": [{
        "id": "-0x809fd2a27b8e4c5d9cd79e0a4995fd0fa6909de0540115f3c9c913ae6b2a2d26",
        "description": "bh1irvkcjfko6r",
        "outcome": "0"
    }],
    "price": "0.00001122316251056174",
    "tradingFee": "0.01999999999999999998",
    "creationFee": "10",
    "description": "bh1irvkcjfko6r",
    "author": "0x639b41c4d3d399894f2a57894278e1653e7cd24c",
    "traderCount": "1",
    "alpha": "0.00790000000000000001",
    "numOutcomes": 2,
    "tradingPeriod": "167",
    "invalid": false,
    "outcomes": [{
        "id": 1,
        "priceHistory": [],
        "outstandingShares": "11.82134557704117959882",
        "price": "0.99999364047654663249",
        "shares": {
            "0x639b41c4d3d399894f2a57894278e1653e7cd24c": "2"
        }
    }, {
        "id": 2,
        "priceHistory": [],
        "outstandingShares": "9.82134557704117959882",
        "price": "0.00001122316251056174",
        "shares": {
            "0x639b41c4d3d399894f2a57894278e1653e7cd24c": "0"
        }
    }],
    "eventOutcome": "0",
    "creationBlock": 298807,
    "winningOutcomes": ["0"],
    "endDate": "301303",
    "participants": {
        "0x639b41c4d3d399894f2a57894278e1653e7cd24c": 0
    },
    "comments": [],
    "network": "7",
    "numEvents": "1",
    "priceHistory": {
        "1": [{
            "price": "0.99999364047654663249",
            "cost": "-0.94622037065744748124",
            "blockNumber": "0x48f43"
        }],
        "2": []
    }
};
var examplePath = path.join(
    "markets",
    "fb48682c79c1317cec28c14944349fc13656debb23892fe4200476cbe5f7a0e"
);
var exampleIpfsHash = "QmWi7jYJiiZosrh9cmK42KehYr4pYW89RHzg7yKk82gZCw";

var DEBUG = false;
var TIMEOUT = 60000;

var config = {
    ethereum: "http://127.0.0.1:8545",
    limit: 2,
    interval: 30000,
    scan: true,
    ipfs: true,
    ipcpath: path.join(process.env.HOME, ".ethereum-augur", "geth.ipc")
};

if (!process.env.CONTINUOUS_INTEGRATION) {

    describe("IPFS", function () {

        before(function () {
            config.mongodb = null;
        });

        describe("documentToHash", function () {
            it("convert market ID/docfile to IPFS hash", function (done) {
                this.timeout(TIMEOUT);
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    mark.documentToHash(examplePath, function (err, ipfsHash) {
                        assert.isNull(err);
                        assert.isNotNull(ipfsHash);
                        assert.strictEqual(ipfsHash, exampleIpfsHash);
                        done();
                    });
                });
            });
        });

        describe("select", function () {
            it("retrieve and verify document using market ID", function (done) {
                this.timeout(TIMEOUT);
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    var doc = example;
                    mark.upsert(doc, function (err, result) {
                        assert.isNull(err);
                        assert.strictEqual(result, exampleIpfsHash);
                        mark.select(doc._id, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(result, doc);
                            mark.remove(doc._id, function (err, result) {
                                assert.isNull(err);
                                assert.property(result, "result");
                                assert.strictEqual(result.result.n, 1);
                                assert.strictEqual(result.result.ok, 1);
                                mark.disconnect();
                                done();
                            });
                        });
                    });
                });
            });
            it("retrieve and verify document using IPFS hash", function (done) {
                this.timeout(TIMEOUT);
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    var doc = example;
                    mark.upsert(doc, function (err, result) {
                        assert.isNull(err);
                        assert.strictEqual(result, exampleIpfsHash);
                        mark.selectHash(exampleIpfsHash, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(result, doc);
                            mark.disconnect();
                            done();
                        });
                    });
                });
            });
        });

        describe("upsert", function () {
            it("insert and update document", function (done) {
                this.timeout(TIMEOUT);
                var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
                var doc = { _id: id, data: "hello world" };
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    mark.upsert(doc, function (err, ipfsHash) {
                        assert.isNull(err);
                        assert.isNotNull(ipfsHash);
                        mark.selectHash(ipfsHash, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(doc, result);
                            doc.data = "goodbye world";
                            mark.upsert(doc, function (err, ipfsHash) {
                                assert.isNull(err);
                                assert.isNotNull(ipfsHash);
                                mark.selectHash(ipfsHash, function (err, result) {
                                    assert.isNull(err);
                                    assert.deepEqual(result, doc);
                                    mark.disconnect();
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        describe("scan", function () {
            it("get market info from blockchain and write to files/IPFS", function (done) {
                this.timeout(TIMEOUT);
                mark.scan(config, function (err, updates) {
                    assert.isNull(err);
                    assert.strictEqual(updates, config.limit);
                    mark.disconnect();
                    assert.isNull(mark.watcher);
                    assert.isNull(mark.db);
                    done();
                });
            });
        });

        describe("watch", function () {
            var branch, markets, marketId, outcome, amount, maxNumPolls;
            mark.augur.connect(config.ethereum);
            branch = mark.augur.branches.dev;
            markets = mark.augur.getMarkets(branch);
            marketId = markets[markets.length - 1];
            outcome = "1";
            amount = "2";
            maxNumPolls = 2;
            it("watch the blockchain for market updates", function (done) {
                this.timeout(TIMEOUT*8);
                var priceUpdated, creationBlock, counter = 0;
                mark.watch(config, function (err, updates, data) {
                    assert.isNull(err);
                    assert.isNotNull(mark.watcher);
                    assert.isAbove(updates, -3);
                    if (updates === -1) {
                        assert.property(data, "filtrate");
                        assert.property(data, "doc");
                        assert.property(data.filtrate, "user");
                        assert.property(data.filtrate, "marketId");
                        assert.property(data.filtrate, "outcome");
                        assert.property(data.filtrate, "price");
                        assert.property(data.filtrate, "cost");
                        assert.property(data.filtrate, "blockNumber");
                        assert.isAbove(abi.bignum(data.filtrate.blockNumber).toNumber(), 0);
                        assert.strictEqual(abi.bignum(data.filtrate.outcome).toFixed(), outcome);
                        priceUpdated = true;
                    } else if (updates === -2) {
                        assert.property(data, "filtrate");
                        assert.property(data, "doc");
                        assert.property(data.filtrate, "marketId");
                        assert.property(data.filtrate, "blockNumber");
                        creationBlock = true;
                    }
                    if (++counter >= maxNumPolls &&
                        (!config.filtering || (priceUpdated && creationBlock)))
                    {
                        assert.isTrue(mark.unwatch());
                        assert.isNull(mark.augur.filters.price_filter.id);
                        assert.isNull(mark.augur.filters.price_filter.heartbeat);
                        assert.isNull(mark.augur.filters.contracts_filter.id);
                        assert.isNull(mark.augur.filters.contracts_filter.heartbeat);
                        assert.isNull(mark.augur.filters.block_filter.id);
                        assert.isNull(mark.augur.filters.block_filter.heartbeat);
                        assert.isNull(mark.augur.filters.creation_filter.id);
                        assert.isNull(mark.augur.filters.creation_filter.heartbeat);
                        assert.isNull(mark.watcher);
                        assert.isNull(mark.db);
                        done();
                    }
                });
                setTimeout(function () {
                    mark.augur.buyShares({
                        branchId: branch,
                        marketId: marketId,
                        outcome: outcome,
                        amount: amount,
                        onSent: function (r) {
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                        },
                        onSuccess: function (r) {
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                            assert.property(r, "blockHash");
                            assert.property(r, "blockNumber");
                            assert.isAbove(abi.bignum(r.blockNumber).toNumber(), 0);
                            assert(abi.bignum(r.from).eq(
                                abi.bignum(mark.augur.coinbase)
                            ));
                            assert(abi.bignum(r.to).eq(
                                abi.bignum(mark.augur.contracts.buyAndSellShares)
                            ));
                            assert.strictEqual(abi.bignum(r.value).toNumber(), 0);
                        },
                        onFailed: done
                    });
                    var description = Math.random().toString(36).substring(4);
                    mark.augur.createEvent({
                        branchId: mark.augur.branches.dev,
                        description: description,
                        expDate: mark.augur.rpc.blockNumber() + 2500,
                        minValue: 1,
                        maxValue: 2,
                        numOutcomes: 2,
                        onSent: function (r) {
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                        },
                        onSuccess: function (r) {
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                            assert.property(r, "blockHash");
                            assert.property(r, "blockNumber");
                            mark.augur.createMarket({
                                branchId: mark.augur.branches.dev,
                                description: description,
                                alpha: "0.0079",
                                initialLiquidity: 10,
                                tradingFee: "0.02",
                                events: [ r.callReturn ],
                                onSent: function (res) {
                                    assert.property(res, "txHash");
                                    assert.property(res, "callReturn");
                                },
                                onSuccess: function (res) {
                                    assert.property(res, "txHash");
                                    assert.property(res, "callReturn");
                                    assert.property(res, "blockHash");
                                    assert.property(res, "blockNumber");
                                },
                                onFailed: done
                            }); // createMarket
                        },
                        onFailed: done
                    }); // createEvent
                }, 2500);
            });
        });

    });

    describe("IPFS and MongoDB", function () {

        before(function () {
            config.mongodb = "mongodb://localhost:27017/marketeer?poolSize=5&noDelay=true&connectTimeoutMS=0&socketTimeoutMS=0";
        });

        describe("documentToHash", function () {
            it("convert market ID/file to IPFS hash", function (done) {
                this.timeout(TIMEOUT);
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    mark.documentToHash(examplePath, function (err, ipfsHash) {
                        assert.isNull(err);
                        assert.isNotNull(ipfsHash);
                        assert.strictEqual(ipfsHash, exampleIpfsHash);
                        done();
                    });
                });
            });
        });

        describe("select", function () {
            it("retrieve and verify document using market ID", function (done) {
                this.timeout(TIMEOUT);
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    var doc = example;
                    mark.upsert(doc, function (err, result) {
                        assert.isNull(err);
                        assert.strictEqual(result, exampleIpfsHash);
                        mark.select(doc._id, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(result, doc);
                            mark.remove(doc._id, function (err, result) {
                                assert.isNull(err);
                                assert.property(result, "result");
                                assert.strictEqual(result.result.n, 1);
                                assert.strictEqual(result.result.ok, 1);
                                mark.disconnect();
                                done();
                            });
                        });
                    });
                });
            });
            it("retrieve and verify document using IPFS hash", function (done) {
                this.timeout(TIMEOUT);
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    var doc = example;
                    mark.upsert(doc, function (err, result) {
                        assert.isNull(err);
                        assert.strictEqual(result, exampleIpfsHash);
                        mark.selectHash(exampleIpfsHash, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(result, doc);
                            mark.disconnect();
                            done();
                        });
                    });
                });
            });
        });

        describe("upsert", function () {
            it("insert and update document", function (done) {
                this.timeout(TIMEOUT);
                var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
                var doc = { _id: id, data: "hello world" };
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    mark.upsert(doc, function (err, ipfsHash) {
                        assert.isNull(err);
                        assert.isNotNull(ipfsHash);
                        mark.selectHash(ipfsHash, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(doc, result);
                            doc.data = "goodbye world";
                            mark.upsert(doc, function (err, ipfsHash) {
                                assert.isNull(err);
                                assert.isNotNull(ipfsHash);
                                mark.selectHash(ipfsHash, function (err, result) {
                                    assert.isNull(err);
                                    assert.deepEqual(result, doc);
                                    mark.disconnect();
                                    done();
                                });
                            });
                        });
                    });
                });
            });
        });

        describe("scan", function () {
            it("get market info from blockchain and write to files/IPFS", function (done) {
                this.timeout(TIMEOUT);
                mark.scan(config, function (err, updates) {
                    assert.isNull(err);
                    assert.strictEqual(updates, config.limit);
                    mark.disconnect();
                    assert.isNull(mark.watcher);
                    assert.isNull(mark.db);
                    done();
                });
            });
        });

        describe("watch", function () {
            var branch, markets, marketId, outcome, amount, maxNumPolls;
            mark.augur.connect(config.ethereum);
            branch = mark.augur.branches.dev;
            markets = mark.augur.getMarkets(branch);
            marketId = markets[markets.length - 1];
            outcome = "1";
            amount = "2";
            maxNumPolls = 2;
            it("watch the blockchain for market updates", function (done) {
                this.timeout(TIMEOUT*8);
                var priceUpdated, creationBlock, counter = 0;
                mark.watch(config, function (err, updates, data) {
                    assert.isNull(err);
                    assert.isNotNull(mark.watcher);
                    assert.isAbove(updates, -3);
                    if (updates === -1) {
                        assert.property(data, "filtrate");
                        assert.property(data, "doc");
                        assert.property(data.filtrate, "user");
                        assert.property(data.filtrate, "marketId");
                        assert.property(data.filtrate, "outcome");
                        assert.property(data.filtrate, "price");
                        assert.property(data.filtrate, "cost");
                        assert.property(data.filtrate, "blockNumber");
                        assert.isAbove(abi.bignum(data.filtrate.blockNumber).toNumber(), 0);
                        assert.strictEqual(abi.bignum(data.filtrate.outcome).toFixed(), outcome);
                        priceUpdated = true;
                    } else if (updates === -2) {
                        assert.property(data, "filtrate");
                        assert.property(data, "doc");
                        assert.property(data.filtrate, "marketId");
                        assert.property(data.filtrate, "blockNumber");
                        creationBlock = true;
                    }
                    if (++counter >= maxNumPolls &&
                        (!config.filtering || (priceUpdated && creationBlock)))
                    {
                        assert.isTrue(mark.unwatch());
                        assert.isNull(mark.augur.filters.price_filter.id);
                        assert.isNull(mark.augur.filters.price_filter.heartbeat);
                        assert.isNull(mark.augur.filters.contracts_filter.id);
                        assert.isNull(mark.augur.filters.contracts_filter.heartbeat);
                        assert.isNull(mark.augur.filters.block_filter.id);
                        assert.isNull(mark.augur.filters.block_filter.heartbeat);
                        assert.isNull(mark.augur.filters.creation_filter.id);
                        assert.isNull(mark.augur.filters.creation_filter.heartbeat);
                        assert.isNull(mark.watcher);
                        assert.isNull(mark.db);
                        done();
                    }
                });
                setTimeout(function () {
                    mark.augur.buyShares({
                        branchId: branch,
                        marketId: marketId,
                        outcome: outcome,
                        amount: amount,
                        onSent: function (r) {
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                        },
                        onSuccess: function (r) {
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                            assert.property(r, "blockHash");
                            assert.property(r, "blockNumber");
                            assert.isAbove(abi.bignum(r.blockNumber).toNumber(), 0);
                            assert(abi.bignum(r.from).eq(
                                abi.bignum(mark.augur.coinbase)
                            ));
                            assert(abi.bignum(r.to).eq(
                                abi.bignum(mark.augur.contracts.buyAndSellShares)
                            ));
                            assert.strictEqual(abi.bignum(r.value).toNumber(), 0);
                        },
                        onFailed: done
                    });
                    var description = Math.random().toString(36).substring(4);
                    mark.augur.createEvent({
                        branchId: mark.augur.branches.dev,
                        description: description,
                        expDate: mark.augur.rpc.blockNumber() + 2500,
                        minValue: 1,
                        maxValue: 2,
                        numOutcomes: 2,
                        onSent: function (r) {
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                        },
                        onSuccess: function (r) {
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                            assert.property(r, "blockHash");
                            assert.property(r, "blockNumber");
                            mark.augur.createMarket({
                                branchId: mark.augur.branches.dev,
                                description: description,
                                alpha: "0.0079",
                                initialLiquidity: 10,
                                tradingFee: "0.02",
                                events: [ r.callReturn ],
                                onSent: function (res) {
                                    assert.property(res, "txHash");
                                    assert.property(res, "callReturn");
                                },
                                onSuccess: function (res) {
                                    assert.property(res, "txHash");
                                    assert.property(res, "callReturn");
                                    assert.property(res, "blockHash");
                                    assert.property(res, "blockNumber");
                                },
                                onFailed: done
                            }); // createMarket
                        },
                        onFailed: done
                    }); // createEvent
                }, 2500);
            });
        });

    });
}

})();
