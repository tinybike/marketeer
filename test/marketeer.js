/**
 * Marketeer unit tests.
 * @author Kevin Day (@k_day)
 */

"use strict";

var path = require("path");
var cp = require("child_process");
var chalk = require("chalk");
var crypto = require("crypto");
var assert = require("chai").assert;
var leveldown = require('leveldown');
var mark = require("../");

var DEBUG = false;
var TIMEOUT = 60000;

var config = {
    http: "http://localhost:8545",
    ws: null,
    db: "./testdb",
    limit: 5,
    interval: null,
    scan: false,
    filtering: true
};

var makeDB = function (done) {
    config.db = crypto.randomBytes(4).toString("hex") + "testdb";
    done();
}


var removeDB = function (done){
    mark.disconnect( (err) => {
        if (err) done(err);
        leveldown.destroy(config.db, (err) => {
            if (err) console.log("Delete DB error:", err);
            done();
        });
    });   
}

var marketId1 = "0x926de0662b697777f13e296a773c026d3831a58858f7c6b3b39506bec5e36c75";
var marketId2 = "0x969a5f7978efc98258c24e69892b6d9db7867652dd750c32e21bdf6c85dfab";
var marketId3 = "0x49bcd98d201ada87719a87ee7023302d669c74187aa955e56dea5780ba895167";
var marketId4 = "0xe8f87d6549b029039baa7728d85cbe3196b198a024848e2d20029ee2797558a9";

var accountId1 = "0xad9bd4391f5d0e407db06c827a9b1581f8085cde";
var accountId2 = "0x025af06be127679ed3df995d75a5e803f3510bd6";

//test market Data
var doc1 = { network: '2',
  makerFee: '0.01',
  takerFee: '0.02',
  tradingFee: '0.03',
  numOutcomes: 2,
  tradingPeriod: 4893087,
  branchID: '1',
  numEvents: 1,
  cumulativeScale: '1',
  creationTime: 1467926059,
  volume: '0',
  creationFee: '8.9',
  author: 'a',
  tags: [ '1', '2', '3' ],
  type: 'binary',
  endDate: 1467926158,
  winningOutcomes: [ '0', '0'],
  description: 'doc1',
  outcomes: 
   [ { id: 1, outstandingShares: '0', price: '0' },
     { id: 2, outstandingShares: '0', price: '0' } ],
  events: 
   [ { id: '1',
       endDate: 1467926158,
       outcome: '0',
       minValue: '1',
       maxValue: '2',
       numOutcomes: 2,
       type: 'binary' } ] };

var doc2 = { network: '2',
  makerFee: '0.01',
  takerFee: '0.02',
  tradingFee: '0.03',
  numOutcomes: 2,
  tradingPeriod: 4893087,
  branchID: '1',
  numEvents: 1,
  cumulativeScale: '1',
  creationTime: 1467926059,
  volume: '0',
  creationFee: '8.9',
  author: 'a',
  tags: [ '4', '5', '6' ],
  type: 'binary',
  endDate: 1467926158,
  winningOutcomes: [ '0', '0'],
  description: 'doc2',
  outcomes: 
   [ { id: 1, outstandingShares: '0', price: '0' },
     { id: 2, outstandingShares: '0', price: '0' } ],
  events: 
   [ { id: '2',
       endDate: 1467926158,
       outcome: '0',
       minValue: '1',
       maxValue: '2',
       numOutcomes: 2,
       type: 'binary' } ] };

var doc3 = { network: '2',
  makerFee: '0.01',
  takerFee: '0.02',
  tradingFee: '0.03',
  numOutcomes: 2,
  tradingPeriod: 4893087,
  branchID: '2',
  numEvents: 1,
  cumulativeScale: '1',
  creationTime: 1467926059,
  volume: '0',
  creationFee: '8.9',
  author: 'a',
  tags: [ '7', '8', '9' ],
  type: 'binary',
  endDate: 1467926158,
  winningOutcomes: [ '0', '0'],
  description: 'doc3',
  outcomes: 
   [ { id: 1, outstandingShares: '0', price: '0' },
     { id: 2, outstandingShares: '0', price: '0' } ],
  events: 
   [ { id: '3',
       endDate: 1467926158,
       outcome: '0',
       minValue: '1',
       maxValue: '2',
       numOutcomes: 2,
       type: 'binary' } ] };

