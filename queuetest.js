var async = require("async");

var options = {
     http: "http://localhost:8545",
     //http: "http://augur2.eastus.cloudapp.azure.com:8545",
     ws: null
};

//options.contracts = { "Backstops": "0xe2d193b7769202d58239dc312143d5ccc74b7e4c", "Branches": "0xf7a71c98e2fada3a853a77fd6fcf69ac6d20f0a6", "BuyAndSellShares": "0xe5876c658820433902efe27c03d7220a1862178b", "Cash": "0x8e123ef6ce5e7a39f34cf957e6862772ed5d8941", "CloseMarket": "0x637895b4fa64c5110f1a7906d830221fec27c1a1", "CloseMarketOne": "0xffdbe37908443952502fc502eed0cc4d55ab305d", "CloseMarketTwo": "0x4f7c34cadd54774aff0a59e4511112d6fb6af7b5", "CollectFees": "0xad425789756d53bba879cc893bb1a6e28ff18c3d", "CompleteSets": "0x8a210d3b6696e684babaf1dbcb0495c69a0023eb", "CompositeGetters": "0xb1f194a8f5c2d744a0c8e2b50c28fab281b6dd66", "Consensus": "0x71b1afb93e5827b7989cf5dd060df37cbb3e537d", "ConsensusData": "0x547c5867e4435073c14d80b70cf01e436944b195", "CreateBranch": "0x2407d5ab8db2ad445f18c814ff027ece91943573", "CreateMarket": "0x709ef6cff1a9034c17c1c7ac3acceeed704231d6", "EventResolution": "0x66c0c91f5aa44ccd12b26dafc0b154faba2dfcb8", "Events": "0xd915c293cf762b665bf5835712de244029ea3109", "ExpiringEvents": "0xe4571b25984c91d084427023e7b5bdb0d134eb49", "Faucets": "0xb3eea8e25817eeb8c8cd6881e2180bef52547f5f", "ForkPenalize": "0x7a946a1d3f74221b5b6dece39c507e1cdcad29be", "Forking": "0xc7cc377e27bc7b5432635025fece42f4364cef87", "FxpFunctions": "0x1444fa8f5021c5fb8507fdee3c95833d1b866f81", "Info": "0xd2e6b2cc7df9927296cb12e4c69ecab025f07e8f", "MakeReports": "0x929779562a1a03d98206ea94d29372a6efb8c28e", "Markets": "0x60686ab40f7b119d46d48c84592e48d5ec0e1ae5", "PenalizationCatchup": "0x2d08f65f6706698c0289b78e5a97ca5bdaefdc33", "PenalizeNotEnoughReports": "0x774ce847bdeeda2b43cc24f213fa43076f55e9dc", "ProportionCorrect": "0xce7a01558a31e52acc00b2e93f986c4a8a300083", "Reporting": "0xd4298e5e6a8811b0889dba23a33fc6226f706b82", "ReportingThreshold": "0x892ef62b0704bf33dd5529bb23ec5c2568d1b256", "RoundTwo": "0x3a88b9a686cc80effb6ec9b652558af4deff6c6c", "RoundTwoPenalize": "0xae973e8387bd684daee78f2cfe5d4c47e64053d8", "SendReputation": "0x720b3208cae428fcda7466a4feb09caf1b5a606f", "SlashRep": "0xa84c27d57ea7835f31aee20e3f8440f1915fabad", "Trade": "0xf91f47ebb23fb936a14841ea8a0d50f6c5e40986", "Trades": "0x5e4b2597982ef4f9418d0888598e46d933c0aea8" };
var augur = require("augur.js");
augur.connect(options);

function loadMarket(market, callback) {
    setTimeout(function() {
        var marketInfo = augur.getMarketInfo(market);
        var priceHistory = augur.getMarketPriceHistory(market);
        console.log(marketInfo);
        //console.log('Processing data: ' + data);
        callback();
    }, 1000);
}

var q = async.queue(loadMarket, 2);
//q.pause();

// called when all items in queue have been processed
q.drain = function() {
    console.log('All items have been processed. ');
}

var numMarkets = 0;
var limit = 10;

var branches = augur.getBranches();
console.log("Loading Market Data and Price History");
for (var i = 0; i < branches.length; i++) {
    if (numMarkets >= limit) continue;
    var branch = branches[i];
    var markets = augur.getMarketsInBranch(branch);
    for (var j = 0; j < markets.length; j++) {
        if (numMarkets >= limit) continue;
        var market = markets[j];
        q.push(market, function(err) {
            // called after this queueWorker has finished
            //console.log('All done with ', numMarkets);
        });
        numMarkets++;
    }
}
//q.resume();