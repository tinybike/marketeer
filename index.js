#!/usr/bin/env node
/**
 * Watches and records the Ethereum blockchain.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var augur = require("augur.js");
var MongoClient = require("mongodb").MongoClient;

var NO = 1;
var YES = 2;

var leech = {

    db: null,

    lookup: function (db, market, callback) {
        db.collection("markets").findOne({ _id: market }, function (err, result) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            if (callback) return callback(null, result);
            console.log(result);
        });
    },

    upsert: function (db, marketDoc, callback) {
        db.collection("markets").save(marketDoc, { upsert: true }, function (err) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            if (callback) callback(null, true);
        });
    },

    collect: function (market) {
        var marketDoc, marketInfo, numEvents, participantNumber, events;
        numEvents = augur.getNumEvents(market);
        if (numEvents) {
            marketInfo = augur.getMarketInfo(market);
            participantNumber = augur.getCurrentParticipantNumber(market);
            marketDoc = {
                _id: market,
                description: augur.getDescription(market),
                shares: {
                    yes: augur.getSharesPurchased(market, YES),
                    no: augur.getSharesPurchased(market, NO)
                },
                events: [],
                fee: parseInt(marketInfo[4])
            };
            events = augur.getMarketEvents(market);
            for (var j = 0; j < numEvents; ++j) {
                marketDoc.events.push({
                    _id: events[j],
                    description: augur.getDescription(events[j]),
                    expiration: augur.getEventInfo(events[j])[1]
                });
            }
        }
        return marketDoc;
    },

    suck: function (config, db, callback) {
        var self = this;
        config = config || {};
        if (db && typeof db === "function" && callback === undefined) {
            callback = db;
            db = undefined;
        }
        if (db && typeof db === "object") {
            augur.connect(config.ethereum);
            var updates = 0;
            var markets = augur.getMarkets(augur.branches.dev);
            var numMarkets = markets.length;
            if (config.limit && config.limit < numMarkets) {
                markets = markets.slice(numMarkets-config.limit, numMarkets);
                numMarkets = config.limit;
            }
            for (var i = 0; i < numMarkets; ++i) {
                this.upsert(db, this.collect(markets[i]), function (err) {
                    if (err) {
                        if (callback) return callback(err);
                        throw err;
                    }
                    if (++updates === numMarkets) callback(null, updates);
                });
            }
        } else {
            MongoClient.connect(config.mongodb, function (err, db) {
                if (err) {
                    if (callback) return callback(err);
                    throw err;
                }
                self.db = db;
                self.suck(config, db, callback);
            });
        }
    },

    attach: function (config, callback) {
        var self = this;
        config = config || {};
        MongoClient.connect(config.mongodb, function (err, db) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            self.db = db;
            self.suck(config, db, function (err) {
                if (err) {
                    if (callback) return callback(err);
                    throw err;
                }
                augur.connect(config.ethereum);
                augur.filters.listen({
                    price: function (update) {
                        var marketDoc = self.collect(update.marketId);
                        (function (updated) {
                            self.upsert(db, updated.market, function (err, success) {
                                updated.success = success;
                                if (err) {
                                    if (callback) return callback(err);
                                    throw err;
                                }
                                if (callback) return callback(null, -1, updated);
                                console.log(updated);
                            });
                        })({ update: update, market: marketDoc });
                    }
                });
                var suckInterval = setInterval(function () {
                    self.suck(config, db, function (err, updates) {
                        if (err) {
                            clearInterval(suckInterval);
                            if (callback) return callback(err);
                            throw err;
                        }
                        if (callback) return callback(null, updates);
                        console.log((new Date()).toString() + ":", updates, "markets updated");
                    });
                }, config.interval || 300000); // default interval: 5 minutes
            });
        });
    }

};

process.on("exit", function () { if (leech.db) leech.db.close(); });

module.exports = leech;
