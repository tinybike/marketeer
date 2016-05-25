/**
 * Augur market monitor
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var async = require("async");
var levelup = require('levelup');
var sublevel = require('level-sublevel')


var INTERVAL = 600000; // default update interval (10 minutes)
var noop = function () {};

module.exports = {

    debug: false,

    db: null,
    dbMarkets: null,
    marketData: null,
    
    augur: require("augur.js"),

    watcher: null,

    connect: function (config, callback) {
        var self = this;
        callback = callback || noop;

        self.augur.connect(config.ethereum, config.ipcpath, () => {
            if (config.leveldb){
                levelup(config.leveldb, (err, db) => {
                    self.db = sublevel(db);
                    self.dbMarkets = self.db.sublevel('markets');
                    self.populateMarkets(self.dbMarkets, (err) => {
                        if (err) return callback(err);
                        return callback(null);
                    });
                });
            }
        });
    },

    //deserialize db into memory
    populateMarkets: function(marketDB, callback){
        var self = this;
        self.marketData = {};
        if (!marketDB) return callback("db not found");

        marketDB.createValueStream({valueEncoding: 'json'})
        .on('data', (data) => {
            self.marketData[data._id] = data;
        }).on('end', () => {
            return callback(null);
        });
    },

    disconnect: function (callback) {
        var self = this;
        callback = callback || function (e, r) { console.log(e, r); };

        if (!self.db || typeof self.db !== "object"
             || !self.dbMarkets || typeof self.dbMarkets !== "object"){
            return callback("db not found");
        }
        self.db.close( (err) => {
            if (err) return callback(err);
            self.db = null;
            self.dbMarkets = null;
            self.marketData = {};
            return callback(null);
        });
    },

    remove: function (id, callback) {
        var self = this;
        if (!self.dbMarkets) return callback("db not found");
        if (!self.marketData) return callback("marketData not loaded");
        
        self.dbMarkets.del(id, (err) => {
            if (err) return callback(err);
            delete self.marketData[id];
            return callback(null);
        });
    },

    // select market using market ID
    select: function (id, callback) {
        var self = this;
        if (!id) return callback("no market specified");
        return callback(null, self.marketData[id]);
    },

    //Updates market data
    upsert: function (doc, callback) {
        var self = this;
        if (!self.db || !self.dbMarkets) return callback("db not found");
        if (!doc._id) return callback("_id not found");

        callback = callback || noop;
        self.dbMarkets.put(doc._id, doc, {valueEncoding: 'json'}, (err) => {
            if (err) return callback(err);
            self.marketData[doc._id] = doc;
            return callback(null);
        });
    },

    getMarkets: function(callback){
        var self = this;
        if (!self.marketData) return callback("marketData not loaded");
        return callback(null, JSON.stringify(self.marketData));
    },

    scan: function (config, callback) {
        var self = this;
        config = config || {};
        callback = callback || noop;

        function upsertMarket(doc){
            if (self.debug) {
                //console.log("Doc:", JSON.stringify(marketInfo, null, 2));
            }
            self.upsert(doc, function (err) {
                if (err) return console.error("scan upsert error:", err);
            });
        }

        //TODO: need to scan all branches?
        if (this.db && typeof this.db === "object" && 
            this.marketData && typeof this.marketData === "object") {
            var branchId = this.augur.branches.dev;
            var marketsPerPage = 15;

            // request data from geth via JSON RPC
            self.augur.getNumMarketsBranch(branchId, (numMarkets) => {
                if (!numMarkets || isNaN(numMarkets)) return callback("no markets found");
                numMarkets = parseInt(numMarkets);
                numMarkets = (config.limit) ? Math.min(config.limit, numMarkets) : numMarkets;
                var numPages = Math.ceil(numMarkets / Number(marketsPerPage));
                var range = new Array(numPages);
                for (var i = 0; i < numPages; ++i) {
                    range[numPages - i - 1] = i*marketsPerPage;
                }
                var markets = {};
                async.forEachOfSeries(range, (offset, index, next) => {
                    console.log("Scanning:", offset);
                    var numMarketsToLoad = (index === 0) ? numMarkets - range[index] : marketsPerPage;
                    self.augur.getMarketsInfo({
                        branch: branchId,
                        offset: offset,
                        numMarketsToLoad: numMarketsToLoad,
                        callback: function (marketsInfo) {
                            if (!marketsInfo || marketsInfo.error) return next(marketsInfo || "getMarketsInfo");
                            async.each(marketsInfo, function (marketInfo, nextMarket) {
                                self.augur.getMarketPriceHistory(marketInfo._id, {fromBlock: marketInfo.creationBlock || "0x1"}, function (priceHistory) {
                                    if (priceHistory && !priceHistory.error) {
                                        marketInfo.priceHistory = priceHistory;
                                    }
                                    markets[marketInfo._id] = marketInfo;
                                    upsertMarket(marketInfo);
                                    nextMarket();
                                });
                            }, (err) => {
                                if (err) return next(err);
                                next();
                            });
                        }
                    });
                }, (err) => {
                    if (err) return callback(err);
                    callback(null, numMarkets);
                });
            });
        } else {
            this.connect(config, (err) => {
                if (err) return callback(err);
                self.scan(config, callback);
            });
        }
    },

    watch: function (config, callback) {
        var self = this;
        config = config || {};

        function upsertFilterDoc(filtrate, doc) {
            //console.log("Doc:", doc);
            //console.log(doc);
            var code = (filtrate.price) ? -1 : -2;
            if (self.debug) {
                console.log("Filtrate:", JSON.stringify(filtrate, null, 2));
                console.log("Document:", JSON.stringify(doc, null, 2));
            }
            if (!filtrate.price && filtrate.blockNumber) {
                doc.creationBlock = parseInt(filtrate.blockNumber);
            }

            self.upsert(doc, (err) => {
                if (err) return console.error("filter upsert error:", err, filtrate, doc);
                if (callback) callback(null, code, {
                    filtrate: filtrate,
                    doc: doc,
                });
            });
        }

        function collectFiltrate(filtrate) {
            console.log("collettFiltrate:", filtrate)
            if (self.debug) console.log(filtrate);
            if (filtrate) {
                if (filtrate.marketId && !filtrate.error) {
                    self.collect(filtrate.marketId, (err, doc) => {
                        if (err) return console.error("filter error:", err, filtrate);
                        upsertFilterDoc(filtrate, doc);
                    });
                } else {
                    console.error("filter error: no marketId field", filtrate);
                }
            }
        }

        this.connect(config, (err) => {
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
                        self.scan(config, (err, updates, markets) => {
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
        var self = this;

        if (self.augur.filters.price_filter.id ||
            self.augur.filters.contracts_filter.id)
        {
            self.augur.filters.ignore(true);
        }
        if (self.watcher) {
            clearTimeout(this.watcher);
            self.watcher = null;
        }

        this.disconnect( (err) => {
            if (err) return 0;
            return !(
                this.watcher && this.db &&
                this.augur.filters.price_filter.id &&
                this.augur.filters.price_filter.heartbeat
            );
        });
    }

};
