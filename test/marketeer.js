/**
 * Marketeer unit tests.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var crypto = require("crypto");
var abi = require("augur-abi");
var assert = require("chai").assert;
var mark = require("../");

var TIMEOUT = 60000;
var config = {
    ethereum: "http://eth1.augur.net",
    mongodb: "mongodb://localhost:27017/marketeer?poolSize=5&noDelay=true&connectTimeoutMS=0&socketTimeoutMS=0",
    limit: 1,
    interval: 2500,
    filtering: !process.env.CONTINUOUS_INTEGRATION
};

describe("lookup", function () {

    it("retrieve and verify document", function (done) {
        this.timeout(TIMEOUT);
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        var doc = { _id: id, data: "booyah" };
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsert(doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
                mark.lookup(doc._id, function (err, result) {
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
            mark.upsert(doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
                mark.lookup(doc._id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    doc.data = "goodbye world";
                    mark.upsert(doc, function (err,result) {
                        assert.isNull(err);
                        assert.isTrue(result);
                        mark.lookup(doc._id, function (err, result) {
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

    it("fetch market info from the blockchain and save to db", function (done) {
        this.timeout(TIMEOUT);
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
    if (config.filtering) config.ethereum = "http://127.0.0.1:8545";

    mark.augur.bignumbers = false;
    mark.augur.connect(config.ethereum);

    var branch = mark.augur.branches.dev;
    var markets = mark.augur.getMarkets(branch);
    var marketId = markets[markets.length - 1];
    var outcome = "1";
    var amount = "2";
    var maxNumPolls = 2;

    it("watch the blockchain for market updates", function (done) {
        this.timeout(TIMEOUT*8);
        var updated, counter = 0;
        mark.watch(config, function (err, updates, priceUpdate) {
            assert.isNull(err);
            assert.isNotNull(mark.watcher);
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
            if (++counter >= maxNumPolls && (!config.filtering || updated)) {
                assert.isTrue(mark.unwatch());
                assert.isNull(mark.augur.filters.price_filter.id);
                assert.isNull(mark.augur.filters.price_filter.heartbeat);
                assert.isNull(mark.augur.filters.contracts_filter.id);
                assert.isNull(mark.augur.filters.block_filter.id);
                assert.isNull(mark.watcher);
                assert.isNull(mark.db);
                done();
            }
        });
        if (config.filtering) {
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
                    onFailed: function (r) {
                        done(r);
                    }
                });
            }, 2500);
        }
    });
});
