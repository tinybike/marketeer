leech
=====

Leeches information from the Ethereum blockchain and stows it in a MongoDB.

Installation
------------

    $ npm install leech

Usage
-----
```javascript
var leech = require("leech");
```
`leech.suck` fetches up-to-date data for all Augur markets from the Ethereum blockchain, and stores it in a MongoDB:
```javascript
var config = {
    ethereum: "http://eth1.augur.net",
    mongodb: "mongodb://localhost:27017/leech"
};
leech.suck(config, function (err, numMarketsUpdated) {
    if (err) throw err;
    console.log("Oh happy day!", numMarketsUpdated, "have been updated!");
    // fun times here
});
```
If you only want the most recently-created markets, use the `config.limit` option.  For example, to only suck the five most recent markets, set `config.limit = 5`.

`leech.attach` creates a persistent blockchain listener, which does a market information `suck` periodically.  (The default is every five minutes; this can be modified by editing `config.interval`.)  If you set `config.priceFilter = true`, it will also create a price filter which listens for updates to market prices, and does an extra `suck` for markets which show up in the filter.
```javascript
leech.attach(config, function (err, numMarketsUpdated) {
    if (err) throw err;
    console.log("Oh happy day!", numMarketsUpdated, "have been updated!");
    // fun times here
});
```

Tests
-----

    $ npm test
