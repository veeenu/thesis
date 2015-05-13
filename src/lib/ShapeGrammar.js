var Geom = require('Geom'),
    SHAPE = require('./SHAPE.js'),
    glMatrix = require('glMatrix'),
    earcut = require('earcut'),
    vec3 = glMatrix.vec3,
    mat4 = glMatrix.mat4;

var _ = function() {
  this.rules = [];
};

_.prototype.define = function(lhs, cond, rhs) {
  this.rules.push({
    lhs: lhs,
    cond: cond,
    rhs: rhs
  });
};

_.prototype.run = function(state) {
  
  var output = [], rules = this.rules, nonterminals = 0;

  state = (state instanceof Array? state : [state]);

  for(var k = 0, K = state.length; k < K; k++) {

    var lhs = state[k];

    if(lhs.sym === _.TERMINAL) {
      output.push(lhs);
    } else for(var i = 0, I = rules.length; i < I; i++) {
      
      var rule = rules[i];
      if(lhs.sym === rule.lhs && 
        (rule.cond === null || rule.cond.call(lhs, state))) {
        
        var ret = rule.rhs.call(lhs, state);
        ret = (ret instanceof Array? ret : [ret]);

        for(var j = 0, J = ret.length; j < J; j++) {
          output.push(ret[j]);
          ++nonterminals;
        }

        break;
      }
    }
  }

  return (nonterminals > 0 ? this.run(output) : output);
}

_.TERMINAL = 'TERMINAL';

module.exports = _;
