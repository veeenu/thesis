var ShapeGrammar = require('ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('Geom'),
    PRNG         = require('PRNG'),
    BalconySHG   = require('./BalconySHG.js'),
    StaircaseSHG = require('./StaircaseSHG.js');

var shg = new ShapeGrammar(),
    context = { 
      vertices: [],
      normals: [],
      extra: [],
      uvs: [],
      totalLights: 0,
      rng: new PRNG(31337)
    };

shg.define('GndFloor', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return idx === 0 ? 'FrontDoor' : 'Facade'} )),
      dy = this.floorHeight * (this.floors + 1),
      ceilFace = {
        /*sym: 'TPolyFloor',
        points: this.points.map(function(i) {
          return { x: i.x, y: i.y + this.floorHeight * (this.floors + 1) + this.ledgeHeight, z: i.z }
        }.bind(this))*/
        sym: 'Ceiling',
        x0: this.points[0].x, y0: this.points[0].y + dy, z0: this.points[0].z,
        x1: this.points[1].x, y1: this.points[1].y + dy, z1: this.points[1].z,
        x2: this.points[2].x, y2: this.points[2].y + dy, z2: this.points[2].z,
        x3: this.points[3].x, y3: this.points[3].y + dy, z3: this.points[3].z,
        texID: 6
      };
      /*floorFace = {
        sym: 'TPolyFloor',
        points: this.points
      },
      gceilFace = {
        sym: 'TPolyFloor',
        points: this.points.map(function(i) {
          return { x: i.x, y: i.y + this.floorHeight, z: i.z }
        }.bind(this))
      };*/

  for(var i = 0; i <= this.floors; i++) {
    var fs = this.points.reduce(function(o, cur) {
      o.points.push({
        x: cur.x, y: cur.y + o.floorHeight * (i + 1), z: cur.z
      });
      return o;
    }.bind(this), { sym: i < this.floors ? 'Floor' : 'Ledge', floorHeight: this.floorHeight, ledgeHeight: this.ledgeHeight, points: [] });

    fs.hasBalcony = true;
    if(i < this.floors - 1)
      fs.hasStairs = true;
    ret.push(fs);
  }

  var lY = (this.points[0].y + this.floorHeight * this.floors) / 2;

  for(var i = 0, I = ret.length; i < I; i++) {
    ret.push({
      sym: 'TLight',
      lightPos: {
        x: (ret[i].x0 + ret[i].x3) / 2,
        y: lY,
        z: (ret[i].z0 + ret[i].z3) / 2
      }
    });
  }

  ret.push(ceilFace);

  return ret;
});

shg.define('Ceiling', null, null, null, function() {
  var ret = SHAPE.splitXZ(this, [ .5, .5 ], [ .5, .5 ], 'TQuad')
    .map(function(i) {
      i.texID = 6;
      return i;
    });
  return ret;
})

shg.define('Floor', null, null, null, function() {
  var hb = this.hasBalcony, hs = this.hasStairs;

  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return 'Facade' } ))
    .map(function(i) {
      i.hasBalcony = hb;
      i.hasStairs = hs;
      return i;
    });
  return ret;
});

shg.define('Ledge', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.ledgeHeight,
        this.points.map(function(i, idx) { return 'TQuad' } )
      ).map(function(i) { 
        i.texID = 6;
        var dx = i.x0 - i.x3, dz = i.z0 - i.z3, 
            dy = Math.abs(i.y1 - i.y0),
            w = Math.sqrt(dx * dx + dz * dz) / (7 * this.ledgeHeight);
        i.uvs = [
          { s: 0, t: .125 },
          { s: 0, t: 0 },
          { s: w, t: 0 },
          { s: w, t: .125 }
        ]
        return i; 
      }.bind(this))/*,
      p0 = this.points[0], p1 = this.points[1],
      p2 = this.points[2], p3 = this.points[3],
      ceilFace = {
        sym: 'TQuad',
        points: {
          x0: p0.x, y0: p0.y + this.ledgeHeight, z0: p0.z,
          x1: p1.x, y1: p1.y + this.ledgeHeight, z1: p1.z,
          x2: p2.x, y2: p2.y + this.ledgeHeight, z2: p2.z,
          x3: p3.x, y3: p3.y + this.ledgeHeight, z3: p3.z
        }
      }*/;
  //ret.push(ceilFace);
  return ret;
});

shg.define('Facade', null, null, null, function() {

  var tiles = SHAPE.fit('x', this, 'Tile', 1);

  tiles[1].hasBalcony = this.hasBalcony;
  tiles[1].hasStairs = this.hasStairs;

  return tiles;
});

shg.define('FrontDoor', null, null, null, function() {
  var d = SHAPE.fit('x', this, 'Tile', 1), c = ~~(d.length / 2);
  d[c].sym = 'Door';
  return d;
});

