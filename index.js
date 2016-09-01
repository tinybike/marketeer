/**
 * Augur market monitor
 * @author Jack Peterson (jack@tinybike.net), Keivn Day (@k_day)
 */

"use strict";

var async = require("async");
var levelup = require('levelup');
var sublevel = require('level-sublevel');

var MarketStreamTransform = require('./marketStreamTransform');
var marketTransform = MarketStreamTransform({ objectMode: true });

var noop = function () {};

module.exports = {

    debug: false,

    db: null,
    dbMarketInfo: null,
    dbMarketInfoTruncated: null,
    dbMarketPriceHistory: null,
    dbAccountTrades: null,
    
    augur: require("augur.js"),

    watcher: null,

    //List of market properties to cache for quick getMarketsInfo lookup
    marketProps: {tradingPeriod: 1, 
                  tradingFee: 1, 
                  creationTime: 1, 
                  volume: 1, 
                  tags: 1, 
                  endDate: 1, 
                  description: 1, 
                  makerFee: 1, 
                  takerFee: 1,
                  branchId: 1 },

    idRegex: /^(0x)(0*)(.*)/,

    connect: function (config, callback) {
        var self = this;
        callback = callback || noop;

        self.augur.connect(config, () => {
            self.augur.rpc.debug.abi = true;
            self.augur.rpc.retryDroppedTxs = true;
            self.augur.rpc.POST_TIMEOUT = 120000
            //self.augur.rpc.debug.broadcast = true;
            if (config.db){
                levelup(config.db, (err, db) => {
                    if (err) return callback(err);
                    self.db = sublevel(db);
                    self.dbMarketInfo = self.db.sublevel('markets');
                    self.dbMarketInfoTruncated = self.db.sublevel('marketstruncated');
                    self.dbMarketPriceHistory = self.db.sublevel('pricehistory');
                    self.dbAccountTrades = self.db.sublevel('accounttrades');
                    return callback(null);
                });
            }
        });
    },

    //some ids returned from filters with leading 0s. This removes them
    //e.g, 0x0a12345 => 0x12345
    normalizeId: function (id){
        var self = this;

        if (!id) return null;
        var m;
        if ((m = self.idRegex.exec(id)) !== null) {
            return (m[1]+m[3]);
        }
        return null;
    },

    disconnect: function (callback) {
        var self = this;
        callback = callback || function (e, r) { console.log(e, r); };

        if (!self.db || typeof self.db !== "object"){
            return callback("db not found");
        }
        self.db.close( (err) => {
            if (err) return callback(err);
            self.db = null;
            self.dbMarketInfo = null;
            self.dbMarketInfoTruncated = null;
            self.dbMarketPriceHistory = null;
            self.dbAccountTrades = null;

            return callback(null);
        });
    },

    removeMarketInfo: function (id, callback) {
        var self = this;
        id = normalizeId(id);
        if (!id) return callback("no market specified");
        if (!self.dbMarketInfo) return callback("db not found");
        if (!self.dbMarketInfoTruncated || !self.dbMarketInfoTruncated) return callback("marketsInfo not loaded");
        
        //TODO: fetch to get branch, delete, delete from mem.
        self.dbMarketInfo.del(id, (err) => {
            if (err) return callback(err);
            self.dbMarketInfoTruncated.del(id, (err) => {
                if (err) return callback(err);
                return callback(null);
            });
        });
    },

    // select market using market ID
    getMarketInfo: function (id, callback) {
        var self = this;
        id = self.normalizeId(id);
        if (!id) return callback("no market specified");
        if (!self.dbMarketInfo) return callback("Database not available");

        self.dbMarketInfo.get(id, {valueEncoding: 'json'}, function (err, value) {
            if (err) {
                if (err.notFound) {return callback("id not found");}
                return callback(err);
            }
            return callback(null, JSON.stringify(value));
        });
    },

    getMarketsInfo: function(branch, callback){
        var self = this;        
        branch = branch || this.augur.constants.DEFAULT_BRANCH_ID;
        if (!self.dbMarketInfoTruncated) return callback("marketsInfo not loaded");
        //if (!self.marketsInfo[branch]) return callback(null, "{}");
        var marketStream = self.dbMarketInfoTruncated.createReadStream({valueEncoding: 'json'});
        marketStream = marketStream.pipe(marketTransform);
        return callback(null, marketStream);
    },

    batchGetMarketInfo: function(ids, callback){
        var self = this;
        if (!ids || ids.constructor !== Array) return callback("array of ids expected");
        if (!self.dbMarketInfo) return callback("Database not available");

        var info = {};
        async.each(ids, function (id, nextID){
            id = self.normalizeId(id);
            self.dbMarketInfo.get(id, {valueEncoding: 'json'}, function (err, value) {
                //skip invalid ids
                if (!err) { info[id] = value };
                nextID();
            });
        }, (err) => {
            if (err) return callback(err);
            callback(null, JSON.stringify(info));
        });
    },

    getMarketPriceHistory: function(id, options, callback){
        var self = this;

        if (!callback && self.augur.utils.is_function(options)) {
            callback = options;
            options = null;
        }

        id = self.normalizeId(id);
        if (!id) return callback("invalid market id");
        if (!self.dbMarketInfo) return callback("Database not available");
        
        self.dbMarketPriceHistory.get(id, {valueEncoding: 'json'}, function (err, history) {
            if (err) {
                if (err.notFound) {return callback("id not found");}
                return callback(err);
            }
            //return the whole thing
            if (!options || ( !options['fromBlock'] && !options['toBlock'])){
                return callback(null, JSON.stringify(history));
            }

            var from = options.fromBlock || 0;
            var to = options.toBlock || Number.MAX_VALUE;

            //filter out blocks not in range.
            for (var outcome in history) {
                history[outcome] = history[outcome].filter(function (price){ 
                    return price.blockNumber >= from && price.blockNumber <= to;
                });
            }
            return callback(null, JSON.stringify(history));
        });
    },

    getAccountTrades: function(account, options, callback){
        var self = this;

        if (!callback && self.augur.utils.is_function(options)) {
            callback = options;
            options = null;
        }

        account = self.normalizeId(account);
        if (!account) return callback("invalid account id");
        if (!self.dbAccountTrades) return callback("Database not available");
        
        self.dbAccountTrades.get(account, {valueEncoding: 'json'}, function (err, trades) {
            if (err) {
                if (err.notFound) {return callback("account not found");}
                return callback(err);
            }
            //return the whole thing
            if (!options || ( !options['fromBlock'] && !options['toBlock'])){
                return callback(null, JSON.stringify(trades));
            }

            var from = options.fromBlock || 0;
            var to = options.toBlock || Number.MAX_VALUE;

            //filter out blocks not in range.
            for (var market in trades){
               for (var outcome in trades[market]){
                    trades[market][outcome] = trades[market][outcome].filter(function (price){ 
                        return price.blockNumber >= from && price.blockNumber <= to;
                    });
                    //if no trades mmatch filter, delete outcome
                    if (!trades[market][outcome].length){
                        delete trades[market][outcome];
                    }
                }
                //if no market has no outcomes that match filter, delete market.
                if (Object.keys(trades[market]).length === 0){
                    delete trades[market];
                }
            }
            return callback(null, JSON.stringify(trades));
        });
    },

    filterProps: function (doc){
        var self = this;
        for (var prop in doc) {
            if (!self.marketProps[prop]){
                delete doc[prop];
            }
        }
    },

    upsertMarketInfo: function(id, market, callback){
        var self = this;
        if (self.debug) console.log("upsertMarketInfo:", id, market);
        callback = callback || noop;
        id = self.normalizeId(id);
        if (!id) return callback ("upsertMarketInfo: id not found");
        if (!self.db || !self.dbMarketInfo || !self.dbMarketInfoTruncated) return callback("upsertMarketInfo: db not found");
        if (!market) return callback("upsertMarketInfo: market data not found");
        if (!market.branchId) return callback("upsertMarketInfo: branchId not found in market data");

        delete market.sortOrder;
        //Storing data twice - once with full market info, another with truncated data
        //for more efficient getMarketsInfo scans/searches
        self.dbMarketInfo.put(id, market, {valueEncoding: 'json'}, (err) => {
            if (err) return callback("upsertMarket error:", err);
            var cacheInfo = JSON.parse(JSON.stringify(market));
            self.filterProps(cacheInfo);
            
            self.dbMarketInfoTruncated.put(id, cacheInfo, {valueEncoding: 'json'}, (err) => {
                if (err) return callback("upsertMarket error:", err);
                return callback(null);
            });
        });
    },

    upsertPriceHistory: function(id, priceHistory, callback){
        var self = this;
        callback = callback || noop;
        id = self.normalizeId(id);
        if (!id) return callback ("upsertPriceHistory: id not found");
        if (!self.db || !self.dbMarketPriceHistory) return callback("upsertPriceHistory: db not found");
     
        self.dbMarketPriceHistory.put(id, priceHistory, {valueEncoding: 'json'}, (err) => {
            if (err) return callback("upsertPriceHistory error:", err);
            return callback(null);
        });
    },

     upsertAccountTrades: function(account, trades, callback){
        var self = this;
        callback = callback || noop;
        account = self.normalizeId(account);
        if (!account) return callback ("upsertAccountTrades: account not found");
        if (!self.db || !self.dbAccountTrades) return callback("upsertAccountTrades: db not found");
     
        if (self.debug) console.log("upsertAccountTrades:", account, trades);

        self.dbAccountTrades.put(account, trades, {valueEncoding: 'json'}, (err) => {
            if (err) return callback("upsertAccountTrades error:", err);
            return callback(null);
        });
    },

    //collects accounts from priceHistory objects.
    getAccountsFromPriceHistory: function(priceHistory){
        if (typeof priceHistory !== "object") return [];

        var accounts = [];
        for (var outcome in priceHistory){
            accounts = accounts.concat(priceHistory[outcome].map( (item) => { 
                return item.user; 
            }));
        }
        return accounts;
    },

    scan: function (config, callback) {

        var self = this;
        var accounts = [];
        var numMarkets = 0;
        
        function loadMarkets(data, callback) {
            
            self.augur.batchGetMarketInfo(data.ids, (markets) => {
                if (!markets) return callback("error fetching markets");
                async.each(Object.keys(markets), function (id, nextMarket) {
                    var marketInfo = markets[id];
                    if (!marketInfo) nextMarket("error loading marketInfo");

                    self.upsertMarketInfo(id, marketInfo, (err) => {                     
                        if (err) return callback(err);
                        var priceHistory = self.augur.getMarketPriceHistory(id);
                        if (priceHistory){
                            self.upsertPriceHistory(id, priceHistory, (err) => {
                                if (err) return nextMarket(err);
                                accounts = accounts.concat(self.getAccountsFromPriceHistory(priceHistory));
                                return nextMarket(null);
                            });   
                        }else{
                            return nextMarket(null);
                        }
                    });
                }, function (err) {
                    if (data.status) console.log(data.status);
                    if (err) return callback(err);
                    return callback(null);
                });
            });
            
        }

        function loadAccount(data, callback) {
            self.augur.getAccountTrades(data.account, (trades) => {
                if (data.status) console.log(data.status);
                if (trades){
                    self.upsertAccountTrades(data.account, trades, (err) => {
                        if (err) return callback(err);
                        return callback(null);
                    });
                }else{
                    return callback(null);
                }
            });

        }

        //careful about setting # workers too high. Geth will choke
        var marketQueue = async.queue(loadMarkets, 10);
        var accountQueue = async.queue(loadAccount, 10);

        // called when all items in queue have been processed
        marketQueue.drain = function() {
            console.log('Done loading Markets');
            console.log("Loading Accounts");

            accounts = Array.from(new Set(accounts));
            if (!accounts.length) return callback(null, numMarkets);

            for (var i = 0; i < accounts.length; i++) {
                var account = accounts[i];
                var status = null;
                if (j%25==0){
                    status = (j/accounts.length*100).toFixed(2) + " % complete";
                }
                accountQueue.push({account: account, status: status}, function(err){
                    if (err) return callback(err);
                });
            }      
        }

        accountQueue.drain = function() {
            console.log('Done loading Accounts');
            return callback(null, numMarkets);
        }

        config = config || {};
        callback = callback || noop;

        
        if (this.db && typeof this.db === "object" && 
            this.dbMarketInfo && typeof this.dbMarketInfo === "object") {

            config.limit = config.limit || Number.MAX_VALUE;
            var branches = self.augur.getBranches();
            console.log("Loading Market Data and Price History");
            for (var i = 0; i < branches.length; i++) {
                if (numMarkets >= config.limit) continue;
                var branch = branches[i];

                //get a list of marketIds
                var marketIds = [];
                var step = 2000;
                var marketsInBranch = self.augur.getNumMarketsBranch(branch);
                for (var i = 0; i < marketsInBranch; i += step){
                    var end = Math.min(i+step, marketsInBranch);
                    marketIds = marketIds.concat(self.augur.getSomeMarketsInBranch(branch, i, end));
                }

                var batchSize = 5;
                for (var j = 0; j < marketIds.length; j += batchSize) {
                    if (numMarkets >= config.limit) break;
                    var remaining = config.limit - numMarkets;
                    var markets = marketIds.slice(j, j + Math.min(batchSize, remaining));
                    //print some occasional status info
                    var status = null;
                    if (j==0){
                        status = "Loading " + Math.min(remaining, marketIds.length) + " markets from branch " + branch;
                    }else if (j % (batchSize * 5) == 0){
                        status = (j/marketIds.length*100).toFixed(2) + " % complete";
                    }
                    marketQueue.push({ids: markets, status: status}, function(err) {
                        if (err) return callback(err);
                    });
                    numMarkets += Math.min(batchSize, remaining);
                }
            }
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
            if (!filtrate.marketID) return;
            var id = filtrate.marketID;
            if (self.debug) console.log("marketCreated filter:", id);
            self.augur.getMarketInfo(id, (marketInfo) => {
                if (self.debug) console.log("marketCreated filter info:", id, marketInfo);
                self.upsertMarketInfo(id, marketInfo);
            });
        }

        function priceChanged(filtrate) {
            if (!filtrate) return;
            if (self.debug) console.log("priceChanged filter:", filtrate);
            if (!filtrate['market']) return;
            if (!filtrate['maker']) return;
            if (!filtrate['taker']) return;

            var id = filtrate['market'];
            var maker = filtrate['maker'];
            var taker = filtrate['taker'];

            self.augur.getMarketInfo(id, (marketInfo) => {
                if (self.debug) console.log("priceChanged market info:", marketInfo);
                self.upsertMarketInfo(id, marketInfo);
            });

            self.augur.getMarketPriceHistory(id, (history) => {
                self.upsertPriceHistory(id, history);
            });

            self.augur.getAccountTrades(maker, (trades) => {
                self.upsertAccountTrades(maker, trades);
            });

            self.augur.getAccountTrades(taker, (trades) => {
                self.upsertAccountTrades(taker, trades);
            });
        }

        function feeChanged(filtrate) {
            if (self.debug) console.log("feeChanged filter:", filtrate);
            if (!filtrate) return;
            if (!filtrate['marketID']) return;
            var id = filtrate['marketID'];

            self.augur.getMarketInfo(id, (marketInfo) => {
                if (self.debug) console.log("feeChanged market info:", marketInfo);
                self.upsertMarketInfo(id, marketInfo);
            });
        }

        function txChange(filtrate) {
            if (self.debug) console.log("tx change:", filtrate);
            if (!filtrate) return;
            if (!filtrate['market']) return;
            var id = filtrate['market'];

            self.augur.getMarketInfo(id, (marketInfo) => {
                if (self.debug) console.log("tx change market info:", marketInfo);
                self.upsertMarketInfo(id, marketInfo);
            });
        }

        function doneSyncing(){

            function scanHelper(){
                if (!config.scan) {
                    if (callback) callback(null, 0);
                }else{
                    self.scan(config, (err, updates, markets) => {
                        if (callback) {
                            if (err) return callback(err);
                            callback(null, updates);
                        }
                    });
                }
            }

            //if we are filtering, delay watch callback/scan until filters are set up
            if (config.filtering) {
                self.augur.filters.listen({
                    marketCreated: marketCreated,
                    log_fill_tx: priceChanged,
                    tradingFeeUpdated: feeChanged,
                    log_add_tx: txChange,
                    log_cancel: txChange,
                }, function (filters) {
                    if (self.debug) console.log(filters);
                    scanHelper();
                });
            }else{
                scanHelper();
            }
        }

        this.connect(config, (err) => {
            if (err) {
                if (callback) callback(err);
            } else {
                if (self.debug) console.log("Connected");
                //Wait until syncing completes to scan/setup filters.
                function syncWait() {
                    try {
                        var syncing = self.augur.rpc.eth("syncing");
                        var peers = parseInt(self.augur.rpc.net("peerCount"));
                        if (self.debug) console.log("syncWait:", syncing, peers);
                        if (!peers){
                            console.log("Waiting for peers");
                            setTimeout(syncWait, 30000);
                            return;
                        }
                        if (syncing == false){
                            doneSyncing();
                        }else{
                            console.log('Blockchain still syncing:', (parseInt(syncing['currentBlock'])/parseInt(syncing['highestBlock'])*100).toFixed(1) + "% complete");
                            setTimeout(syncWait, 30000);
                        }
                    } catch (e) {
                        console.log("RPC error", e.toString());
                        setTimeout(syncWait, 30000);
                    }
                }
                syncWait();
            }
        });
    },

    unwatch: function (callback) {
        var self = this;

        callback = callback || noop;

        if (self.watcher) {
            clearTimeout(this.watcher);
            self.watcher = null;
        }
        self.augur.filters.ignore(true, callback);
    }

};
