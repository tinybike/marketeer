"use strict";

const Transform = require('stream').Transform;


var ops = {
  'eq':  function (a,b) { return a == b },
  'lt':  function (a,b) { return a < b },
  'lte': function (a,b) { return a <= b },
  'gt':  function (a,b) { return a > b },
  'gte': function (a,b) { return a >= b },
  'no':  function (a,b) { return 0 }
};

class PropFilter extends Transform {

  constructor(property, operator, value) {
    super({objectMode: true});
    this.property = property;
    this.value = value;

    this.op = ops[operator];
    if (!this.op) this.op = ops['no'];
  };

  _transform(data, encoding, cb) {
    if (this.op(data['value'][this.property], this.value)){
      this.push(data);
    }
    cb();
  };
}

module.exports = PropFilter;
