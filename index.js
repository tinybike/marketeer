/**
 * Augur market monitor
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var async = require("async");
var levelup = require('levelup');
var sublevel = require('level-sublevel')
var offset_stream = require('offset-stream');

var INTERVAL = 600000; // default update interval (10 minutes)
var noop = function () {};

module.exports = {

    debug: false,

    db: null,
    db_blocks: null,
    db_ids: null,

    augur: require("augur.js"),

    watcher: null,

    connect: function (config, callback) {
        var self = this;
        if (config.leveldb) {
            levelup(config.leveldb, function (err, db) {
                if (err) return callback(err);
                self.db = sublevel(db);
                self.db_blocks = self.db.sublevel('blocks');
                self.db_ids = self.db.sublevel('ids');
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
        if (this.db && typeof this.db === "object"
            && this.db_ids && typeof this.db_ids === "object"
            && this.db_blocks && typeof this.db_blocks === "object") {
            this.db.close();
            this.db = null;
            this.db_ids = null;
            this.db_blocks = null;
        }
    },


    removeHelper: function (id, callback, db) {
        if (!db) return callback("db not found");
        callback = callback || noop;
        db.del(id, function (err) {
            return callback(err);
        });
    },

    remove: function (id, callback) {
        this.removeHelper(id, callback, this.db_ids);
    },

    removeByBlock: function (id, callback) {
        this.removeHelper(id, callback, this.db_blocks);
    },

    selectHelper: function (id, callback, db){
        if (!db) return callback("db not found");
        if (!id) return callback("no market specified");
        callback = callback || function (e, r) { console.log(e, r); };
        db.get(id, {valueEncoding: 'json'}, function (err, value) {
            if (err) return callback(err);
            callback(null, value);
        });
    },

    // select market using market ID
    select: function (id, callback) {
        return this.selectHelper(id, callback, this.db_ids);
    },

    selectByBlock: function (id, callback) {
        return this.selectHelper(id, callback, this.db_blocks);
    },

    //This will write data twice - once by id, once by block# + id.
    //This allows individual market lookup, and chronological order fetches
    upsert: function (doc, callback) {
        if (!this.db_ids || !this.db_blocks) return callback("db not found");
        if (!doc._id || !doc.creationBlock) return callback("_id and creationBlock not found");

        callback = callback || noop;

        this.db_ids.put(doc._id, doc, {valueEncoding: 'json'}, function (err) {
            if (err) return callback(err);
        });

        var block_key = doc.creationBlock + "_" + doc._id;
        this.db_blocks.put(block_key, doc, {valueEncoding: 'json'}, function (err) {
            if (err) return callback(err);
        });
        console.log(block_key);
        callback(null, true);
    },


    getMarkets: function(limit, offset, callback){
        if (!this.db_blocks) return callback("db not found");
        if (!offset || offset < 0) offset = 0;
        var total = (!limit || limit < 0) ? Number.MAX_VALUE : limit + offset;
        console.log(total);
        this.db_blocks.createReadStream({ keys: false, values: true, reverse: false, limit: total})
            .pipe(offset_stream(offset))
            .on('data', function (data) {
                console.log('value=', data)
            });
        callback("hi");
    },

    scan: function (config, callback) {
        var self = this;
        config = config || {};
        callback = callback || noop;

        function upsertMarket(doc){
            if (self.debug) {
                //console.log("Doc:", JSON.stringify(marketInfo, null, 2));
            }
            self.upsert(doc, function (err, success) {
                if (err) return console.error("scan upsert error:", err, doc);
            });
        }

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
                                    //console.log(JSON.stringify(marketInfo));
                                    nextMarket();
                                });
                            }, function (err) {
                                if (err) return next(err);
                                next();
                            });
                        }
                    });
                }, function (err) {
                    if (err) return callback(err);
                    callback(null, numMarkets);
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
