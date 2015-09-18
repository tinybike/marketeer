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

    remove: function (market, callback) {
        if (this.db) {
            this.db.collection("markets").remove({ _id: market }, function (err, result) {
                if (err) {
                    if (callback) return callback(err);
                    throw err;
                }
                if (callback) callback(null, result);
            });
        }
    },

    select: function (market, callback) {
        if (this.db) {
            this.db.collection("markets").findOne({ _id: market }, function (err, result) {
                if (err) {
                    if (callback) return callback(err);
                    throw err;
                }
                if (callback) callback(null, result);
            });
        }
    },

    upsert: function (doc, callback) {
        if (this.db) {
            this.db.collection("markets").save(doc, { upsert: true }, function (err) {
                if (err) {
                    if (callback) return callback(err);
                    throw err;
                }
                if (callback) callback(null, true);
            });
        }
    },

    collect: function (market, callback) {
        var self = this;
        // note: doc field names (mostly) match the UI's market object
        var doc = {
            _id: market,
            branchId: null,
            events: [],           // hex: getMarketEvents
            price: null,          // str: price
            tradingFee: null,     // str: getTradingFee
            creationFee: null,    // str: getCreationFee
            description: null,    // str: getDescription
            author: null,         // hex: getCreator
            traderCount: null,    // str: getMarketInfo[0]
            alpha: null,          // str: getMarketInfo[1]
            numOutcomes: null,    // int: getMarketInfo[3]
            tradingPeriod: null,  // str: getMarketInfo[4]
            invalid: null,        // t/f: numOutcomes < 2
            outcomes: [],         // { id: int, shares: str, outstandingShares: int, price: str, priceHistory: NYI }
            eventOutcome: null,
            winningOutcomes: [],
            endDate: null,
            participants: {},
            comments: [],
            network: this.augur.rpc.version()
        };
        this.select(market, function (err, storedDoc) {
            if (err) {
                if (callback) return callback(err);
                throw err;
            }
            if (storedDoc) {
                for (var k in storedDoc) {
                    if (!storedDoc.hasOwnProperty(k)) continue;
                    doc[k] = storedDoc[k];
                }
            }
            self.augur.getBranchID(market, function (branchId) {
                if (branchId) {
                    if (branchId.error) {
                        console.log("getBranchID error:", branchId);
                    } else {
                        doc.branchId = branchId;
                    }
                }
                self.augur.getNumEvents(market, function (numEvents) {
                    if (numEvents) {
                        if (numEvents.error) {
                            console.log("getNumEvents error:", numEvents);
                        } else {
                            doc.numEvents = numEvents;
                        }
                    }
                    self.augur.getTradingFee(market, function (tradingFee) {
                        if (tradingFee) {
                            if (tradingFee.error) {
                                console.log("getTradingFee error:", tradingFee);
                            } else {
                                doc.tradingFee = tradingFee;
                            }
                        }
                        var allOutcomes = [1, 2];
                        doc.outcomes = new Array(allOutcomes.length);
                        async.each(allOutcomes, function (outcome, nextOutcome) {
                            var outcomeIndex = outcome - 1;
                            var stored = doc.outcomes[outcomeIndex];
                            if (!stored || !stored.length) {
                                doc.outcomes[outcomeIndex] = {
                                    id: outcome,
                                    priceHistory: [],
                                    outstandingShares: null,
                                    price: null,
                                    shares: {}
                                };
                            } else {
                                doc.outcomes[outcomeIndex].id = outcome;
                                doc.outcomes[outcomeIndex].priceHistory = stored.priceHistory || [];
                                doc.outcomes[outcomeIndex].outstandingShares = stored.outstandingShares || null;
                                doc.outcomes[outcomeIndex].price = stored.price || null;
                                if (stored.shares && Object.keys(stored.shares).length) {
                                    for (var k in stored.shares) {
                                        if (!stored.shares.hasOwnProperty(k) || !parseInt(k)) continue;
                                        doc.outcomes[outcomeIndex].shares[k] = stored.shares[k];
                                    }
                                } else {
                                    doc.outcomes[outcomeIndex].shares = {};
                                }
                            }
                            self.augur.getMarketOutcomeInfo(market, outcome, function (marketOutcomeInfo) {
                                if (marketOutcomeInfo) {
                                    if (marketOutcomeInfo.error) {
                                        console.log("getMarketOutcomeInfo error:", marketOutcomeInfo);
                                    } else {
                                        doc.outcomes[outcomeIndex].outstandingShares = marketOutcomeInfo[0];
                                        doc.outcomes[outcomeIndex].price = marketOutcomeInfo[2];
                                        if (outcome === 2) {
                                            doc.price = marketOutcomeInfo[2];
                                        }
                                    }
                                }
                                nextOutcome();
                            });
                        }, function (err) {
                            if (err) console.log("async.each(outcomes) error:", err);
                            self.augur.getCreationFee(market, function (creationFee) {
                                if (creationFee) {
                                    if (creationFee.error) {
                                        console.log("getCreationFee error:", creationFee);
                                    } else {
                                        doc.creationFee = creationFee;
                                    }
                                }
                                self.augur.getCreator(market, function (author) {
                                    if (author) {
                                        if (author.error) {
                                            console.log("getCreator error:", author);
                                        } else {
                                            doc.author = author;
                                        }
                                    }
                                    var comments = self.augur.comments.getMarketComments(market);
                                    // [ { whisperId: '0x04aec3e929a511be478cab0de7...',
                                    //     from: '0x639b41c4d3d399894f2a57894278e1653e7cd24c',
                                    //     comment: 'o3g50msfpnl8fr',
                                    //     time: 1442272587 },
                                    //   { whisperId: '0x04d2f7b8e6fa3a4ba00f988091...',
                                    //     from: '0x639b41c4d3d399894f2a57894278e1653e7cd24c',
                                    //     comment: 'lgn7ch1sdzpvi',
                                    //     time: 1442272586 }, ... ]
                                    if (comments) {
                                        if (comments.error) {
                                            console.log("getMarketComments error:", comments);
                                        } else if (comments.constructor === Array && comments.length &&
                                                   comments[0].comment && comments[0].time) {
                                            comments.reverse();
                                            doc.comments = comments;
                                        } else {
                                            console.log("getMarketComments error:", comments);
                                        }
                                    }
                                    self.augur.getMarketInfo(market, function (marketInfo) {
                                        if (marketInfo) {
                                            if (marketInfo.error) {
                                                console.log("getMarketInfo error:", marketInfo);
                                            } else if (marketInfo.constructor === Array && marketInfo.length >= 5) {
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
                                                        if (address) {
                                                            if (address.error) {
                                                                console.log("getParticipantID error:", address);
                                                                nextTrader();
                                                            } else if (parseInt(address) === 0) {
                                                                nextTrader();
                                                            } else {
                                                                doc.participants[address] = trader;
                                                                async.each(allOutcomes, function (outcome, nextOutcome) {
                                                                    self.augur.getParticipantSharesPurchased(market, trader, outcome, function (shares) {
                                                                        if (shares && !shares.error) {
                                                                            doc.outcomes[outcome - 1].shares[address] = shares;
                                                                        }
                                                                        nextOutcome();
                                                                    });
                                                                }, function (err) {
                                                                    if (err) console.log("async.each(traders, async.each(outcomes)) error:", err);
                                                                    nextTrader();
                                                                });
                                                            }
                                                        } else {
                                                            nextTrader();
                                                        }
                                                    });
                                                }, function (err) {
                                                    if (err) console.log("async.each(traders) error:", err);
                                                    self.augur.getDescription(market, function (marketDescription) {
                                                        if (marketDescription) {
                                                            if (marketDescription.error) {
                                                                console.log("getMarketDescription error:", marketDescription);
                                                            } else {
                                                                doc.description = marketDescription;
                                                            }
                                                        }
                                                        self.augur.getMarketEvents(market, function (events) {
                                                            if (events) {
                                                                if (events.error) {
                                                                    console.log("getMarketEvents error:", events);
                                                                } else if (events.constructor === Array &&
                                                                           events.length === parseInt(numEvents)) {
                                                                    self.augur.getWinningOutcomes(market, function (winningOutcomes) {
                                                                        if (winningOutcomes) {
                                                                            if (winningOutcomes.error) {
                                                                                console.log("getWinningOutcomes error:", winningOutcomes);
                                                                            } else {
                                                                                doc.winningOutcomes = winningOutcomes.slice(0, events.length);
                                                                            }
                                                                        }
                                                                        self.augur.getExpiration(events[0], function (endDate) {
                                                                            if (endDate) {
                                                                                if (endDate.error) {
                                                                                    console.log("getExpiration error:", endDate);
                                                                                } else {
                                                                                    doc.endDate = endDate; // blocknumber
                                                                                }
                                                                            }
                                                                            async.each(events, function (thisEvent, nextEvent) {
                                                                                var eventDoc, storedEventIndex;
                                                                                eventDoc = {
                                                                                    id: thisEvent,
                                                                                    description: null,
                                                                                    outcome: null
                                                                                };
                                                                                if (doc.events && doc.events.length) {
                                                                                    for (var i = 0; i < doc.events.length; ++i) {
                                                                                        if (doc.events[i].id === thisEvent) {
                                                                                            storedEventIndex = i;
                                                                                            break;
                                                                                        }
                                                                                    }
                                                                                }
                                                                                if (storedEventIndex !== undefined) {
                                                                                    eventDoc.description = doc.events[storedEventIndex].description;
                                                                                    eventDoc.outcome = doc.events[storedEventIndex].outcome;
                                                                                }
                                                                                self.augur.getDescription(thisEvent, function (eventDescription) {
                                                                                    if (eventDescription) {
                                                                                        if (eventDescription.error) {
                                                                                            console.log("getDescription [event] error:", eventDescription);
                                                                                        } else {
                                                                                            eventDoc.description = eventDescription; // blocknumber
                                                                                        }
                                                                                    }
                                                                                    self.augur.getOutcome(thisEvent, function (outcome) {
                                                                                        if (outcome) {
                                                                                            if (outcome.error) {
                                                                                                console.log("getOutcome error:", outcome);
                                                                                            } else {
                                                                                                eventDoc.outcome = outcome;
                                                                                                doc.eventOutcome = outcome;
                                                                                            }
                                                                                        }
                                                                                        if (storedEventIndex !== undefined) {
                                                                                            doc.events[storedEventIndex] = eventDoc;
                                                                                        } else {
                                                                                            doc.events.push(eventDoc);
                                                                                        }
                                                                                        nextEvent();
                                                                                    });
                                                                                });
                                                                            }, function (err) {
                                                                                if (err) console.log("async.each(events) error:", err);
                                                                                // console.log("completed successfully:", JSON.stringify(doc, null, 2));
                                                                                callback(null, doc);
                                                                            });
                                                                        });
                                                                    });
                                                                } else {
                                                                    doc.invalid = true;
                                                                    console.log("getMarketEvents error [terminating 1]:", events);
                                                                    callback(events, doc);
                                                                }
                                                            } else {
                                                                doc.invalid = true;
                                                                console.log("getMarketEvents error [terminating 2]:", events);
                                                                callback(events, doc);
                                                            }
                                                        });
                                                    });
                                                });
                                            } else {
                                                doc.invalid = true;
                                                console.log("getMarketInfo error [terminating]:", marketInfo);
                                                callback(marketInfo, doc);
                                            }
                                        }
                                    });
                                });
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
            this.augur.getPriceHistory(this.augur.branches.dev, function (priceHistory) {
                self.augur.getMarkets(self.augur.branches.dev, function (markets) {
                    if (markets && !markets.error) {
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
                            setTimeout(function () {
                                self.collect(market, function (err, doc) {
                                    if (err) return nextMarket(err);
                                    if (doc) {
                                        if (priceHistory[market]) {
                                            doc.priceHistory = priceHistory[market];
                                        }
                                        self.upsert(doc, function (err) {
                                            ++updates;
                                            nextMarket(err);
                                        });
                                    }
                                });
                            }, 50);
                        }, function (err) {
                            if (err) return console.error(err);
                            callback(err, updates);
                        });
                    }
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

        function collectFiltrate(filtrate) {
            if (self.debug) console.log(filtrate);
            if (filtrate) {
                if (filtrate.marketId && !filtrate.error) {
                    self.collect(filtrate.marketId, function (err, doc) {
                        if (err) return console.error("price filter error:", err, filtrate);
                        upsertFilterDoc(filtrate, doc);
                    });
                } else {
                    console.error("price filter error: no marketId field", filtrate);
                }
            }
        }

        function upsertFilterDoc(filtrate, doc) {
            var code = (filtrate.price) ? -1 : -2;
            if (self.debug) {
                console.log("Filtrate:", JSON.stringify(filtrate, null, 2));
                console.log("Document:", JSON.stringify(doc, null, 2));
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
                    /**
                        { user: '0x05ae1d0ca6206c6168b42efcd1fbe0ed144e821b',
                          marketId: '-0xcaa8317a2d53b432c94180c591f09c30594e72cb6f747ef12be1bb5504c664bc',
                          outcome: '1',
                          price: '1.00000000000000002255',
                          cost: '-1.00000000000000008137',
                          blockNumber: '4722' }
                     */
                    price: collectFiltrate,
                    contracts: function (filtrate) {
                        /**
                            buyShares:
                            { address: '0xc1c4e2f32e4b84a60b8b7983b6356af4269aab79',
                              topics: 
                               [ '0x1a653a04916ffd3d6f74d5966492bda358e560be296ecf5307c2e2c2fdedd35a',
                                 '0x00000000000000000000000005ae1d0ca6206c6168b42efcd1fbe0ed144e821b',
                                 '0xa75efad9b39ee62f8dc0d87cdd6f21e57ac486db17e5ca5cd820c4fa92bfee03',
                                 '0x0000000000000000000000000000000000000000000000000000000000000001' ],
                              data: 
                               [ '0x000000000000000000000000000000000000000000000000f972dda04ee3f330',
                                 '0xffffffffffffffffffffffffffffffffffffffffffffffff2f27a6d1ff09119c' ],
                              blockNumber: '0x4ec9',
                              logIndex: '0x0',
                              blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
                              transactionHash: '0xbf1dfee6311cb3a388fc4e4b1f75a9eee67d081f59522b99d813840a5cb74a9e',
                              transactionIndex: '0x0' }

                            createMarket:
                            { address: '0xd2e9f7c2fd4635199b8cc9e8128fc4d27c693945',
                              topics: 
                               [ '0x20a4e172725965b86bd8a626ee70f94c0e142ef8c81c890e7f538a1ce4e6dbe9',
                                 '0x763c9ea797fe61236b2eed85617a1ba0aad7a24240a37d5cb0a2330e63e49c5f' ],
                              data: '0x',
                              blockNumber: '0x4e99',
                              logIndex: '0x0',
                              blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
                              transactionHash: '0xd0da45a58ac293adbbddff613bffc6ec6e35e8c487ef1f3171e999057c5a3167',
                              transactionIndex: '0x0' }
                          */
                        if (filtrate && filtrate.address && filtrate.topics && filtrate.topics.constructor === Array) {
                            switch (filtrate.address) {
                            case self.augur.contracts.createMarket:
                                if (filtrate.topics.length > 1) {
                                    self.collect(self.augur.numeric.bignum(filtrate.topics[1], "hex"), function (err, doc) {
                                        if (err) return console.error("contracts filter error:", err, filtrate);
                                        upsertFilterDoc(filtrate, doc);
                                    });
                                }
                                break;
                            case self.augur.contracts.closeMarket:
                                console.log("closeMarket:", filtrate);
                                break;
                            case self.augur.contracts.sendReputation:
                                console.log("sendReputation:", filtrate);
                                break;
                            case self.augur.contracts.checkQuorum:
                                console.log("checkQuorum:", filtrate);
                                break;
                            case self.augur.contracts.createBranch:
                                console.log("createBranch:", filtrate);
                                break;
                            case self.augur.contracts.sendReputation:
                                console.log("sendReputation:", filtrate);
                                break;
                            case self.augur.contracts.createEvent:
                                console.log("createEvent:", filtrate);
                                break;
                            case self.augur.contracts.dispatch:
                                console.log("dispatch:", filtrate);
                                break;
                            case self.augur.contracts.faucets:
                                console.log("faucets:", filtrate);
                                break;
                            case self.augur.contracts.makeReports:
                                console.log("makeReports:", filtrate);
                                break;
                            case self.augur.contracts.p2pWagers:
                                console.log("p2pWagers:", filtrate);
                                break;
                            case self.augur.contracts.transferShares:
                                console.log("transferShares:", filtrate);
                                break;
                            case self.augur.contracts.reporting:
                                console.log("reporting:", filtrate);
                                break;
                            case self.augur.contracts.markets:
                                console.log("markets:", filtrate);
                                break;
                            case self.augur.contracts.events:
                                console.log("events:", filtrate);
                                break;
                            case self.augur.contracts.info:
                                console.log("info:", filtrate);
                                break;
                            case self.augur.contracts.fxpFunctions:
                                console.log("fxpFunctions:", filtrate);
                                break;
                            case self.augur.contracts.expiringEvents:
                                console.log("expiringEvents:", filtrate);
                                break;
                            case self.augur.contracts.cash:
                                console.log("cash:", filtrate);
                                break;
                            case self.augur.contracts.branches:
                                console.log("branches:", filtrate);
                                break;
                            case self.augur.contracts.namereg:
                                console.log("namereg:", filtrate);
                                break;
                            default:
                                if (self.debug) console.log(filtrate);
                            }
                            
                        }                        
                    }
                });
            }
            (function pulse() {
                if (config.scan) {
                    self.scan(config, function (err, updates) {
                        if (err) {
                            if (callback) return callback(err);
                            throw err;
                        }
                        if (callback) callback(null, updates);
                    });
                    if (config.interval) {
                        self.watcher = setTimeout(pulse, config.interval || INTERVAL);
                    }
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
        return !(
            this.watcher && this.db &&
            this.augur.filters.price_filter.id &&
            this.augur.filters.price_filter.heartbeat
        );
    }

};
