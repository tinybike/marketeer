/**
 * Watches and records the Ethereum blockchain.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var augur = require("augur.js");
var MongoClient = require("mongodb").MongoClient;

var NO = 1;
var YES = 2;

var marketeer = {

    db: null,

    augur: augur,

    watcher: null,

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
        numEvents = this.augur.getNumEvents(market);
        if (numEvents) {
            marketInfo = this.augur.getMarketInfo(market);
            participantNumber = this.augur.getCurrentParticipantNumber(market);
            marketDoc = {
                _id: market,
                description: this.augur.getDescription(market),
                shares: {
                    yes: this.augur.getSharesPurchased(market, YES),
                    no: this.augur.getSharesPurchased(market, NO)
                },
                events: [],
                fee: parseInt(marketInfo[4])
            };
            events = this.augur.getMarketEvents(market);
            for (var j = 0; j < numEvents; ++j) {
                marketDoc.events.push({
                    _id: events[j],
                    description: this.augur.getDescription(events[j]),
                    expiration: this.augur.getEventInfo(events[j])[1]
                });
            }
        }
        return marketDoc;
    },

    scan: function (config, db, callback) {
        var self = this;
        config = config || {};
        if (db && typeof db === "function" && callback === undefined) {
            callback = db;
            db = undefined;
        }
        if (db && typeof db === "object") {
            this.augur.connect(config.ethereum);
            var updates = 0;
            var markets = this.augur.getMarkets(this.augur.branches.dev);
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
                self.scan(config, db, callback);
            });
        }
    },

    watch: function (config, callback) {
        var self = this;
        config = config || {};
        MongoClient.connect(config.mongodb, function (err, db) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            self.db = db;
            self.scan(config, db, function (err) {
                if (err) {
                    if (callback) return callback(err);
                    throw err;
                }
                self.augur.connect(config.ethereum);
                self.augur.filters.listen({
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
                self.watcher = setInterval(function () {
                    self.scan(config, db, function (err, updates) {
                        if (err) {
                            clearInterval(self.watcher);
                            if (callback) return callback(err);
                            throw err;
                        }
                        if (callback) return callback(null, updates);
                        console.log((new Date()).toString() + ":", updates, "markets updated");
                    });
                }, config.interval || 300000); // default interval: 5 minutes
            });
        });
    },

    unwatch: function () {
        if (this.augur.filters.price_filter.id) {
            this.augur.filters.ignore(true);
        }
        if (this.watcher) {
            clearInterval(this.watcher);
            this.watcher = null;
        }
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        return !(this.watcher && this.augur.filters.price_filter.id &&
                 this.augur.filters.price_filter.heartbeat && this.db);
    }

};

process.on("exit", function () { if (marketeer.db) marketeer.db.close(); });

module.exports = marketeer;
