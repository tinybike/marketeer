/**
 * Augur market monitor
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var async = require("async");
var levelup = require('levelup');

var INTERVAL = 600000; // default update interval (10 minutes)
var noop = function () {};

module.exports = {

    debug: false,

    db: null,

    augur: require("augur.js"),

    watcher: null,

    connect: function (config, callback) {
        var self = this;
        if (config.leveldb) {
            levelup(config.leveldb, function (err, db) {
                if (err) return callback(err);
                self.db = db;
                if (callback) {
                    self.augur.connect(config.ethereum, config.ipcpath, function () {
                        callback(null);
                    });
                } else {
                   self.augur.connect(config.ethereum, config.ipcpath);
                }
            });
        }

    },

    disconnect: function () {
        if (this.db && typeof this.db === "object") {
            this.db.close();
            this.db = null;
        }
    },

    remove: function (id, callback) {
        if (!this.db) return callback("db not found");
        callback = callback || noop;
        this.db.del(id, function (err) {
            return callback(err);
        });
    },

    // select market using market ID
    select: function (id, callback) {
        if (!this.db) return callback("db not found");
        if (!id) return callback("no market specified");
        callback = callback || function (e, r) { console.log(e, r); };
        this.db.get(id, {valueEncoding: 'json'}, function (err, value) {
            if (err) return callback(err);
            callback(null, value);
        });
    },

    upsert: function (doc, callback) {
        if (!this.db) return callback("db not found");
        callback = callback || noop;
        this.db.put(doc._id, doc, {valueEncoding: 'json'}, function (err) {
            if (err) return callback(err);
            callback(null, true);
        });
    },

    scan: function (config, callback) {
        var self = this;
        config = config || {};
        callback = callback || noop;
        if (this.db && typeof this.db === "object") {
            var branchId = this.augur.branches.dev;
            var marketsPerPage = 15;

            // request data from geth via JSON RPC
            self.augur.getNumMarketsBranch(branchId, function (numMarkets) {
                if (!numMarkets || isNaN(numMarkets)) return callback("no markets found");
                numMarkets = parseInt(numMarkets);
                numMarkets = (config.limit) ? Math.min(config.limit, numMarkets) : numMarkets;
                var numPages = Math.ceil(numMarkets / Number(marketsPerPage));
                var range = new Array(numPages);
                for (var i = 0; i < numPages; ++i) {
                    range[numPages - i - 1] = i*marketsPerPage;
                }
                var markets = {};
                async.forEachOfSeries(range, function (offset, index, next) {
                    var numMarketsToLoad = (index === 0) ? numMarkets - range[index] : marketsPerPage;
                    self.augur.getMarketsInfo({
                        branch: branchId,
                        offset: offset,
                        numMarketsToLoad: numMarketsToLoad,
                        callback: function (marketsInfo) {
                            if (!marketsInfo || marketsInfo.error) return next(marketsInfo || "getMarketsInfo");
                            async.each(marketsInfo, function (marketInfo, nextMarket) {

                                self.augur.getMarketCreationBlock(marketInfo._id, function (creationBlock) {
                                    if (creationBlock && !creationBlock.error) {
                                        marketInfo.creationBlock = creationBlock;
                                    }
                                    self.augur.getMarketPriceHistory(marketInfo._id, {fromBlock: marketInfo.creationBlock || "0x1"}, function (priceHistory) {
                                        if (priceHistory && !priceHistory.error) {
                                            marketInfo.priceHistory = priceHistory;
                                        }
                                        markets[marketInfo._id] = marketInfo;
                                        nextMarket();
                                    });
                                });
                            }, function (err) {
                                if (err) return next(err);
                                next();
                            });
                        }
                    });
                }, function (err) {
                    if (err) return callback(err);
                    callback(null, numMarkets, markets);
                });
            });
        } else {
            this.connect(config, function (err) {
                if (err) return callback(err);
                self.augur.connect(config.ethereum);
                self.scan(config, callback);
            });
        }
    },

    watch: function (config, callback) {
        var self = this;
        config = config || {};

        function upsertFilterDoc(filtrate, doc) {
            console.log("Doc:", doc);
            //console.log(doc);
            var code = (filtrate.price) ? -1 : -2;
            if (self.debug) {
                console.log("Filtrate:", JSON.stringify(filtrate, null, 2));
                console.log("Document:", JSON.stringify(doc, null, 2));
            }
            if (!filtrate.price && filtrate.blockNumber) {
                doc.creationBlock = parseInt(filtrate.blockNumber);
            }

            self.upsert(doc, function (err, success) {
                if (err) return console.error("filter upsert error:", err, filtrate, doc);
                if (callback) callback(null, code, {
                    filtrate: filtrate,
                    doc: doc,
                    success: success
                });
            });
        }

        function collectFiltrate(filtrate) {
            console.log("collettFiltrate:", filtrate)
            if (self.debug) console.log(filtrate);
            if (filtrate) {
                if (filtrate.marketId && !filtrate.error) {
                    self.collect(filtrate.marketId, function (err, doc) {
                        if (err) return console.error("filter error:", err, filtrate);
                        upsertFilterDoc(filtrate, doc);
                    });
                } else {
                    console.error("filter error: no marketId field", filtrate);
                }
            }
        }

        this.connect(config, function (err) {
            if (err) {
                if (callback) callback(err);
            } else {
                if (self.debug) console.log("Connected");
                if (config.filtering) {
                    self.augur.filters.listen({
                        /**
                            { user: '0x05ae1d0ca6206c6168b42efcd1fbe0ed144e821b',
                              marketId: '-0xcaa8317a2d53b432c94180c591f09c30594e72cb6f747ef12be1bb5504c664bc',
                              outcome: '1',
                              price: '1.00000000000000002255',
                              cost: '-1.00000000000000008137',
                              blockNumber: '4722' }
                         */
                        log_price: collectFiltrate,
                        /**
                            { marketId: "-0x65ba5a9c2db024df5cdd4db31a0343608758ebdfcd69bf4eb1810d77502b932e",
                              blockNumber: "20542" }
                         */
                        creation: collectFiltrate
                    });
                }
                (function pulse() {
                    if (config.scan) {
                        self.scan(config, function (err, updates, markets) {
                            console.log("Markets: ", markets);
                            if (callback) {
                                if (err) return callback(err);
                                callback(null, updates);
                            }
                        });
                        if (config.interval) {
                            self.watcher = setTimeout(pulse, config.interval || INTERVAL);
                        }
                    }
                })();
            }
        });
    },

    unwatch: function () {
        if (this.augur.filters.price_filter.id ||
            this.augur.filters.contracts_filter.id)
        {
            this.augur.filters.ignore(true);
        }
        if (this.watcher) {
            clearTimeout(this.watcher);
            this.watcher = null;
        }
        if (this.db) {
            this.db.close();
            this.db = null;
        }
        return !(
            this.watcher && this.db &&
            this.augur.filters.price_filter.id &&
            this.augur.filters.price_filter.heartbeat
        );
    }

};
