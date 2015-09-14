/**
 * Augur market monitor
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var async = require("async");
var MongoClient = require("mongodb").MongoClient;

var INTERVAL = 1800000; // default update interval (30 minutes)

module.exports = {

    debug: false,

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
            self.augur.bignumbers = false;
            self.augur.connect(config.ethereum);
            if (callback) callback(null);
        });
    },

    disconnect: function () {
        this.db.close();
        this.db = null;
    },

    select: function (market, callback) {
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

    collect: function (market, callback) {
        var self = this;
        // note: doc field names match the UI's market object
        var doc = {
            _id: market,
            id: market,
            events: [],             // hex: getMarketEvents
            price: null,            // str: price
            tradingFee: null,       // str: getTradingFee
            creationFee: null,      // str: getCreationFee
            description: null,      // str: getDescription
            traderId: null,         // str: getParticipantNumber (tabulate all of them?)
            author: null,           // hex: getCreator
            traderCount: null,      // str: getMarketInfo[0]
            alpha: null,            // str: getMarketInfo[1]
            numOutcomes: null,      // int: getMarketInfo[3]
            tradingPeriod: null,    // str: getMarketInfo[4]
            invalid: null,          // t/f: numOutcomes < 2
            outcomes: new Array(2), // { id: int, shares: str, outstandingShares: int, price: str, priceHistory: NYI }
            eventOutcome: null,
            winningOutcomes: [],
            endDate: null,
            participants: {}
        };
        this.augur.getNumEvents(market, function (numEvents) {
            if (numEvents && !numEvents.error) {
                doc.numEvents = numEvents;
            }
            self.augur.getTradingFee(market, function (tradingFee) {
                if (tradingFee && !tradingFee.error) {
                    doc.tradingFee = tradingFee;
                }
                async.each([1, 2], function (outcome, nextOutcome) {
                    doc.outcomes[outcome - 1] = {
                        id: outcome,
                        priceHistory: null,
                        shares: {}, // { account: shares }
                        outstandingShares: null,
                        price: null
                    };
                    self.augur.getMarketOutcomeInfo(market, outcome, function (marketOutcomeInfo) {
                        if (marketOutcomeInfo && !marketOutcomeInfo.error) {
                            doc.outcomes[outcome - 1].outstandingShares = marketOutcomeInfo[0];
                            doc.outcomes[outcome - 1].price = marketOutcomeInfo[2];
                        }
                        if (outcome === 2) doc.price = marketOutcomeInfo[2];
                        nextOutcome();
                    });
                }, function (err) {
                    if (err) console.error(err);
                    self.augur.getCreationFee(market, function (creationFee) {
                        if (creationFee && !creationFee.error) {
                            doc.creationFee = creationFee;
                        }
                        self.augur.getCreator(market, function (author) {
                            if (author && !author.error) {
                                doc.author = author;
                            }
                            self.augur.getMarketInfo(market, function (marketInfo) {
                                if (marketInfo && !marketInfo.error && marketInfo.constructor === Array && marketInfo.length >= 6) {
                                    doc.traderCount = marketInfo[0];
                                    doc.alpha = marketInfo[1];
                                    doc.numOutcomes = parseInt(marketInfo[3]);
                                    doc.tradingPeriod = marketInfo[4];
                                    doc.invalid = (doc.numOutcomes < 2);
                                    var traders = new Array(doc.traderCount);
                                    for (var i = 0; i < doc.traderCount; ++i) {
                                        traders[i] = i;
                                    }
                                    async.each(traders, function (trader, nextTrader) {
                                        self.augur.getParticipantID(market, trader, function (address) {
                                            if (address && !address.error) {
                                                doc.participants[address] = trader;
                                                async.each([1, 2], function (outcome, nextOutcome) {
                                                    self.augur.getParticipantSharesPurchased(market, trader, outcome, function (shares) {
                                                        if (shares && !shares.error) {
                                                            doc.outcomes[outcome - 1].shares[address] = shares;
                                                        }
                                                        nextOutcome();
                                                    });
                                                }, function (err) {
                                                    if (err) console.error(err);
                                                    nextTrader();
                                                });
                                            } else {
                                                nextTrader();
                                            }
                                        });
                                    }, function (err) {
                                        if (err) console.error(err);
                                        self.augur.getDescription(market, function (marketDescription) {
                                            if (marketDescription && !marketDescription.error) {
                                                doc.description = marketDescription;
                                            }
                                            self.augur.getMarketEvents(market, function (events) {
                                                if (events && events.constructor === Array && events.length === parseInt(numEvents) && !events.error) {
                                                    self.augur.getWinningOutcomes(market, function (winningOutcomes) {
                                                        if (winningOutcomes && !winningOutcomes.error) {
                                                            doc.winningOutcomes = winningOutcomes.slice(0, events.length);
                                                            self.augur.getExpiration(events[0], function (endDate) {
                                                                if (endDate && !endDate.error) {
                                                                    doc.endDate = endDate; // blocknumber
                                                                }
                                                                async.each(events, function (thisEvent, nextEvent) {
                                                                    var eventDoc = {
                                                                        id: thisEvent,
                                                                        description: null,
                                                                        outcome: null
                                                                    };
                                                                    self.augur.getDescription(thisEvent, function (eventDescription) {
                                                                        if (eventDescription && !eventDescription.error) {
                                                                            eventDoc.description = eventDescription;
                                                                        }
                                                                        self.augur.getOutcome(thisEvent, function (outcome) {
                                                                            if (outcome && !outcome.error) {
                                                                                eventDoc.outcome = outcome;
                                                                                doc.eventOutcome = outcome;
                                                                            }
                                                                            doc.events.push(eventDoc);
                                                                            nextEvent();
                                                                        });
                                                                    });
                                                                }, function (err) {
                                                                    if (err) console.error(err);
                                                                    callback(null, doc);
                                                                });
                                                            });
                                                        } else {
                                                            callback(null, doc);
                                                        }
                                                    });
                                                } else {
                                                    doc.invalid = true;
                                                    callback(null, doc);
                                                }
                                            });
                                        });
                                    });
                                } else {
                                    callback(null, doc);
                                }
                            });
                        });
                    });
                });
            });
        });
    },

    scan: function (config, callback) {
        var self = this;
        config = config || {};
        if (this.db && typeof this.db === "object") {
            this.augur.getMarkets(this.augur.branches.dev, function (markets) {
                var numMarkets = markets.length;
                if (config.limit && config.limit < numMarkets) {
                    markets = markets.slice(numMarkets - config.limit, numMarkets);
                    numMarkets = config.limit;
                }
                if (self.debug) {
                    console.log("Scanning", numMarkets, "markets...");
                }
                var updates = 0;
                async.each(markets, function (market, nextMarket) {
                    self.collect(market, function (err, doc) {
                        if (err) return nextMarket(err);
                        if (doc) self.upsert(doc, function (err) {
                            ++updates;
                            nextMarket(err);
                        });
                    });
                }, function (err) {
                    if (err) {
                        // if (callback) return callback(err);
                        // throw err;
                        return console.error(err);
                    }
                    callback(err, updates);
                });
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
            if (self.debug) console.log("Connected");
            if (config.filtering) {
                self.augur.filters.listen({
                    price: function (update) {
                        // { user: '0x00000000000000000000000005ae1d0ca6206c6168b42efcd1fbe0ed144e821b',
                        //   marketId: '-0xcaa8317a2d53b432c94180c591f09c30594e72cb6f747ef12be1bb5504c664bc',
                        //   outcome: '1',
                        //   price: '1.00000000000000002255',
                        //   cost: '-1.00000000000000008137',
                        //   blockNumber: '4722' }
                        self.collect(update.marketId, function (err, doc) {
                            if (err) return console.error(err, update);
                            (function (updated) {
                                self.upsert(updated.market, function (err, success) {
                                    updated.success = success;
                                    if (err) return console.error(err);
                                    if (callback) return callback(null, -1, updated);
                                    console.log(updated);
                                });
                            })({ update: update, market: doc });
                        });
                    },
                    contracts: function (tx) {
                        // { address: '0xc1c4e2f32e4b84a60b8b7983b6356af4269aab79',
                        //   topics: 
                        //    [ '0x1a653a04916ffd3d6f74d5966492bda358e560be296ecf5307c2e2c2fdedd35a',
                        //      '0x00000000000000000000000005ae1d0ca6206c6168b42efcd1fbe0ed144e821b',
                        //      '0x3557ce85d2ac4bcd36be7f3a6e0f63cfa6b18d34908b810ed41e44aafb399b44',
                        //      '0x0000000000000000000000000000000000000000000000000000000000000001' ],
                        //   data: 
                        //    [ '0x000000000000000000000000000000000000000000000001000000000000d330',
                        //      '0xfffffffffffffffffffffffffffffffffffffffffffffffeffffffffffffffa3' ],
                        //   blockNumber: '0x110d',
                        //   logIndex: '0x0',
                        //   blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
                        //   transactionHash: '0x8481c76a1f88a203191c1cd1942963ff9f1ea31b1db02f752771fef30133798e',
                        //   transactionIndex: '0x0' }
                        if (tx && tx.topics &&
                            tx.topics.constructor === Array && tx.topics.length >= 3)
                        {
                            self.collect(tx.topics[2], function (err, doc) {
                                if (err) return console.error(err, tx);
                                (function (updated) {
                                    self.upsert(updated.market, function (err, success) {
                                        updated.success = success;
                                        if (err) return console.error(err);
                                        if (callback) return callback(null, -2, updated);
                                        console.log(updated);
                                    });
                                })({ tx: tx, market: doc });
                            });
                        }
                    }
                });
            }
            (function pulse() {
                self.scan(config, function (err, updates) {
                    if (err) {
                        if (callback) return callback(err);
                        throw err;
                    }
                    if (callback) return callback(null, updates);
                    console.log(
                        (new Date()).toString() + ":",
                        updates, "market(s) updated"
                    );
                });
                if (config.interval) {
                    self.watcher = setTimeout(pulse, config.interval || INTERVAL);
                }
            })();
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
        return !(this.watcher && this.augur.filters.price_filter.id &&
                 this.augur.filters.price_filter.heartbeat && this.db);
    }

};
