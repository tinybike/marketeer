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


describe("select", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("retrieve and verify document", function (done) {
        this.timeout(TIMEOUT);
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        var doc = {data: "booyah"};
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsert(id, doc, function (err) {
                assert.isNull(err);
                mark.select(id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    done();
                });
            });
        });
    });
});

describe("upsert", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("insert and update document", function (done) {
        this.timeout(TIMEOUT);
        var id = abi.prefix_hex(crypto.randomBytes(32).toString("hex"));
        var doc = {creationTime: 4, data: "hello world"};
        mark.connect(config, function (err) {
            assert.isNull(err);
            mark.upsert(id, doc, function (err) {
                assert.isNull(err);
                mark.select(id, function (err, result) {
                    assert.isNull(err);
                    assert.deepEqual(result, doc);
                    doc.data = "goodbye world";
                    mark.upsert(id, doc, function (err) {
                        assert.isNull(err);
                        mark.select(id, function (err, result) {
                            assert.isNull(err);
                            assert.deepEqual(result, doc);
                            done();
                        });
                    });
                });
            });
        });
    });
});


describe("getMarkets", function () {
    beforeEach(makeDB);
    afterEach(removeDB);
    it("retrieves marekts", function (done) {
        this.timeout(TIMEOUT);
        //Insert docs out of order.
        var data = {
            "A": {data: 1},
            "B": {data: 2},
            "C": {data: 3},
            "D": {data: 4}  
        };

        mark.connect(config, (err) => {
         mark.upsert("A", data["A"], (err) => {
          mark.upsert("B", data["B"], (err) => {
           mark.upsert("C", data["C"], (err) => {
            mark.upsert("D", data["D"], (err) => {
             mark.getMarkets( (err, markets) => {
                assert.isNull(err);
                assert.isNotNull(markets);
                var results = JSON.parse(markets);
                assert.deepEqual(results["A"], data["A"]);
                assert.deepEqual(results["B"], data["B"]);
                assert.deepEqual(results["C"], data["C"]);
                assert.deepEqual(results["D"], data["D"]);
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
        var data = {
            "A": {data: 1}
        };
        mark.connect(config, (err) => {
          mark.upsert("A", data["A"], (err) => {
            mark.disconnect( (err) => {
              mark.connect(config, (err) => {
                mark.getMarkets( (err, markets) => {
                  assert.isNull(err);
                  assert.isNotNull(markets);
                  var results = JSON.parse(markets);
                  assert.deepEqual(results["A"], data["A"]);
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