shg.define('Tile', null, null, null, function() {

  var spl = SHAPE.split(this, [ .3, .4, .3 ], [ .7, .3 ], [
    'TQuad', 'TWin',  'TQuad',
    'TQuad', 'TQuad', 'TQuad'
  ]);

  spl[0].texID = spl[4].texID = spl[2].texID = 
    spl[3].texID = spl[5].texID = 6;
  spl[1].uvs = null;
  
  var dx = this.x3 - this.x0,
      dy = Math.abs(this.y1 - this.y0),
      dz = this.z3 - this.z0,
      angle = Math.atan2(dz, dx) + Math.PI / 2,
      cos = Math.cos(angle), sin = Math.sin(angle),
      padx = sin * .01, padz = -cos * .01,
      w = Math.sqrt(dx * dx + dz * dz) * .33,
      h = Math.abs(dy);
  
  if(this.hasBalcony) {
    spl.push({
      sym: 'Balcony',
      points: {
        x0: this.x0 + padx, y0: this.y1, z0: this.z0 + padz,
        x3: this.x3 - padx, y3: this.y2, z3: this.z3 - padz,
        y1: this.y1, y2: this.y1,

        x1: this.x0 + cos * w + padx,
        x2: this.x3 + cos * w - padx,
        z1: this.z0 + sin * w + padz,
        z2: this.z3 + sin * w - padz
      },
      cos: cos,
      floorHeight: .005,
      fenceHeight: dy / 2
    });
  }
  if(this.hasStairs) {
    spl.push({
      sym: 'Staircase',
      x: this.x0 + 2 * padx, y: this.y1, z: this.z0 + w * .25,

      height: Math.abs(this.y1 - this.y0), 
      width: sin * (dx - 4 * padx),
      stairDepth: w * .5,
      stairHeight: .0025,
      stairSpace: .00625
    });
  }

  return spl;
});

shg.define('Door', null, null, null, function() {

 var spl = SHAPE.split(this, [ .1, .8, .1 ], [ .3, .7 ], [
   'TQuad', 'TQuad', 'TQuad',
   'TQuad', 'TDoor',  'TQuad'
 ]).map(function(i, idx) {
   if(idx !== 4)
     i.texID = 6;
   return i;
 });

  spl[4].uvs = [ { s:  0, t:  1 }, { s:  0, t:  0 }, { s:  1, t:  0 }, { s:  1, t:  1 } ];

  return spl;
});

shg.define('TQuad', null, null, null, function() {
  var vertices = [], normals = [], uvs = [], normal,
      u0, u1, u2, u3;
  var uuvs = this.uvs || [ { s:  0, t:  1 }, { s:  0, t:  0 }, { s:  1, t:  0 }, { s:  1, t:  1 } ];

  vertices = [
    this.x0, this.y0, this.z0,
    this.x1, this.y1, this.z1,
    this.x2, this.y2, this.z2,
    this.x0, this.y0, this.z0,
    this.x2, this.y2, this.z2,
    this.x3, this.y3, this.z3
  ];

  var ti = this.texID || 0;

  u0 = uuvs[0];
  u1 = uuvs[1];
  u2 = uuvs[2];
  u3 = uuvs[3];

  uvs = [
    u0.s, u0.t, ti,
    u1.s, u1.t, ti,
    u2.s, u2.t, ti,
    u0.s, u0.t, ti,
    u2.s, u2.t, ti,
    u3.s, u3.t, ti
  ];

  normal = Geom.triToNormal(vertices);
  for(var i = 0; i < 18; i++) {
    normals.push(normal[i % 3]);
  }

  this.sym = null;
  this.vertices = vertices;
  this.normals = normals;
  this.uvs = uvs;
  return this;
  //return { sym: null , vertices: vertices, normals: normals, uvs: uvs };
});

shg.define('TPolyFloor', null, null, null, function() {
  var rings = this.points.reduce(function(out, val) {
    out.push([val.x, val.z]);
    return out;
  }, []), y = this.points[0].y;

  var triverts = earcut([rings]),
      vertices = triverts.reduce(function(out, val, i) {
        out.push(val[0], y, val[1]);
        return out;
      }, []),
      normal = Geom.triToNormal(vertices),
      normals = vertices.map(function(i, idx) {
        return normal[idx % 3];
      });

  return { sym: null, vertices: vertices, normals: normals };
});

shg.define('TWin', null, null, null, function() {
  var hasLight = context.rng.random() > .25;
  this.texID = hasLight ? 4 : 5;
  this.sym = 'TQuad';
  //if(hasLight)

  return this;
});

shg.define('TDoor', null, null, null, function() {
  this.texID = 4;
  this.sym = 'TQuad';

  return this;
});

BalconySHG.augment(shg);
StaircaseSHG.augment(shg);

var availColors = [
  [ .88, .88, .88 ],
  [ .66, .66, .66 ],
  [ 1,   .97, .83 ],
  [ .68, .53, .46 ]
];

module.exports = {
  shg: shg,
  create: function(lot) {
    //context.rng.seed(10);

    var dx = lot.width / 2, dy = lot.depth / 2,
        x0 = lot.x - dx, x1 = lot.x + dx,
        y0 = lot.y - dy, y1 = lot.y + dy;

    var axiom = {
      sym: 'GndFloor',
      floorHeight: .1,
      floors: 4 + ~~(context.rng.random() * 10),
      ledgeHeight: .02,
      points: [
        { x: x0, y: 0, z: y0 },
        { x: x0, y: 0, z: y1 },
        { x: x1, y: 0, z: y1 },
        { x: x1, y: 0, z: y0 }
      ]
    };

    var color = availColors[ ~~(context.rng.random() * availColors.length) ];

    var ret = shg.run(axiom);
    return { geom: ret, color: color };
  },
  getGeom: function() {
    return context;
  }
};
