(function () {
/**
 * Marketeer with local geth unit tests.
 * @author Jack Peterson (jack@tinybike.net)
 */

"use strict";

var path = require("path");
var cp = require("child_process");
var chalk = require("chalk");
var crypto = require("crypto");
var abi = require("augur-abi");
var assert = require("chai").assert;

if (!process.env.CONTINUOUS_INTEGRATION) {

    var mark, geth, config, datadir;

    var DEBUG = false;
    var TIMEOUT = 60000;
    var NETWORK_ID = "10101";
    // var NETWORK_ID = "7";
    var COINBASE = "0x05ae1d0ca6206c6168b42efcd1fbe0ed144e821b";
    // var COINBASE = "0x639b41c4d3d399894f2a57894278e1653e7cd24c";

    process.on("exit", function () { if (geth) geth.kill(); });

    before(function (done) {
        this.timeout(TIMEOUT);
        mark = require("../");
        datadir = path.join(process.env.HOME, ".augur-test");
        // datadir = path.join(process.env.HOME, ".ethereum-augur");
        config = {
            ethereum: "http://127.0.0.1:8545",
            leveldb: "./testdb",
            limit: 2,
            interval: 30000,
            scan: true,
            filtering: true,
            ipcpath: path.join(datadir, "geth.ipc")
        };
        cp.exec("ps cax | grep geth > /dev/null", function (err) {
            if (err === null) return done();
            geth = cp.spawn("geth", [
                "--etherbase", COINBASE,
                "--unlock", COINBASE,
                "--nodiscover",
                "--mine",
                "--networkid", NETWORK_ID,
                "--port", 30304,
                "--rpcport", 8547,
                "--rpc",
                "--shh",
                "--ipcapi", "admin,db,eth,debug,miner,net,shh,txpool,personal,web3",
                "--datadir", datadir,
                "--password", path.join(datadir, ".password")
            ]);
            geth.stdout.on("data", function (data) {
                if (DEBUG) process.stdout.write(chalk.cyan.dim(data));
            });
            geth.stderr.on("data", function (data) {
                if (DEBUG) process.stdout.write(chalk.white.dim(data));
                if (data.toString().indexOf("IPC service started") > -1) {
                    done();
                }
            });
            geth.on("close", function (code) {
                if (code !== 2 && code !== 0) geth.kill();
            });
        });
    });

    after(function (done) {
        if (geth) geth.kill();
        done();
    });

    describe("IPC", function () {

        describe("scan", function () {

            it("fetch market info from the blockchain and save to db", function (done) {
                this.timeout(TIMEOUT);
                mark.connect(config, function (err) {
                    assert.isNull(err);
                    mark.scan(config, function (err, updates) {
                        assert.strictEqual(updates, config.limit);
                        mark.disconnect();
                        done();
                    });
                });
            });

            it("fetch market info from the blockchain, set up db connection, then save to db", function (done) {
                this.timeout(TIMEOUT);
                mark.scan(config, function (err, updates) {
                    assert.isNull(err);
                    assert.strictEqual(updates, config.limit);
                    mark.disconnect();
                    assert.isNull(mark.watcher);
                    assert.isNull(mark.db);
                    done();
                });
            });

        });

        describe("watch", function (done) {
            var branch, markets, marketId, outcome, amount, maxNumPolls;

            before(function (done) {
                mark.augur.connect(config.ethereum, config.ipcpath, function () {
                    branch = mark.augur.branches.dev;
                    mark.augur.getMarkets(branch, function (markets) {
                        marketId = markets[markets.length - 1];
                        outcome = "1";
                        amount = "2";
                        maxNumPolls = 2;
                        done();
                    });
                });
            });

            it("watch the blockchain for market updates", function (done) {
                this.timeout(TIMEOUT*8);
                var priceUpdated, creationBlock, counter = 0;
                mark.watch(config, function (err, updates, data) {
                    assert.isNull(err);
                    assert.isNotNull(mark.watcher);
                    assert.isAbove(updates, -3);
                    if (updates === -1) {
                        assert.property(data, "filtrate");
                        assert.property(data, "doc");
                        assert.property(data.filtrate, "user");
                        assert.property(data.filtrate, "marketId");
                        assert.property(data.filtrate, "outcome");
                        assert.property(data.filtrate, "price");
                        assert.property(data.filtrate, "cost");
                        assert.property(data.filtrate, "blockNumber");
                        assert.isAbove(abi.bignum(data.filtrate.blockNumber).toNumber(), 0);
                        assert.strictEqual(abi.bignum(data.filtrate.outcome).toFixed(), outcome);
                        priceUpdated = true;
                    } else if (updates === -2) {
                        assert.property(data, "filtrate");
                        assert.property(data, "doc");
                        assert.property(data.filtrate, "marketId");
                        assert.property(data.filtrate, "blockNumber");
                        creationBlock = true;
                    }
                    if (++counter >= maxNumPolls &&
                        (!config.filtering || (priceUpdated && creationBlock)))
                    {
                        assert.isTrue(mark.unwatch());
                        assert.isNull(mark.augur.filters.price_filter.id);
                        assert.isNull(mark.augur.filters.price_filter.heartbeat);
                        assert.isNull(mark.augur.filters.contracts_filter.id);
                        assert.isNull(mark.augur.filters.contracts_filter.heartbeat);
                        assert.isNull(mark.augur.filters.block_filter.id);
                        assert.isNull(mark.augur.filters.block_filter.heartbeat);
                        assert.isNull(mark.augur.filters.creation_filter.id);
                        assert.isNull(mark.augur.filters.creation_filter.heartbeat);
                        assert.isNull(mark.watcher);
                        assert.isNull(mark.db);
                        done();
                    }
                });
                if (config.filtering) {
                    setTimeout(function () {
                        mark.augur.buyShares({
                            branchId: branch,
                            marketId: marketId,
                            outcome: outcome,
                            amount: amount,
                            onSent: function (r) {
                                assert.property(r, "txHash");
                                assert.property(r, "callReturn");
                            },
                            onSuccess: function (r) {
                                assert.property(r, "txHash");
                                assert.property(r, "callReturn");
                                assert.property(r, "blockHash");
                                assert.property(r, "blockNumber");
                                assert.isAbove(abi.bignum(r.blockNumber).toNumber(), 0);
                                assert(abi.bignum(r.from).eq(
                                    abi.bignum(mark.augur.coinbase)
                                ));
                                assert(abi.bignum(r.to).eq(
                                    abi.bignum(mark.augur.contracts.buyAndSellShares)
                                ));
                                assert.strictEqual(abi.bignum(r.value).toNumber(), 0);
                            },
                            onFailed: done
                        });
                        var description = Math.random().toString(36).substring(4);
                        mark.augur.rpc.blockNumber(function (blockNumber) {
                            mark.augur.createEvent({
                                branchId: mark.augur.branches.dev,
                                description: description,
                                expDate: parseInt(blockNumber) + 2500,
                                minValue: 1,
                                maxValue: 2,
                                numOutcomes: 2,
                                onSent: function (r) {
                                    assert.property(r, "txHash");
                                    assert.property(r, "callReturn");
                                },
                                onSuccess: function (r) {
                                    assert.property(r, "txHash");
                                    assert.property(r, "callReturn");
                                    assert.property(r, "blockHash");
                                    assert.property(r, "blockNumber");
                                    mark.augur.createMarket({
                                        branchId: mark.augur.branches.dev,
                                        description: description,
                                        alpha: "0.0079",
                                        initialLiquidity: 10,
                                        tradingFee: "0.02",
                                        events: [ r.callReturn ],
                                        onSent: function (res) {
                                            assert.property(res, "txHash");
                                            assert.property(res, "callReturn");
                                        },
                                        onSuccess: function (res) {
                                            assert.property(res, "txHash");
                                            assert.property(res, "callReturn");
                                            assert.property(res, "blockHash");
                                            assert.property(res, "blockNumber");
                                        },
                                        onFailed: done
                                    }); // createMarket
                                },
                                onFailed: done
                            }); // createEvent
                        });
                    }, 5000);
                }
            });
        });

    });

}

})();
