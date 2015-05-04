var ShapeGrammar = require('ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('Geom'),
    PRNG         = require('PRNG');

module.exports = {
  augment: function(shg) {
  
    shg.define('Staircase', null, null, null, function() {
      var stairHeightTot = (this.stairHeight + this.stairSpace),
          stairCount = Math.abs(this.height / stairHeightTot),
          stairPosm  = Math.abs(this.width / stairCount),
          stairs = [];

      for(var i = 0; i <= stairCount; i++) {
        stairs.push({
          sym: 'Stair',
          x: this.x + stairPosm * i,
          y: this.y + stairHeightTot * i,
          z: this.z,
          height: this.stairHeight,
          width: stairPosm,
          depth: this.stairDepth
        });
      }

      stairs.push({
        sym: 'TQuad',
        x0: this.x - stairPosm / 2, y0: this.y, z0: this.z - this.stairDepth / 2,
        x1: this.x - stairPosm / 2 + this.width, y1: this.y + this.height, z1: this.z - this.stairDepth / 2,
        x2: this.x + stairPosm / 2 + this.width, y2: this.y + this.height, z2: this.z - this.stairDepth / 2,
        x3: this.x + stairPosm / 2, y3: this.y, z3: this.z - this.stairDepth / 2
      }, {
        sym: 'TQuad',
        x0: this.x - stairPosm / 2, y0: this.y, z0: this.z + this.stairDepth / 2,
        x1: this.x - stairPosm / 2 + this.width, y1: this.y + this.height, z1: this.z + this.stairDepth / 2,
        x2: this.x + stairPosm / 2 + this.width, y2: this.y + this.height, z2: this.z + this.stairDepth / 2,
        x3: this.x + stairPosm / 2, y3: this.y, z3: this.z + this.stairDepth / 2
      })

      return stairs;
    });

    shg.define('Stair', null, null, null, function() {

      var dx = this.width / 2,
          dy = this.height / 2,
          dz = this.depth / 2;

      var ret = [{
          sym: 'TQuad',
          x0: this.x - dx, y0: this.y - dy, z0: this.z - dz,
          x1: this.x - dx, y1: this.y - dy, z1: this.z + dz,
          x2: this.x + dx, y2: this.y - dy, z2: this.z + dz,
          x3: this.x + dx, y3: this.y - dy, z3: this.z - dz
        }, {
          sym: 'TQuad',
          x0: this.x - dx, y0: this.y + dy, z0: this.z - dz,
          x1: this.x - dx, y1: this.y + dy, z1: this.z + dz,
          x2: this.x + dx, y2: this.y + dy, z2: this.z + dz,
          x3: this.x + dx, y3: this.y + dy, z3: this.z - dz
        },
      ];

      ret.push.apply(ret, SHAPE.extrudeAll([
        { x: ret[0].x0, y: ret[0].y0, z: ret[0].z0 },
        { x: ret[0].x1, y: ret[0].y1, z: ret[0].z1 },
        { x: ret[0].x2, y: ret[0].y2, z: ret[0].z2 },
        { x: ret[0].x3, y: ret[0].y3, z: ret[0].z3 }
      ], this.height, 'TQuad'));

      return ret;
    });

  }
}
