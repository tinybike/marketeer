var http = require("http");
var getopt = require("posix-getopt");
var chalk = require("chalk");
var dispatcher = require('httpdispatcher');
//var join = require("path").join;
var mark = require("./");

var config = {
    ethereum: "http://localhost:8545",
    leveldb: "./augurmarketdb",
    limit: null,
    filtering: true,
    interval: null,
    scan: true,
    //ipcpath: join(process.env.HOME, ".ethereum-of-the-moment", "geth.ipc")
};

function log(str) {
    console.log(chalk.cyan.dim("[augur]"), str);
}

dispatcher.onGet("/getMarkets", function(req, res) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    mark.getMarkets(3, 1, function (err, markets){
      if (err) console.log(err);
      res.end(JSON.stringify(markets));
    });
});    

dispatcher.onError(function(req, res) {
    res.writeHead(404);
  });

function runserver(protocol, port) {
    if (protocol === "https") {
        https.createServer(ssl, function (req, res) {
            dispatcher.dispatch(req, res);
        }).listen(port);
    } else {
        http.createServer(function (req, res) {
            dispatcher.dispatch(req, res);
        }).listen(port);
    }
    log(protocol + "://localhost:" + port.toString());
}


(function init(args) {
    var opt, port, protocol, parser;
    parser = new getopt.BasicParser("s(ssl)p:(port)", args);
    while ( (opt = parser.getopt()) !== undefined) {
        switch (opt.option) {
            case 's':
                protocol = "https";
                break;
            case 'p':
                port = opt.optarg;
                break;
        }
    }

    mark.connect(config, function (err){
        if (err){
            log(err);
        }
    });

    runserver(protocol || "http", port || process.env.PORT || 8546);
})(process.argv);
