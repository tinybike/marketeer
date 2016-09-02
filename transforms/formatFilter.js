"use strict";

const Transform = require('stream').Transform;


class FormatFilter extends Transform {

  constructor() {
    super({objectMode: true});
  };

  _transform(data, encoding, cb) {
    //if (this.op(data['value'][this.property], this.value)){
    //  this.push(data);
    //}
    var values = data['value'];
    //var key = data['key'];
    // var result = 
    this.push(JSON.stringify({
      [data['key']]: {
          tradingPeriod: values['tradingPeriod'], 
          tradingFee: values['tradingFee'],
          creationTime: values['creationTime'],
          volume: values['volume'],
          tags: values['tags'],
          endDate: values['endDate'],
          description: values['description'], 
          makerFee: values['makerFee'],
          takerFee: values['takerFee']
      }
    }));
    cb();
  };
}

module.exports = FormatFilter;
