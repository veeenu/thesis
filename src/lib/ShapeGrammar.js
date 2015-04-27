var Geom = require('Geom'),
    SHAPE = require('./SHAPE.js'),
    glMatrix = require('gl-matrix'),
    earcut = require('earcut'),
    vec3 = glMatrix.vec3,
    mat4 = glMatrix.mat4;

var ShapeGrammar = function() {
  this.rules = [];
}

ShapeGrammar.prototype.define = function(rule, lc, rc, cond, fn) {

  if(!(rule in this.rules))
    this.rules[rule] = [];

  this.rules[rule].push({
    lc: lc, rc: rc, cond: cond, fn: fn
  });
}

ShapeGrammar.prototype.run = function(axiom) {

  var out = [], nonempty = false;
  axiom = axiom instanceof Array? axiom : [axiom];

  for(var i = 0, n = axiom.length; i < n; i++) {
    var symbol = axiom[i],
        //lc = (i > 0 ?     axiom[i - 1] : null),
        //rc = (i < n - 1 ? axiom[i + 1] : null),
        rlhs, rule = null;
    
    rlhs = this.rules[symbol.sym];
    if(!rlhs) {
      out.push(symbol);
      continue;
    }

    for(var j = 0, J = rlhs.length; j < J && rule === null; j++) {
      var r = rlhs[j];
      if( /*(r.lc   === null || r.lc === lc.sym) &&
          (r.rc   === null || r.rc === rc.sym) &&*/
          (r.cond === null || r.cond.call(symbol/*, lc, rc*/)) ) {
        rule = r;
      }
    }

    if(rule === null) {
      out.push(symbol);
      continue;
    }

    nonempty = true;

    var res = rule.fn.call(symbol/*, lc, rc*/);
    if(!(res instanceof Array)) res = [res];
    for(var k = 0, K = res.length; k < K; k++)
      out.push(res[k]);
    //out.push.apply(out, res instanceof Array? res : [res]);

  }

  return nonempty ? this.run(out) : axiom;
}

module.exports = ShapeGrammar;
