var ShapeGrammar = require('ShapeGrammar'),
    Geom = require('Geom');

var floorHeight = .25;
   
var shg = new ShapeGrammar();

shg.define('Lot', function(SHAPE, lot) {
  
  var out = {};
  SHAPE.stochastic(out, [
    //{ p: .33, lhs: 'Floor', rhs: SHAPE.transform({ points: lot.points_circle.slice(), count: 8, size: lot.size }, lot) },
    //{ p: .33, lhs: 'Floor', rhs: SHAPE.transform({ points: lot.points_horseshoe.slice(), count: 8, size: lot.size }, lot) },
    //{ p: .33, lhs: 'Floor', rhs: SHAPE.transform({ points: lot.points_quad.slice(), count: 8, size: lot.size }, lot) }
    { p: 1, lhs: 'Floor0', rhs: SHAPE.transform({ points: lot.points_quad.slice(), count: 8, size: lot.size }, lot) }
  ]);

  return out;
    
});

shg.define('Floor0', function(SHAPE, floor) {

  floor.count--;
  var out = {
    't0': SHAPE.extrude(floor, floorHeight),
    't1': SHAPE.face(floor),
    't2': SHAPE.face(SHAPE.transform(SHAPE.clone(floor), { t: [0, floorHeight, 0] }))
  };

  if(floor.count > 0)
    SHAPE.stochastic(out, [
      { p: .8, lhs: 'Floor', rhs: SHAPE.transform(SHAPE.clone(floor), { t: [0, floorHeight, 0] }) },
      { p: .2, lhs: null }
    ]);

  return out;
});

shg.define('Floor', function(SHAPE, floor) {

  floor.count--;
  var out = {
    't0': SHAPE.extrude(floor, floorHeight),
    't1': SHAPE.face(floor),
    't2': SHAPE.face(SHAPE.transform(SHAPE.clone(floor), { t: [0, floorHeight, 0] }))
  };

  if(floor.count > 0)
    SHAPE.stochastic(out, [
      { p: .4, lhs: 'Floor', rhs: SHAPE.transform(SHAPE.clone(floor), { t: [0, floorHeight, 0] }) },
      { p: .3, lhs: 'Floor', rhs: SHAPE.transform(SHAPE.inset(SHAPE.clone(floor), floor.size), { t: [0, floorHeight, 0] }) },
      { p: .3, lhs: null }
    ]);

  return out;
});

var points_circle = (function() {
      var arr = [];

      for(var r = 0, n = 16; r < n; r++) {
        var ang = r * Math.PI * 2 / n;
        arr.push(.5 + .5 * Math.cos(ang), 0, -.5 + .5 * Math.sin(ang));
      }
      return arr;
    }()),
    points_horseshoe = [ 0, 0, 0,  0, 0, -1,  1, 0, -1,  1, 0, 0,  .66, 0, 0,  .66, 0, -.3,  .3, 0, -.3,  .3, 0, 0 ],
    points_quad =      [ 0, 0, 0,  0, 0, -1,  1, 0, -1,  1, 0, 0 ];

module.exports = {
  shg: shg,
  create: function(lot) {
    //console.log(lot)
    var scale = [lot.width, 1, lot.depth], scf = function(val, i) {
      return scale[i % 3] * val; //(val + (i % 3 !== 1 ? 1 : 0) * (-.5));
    };
    return shg.run('Lot', { 
      t: [lot.x - lot.width / 2, 0, lot.y + lot.depth / 2], r: [0, 0, 0], s: [1, 1, 1],
      points_circle: points_circle.map(scf),
      points_horseshoe: points_horseshoe.map(scf),
      points_quad: points_quad.map(scf),
      size: Math.min(lot.width, lot.depth) * .1
    })
  }
};