var doc4 = { network: '2',
  makerFee: '0.01',
  takerFee: '0.02',
  tradingFee: '0.03',
  numOutcomes: 2,
  tradingPeriod: 4893087,
  branchID: '3',
  numEvents: 1,
  cumulativeScale: '1',
  creationTime: 1467926059,
  volume: '0',
  creationFee: '8.9',
  author: 'a',
  tags: [ '10', '11', '12' ],
  type: 'binary',
  endDate: 1467926158,
  winningOutcomes: [ '0', '0'],
  description: 'doc4',
  outcomes: 
   [ { id: 1, outstandingShares: '0', price: '0' },
     { id: 2, outstandingShares: '0', price: '0' } ],
  events: 
   [ { id: '4',
       endDate: 1467926158,
       outcome: '0',
       minValue: '1',
       maxValue: '2',
       numOutcomes: 2,
       type: 'binary' } ] };


//test price history
var history = { '1': 
   [ { market: marketId1,
       type: 2,
       user: 'A',
       price: '0.01',
       shares: '1',
       timestamp: 1468531807,
       blockNumber: 1},
     { market: marketId1,
       type: 1,
       user: 'A',
       price: '0.999',
       shares: '1',
       timestamp: 2,
       blockNumber: 1309015 },
     { market: marketId1,
       type: 2,
       user: 'A',
       price: '0.52',
       shares: '0.25',
       timestamp: 1468531957,
       blockNumber: 3 },
     { market: marketId1,
       type: 2,
       user: 'B',
       price: '0.5',
       shares: '0.916478745098039215',
       timestamp: 1468531957,
       blockNumber: 4} ], 
    '2': 
   [ { market: marketId1,
       type: 2,
       user: 'C',
       price: '0.01',
       shares: '1',
       timestamp: 1468531807,
       blockNumber: 3 },
     { market: marketId1,
       type: 1,
       user: 'C',
       price: '0.999',
       shares: '1',
       timestamp: 1468531897,
       blockNumber: 4 },
     { market: marketId1,
       type: 2,
       user: 'D',
       price: '0.52',
       shares: '0.25',
       timestamp: 1468531957,
       blockNumber: 5},
     { market: marketId1,
       type: 2,
       user: 'E',
       price: '0.5',
       shares: '0.916478745098039215',
       timestamp: 1468531957,
       blockNumber: 6 } ]
   };

var account_trades = {
  "0x926de0662b697777f13e296a773c026d3831a58858f7c6b3b39506bec5e36c75": {
    "1": [
      {
        "type": 1,
        "price": "0.01",
        "shares": "1",
        "trade_id": "1",
        "blockNumber": 1,
        "maker": false
      }
    ]
  },
  "0x969a5f7978efc98258c24e69892b6d9db7867652dd750c32e21bdf6c85dfab": {
    "1": [
      {
        "type": 1,
        "price": "0.01",
        "shares": "1",
        "trade_id": "2",
        "blockNumber": 2,
        "maker": false
      }
    ]
  },
  "0x49bcd98d201ada87719a87ee7023302d669c74187aa955e56dea5780ba895167": {
    "1": [
      {
        "type": 1,
        "price": "0.01",
        "shares": "1",
        "trade_id": "3",
        "blockNumber": 3,
        "maker": false
      }
    ]
  },
  "0xe8f87d6549b029039baa7728d85cbe3196b198a024848e2d20029ee2797558a9": {
    "1": [
      {
        "type": 1,
        "price": "0.01",
        "shares": "1",
        "trade_id": "4",
        "blockNumber": 4,
        "maker": false
      }
    ]
  }
};

describe("getMarketInfo", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("retrieve and verify document", function (done) {
        this.timeout(TIMEOUT);
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsertMarketInfo(marketId1, doc1, function (err) {
                assert.isNull(err);
                mark.getMarketInfo(marketId1, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, JSON.stringify(doc1));
                    done();
                });
            });
        });
    });
});

describe("upsertMarketInfo", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("insert and update document", function (done) {
        this.timeout(TIMEOUT);
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsertMarketInfo(marketId1, doc1, function (err) {
                assert.isNull(err);
                mark.getMarketInfo(marketId1, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, JSON.stringify(doc1));
                    doc1.volume = "50";
                    mark.upsertMarketInfo(marketId1, doc1, function (err) {
                        assert.isNull(err);
                        mark.getMarketInfo(marketId1, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(result, JSON.stringify(doc1));
                            done();
                        });
                    });
                });
            });
        });
    });
});

