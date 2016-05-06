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

var DEBUG = false;
var TIMEOUT = 60000;

var config = {
    ethereum: "https://eth3.augur.net",
    mongodb: "mongodb://localhost:27017/marketeer?poolSize=5&noDelay=true&connectTimeoutMS=0&socketTimeoutMS=0",
    limit: 30,
    interval: 30000,
    scan: true,
    filtering: !process.env.CONTINUOUS_INTEGRATION
};

describe("select", function () {

    it("retrieve and verify document", function (done) {
        this.timeout(TIMEOUT);
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        var doc = {_id: id, data: "booyah"};
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsert(doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
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

});

describe("upsert", function () {

    it("insert and update document", function (done) {
        this.timeout(TIMEOUT);
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        var doc = {_id: id, data: "hello world"};
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsert(doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
                mark.select(doc._id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    mark.remove(doc._id, function (err, result) {
                        assert.isNull(err);
                        assert.property(result, "result");
                        assert.strictEqual(result.result.n, 1);
                        assert.strictEqual(result.result.ok, 1);
                        doc.data = "goodbye world";
                        mark.upsert(doc, function (err,result) {
                            assert.isNull(err);
                            assert.isTrue(result);
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
            });
        });
    });

});

describe("scan", function () {
    if (config.filtering) config.ethereum = "http://127.0.0.1:8545";

    it("fetch market info from the blockchain and save to db", function (done) {
        this.timeout(TIMEOUT*100);
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.scan(config, function (err, updates) {
                assert.isNull(err);
                assert.strictEqual(updates, config.limit);
                mark.disconnect();
                done();
            });
        });
    });

    it("fetch market info from the blockchain, set up db connection, then save to db", function (done) {
        this.timeout(TIMEOUT*100);
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
    if (config.filtering) config.ethereum = "http://127.0.0.1:8545";

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
        if (config.filtering) {
            setTimeout(function () {
                var desc = Math.random().toString(36).substring(4);
                mark.augur.rpc.blockNumber(function (blockNumber) {
                    assert.notProperty(blockNumber, "error");
                    var expBlock = parseInt(blockNumber) + 2500;
                    console.log("creating:", {
                        branchId: branch,
                        description: desc,
                        expirationBlock: expBlock,
                        minValue: 1,
                        maxValue: 2,
                        numOutcomes: 2,
                        alpha: "0.0079",
                        initialLiquidity: 100,
                        tradingFee: "0.02"
                    });
                    mark.augur.createSingleEventMarket({
                        branchId: branch,
                        description: desc,
                        expirationBlock: expBlock,
                        minValue: 1,
                        maxValue: 2,
                        numOutcomes: 2,
                        alpha: "0.0079",
                        initialLiquidity: 100,
                        tradingFee: "0.02",
                        onSent: function (r) {
                            console.log("createSingleEventMarket sent:", r);
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                        },
                        onSuccess: function (r) {
                            console.log("createSingleEventMarket success:", r);
                            assert.property(r, "txHash");
                            assert.property(r, "callReturn");
                            assert.property(r, "blockHash");
                            assert.property(r, "blockNumber");
                            mark.augur.trade({
                                branchId: branch,
                                marketId: marketId,
                                outcome: outcome,
                                amount: amount,
                                limit: 0,
                                callbacks: {
                                    onMarketHash: function (r) {
                                        console.log("marketHash:", r);
                                    },
                                    onCommitTradeSent: function (r) {
                                        console.log("commitTradeSent:", r);
                                        assert.property(r, "txHash");
                                        assert.property(r, "callReturn");
                                    },
                                    onCommitTradeSuccess: function (r) {
                                        console.log("commitTradeSuccess:", r);
                                        assert.property(r, "txHash");
                                        assert.property(r, "callReturn");
                                    },
                                    onNextBlock: function (r) {
                                        console.log("nextBlock:", r);
                                    },
                                    onTradeSent: function (r) {
                                        console.log("tradeSent:", r);
                                        assert.property(r, "txHash");
                                        assert.property(r, "callReturn");
                                    },
                                    onTradeSuccess: function (r) {
                                        console.log("tradeSuccess:", r);
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
                                    onCommitTradeFailed: done,
                                    onTradeFailed: done
                                }
                            });
                        },
                        onFailed: done
                    }); // createEvent
                });
            }, 2500);
        }
    });
});
