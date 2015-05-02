/**
 * PRNG.js
 *
 * TODO implement Mersenne twister.
 */

var MersenneTwister = require('mersennetwister');

var PRNG = function(seed) {
  if(seed !== undefined)
    this.seed(seed);
  else
    this.mt = new MersenneTwister();
}

PRNG.prototype.seed = function(seed) {
  this.mt = new MersenneTwister(seed);
}

PRNG.prototype.random = function() {
  return this.mt.random();
}

module.exports = PRNG;
