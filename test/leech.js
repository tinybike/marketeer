#!/usr/bin/env node
/**
 * Leech unit tests.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var crypto = require("crypto");
var augur = require("augur.js");
var assert = require("chai").assert;
var MongoClient = require("mongodb").MongoClient;
var leech = require("../");

var TIMEOUT = 60000;
var config = {
    ethereum: "http://eth1.augur.net",
    mongodb: "mongodb://localhost:27017/leech?poolSize=5&noDelay=true&connectTimeoutMS=0&socketTimeoutMS=0",
    limit: 1,
    interval: 2500,
    priceFilter: true
};

describe("lookup", function () {

    it("retrieve and verify document", function (done) {
        this.timeout(TIMEOUT);
        var id = "0x" + crypto.randomBytes(32).toString("hex");
        var doc = { _id: id, data: "booyah" };
        MongoClient.connect(config.mongodb, function (err, db) {
            assert.isNull(err);
            leech.upsert(db, doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
                leech.lookup(db, doc._id, function (err, result) {
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
            leech.upsert(db, doc, function (err, result) {
                assert.isNull(err);
                assert.isTrue(result);
                leech.lookup(db, doc._id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    doc.data = "goodbye world";
                    leech.upsert(db, doc, function (err,result) {
                        assert.isNull(err);
                        assert.isTrue(result);
                        leech.lookup(db, doc._id, function (err, result) {
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

describe("suck", function () {

    it("fetch market info from the blockchain and save to db", function (done) {
        this.timeout(TIMEOUT);
        MongoClient.connect(config.mongodb, function (err, db) {
            leech.suck(config, db, function (err, updates) {
                assert.isNull(err);
                assert.strictEqual(updates, config.limit);
                db.close();
                done();
            });
        });
    });

    it("fetch market info from the blockchain, set up db connection, then save to db", function (done) {
        this.timeout(TIMEOUT*2);
        leech.suck(config, function (err, updates) {
            assert.isNull(err);
            assert.strictEqual(updates, config.limit);
            leech.suck(config, null, function (err, updates) {
                assert.isNull(err);
                assert.strictEqual(updates, config.limit);
                leech.db.close();
                done();
            });
        });
    });

});

describe("attach", function () {
    if (!process.env.CONTINUOUS_INTEGRATION) {
        config.ethereum = "http://127.0.0.1:8545";

        augur.bignumbers = false;
        augur.connect(config.ethereum);
        var branch = augur.branches.dev;
        var markets = augur.getMarkets(branch);
        var marketId = markets[markets.length - 1];
        var outcome = "1";
        var amount = "2";
        var maxNumPolls = 3;

        it("watch the blockchain for market updates", function (done) {
            this.timeout(TIMEOUT*8);
            var updatedPrice, counter = 0;
            leech.attach(config, function (err, updates, updatedPrice) {
                assert.isNull(err);
                assert.isAbove(updates, -2);
                if (updates === -1) {
                    assert.property(updatedPrice, "update");
                    assert.property(updatedPrice, "market");
                    assert.property(updatedPrice.update, "user");
                    assert.property(updatedPrice.update, "marketId");
                    assert.property(updatedPrice.update, "outcome");
                    assert.property(updatedPrice.update, "price");
                    assert.property(updatedPrice.update, "cost");
                    assert.property(updatedPrice.update, "blockNumber");
                    assert.isAbove(parseInt(updatedPrice.update.blockNumber), 0);
                    assert.strictEqual(updatedPrice.update.outcome, outcome);
                    updatedPrice = true;
                }
                if (++counter >= maxNumPolls && updatedPrice) {
                    leech.db.close();
                    done();
                }
            });
            augur.buyShares({
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
                    assert.isAbove(parseInt(r.blockNumber), 0);
                    assert.strictEqual(r.from, augur.coinbase);
                    assert.strictEqual(r.to, augur.contracts.buyAndSellShares);
                    assert.strictEqual(parseInt(r.value), 0);
                },
                onFailed: function (r) {
                    done(r);
                }
            });
        });
    }
});
