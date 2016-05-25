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
var leveldown = require('leveldown');
var mark = require("../");

var DEBUG = false;
var TIMEOUT = 60000;

var config = {
    ethereum: "https://eth3.augur.net",
    db: "./testdb",
    limit: 5,
    interval: 30000,
    scan: true,
    filtering: !process.env.CONTINUOUS_INTEGRATION
};

function makeDB() {
    config.leveldb = "./testdb_" + crypto.randomBytes(4).toString("hex");
}

function removeDB() {
    mark.disconnect( function () {
        leveldown.destroy(config.leveldb, function(err) {
            if (err) console.log("Delete DB error:", err);
        });
    });
}


describe("select", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("retrieve and verify document", function (done) {

        this.timeout(TIMEOUT);
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        var doc = {_id: id, creationTime: 4, data: "booyah"};
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsert(doc, function (err, result) {
                //console.log("test123");
                assert.isNull(err);
                assert.isTrue(result);
                mark.select(doc._id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    done();
                });
            });
        });
    });
});

describe("upsert", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("insert and update document", function (done) {
        this.timeout(TIMEOUT);
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        var doc = {_id: id, creationTime: 4, data: "hello world"};
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsert(doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
                mark.select(doc._id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    var order_key = doc.creationTime + "_" + doc._id;
                    mark.selectByTime(order_key, function (err, result) {
                        assert.isNull(err);
                        assert.deepEqual(result, doc);
                        doc.data = "goodbye world";
                        mark.upsert(doc, function (err,result) {
                            assert.isNull(err);
                            assert.isTrue(result);
                            mark.select(doc._id, function (err, result) {
                                assert.isNull(err);
                                assert.deepEqual(result, doc);
                                mark.selectByTime(order_key, function (err, result) {
                                    assert.isNull(err);
                                    assert.deepEqual(result, doc);
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


describe("getMarkets", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("retrieves marekts in reverse order", function (done) {
        this.timeout(TIMEOUT);
        //Insert docs out of order.
        var doc1 = {_id: "C", creationTime: 5};
        var doc2 = {_id: "A", creationTime: 4};
        var doc3 = {_id: "D", creationTime: 6};
        var doc4 = {_id: "B", creationTime: 5};
        mark.connect(config, function (err) {
         mark.upsert(doc1, function (err,result) {
          mark.upsert(doc2, function (err,result) {
           mark.upsert(doc3, function (err,result) {
            mark.upsert(doc4, function (err,result) {
             mark.getMarkets(4, 0, function (err, markets) {
                assert.deepEqual(markets[0], doc3);
                assert.deepEqual(markets[1], doc1);
                assert.deepEqual(markets[2], doc4);
                assert.deepEqual(markets[3], doc2);
                done();
             });
            });
           });
          });
         });   
        });
    });

    it("retrieves respects limit and offset", function (done) {
        this.timeout(TIMEOUT);
        //Insert docs out of order.
        var doc1 = {_id: "C", creationTime: 5};
        var doc2 = {_id: "A", creationTime: 4};
        var doc3 = {_id: "D", creationTime: 6};
        var doc4 = {_id: "B", creationTime: 5};
        mark.connect(config, function (err) {
         mark.upsert(doc1, function (err,result) {
          mark.upsert(doc2, function (err,result) {
           mark.upsert(doc3, function (err,result) {
            mark.upsert(doc4, function (err,result) {
             mark.getMarkets(2, 1, function (err, markets) {
                assert.strictEqual(markets.length, 2);
                assert.deepEqual(markets[0], doc1);
                assert.deepEqual(markets[1], doc4);
                done();
             });
            });
           });
          });
         });   
        });
    });
});

describe("scan", function () {
    beforeEach(makeDB);
    afterEach(removeDB);

    if (config.filtering) config.ethereum = "http://127.0.0.1:8545";

    it("fetch market info from the blockchain and save to db", function (done) {
        this.timeout(TIMEOUT*100);
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.scan(config, function (err, updates) {
                assert.isNull(err);
                assert.strictEqual(updates, config.limit);
                done();
            });
        });
    });

    it("fetch market info from the blockchain, set up db connection, then save to db", function (done) {
        this.timeout(TIMEOUT*100);
        mark.scan(config, function (err, updates) {
            assert.isNull(err);
            assert.strictEqual(updates, config.limit);
            done();
        });
    });

});

/*
describe("watch", function () {
    beforeEach(makeDB);
    afterEach(removeDB);

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
                mark.augur.trade({
                    branchId: branch,
                    marketId: marketId,
                    outcome: outcome,
                    amount: amount,
                    onCommitTradeSent: function (r) {
                        assert.property(r, "txHash");
                        assert.property(r, "callReturn");
                    },
                    onCommitTradeSuccess: function (r) {
                        assert.property(r, "txHash");
                        assert.property(r, "callReturn");
                    },
                    onTradeSent: function (r) {
                        assert.property(r, "txHash");
                        assert.property(r, "callReturn");
                    },
                    onTradeSuccess: function (r) {
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
        }
    });
});
*/
