'use strict';

const gasmon = require('./src/main')

module.exports.gasmon = (event, context, callback) => {
  gasmon.monitor().then(result => {
    console.log(result)
    callback(null, result)
  }, callback)
};
