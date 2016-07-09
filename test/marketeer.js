/**
 * Marketeer unit tests.
 * @author Kevin Day (@k_day)
 */

"use strict";

var path = require("path");
var cp = require("child_process");
var chalk = require("chalk");
var crypto = require("crypto");
var abi = require("augur-abi");
var assert = require("chai").assert;
var leveldown = require('leveldown');
var mark = require("../");

var DEBUG = false;
var TIMEOUT = 60000;

var config = {
    http: "http://localhost:8545",
    leveldb: "./testdb",
    limit: 5,
    interval: null,
    scan: true,
    filtering: true
};

var makeDB = function (done) {
    config.leveldb = crypto.randomBytes(4).toString("hex") + "testdb";
    done();
}


var removeDB = function (done){
    mark.disconnect( (err) => {
        if (err) done(err);
        leveldown.destroy(config.leveldb, (err) => {
            if (err) console.log("Delete DB error:", err);
            done();
        });
    });   
}

var doc1 = { network: '2',
  makerFee: '0.01',
  takerFee: '0.02',
  numOutcomes: 2,
  tradingPeriod: 4893087,
  branchId: '1',
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
  numOutcomes: 2,
  tradingPeriod: 4893087,
  branchId: '1',
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

var doc3 = { network: '2',makerFee: '0.01',
  takerFee: '0.02',
  numOutcomes: 2,
  tradingPeriod: 4893087,
  branchId: '2',
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
  numOutcomes: 2,
  tradingPeriod: 4893087,
  branchId: '3',
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

describe("getMarketInfo", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("retrieve and verify document", function (done) {
        this.timeout(TIMEOUT);
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsertMarketInfo(id, doc1, function (err) {
                assert.isNull(err);
                mark.getMarketInfo(id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc1);
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
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsertMarketInfo(id, doc1, function (err) {
                assert.isNull(err);
                mark.getMarketInfo(id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc1);
                    doc1.volume = "50";
                    mark.upsertMarketInfo(id, doc1, function (err) {
                        assert.isNull(err);
                        mark.getMarketInfo(id, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(result, doc1);
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
    
    it("retrieves marekts from branch", function (done) {
        this.timeout(TIMEOUT);

        mark.connect(config, (err) => {
         mark.upsertMarketInfo("A", doc1, (err) => {
          mark.upsertMarketInfo("B", doc2, (err) => {
           mark.upsertMarketInfo("C", doc3, (err) => {
            mark.upsertMarketInfo("D", doc4, (err) => {
             //2 markets w/ branch id: 1
             mark.getMarketsInfo("1", (err, markets) => {
                assert.isNull(err);
                assert.isNotNull(markets);
                var results = JSON.parse(markets);
                assert.property(results, 'A');
                assert.property(results, 'B');
                assert.notProperty(results, 'C');
                assert.notProperty(results, 'D');
                assert.deepEqual(Object.keys(results['A']).length, 8);
                assert.deepEqual(Object.keys(results['B']).length, 8);
                assert.deepEqual(results['A']['makerFee'], doc1.makerFee);
                assert.deepEqual(results['A']['takerFee'], doc1.takerFee);
                assert.deepEqual(results['A']['tradingPeriod'], doc1.tradingPeriod);
                assert.deepEqual(results['A']['creationTime'], doc1.creationTime);
                assert.deepEqual(results['A']['volume'], doc1.volume);
                assert.deepEqual(results['A']['tags'], doc1.tags);
                assert.deepEqual(results['A']['endDate'], doc1.endDate);
                assert.deepEqual(results['A']['description'], doc1.description);
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
          mark.upsertMarketInfo("A", doc1, (err) => {
            mark.disconnect( (err) => {
              mark.connect(config, (err) => {
                mark.getMarketsInfo("1", (err, markets) => {
                  assert.isNull(err);
                  assert.isNotNull(markets);
                  var results = JSON.parse(markets);
                  assert.property(results, 'A');
                  assert.deepEqual(Object.keys(results['A']).length, 8);
                  done();
                });
              });
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
            var branch = mark.augur.constants.DEFAULT_BRANCH_ID;
            var numMarkets = mark.augur.getNumMarkets(branch);
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
/*

describe("watch", function () {
    beforeEach(makeDB);
    afterEach(removeDB);

    var branch, markets, marketId, outcome, amount, maxNumPolls;

    config.limit=5;

    mark.augur.connect(config);
    var branch = mark.augur.constants.DEFAULT_BRANCH_ID;
    var numMarkets = mark.augur.getNumMarketsBranch(branch);

    var expectedMarkets = numMarkets < config.limit ? numMarkets : config.limit;

    it("does an initial market scan", function (done) {
        this.timeout(TIMEOUT*8);
        mark.watch(config, function (err, updates, data) {
            assert.isNull(err);
            assert.isNull(mark.watcher);
            assert.isNotNull(updates);
            assert.strictEqual(updates, expectedMarkets);
            assert.isNotNull(mark.augur.filters.filter.marketCreated.id);
            done();
        });
    });

    it("listens for market creation", function (done) {
        this.timeout(TIMEOUT*8);

        mark.watch(config, function (err, updates, data) {
            assert.isNull(err);
            assert.isNull(mark.watcher);
            assert.isNotNull(mark.augur.filters.filter.marketCreated.id);

            setTimeout(function () {
                var desc = Math.random().toString(36).substring(4);
                var expDate = new Date("7/2/5099").getTime() / 1000;
                var tags = ['a', 'b', 'c'];
                console.log("creating:", {
                    branchId: branch,
                    description: desc,
                    expDate: expDate,
                    minValue: 1,
                    maxValue: 2,
                    numOutcomes: 2,
                    makerFee: .002,
                    takerFee: .05,
                    tags: tags,
                    extraInfo: "xtra",
                    resolution: "generic",
                });
                mark.augur.createSingleEventMarket({
                    branchId: branch,
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
                        assert.property(r, "marketID");
                        var maxTries = 10;
                        var counter = 0;
                        var id = r["marketID"];
                        //may be a slight delay betwwen market creation
                        //and marketeer update. Retry this a few times.
                        var timerId = setInterval( () => {
                            console.log("try:", counter);
                            mark.getMarkets( (err, markets) => {
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
                                    done();
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
                console.log("creating:", {
                    branchId: branch,
                    description: desc,
                    expDate: expDate,
                    minValue: 1,
                    maxValue: 2,
                    numOutcomes: 2,
                    makerFee: .002,
                    takerFee: .05,
                    tags: tags,
                    extraInfo: "xtra",
                    resolution: "generic",
                });
                mark.augur.createSingleEventMarket({
                    branchId: branch,
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
                        assert.property(r, "marketID");
                        var id = r["marketID"];
                        var accounts = mark.augur.rpc.personal("listAccounts");
                        mark.augur.rpc.personal("unlockAccount", [accounts[0], "password"]);
                        mark.augur.useAccount(accounts[0]);
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
                                                        mark.getMarkets( (err, markets) => {
                                                            assert.isNull(err);
                                                            assert.isNotNull(markets);
                                                            var results = JSON.parse(markets);
                                                            assert.property(results, id);
                                                            var market = results[id];
                                                            assert.property(market, "volume");
                                                            //If we see the volume change, we are done.
                                                            if (original_volume != market.volume){
                                                                clearInterval(timerId);
                                                                done();
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

});
*/
