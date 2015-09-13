Blockscan
=========

[![Build Status](https://travis-ci.org/AugurProject/blockscan.svg)](https://travis-ci.org/AugurProject/blockscan)
[![Coverage Status](https://coveralls.io/repos/AugurProject/blockscan/badge.svg?branch=master&service=github)](https://coveralls.io/github/AugurProject/blockscan?branch=master)
[![npm version](https://badge.fury.io/js/blockscan.svg)](http://badge.fury.io/js/blockscan)

Reads data from the Ethereum blockchain and stows it in a MongoDB.

Installation
------------

    $ npm install blockscan

Usage
-----
```javascript
var blockscan = require("blockscan");
```
`blockscan.scan` fetches up-to-date data for all Augur markets from the Ethereum blockchain, and stores it in a MongoDB:
```javascript
var config = {
    ethereum: "http://eth1.augur.net",
    mongodb: "mongodb://localhost:27017/blockscan"
};
blockscan.scan(config, function (err, numMarketsUpdated) {
    if (err) throw err;
    console.log("Oh happy day!", numMarketsUpdated, "have been updated!");
    // fun times here
});
```
If you only want the most recently-created markets, use the `config.limit` option.  For example, to only scan the five most recent markets, set `config.limit = 5`.

`blockscan.watch` creates a persistent blockchain listener, which does a market information `scan` periodically.  (The default is every five minutes; this can be modified by editing `config.interval`.)  If you set `config.priceFilter = true`, it will also create a price filter which listens for updates to market prices, and does an extra `scan` for markets which show up in the filter.
```javascript
blockscan.watch(config, function (err, numMarketsUpdated) {
    if (err) throw err;
    console.log("Oh happy day!", numMarketsUpdated, "have been updated!");
    // fun times here
});
```

Tests
-----

    $ npm test
