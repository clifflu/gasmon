'use strict';

const gasmon = require('./src/gasmon')

module.exports.gasmon = (event, context, callback) => {
  gasmon
    .query()
    .then(gasmon.writeLogs)
    .then(result => {
      callback(null, result)
    }, callback)
};
