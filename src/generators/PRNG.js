/**
 * PRNG.js
 *
 * TODO implement Mersenne twister.
 */

var PRNG = function(seed) {
  if(seed !== undefined)
    this.seed(seed);
}

PRNG.prototype.seed = function(seed) {
}

PRNG.prototype.random = Math.random;

module.exports = PRNG;
