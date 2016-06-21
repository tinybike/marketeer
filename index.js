/**
 * Augur market monitor
 * @author Jack Peterson (jack@tinybike.net), Keivn Day (@k_day)
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

    //List of market properties to cache
    marketProps: {_id:1, tradingPeriod:1, tradingFee:1, creationTime:1, volume:1, tags:1, endDate:1, description:1},

    connect: function (config, callback) {
        var self = this;
        callback = callback || noop;

        self.augur.connect(config, () => {
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

    upsertMarket: function(market){
        var self = this;

        function filterProps(){
            for (var prop in market) {
                if (!self.marketProps[prop]){
                    delete market[prop];
                }
            }
        }
        //Only need to cache a subset of fields.
        filterProps();
        console.log(market);
        self.upsert(market, function (err) {
            if (err) return console.error("scan upsert error:", err);
        });
    },

    scan: function (config, callback) {
        var self = this;
        config = config || {};
        callback = callback || noop;

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
                                self.upsertMarket(marketInfo);
                                nextMarket();
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

        function marketCreated(filtrate) {
            if (!filtrate) return;

            for (var i = 0; i < filtrate.length; ++i){
                var doc = filtrate[i];
                if (!doc['data']) continue;
                self.augur.getMarketInfo(doc['data'], (marketInfo) => {
                    marketInfo['_id']=doc['data'];
                    self.upsertMarket(marketInfo);
                });
            }
        }

        this.connect(config, (err) => {
            if (err) {
                if (callback) callback(err);
            } else {
                if (self.debug) console.log("Connected");
                if (config.filtering) {
                    self.augur.filters.listen({
                        marketCreated: marketCreated,
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
