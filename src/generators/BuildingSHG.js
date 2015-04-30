var ShapeGrammar = require('ShapeGrammar'),
    SHAPE = require('../lib/SHAPE.js'),
    earcut = require('earcut'),
    Geom = require('Geom');

var shg = new ShapeGrammar(),
    context = { 
      vertices: [],
      normals: [],
      extra: [],
      uvs: [],
      totalLights: 0
    };

shg.define('GndFloor', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return idx === 0 ? 'FrontDoor' : 'Facade'} ));
      /*floorFace = {
        sym: 'TPolyFloor',
        points: this.points
      },
      ceilFace = {
        sym: 'TPolyFloor',
        points: this.points.map(function(i) {
          return { x: i.x, y: i.y + this.floorHeight * (this.floors + 1) + this.ledgeHeight, z: i.z }
        }.bind(this))
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
    ret.push(fs);
  }

  return ret;
});

shg.define('Floor', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return 'Facade' } ))
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

  return SHAPE.fit('x', this, 'Tile', 1);
});

shg.define('FrontDoor', null, null, null, function() {
  var d = SHAPE.fit('x', this, 'Tile', 1), c = ~~(d.length / 2);
  d[c].sym = 'Door';
  return d;
});

shg.define('Tile', null, null, null, function() {

  var spl = SHAPE.split(this, [ .3, .4, .3 ], [ .7, .3 ], [
//    'TQuad', 'TQuad', 'TQuad',
    'TQuad', 'TWin',  'TQuad',
    'TQuad', 'TQuad', 'TQuad'
  ]);

  spl[0].texID = spl[4].texID = spl[2].texID = 
    spl[3].texID = spl[5].texID = 6;
    //spl[6].texID = spl[7].texID = spl[8].texID = 6;
  spl[1].uvs = null;
  
  /*var spl = this;
  spl.sym = 'TWin';*/

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
    context.vertices.push(vertices[i])
    context.normals.push(normal[i % 3]);
    context.uvs.push(uvs[i]);
    //normals.push.apply(normals, normal);
  }

  return { sym: null }; //, vertices: vertices, normals: normals, uvs: uvs };
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
  var test = Math.random() > .35;
  this.texID = test ? 4 : 5;
  this.sym = 'TQuad';

  if(!test)
    context.totalLights++;

  return this;
});

shg.define('TDoor', null, null, null, function() {
  this.texID = 4;
  this.sym = 'TQuad';

  return this;
});

module.exports = {
  shg: shg,
  create: function(lot) {
    var dx = lot.width / 2, dy = lot.depth / 2,
        x0 = lot.x - dx, x1 = lot.x + dx,
        y0 = lot.y - dy, y1 = lot.y + dy;

    var axiom = {
      sym: 'GndFloor',
      floorHeight: .1,
      floors: 4 + ~~(Math.random() * 10),
      ledgeHeight: .02,
      points: [
        { x: x0, y: 0, z: y0 },
        { x: x0, y: 0, z: y1 },
        { x: x1, y: 0, z: y1 },
        { x: x1, y: 0, z: y0 }
      ]
    };

    var ret = shg.run(axiom);
    return ret;
  },
  getGeom: function() {
    return context;
  }
};