describe("getMarketsInfo", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    
    it("retrieves markets from branch", function (done) {
        this.timeout(TIMEOUT);

        mark.connect(config, (err) => {
         mark.upsertMarketInfo(marketId1, doc1, (err) => {
          mark.upsertMarketInfo(marketId2, doc2, (err) => {
           mark.upsertMarketInfo(marketId3, doc3, (err) => {
            mark.upsertMarketInfo(marketId4, doc4, (err) => {
             //2 markets w/ branch id: 1
             mark.getMarketsInfo("1", (err, markets) => {
                assert.isNull(err);
                assert.isNotNull(markets);
                var results = JSON.parse(markets);
                assert.property(results, marketId1);
                assert.property(results, marketId2);
                assert.notProperty(results, marketId3);
                assert.notProperty(results, marketId4);
                assert.deepEqual(Object.keys(results[marketId1]).length, 9);
                assert.deepEqual(Object.keys(results[marketId2]).length, 9);
                assert.deepEqual(results[marketId1]['makerFee'], doc1.makerFee);
                assert.deepEqual(results[marketId1]['takerFee'], doc1.takerFee);
                assert.deepEqual(results[marketId1]['tradingPeriod'], doc1.tradingPeriod);
                assert.deepEqual(results[marketId1]['creationTime'], doc1.creationTime);
                assert.deepEqual(results[marketId1]['volume'], doc1.volume);
                assert.deepEqual(results[marketId1]['tags'], doc1.tags);
                assert.deepEqual(results[marketId1]['endDate'], doc1.endDate);
                assert.deepEqual(results[marketId1]['description'], doc1.description);
                assert.property(results[marketId1], 'tradingFee');
                done();
             });
            });
           });
          });
         });   
        });
    });

    it("tests persistence", function (done) {
        this.timeout(TIMEOUT);
        mark.connect(config, (err) => {
          mark.upsertMarketInfo(marketId1, doc1, (err) => {
            mark.disconnect( (err) => {
              mark.connect(config, (err) => {
                mark.getMarketsInfo("1", (err, markets) => {
                  assert.isNull(err);
                  assert.isNotNull(markets);
                  var results = JSON.parse(markets);
                  assert.property(results, marketId1);
                  assert.deepEqual(Object.keys(results[marketId1]).length, 9);
                  done();
                });
              });
            });
          });
        });
    });

});

describe("batchGetMarketsInfo", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    
    it("retrieves marekts in bulk", function (done) {
        this.timeout(TIMEOUT);
        mark.connect(config, (err) => {
         mark.upsertMarketInfo(marketId1, doc1, (err) => {
          mark.upsertMarketInfo(marketId2, doc2, (err) => {
            mark.batchGetMarketInfo([marketId1, marketId2, marketId3], (err, markets) => {
                assert.isNull(err);
                var results = JSON.parse(markets);
                assert.property(results, marketId1);
                assert.property(results, marketId2);
                assert.notProperty(results, marketId3);
                assert.deepEqual(results[marketId1], doc1);
                assert.deepEqual(results[marketId2], doc2);
                done();
            });
          });
        });
       });
    })
});

describe("getMarketPriceHistory", function (done){
    beforeEach(makeDB);
    afterEach(removeDB);

    it("fetches history with no options", function (done) {
        this.timeout(TIMEOUT);
        mark.connect(config, (err) => {
            mark.upsertPriceHistory(marketId1, history, (err) => {
                assert.isNull(err);
                mark.getMarketPriceHistory(marketId1, function (err, value) {
                    assert.isNull(err);
                    var results = JSON.parse(value);
                    assert.deepEqual(results, history);
                    done();
                });
            });
        });
    });

    it("fetches history with options", function (done) {
        this.timeout(TIMEOUT);
        mark.connect(config, (err) => {
            mark.upsertPriceHistory(marketId1, history, (err) => {
                assert.isNull(err);
                var options = {fromBlock: 2, toBlock: 4};
                mark.getMarketPriceHistory(marketId1, options, function (err, value) {
                    assert.isNull(err);
                    var results = JSON.parse(value);
                    assert.property(results, '1');
                    assert.property(results, '2');
                    assert.deepEqual(results['1'].length, 2);
                    assert.deepEqual(results['2'].length, 2);
                    assert.deepEqual(results['1'][0]['blockNumber'], 3);
                    assert.deepEqual(results['1'][1]['blockNumber'], 4);
                    assert.deepEqual(results['2'][0]['blockNumber'], 3);
                    assert.deepEqual(results['2'][1]['blockNumber'], 4);
                    done();
                });
            });
        });
    });
});

