/**
 * Augur market data preprocessor.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var MongoClient = require("mongodb").MongoClient;

var marketeer = {

    db: null,

    augur: require("augur.js"),

    watcher: null,

    connect: function (config, callback) {
        var self = this;
        MongoClient.connect(config.mongodb, function (err, db) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            self.db = db;
            self.augur.connect(config.ethereum);
            if (callback) callback(null);
        });
    },

    disconnect: function (callback) {
        this.db.close();
        this.db = null;
    },

    lookup: function (market, callback) {
        this.db.collection("markets").findOne({ _id: market }, function (err, result) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            if (callback) return callback(null, result);
            console.log(result);
        });
    },

    upsert: function (doc, callback) {
        this.db.collection("markets").save(doc, { upsert: true }, function (err) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            if (callback) callback(null, true);
        });
    },

    collect: function (market) {
        var doc, marketInfo, numEvents, events;
        numEvents = this.augur.getNumEvents(market);
        if (numEvents) {
            marketInfo = this.augur.getMarketInfo(market);
            doc = {
                _id: market,
                description: this.augur.getDescription(market),
                shares: {
                    yes: this.augur.getSharesPurchased(market, 2),
                    no: this.augur.getSharesPurchased(market, 1)
                },
                events: [],
                fee: parseInt(marketInfo[4])
            };
            events = this.augur.getMarketEvents(market);
            for (var j = 0; j < numEvents; ++j) {
                doc.events.push({
                    _id: events[j],
                    description: this.augur.getDescription(events[j]),
                    expiration: this.augur.getEventInfo(events[j])[1]
                });
            }
        }
        return doc;
    },

    scan: function (config, callback) {
        var self = this;
        config = config || {};
        if (this.db && typeof this.db === "object") {
            this.augur.getMarkets(this.augur.branches.dev, function (markets) {
                function upserted(err) {
                    if (err) {
                        if (callback) return callback(err);
                        throw err;
                    }
                    if (++updates === numMarkets) callback(null, updates);
                }
                var numMarkets = markets.length;
                var updates = 0;
                if (config.limit && config.limit < numMarkets) {
                    markets = markets.slice(numMarkets - config.limit, numMarkets);
                    numMarkets = config.limit;
                }
                for (var i = 0; i < numMarkets; ++i) {
                    self.upsert(self.collect(markets[i]), upserted);
                }
            });
        } else {
            this.connect(config, function (err) {
                if (err) {
                    if (callback) return callback(err);
                    throw err;
                }
                self.augur.connect(config.ethereum);
                self.scan(config, callback);
            });
        }
    },

    watch: function (config, callback) {
        var self = this;
        config = config || {};
        this.connect(config, function (err) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            self.scan(config, function (err) {
                if (err) {
                    if (callback) return callback(err);
                    throw err;
                }
                self.augur.connect(config.ethereum);
                self.augur.filters.listen({
                    price: function (update) {
                        var marketDoc = self.collect(update.marketId);
                        (function (updated) {
                            self.upsert(updated.market, function (err, success) {
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
                    self.scan(config, function (err, updates) {
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
