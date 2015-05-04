var ShapeGrammar = require('ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('Geom'),
    PRNG         = require('PRNG');

module.exports = {
  augment: function(shg) {
    shg.define('Balcony', null, null, null, function() {

      var p = this.points,
          floorFace, floorFace1, border, fence;

      if(Math.abs(this.cos) < 10e-1) {
        floorFace  = { 
          sym: 'BalconyFloor', 
          x0: p.x0, y0: p.y0, z0: p.z0,
          x1: p.x1, y1: p.y1, z1: p.z1,
          x2: p.x2, y2: p.y2, z2: p.z2,
          x3: p.x3, y3: p.y3, z3: p.z3,
          extrudeBorders: this.floorHeight
        },
        floorFace1 = { 
          sym: 'BalconyFloor', 
          x0: p.x0, y0: p.y0 + this.floorHeight, z0: p.z0,
          x1: p.x1, y1: p.y1 + this.floorHeight, z1: p.z1,
          x2: p.x2, y2: p.y2 + this.floorHeight, z2: p.z2,
          x3: p.x3, y3: p.y3 + this.floorHeight, z3: p.z3
        },
        border = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0, z: p.z0 },
          { x: p.x1, y: p.y1, z: p.z1 },
          { x: p.x2, y: p.y2, z: p.z2 },
          { x: p.x3, y: p.y3, z: p.z3 }
        ], this.floorHeight, 'TQuad'),
        fence = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0 + this.floorHeight, z: p.z0 },
          { x: p.x1, y: p.y1 + this.floorHeight, z: p.z1 },
          { x: p.x2, y: p.y2 + this.floorHeight, z: p.z2 },
          { x: p.x3, y: p.y3 + this.floorHeight, z: p.z3 }
        ], this.fenceHeight, 'Fence');
      } else { 
        floorFace  = { 
          sym: 'BalconyFloorRot', 
          x0: p.x0, y0: p.y0, z0: p.z0,
          x1: p.x1, y1: p.y1, z1: p.z1,
          x2: p.x2, y2: p.y2, z2: p.z2,
          x3: p.x3, y3: p.y3, z3: p.z3,
          extrudeBorders: this.floorHeight
        },
        floorFace1 = { 
          sym: 'BalconyFloorRot', 
          x0: p.x0, y0: p.y0 + this.floorHeight, z0: p.z0,
          x1: p.x1, y1: p.y1 + this.floorHeight, z1: p.z1,
          x2: p.x2, y2: p.y2 + this.floorHeight, z2: p.z2,
          x3: p.x3, y3: p.y3 + this.floorHeight, z3: p.z3
        },
        border = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0, z: p.z0 },
          { x: p.x1, y: p.y1, z: p.z1 },
          { x: p.x2, y: p.y2, z: p.z2 },
          { x: p.x3, y: p.y3, z: p.z3 }
        ], this.floorHeight, 'TQuad'),
        fence = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0 + this.floorHeight, z: p.z0 },
          { x: p.x1, y: p.y1 + this.floorHeight, z: p.z1 },
          { x: p.x2, y: p.y2 + this.floorHeight, z: p.z2 },
          { x: p.x3, y: p.y3 + this.floorHeight, z: p.z3 }
        ], this.fenceHeight, 'Fence');
      }

      fence.pop();
      border.push.apply(border, fence)
      border.push(floorFace, floorFace1);
      return border;

    });

    shg.define('BalconyFloor', null, null, null, function() {

      var fl = SHAPE.splitXZ(this, [ .8, .15, .05 ], [ .05, .45, .5 ], 'TQuad'),
          p = fl.splice(4, 1).shift();

      if('extrudeBorders' in this) {
        var borders = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0, z: p.z0 },
          { x: p.x1, y: p.y1, z: p.z1 },
          { x: p.x2, y: p.y2, z: p.z2 },
          { x: p.x3, y: p.y3, z: p.z3 }
        ], this.extrudeBorders, 'TQuad');
        fl.push.apply(fl, borders);
      }

      return fl;

    });

    shg.define('BalconyFloorRot', null, null, null, function() {

      var fl = SHAPE.splitZX(this, [ .05, .45, .5 ], [ .8, .15, .05 ], 'TQuad'),
          p = fl.splice(4, 1).shift();

      if('extrudeBorders' in this) {
        var borders = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0, z: p.z0 },
          { x: p.x1, y: p.y1, z: p.z1 },
          { x: p.x2, y: p.y2, z: p.z2 },
          { x: p.x3, y: p.y3, z: p.z3 }
        ], this.extrudeBorders, 'TQuad');
        fl.push.apply(fl, borders);
      }

      this.sym = 'TQuad';
      return fl;

    });

    shg.define('Fence', null, null, null, function() {
      var stickBase = SHAPE.fit('x', this, 'StickBase', .25),
          dx = this.x3 - this.x0,
          dy = this.y1 - this.y0,
          dz = this.z3 - this.z0,
          angle = Math.atan2(dz, dx) - Math.PI / 2,
          width = Math.sqrt(dx * dx + dz * dz),
          p = { // Handle base
            sym: 'TQuad',
            x0: this.x0, y0: this.y1, z0: this.z0,
            x3: this.x3, y3: this.y1, z3: this.z3,
            y1: this.y1, y2: this.y1,
            x1: this.x0 + Math.cos(angle) * .005,
            x2: this.x3 + Math.cos(angle) * .005,
            z1: this.z0 + Math.sin(angle) * .005,
            z2: this.z3 + Math.sin(angle) * .005
          },
          p1 = {
            sym: 'TQuad',
            x0: this.x0, y0: this.y1 + .005, z0: this.z0,
            x3: this.x3, y3: this.y1 + .005, z3: this.z3,
            y1: this.y1 + .005, y2: this.y1 + .005,
            x1: this.x0 + Math.cos(angle) * .005,
            x2: this.x3 + Math.cos(angle) * .005,
            z1: this.z0 + Math.sin(angle) * .005,
            z2: this.z3 + Math.sin(angle) * .005
          };

      stickBase.push(p);
      stickBase.push(p1);
      stickBase.push.apply(stickBase, SHAPE.extrudeAll([
        { x: p.x0, y: p.y0, z: p.z0 },
        { x: p.x1, y: p.y1, z: p.z1 },
        { x: p.x2, y: p.y2, z: p.z2 },
        { x: p.x3, y: p.y3, z: p.z3 }
      ], .005, 'TQuad'));

      return stickBase;
    });

    shg.define('StickBase', null, null, null, function() {

      var subds = SHAPE.split(this, [ .45, .1, .45 ], [1], null),
          stick = subds[1],
          dx = stick.x3 - stick.x0,
          dy = stick.y1 - stick.y0,
          dz = stick.z3 - stick.z0,
          angle = Math.atan2(dz, dx) - Math.PI / 2,
          width = Math.sqrt(dx * dx + dz * dz),
          height = Math.abs(dy);

      return {
        sym: 'Stick',
        x0: stick.x0, y0: stick.y0, z0: stick.z0,
        x3: stick.x3, y3: stick.y0, z3: stick.z3,

        y1: stick.y0, y2: stick.y0,

        x1: stick.x0 + Math.cos(angle) * width,
        x2: stick.x3 + Math.cos(angle) * width,
        z1: stick.z0 + Math.sin(angle) * width,
        z2: stick.z3 + Math.sin(angle) * width,

        stickHeight: height
      }

    });

    shg.define('Stick', null, null, null, function() {
      
      var p = this;
      return SHAPE.extrudeAll([
        { x: p.x0, y: p.y0, z: p.z0 },
        { x: p.x1, y: p.y1, z: p.z1 },
        { x: p.x2, y: p.y2, z: p.z2 },
        { x: p.x3, y: p.y3, z: p.z3 }
      ], this.stickHeight, 'TQuad');
    });

  
  }
}