describe("getAccountTrades", function (done){
    beforeEach(makeDB);
    afterEach(removeDB);

    it("fetches trades with no options", function (done) {
        this.timeout(TIMEOUT);
        mark.connect(config, (err) => {
            mark.upsertAccountTrades(accountId1, account_trades, (err) => {
                assert.isNull(err);
                mark.getAccountTrades(accountId1, function (err, value) {
                    assert.isNull(err);
                    var results = JSON.parse(value);
                    assert.deepEqual(results, account_trades);
                    done();
                });
            });
        });
    });

    it("fetches history with options", function (done) {
        this.timeout(TIMEOUT);
        mark.connect(config, (err) => {
            mark.upsertAccountTrades(accountId1, account_trades, (err) => {
                assert.isNull(err);
                var options = {fromBlock: 2, toBlock: 3};
                mark.getAccountTrades(accountId1, options, function (err, value) {
                    assert.isNull(err);
                    var results = JSON.parse(value);
                    assert.property(results, marketId2);
                    assert.property(results, marketId3);
                    assert.notProperty(results, marketId1);
                    assert.notProperty(results, marketId4);
                    done();
                });
            });
        });
    });

});


describe("scan", function () {
    beforeEach(makeDB);
    afterEach(removeDB);

    it("fetch market info from the blockchain and save to db", function (done) {
        this.timeout(TIMEOUT*100);
        mark.connect(config, (err) => {
            assert.isNull(err);
            var numMarkets = 0;
            var branches = mark.augur.getBranches();
            for (var i =0; i < branches.length; ++i){
                numMarkets += mark.augur.getMarketsInBranch(branches[i]).length;
            }
            var expectedMarkets = numMarkets < config.limit ? numMarkets : config.limit;
            mark.scan(config, function (err, updates) {
                assert.isNull(err);
                assert.strictEqual(updates, config.limit);
                done();
            });
        });
    });

    it("fetch market info from the blockchain, set up db connection, then save to db", function (done) {
        this.timeout(TIMEOUT*100);
        mark.scan(config, function (err, updates) {
            assert.isNull(err);
            assert.strictEqual(updates, config.limit);
            done();
        });
    });

});

