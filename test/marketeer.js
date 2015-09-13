/**
 * Marketeer unit tests.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var crypto = require("crypto");
var abi = require("augur-abi");
var assert = require("chai").assert;
var MongoClient = require("mongodb").MongoClient;
var marketeer = require("../");

var TIMEOUT = 60000;
var config = {
    ethereum: "http://eth1.augur.net",
    mongodb: "mongodb://localhost:27017/marketeer?poolSize=5&noDelay=true&connectTimeoutMS=0&socketTimeoutMS=0",
    limit: 3,
    interval: 2500,
    priceFilter: !process.env.CONTINUOUS_INTEGRATION
};

describe("lookup", function () {

    it("retrieve and verify document", function (done) {
        this.timeout(TIMEOUT);
        var id = "0x" + crypto.randomBytes(32).toString("hex");
        var doc = { _id: id, data: "booyah" };
        MongoClient.connect(config.mongodb, function (err, db) {
            assert.isNull(err);
            marketeer.upsert(db, doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
                marketeer.lookup(db, doc._id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    db.close();
                    done();
                });
            });
        });
    });

});

describe("upsert", function () {

    it("insert and update document", function (done) {
        this.timeout(TIMEOUT);
        var id = "0x" + crypto.randomBytes(32).toString("hex");
        var doc = { _id: id, data: "hello world" };
        MongoClient.connect(config.mongodb, function (err, db) {
            assert.isNull(err);
            marketeer.upsert(db, doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
                marketeer.lookup(db, doc._id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    doc.data = "goodbye world";
                    marketeer.upsert(db, doc, function (err,result) {
                        assert.isNull(err);
                        assert.isTrue(result);
                        marketeer.lookup(db, doc._id, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(result, doc);
                            db.close();
                            done();
                        });
                    });
                });
            });
        });
    });

});

describe("scan", function () {

    it("fetch market info from the blockchain and save to db", function (done) {
        this.timeout(TIMEOUT);
        MongoClient.connect(config.mongodb, function (err, db) {
            marketeer.scan(config, db, function (err, updates) {
                assert.isNull(err);
                assert.strictEqual(updates, config.limit);
                db.close();
                done();
            });
        });
    });

    it("fetch market info from the blockchain, set up db connection, then save to db", function (done) {
        this.timeout(TIMEOUT*2);
        marketeer.scan(config, function (err, updates) {
            assert.isNull(err);
            assert.strictEqual(updates, config.limit);
            marketeer.scan(config, null, function (err, updates) {
                assert.isNull(err);
                assert.strictEqual(updates, config.limit);
                assert.isTrue(marketeer.unwatch());
                assert.isNull(marketeer.augur.filters.price_filter.id);
                assert.isNull(marketeer.watcher);
                assert.isNull(marketeer.db);
                done();
            });
        });
    });

});

describe("watch", function () {
    if (config.priceFilter) config.ethereum = "http://127.0.0.1:8545";

    marketeer.augur.bignumbers = false;
    marketeer.augur.connect(config.ethereum);

    var branch = marketeer.augur.branches.dev;
    var markets = marketeer.augur.getMarkets(branch);
    var marketId = markets[markets.length - 1];
    var outcome = "1";
    var amount = "2";
    var maxNumPolls = 3;

    it("watch the blockchain for market updates", function (done) {
        this.timeout(TIMEOUT*8);
        var updated, counter = 0;
        marketeer.watch(config, function (err, updates, priceUpdate) {
            assert.isNull(err);
            assert.isNotNull(marketeer.watcher);
            assert.isAbove(updates, -2);
            if (updates === -1) {
                assert.property(priceUpdate, "update");
                assert.property(priceUpdate, "market");
                assert.property(priceUpdate.update, "user");
                assert.property(priceUpdate.update, "marketId");
                assert.property(priceUpdate.update, "outcome");
                assert.property(priceUpdate.update, "price");
                assert.property(priceUpdate.update, "cost");
                assert.property(priceUpdate.update, "blockNumber");
                assert.isAbove(abi.bignum(priceUpdate.update.blockNumber).toNumber(), 0);
                assert.strictEqual(abi.bignum(priceUpdate.update.outcome).toFixed(), outcome);
                updated = true;
            }
            if (++counter >= maxNumPolls && (!config.priceFilter || updated)) {
                assert.isTrue(marketeer.unwatch());
                assert.isNull(marketeer.augur.filters.price_filter.id);
                assert.isNull(marketeer.augur.filters.price_filter.heartbeat);
                assert.isNull(marketeer.augur.filters.contracts_filter.id);
                assert.isNull(marketeer.augur.filters.block_filter.id);
                assert.isNull(marketeer.watcher);
                assert.isNull(marketeer.db);
                done();
            }
        });
        if (config.priceFilter) {
            setTimeout(function () {
                marketeer.augur.buyShares({
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
                            abi.bignum(marketeer.augur.coinbase)
                        ));
                        assert(abi.bignum(r.to).eq(
                            abi.bignum(marketeer.augur.contracts.buyAndSellShares)
                        ));
                        assert.strictEqual(abi.bignum(r.value).toNumber(), 0);
                    },
                    onFailed: function (r) {
                        done(r);
                    }
                });
            }, 2500);
        }
    });
});
