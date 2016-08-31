var Transform = require('stream').Transform; 
var util = require('util');

module.exports = MarketStreamTransform;

function MarketStreamTransform(options) {
  // allow use without new
  if (!(this instanceof MarketStreamTransform)) {
    return new MarketStreamTransform(options);
  }

  // init Transform
  Transform.call(this, options);
}
util.inherits(MarketStreamTransform, Transform);

MarketStreamTransform.prototype._transform = function (chunk, enc, cb) {
  if (chunk['value']['endDate'] == 1472266800){
    this.push(chunk);
  }
  cb();
};