describe("watch", function () {
    beforeEach(makeDB);
    afterEach(removeDB);

    var branch, markets, outcome, amount, maxNumPolls;

    mark.augur.connect(config);

    var numMarkets = 0;
    var branches = mark.augur.getBranches();
    for (var i =0; i < branches.length; ++i){
        numMarkets += mark.augur.getMarketsInBranch(branches[i]).length;
    }
    var expectedMarkets = numMarkets < config.limit ? numMarkets : config.limit;
    var branch = mark.augur.constants.DEFAULT_BRANCH_ID

    it("does an initial market scan", function (done) {
        this.timeout(TIMEOUT*8);
        config.limit = 5;
        config.scan = true;
        mark.watch(config, function (err, updates) {
            assert.isNull(err);
            assert.isNull(mark.watcher);
            assert.isNotNull(updates);
            assert.strictEqual(updates, expectedMarkets);
            assert.isNotNull(mark.augur.filters.filter.marketCreated.id);
            mark.unwatch(done);
        });
    });

    it("listens for market creation", function (done) {
        config.scan = false;
        this.timeout(TIMEOUT*8);
        mark.watch(config, function (err, updates) {
            assert.isNull(err);
            assert.isNull(mark.watcher);
            assert.isNotNull(mark.augur.filters.filter.marketCreated.id);

            setTimeout(function () {
                var desc = Math.random().toString(36).substring(4);
                var expDate = new Date("7/2/5099").getTime() / 1000;
                var tags = ['a', 'b', 'c'];
                mark.augur.createSingleEventMarket({
                    branch: branch,
                    description: desc,
                    expDate: expDate,
                    minValue: 1,
                    maxValue: 2,
                    numOutcomes: 2,
                    makerFee: ".002",
                    takerFee: ".05",
                    tags: tags,
                    extraInfo: "xtra",
                    resolution: "generic",
                    onSent: function (r) {
                    console.log("createSingleEventMarket sent:", r);
                        assert.property(r, "txHash");
                        assert.property(r, "callReturn");
                    },
                    onSuccess: function (r) {
                        console.log("createSingleEventMarket success:", r);
                        assert.property(r, "txHash");
                        assert.property(r, "callReturn");
                        assert.property(r, "blockHash");
                        assert.property(r, "blockNumber");
                        var maxTries = 10;
                        var counter = 0;
                        var id = r["callReturn"];
                        //may be a slight delay betwwen market creation
                        //and marketeer update. Retry this a few times.
                        var timerId = setInterval( () => {
                            console.log("try:", counter);
                            mark.getMarketsInfo(branch, (err, markets) => {
                                assert.isNull(err);
                                assert.isNotNull(markets);
                                var results = JSON.parse(markets);
                                if (results[id]){
                                    var market = results[id];
                                    assert.property(market, "tradingPeriod");
                                    assert.property(market, "tradingFee");
                                    assert.property(market, "makerFee");
                                    assert.property(market, "takerFee");
                                    assert.property(market, "creationTime");
                                    assert.property(market, "volume");
                                    assert.property(market, "tags");
                                    assert.property(market, "endDate");
                                    assert.deepEqual(market["description"], desc);
                                    mark.unwatch(done);
                                    clearInterval(timerId);
                                    return;
                                }
                                if (++counter >= maxTries){
                                    assert.fail(r, "Market not seen by watch.");
                                }
                            });
                        }, 5000);
                    },
                    onFailed: function (r) {
                        assert.fail(r, "Market creation failure.");
                        done();
                    }
                }); // createSingleEventMarket
            }, 2500);
        });
    });

    it("listens for price changes", function (done) {
        this.timeout(TIMEOUT*20);
        mark.watch(config, function (err, updates, data) {
            assert.isNull(err);
            assert.isNull(mark.watcher);
            assert.isNotNull(mark.augur.filters.filter.marketCreated.id);
            setTimeout(function () {
                var desc = Math.random().toString(36).substring(4);
                var expDate = new Date("7/2/5099").getTime() / 1000;
                var tags = ['a', 'b', 'c'];
                mark.augur.createSingleEventMarket({
                    branch: branch,
                    description: desc,
                    expDate: expDate,
                    minValue: 1,
                    maxValue: 2,
                    numOutcomes: 2,
                    makerFee: ".002",
                    takerFee: ".05",
                    tags: tags,
                    extraInfo: "xtra",
                    resolution: "generic",
                    onSent: function (r) {console.log("createSingleEventMarket sent:", r);},
                    onSuccess: function (r) {
                        console.log("createSingleEventMarket success:", r);
                        var id = r["callReturn"];
                        var accounts = mark.augur.rpc.personal("listAccounts");
                        mark.augur.rpc.personal("unlockAccount", [accounts[0], "password"]);
                        mark.augur.useAccount(accounts[0]);
                        console.log(accounts[0]);
                        mark.augur.buyCompleteSets({
                            market: id,
                            amount: 1,
                            onSent: function (r) {console.log("BuyCompleteSets Sent:", r);},
                            onSuccess: function (r) {
                                console.log("BuyCompleteSets Success:", r);
                                mark.augur.sell({
                                    amount: 1,
                                    price: "0.01",
                                    market: id,
                                    outcome: "1",
                                    onSent: function (r) {
                                        console.log("Sell Sent:", r);
                                    },
                                    onSuccess: function (r) {
                                        mark.augur.rpc.personal("unlockAccount", [accounts[1], "password"]);
                                        mark.augur.useAccount(accounts[1]);
                                        mark.augur.get_trade_ids(id, function (trade_ids) {
                                            assert.isAbove(trade_ids.length, 0);
                                            var info = mark.augur.getMarketInfo(id);
                                            assert.property(info, "volume");
                                            var original_volume = info['volume'];
                                            var trade_id = trade_ids[0];
                                            mark.augur.trade({
                                                max_value: 1,
                                                max_amount: 1,
                                                trade_ids: [trade_id],
                                                onTradeHash: function (r) {console.log("tradeHash", r)},
                                                onCommitSent: function (r) {console.log("commitSent", r)},
                                                onCommitSuccess: function (r) {console.log("commitSuccess", r)},
                                                onCommitFailed: function (r) {console.log("commitFailed", r)},
                                                onTradeSuccess: function (r) {
                                                    console.log("tradeSuccess", r);
                                                    //may be a slight delay betwwen trade
                                                    //and marketeer volume update. Retry this a few times.
                                                    var maxTries = 10;
                                                    var counter = 0;
                                                    var timerId = setInterval( () => {
                                                        console.log("try:", counter);
                                                        mark.getMarketsInfo(branch, (err, markets) => {
                                                            assert.isNull(err);
                                                            assert.isNotNull(markets);
                                                            var results = JSON.parse(markets);
                                                            assert.property(results, id);
                                                            var market = results[id];
                                                            assert.property(market, "volume");
                                                            //If we see the volume change, we are done.
                                                            if (original_volume != market.volume){
                                                                clearInterval(timerId);
                                                                mark.unwatch(done);
                                                                return;
                                                            }
                                                            if (++counter >= maxTries){
                                                                assert.fail(r, "Volume not updated after trade.");
                                                            }
                                                        });
                                                    }, 5000);
                                                },
                                                onTradeFailed: function (r) {
                                                    console.log("tradeFailed", r);
                                                    done();
                                                }
                                            }); //trade
                                        });  //getTradeIds
                                    },
                                    onFailed: function (r){
                                        console.log("Sell Failed:", r);
                                        done();
                                    }
                                });
                            },
                            onFailed: function (r) {
                                assert.fail(r, "BuyCompleteSets failure.");
                                done();
                            }
                        }); //buyCompleteSets
                    },
                    onFailed: function (r) {
                        assert.fail(r, "Market creation failure.");
                        done();
                    }
                }); // createSingleEventMarket
            }, 2500); //setTimeout
        }); //watch
    });

    it("updates price history", function (done) {
        this.timeout(TIMEOUT*20);
        mark.watch(config, function (err, updates, data) {
            assert.isNull(err);
            assert.isNull(mark.watcher);
            assert.isNotNull(mark.augur.filters.filter.log_fill_tx.id);
            setTimeout(function () {
                var desc = Math.random().toString(36).substring(4);
                var expDate = new Date("7/2/5099").getTime() / 1000;
                var tags = ['a', 'b', 'c'];
                mark.augur.createSingleEventMarket({
                    branch: branch,
                    description: desc,
                    expDate: expDate,
                    minValue: 1,
                    maxValue: 2,
                    numOutcomes: 2,
                    makerFee: ".002",
                    takerFee: ".05",
                    tags: tags,
                    extraInfo: "xtra",
                    resolution: "generic",
                    onSent: function (r) {console.log("createSingleEventMarket sent:", r);},
                    onSuccess: function (r) {
                        console.log("createSingleEventMarket success:", r);
                        assert.property(r, "callReturn");
                        var id = r["callReturn"];
                        var accounts = mark.augur.rpc.personal("listAccounts");
                        mark.augur.rpc.personal("unlockAccount", [accounts[0], "password"]);
                        mark.augur.useAccount(accounts[0]);
                        console.log(accounts[0]);
                        mark.augur.buyCompleteSets({
                            market: id,
                            amount: 1,
                            onSent: function (r) {console.log("BuyCompleteSets Sent:", r);},
                            onSuccess: function (r) {
                                console.log("BuyCompleteSets Success:", r);
                                mark.augur.sell({
                                    amount: 1,
                                    price: "0.01",
                                    market: id,
                                    outcome: "1",
                                    onSent: function (r) {
                                        console.log("Sell Sent:", r);
                                    },
                                    onSuccess: function (r) {
                                        mark.augur.rpc.personal("unlockAccount", [accounts[1], "password"]);
                                        mark.augur.useAccount(accounts[1]);
                                        mark.augur.get_trade_ids(id, function (trade_ids) {
                                            assert.isAbove(trade_ids.length, 0);
                                            var trade_id = trade_ids[0];
                                            mark.augur.trade({
                                                max_value: 1,
                                                max_amount: 1,
                                                trade_ids: [trade_id],
                                                onTradeHash: function (r) {console.log("tradeHash", r)},
                                                onCommitSent: function (r) {console.log("commitSent", r)},
                                                onCommitSuccess: function (r) {console.log("commitSuccess", r)},
                                                onCommitFailed: function (r) {console.log("commitFailed", r)},
                                                onTradeSuccess: function (r) {
                                                    console.log("tradeSuccess", r);
                                                    //may be a slight delay betwwen trade
                                                    //and marketeer price history update. Retry this a few times.
                                                    var maxTries = 10;
                                                    var counter = 0;
                                                    var timerId = setInterval( () => {
                                                        console.log("try:", counter);
                                                        mark.getMarketPriceHistory(id, (err, history) => {
                                                            if (!err && history){
                                                                clearInterval(timerId);
                                                                mark.unwatch(done);
                                                                return;
                                                            }
                                                            if (++counter >= maxTries){
                                                                assert.fail(r, "No price history after trade.");
                                                            }
                                                        });
                                                    }, 5000);
                                                },
                                                onTradeFailed: function (r) {
                                                    console.log("tradeFailed", r);
                                                    done();
                                                }
                                            }); //trade
                                        });  //getTradeIds
                                    },
                                    onFailed: function (r){
                                        console.log("Sell Failed:", r);
                                        done();
                                    }
                                });
                            },
                            onFailed: function (r) {
                                assert.fail(r, "BuyCompleteSets failure.");
                                done();
                            }
                        }); //buyCompleteSets
                    },
                    onFailed: function (r) {
                        assert.fail(r, "Market creation failure.");
                        done();
                    }
                }); // createSingleEventMarket
            }, 2500); //setTimeout
        }); //watch
    });

    it("updates account trades", function (done) {
        this.timeout(TIMEOUT*20);
        mark.watch(config, function (err, updates, data) {
            assert.isNull(err);
            assert.isNull(mark.watcher);
            assert.isNotNull(mark.augur.filters.filter.log_fill_tx.id);
            setTimeout(function () {
                var desc = Math.random().toString(36).substring(4);
                var expDate = new Date("7/2/5099").getTime() / 1000;
                var tags = ['a', 'b', 'c'];
                mark.augur.createSingleEventMarket({
                    branch: branch,
                    description: desc,
                    expDate: expDate,
                    minValue: 1,
                    maxValue: 2,
                    numOutcomes: 2,
                    makerFee: ".002",
                    takerFee: ".05",
                    tags: tags,
                    extraInfo: "xtra",
                    resolution: "generic",
                    onSent: function (r) {console.log("createSingleEventMarket sent:", r);},
                    onSuccess: function (r) {
                        console.log("createSingleEventMarket success:", r);
                        assert.property(r, "callReturn");
                        var id = r["callReturn"];
                        var accounts = mark.augur.rpc.personal("listAccounts");
                        mark.augur.rpc.personal("unlockAccount", [accounts[0], "password"]);
                        mark.augur.useAccount(accounts[0]);
                        console.log(accounts[0]);
                        mark.augur.buyCompleteSets({
                            market: id,
                            amount: 1,
                            onSent: function (r) {console.log("BuyCompleteSets Sent:", r);},
                            onSuccess: function (r) {
                                console.log("BuyCompleteSets Success:", r);
                                mark.augur.sell({
                                    amount: 1,
                                    price: "0.01",
                                    market: id,
                                    outcome: "1",
                                    onSent: function (r) {
                                        console.log("Sell Sent:", r);
                                    },
                                    onSuccess: function (r) {
                                        mark.augur.rpc.personal("unlockAccount", [accounts[1], "password"]);
                                        mark.augur.useAccount(accounts[1]);
                                        var tradingAccount = accounts[1];
                                        mark.getAccountTrades(tradingAccount, (err, trades_begin) => {
                                            mark.augur.get_trade_ids(id, function (trade_ids) {
                                                assert.isAbove(trade_ids.length, 0);
                                                var trade_id = trade_ids[0];
                                                mark.augur.trade({
                                                    max_value: 1,
                                                    max_amount: 1,
                                                    trade_ids: [trade_id],
                                                    onTradeHash: function (r) {console.log("tradeHash", r)},
                                                    onCommitSent: function (r) {console.log("commitSent", r)},
                                                    onCommitSuccess: function (r) {console.log("commitSuccess", r)},
                                                    onCommitFailed: function (r) {console.log("commitFailed", r)},
                                                    onTradeSuccess: function (r) {
                                                        console.log("tradeSuccess", r);
                                                    //may be a slight delay betwwen trade
                                                    //and marketeer price history update. Retry this a few times.
                                                    var maxTries = 10;
                                                    var counter = 0;
                                                    var timerId = setInterval( () => {
                                                        console.log("try:", counter);
                                                        mark.getAccountTrades(tradingAccount, (err, trades_end) => {
                                                            if (!err && trades_begin != trades_end){
                                                                clearInterval(timerId);
                                                                mark.unwatch(done);
                                                                return;
                                                            }
                                                            if (++counter >= maxTries){
                                                                assert.fail(r, "Account trades not updated after trade.");
                                                            }
                                                        });
                                                    }, 5000);
                                                },
                                                onTradeFailed: function (r) {
                                                    console.log("tradeFailed", r);
                                                    done();
                                                }
                                                }); //trade
                                            });  //getTradeIds
                                        }); //getAccountTrades
                                    },
                                    onFailed: function (r){
                                        console.log("Sell Failed:", r);
                                        done();
                                    }
                                });
                            },
                            onFailed: function (r) {
                                assert.fail(r, "BuyCompleteSets failure.");
                                done();
                            }
                        }); //buyCompleteSets
                    },
                    onFailed: function (r) {
                        assert.fail(r, "Market creation failure.");
                        done();
                    }
                }); // createSingleEventMarket
            }, 2500); //setTimeout
        }); //watch
    });

    it("listens for fee update", function (done) {
        config.scan = false;
        this.timeout(TIMEOUT*8);
        mark.watch(config, function (err, updates) {
            assert.isNull(err);
            assert.isNull(mark.watcher);
            assert.isNotNull(mark.augur.filters.filter.tradingFeeUpdated.id);

            setTimeout(function () {
                var desc = Math.random().toString(36).substring(4);
                var expDate = new Date("7/2/5099").getTime() / 1000;
                var tags = ['a', 'b', 'c'];
                var makerFee = ".02";
                var takerFee = ".05";
                mark.augur.createSingleEventMarket({
                    branch: branch,
                    description: desc,
                    expDate: expDate,
                    minValue: 1,
                    maxValue: 2,
                    numOutcomes: 2,
                    makerFee: makerFee,
                    takerFee: takerFee,
                    tags: tags,
                    extraInfo: "xtra",
                    resolution: "generic",
                    onSent: function (r) {
                    console.log("createSingleEventMarket sent:", r);
                        assert.property(r, "txHash");
                        assert.property(r, "callReturn");
                    },
                    onSuccess: function (r) {
                        console.log("createSingleEventMarket success:", r);
                        var maxTries = 10;
                        var counter = 0;
                        var id = r["callReturn"];
                        mark.augur.updateTradingFee({
                            branch: branch,
                            market: id,
                            makerFee: ".019", 
                            takerFee: ".049",
                            onSent: function (r) { console.log("updateTradingFee sent:", r); },
                            onSuccess: function (r) { 
                                console.log("updateTradingFee success:", r);
                                //may be a slight delay betwwen market creation
                                //and marketeer update. Retry this a few times.
                                var timerId = setInterval( () => {
                                    console.log("try:", counter);
                                    mark.getMarketInfo(id, (err, market) => {
                                        if (!err && market['makerFee'] != makerFee && market['takerFee'] != takerFee){
                                            mark.unwatch(done);
                                            clearInterval(timerId);
                                            return;
                                        }
                                        if (++counter >= maxTries){
                                            assert.fail(r, "Fee Update not seen by watch.");
                                        }
                                    });
                                }, 5000);
                            },
                            onFailed: function (r) { 
                                assert.fail(r, "Fee update failure.");
                                done();
                            }
                        });
                    },
                    onFailed: function (r) {
                        assert.fail(r, "Market creation failure.");
                        done();
                    }
                }); // createSingleEventMarket
            }, 2500);
        });
    });
});
