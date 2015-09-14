Marketeer
=========

[![Build Status](https://travis-ci.org/AugurProject/marketeer.svg)](https://travis-ci.org/AugurProject/marketeer)
[![Coverage Status](https://coveralls.io/repos/AugurProject/marketeer/badge.svg?branch=master&service=github)](https://coveralls.io/github/AugurProject/marketeer?branch=master)
[![npm version](https://badge.fury.io/js/marketeer.svg)](http://badge.fury.io/js/marketeer)

Augur market data preprocessor.

Installation
------------

    $ npm install marketeer

Usage
-----
```javascript
var marketeer = require("marketeer");
```
`marketeer.scan` fetches up-to-date data for all Augur markets from the Ethereum blockchain, and stores it in a MongoDB:
```javascript
var config = {
    ethereum: "http://eth1.augur.net",
    mongodb: "mongodb://localhost:27017/marketeer"
};
marketeer.scan(config, function (err, numUpdates) {
    if (err) throw err;
    console.log("Oh happy day!", numUpdates, "markets have been updated!");
    // fun times here
});
```
If you only want the most recently-created markets, use the `config.limit` option.  For example, to only scan the five most recent markets, set `config.limit = 5`.

`marketeer.watch` creates a persistent blockchain listener, which does a market information `scan` periodically.  (The default is every 30 minutes; this can be modified by editing `config.interval`.)  If you set `config.filtering = true`, it will also create contracts and price filters which listen for Augur contract transactions and updates to market prices, respectively.  It then collects the most recent info for markets which show up in the filter(s).
```javascript
marketeer.watch(config, function (err, numUpdates) {
    if (err) throw err;
    console.log("Oh happy day!", numUpdates, "markets have been updated!");
    // fun times here
});
```
`marketeer.unwatch` stops watching the blockchain, removes the price filter, and closes the database connection.

Tests
-----

    $ npm test
