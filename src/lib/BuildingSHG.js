var ShapeGrammar = require('ShapeGrammar'),
    SHAPE = require('./SHAPE.js'),
    earcut = require('earcut'),
    Geom = require('Geom');

var shg = new ShapeGrammar();

shg.define('GndFloor', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return idx === 0 ? 'FrontDoor' : 'Facade'} )),
      floorFace = {
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
      };

  for(var i = 0; i < this.floors; i++) {
    var fs = this.points.reduce(function(o, cur) {
      o.points.push({
        x: cur.x, y: cur.y + this.ledgeHeight + o.floorHeight * (i + 1), z: cur.z
      });
      return o;
    }.bind(this), { sym: 'Floor', floorHeight: this.floorHeight, points: [] });
    ret.push(fs);
  }

  ret.push(floorFace);
  ret.push(ceilFace);
  ret.push(gceilFace);
  var insp = Geom.insetPolygon(this.points.map(function(i) { 
               return { x: i.x, y: i.z }
             }), this.ledgeInset).map(function(i, idx) {
               return {
                 x: i.x,
                 y: this.points[idx].y + this.floorHeight,
                 z: i.y
               }
             }.bind(this)),
      ceilp = insp.map(function(i) {
        return { x: i.x, y: i.y + this.floorHeight * this.floors + this.ledgeHeight, z: i.z };
      }.bind(this));

  ret.push({
    sym: 'Ledge',
    ledgeHeight: this.ledgeHeight,
    points: insp
  })
  ret.push({
    sym: 'Ledge',
    ledgeHeight: this.ledgeHeight,
    points: ceilp,
    hasCeil: true
  })
  return ret;
});

shg.define('Floor', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return 'Facade' } )),
      floorFace = {
        sym: 'TPolyFloor',
        points: this.points
      };
  ret.push(floorFace);
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
      }.bind(this)),
      ceilFace = this.hasCeil ? {
        sym: 'TPolyFloor',
        points: this.points.map(function(i) { 
          return { x: i.x, y: i.y + this.ledgeHeight, z: i.z }
        }.bind(this))
      } : null;
  if(ceilFace !== null)
    ret.push(ceilFace);
  return ret;
});

shg.define('Facade', null, null, null, function() {

  return SHAPE.fit('x', this, 'Tile', .7);
});

shg.define('FrontDoor', null, null, null, function() {
  var d = SHAPE.fit('x', this, 'Tile', .7), c = ~~(d.length / 2);
  d[c].sym = 'Door';
  return d;
});

shg.define('Tile', null, null, null, function() {

  var spl = SHAPE.split(this, [ .3, .4, .3 ], [ .2, .6, .2 ], [
    'TQuad', 'TQuad', 'TQuad',
    'TQuad', 'TWin',  'TQuad',
    'TQuad', 'TQuad', 'TQuad'
  ]).map(function(i, idx) {
    if(idx === 4) {
      i.uvs = [ { s:  0, t:  1 }, { s:  0, t:  0 }, { s:  1, t:  0 }, { s:  1, t:  1 } ];
    } else {
      i.texID = 6;
    }
    return i;
  });


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
  var vertices = [], normals = [], uvs = [], normal;
  this.uvs = this.uvs || [ { s:  0, t:  1 }, { s:  0, t:  0 }, { s:  1, t:  0 }, { s:  1, t:  1 } ];

  vertices = [
    this.x0, this.y0, this.z0,
    this.x1, this.y1, this.z1,
    this.x2, this.y2, this.z2,
    this.x0, this.y0, this.z0,
    this.x2, this.y2, this.z2,
    this.x3, this.y3, this.z3
  ];

  uvs = [ 0, 1, 2, 0, 2, 3 ].reduce(function(o, i) {
    o.push(this.uvs[i].s, this.uvs[i].t, this.texID || 0);
    return o;
  }.bind(this), []);

  normal = Geom.triToNormal(vertices);
  for(var i = 0; i < 6; i++) {
    normals.push.apply(normals, normal);
  }

  return { sym: null, vertices: vertices, normals: normals, uvs: uvs };
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
  this.texID = Math.random() > .35 ? 4 : 5;
  this.sym = 'TQuad';

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
    //console.log(lot)

    var axiom = {
      sym: 'GndFloor',
      floorHeight: .025,
      floors: 4 + ~~(Math.random() * 20),
      ledgeHeight: .005,
      ledgeInset: -.0025,
      points: [
        { x: lot.x - lot.width / 2, y: 0, z: lot.y - lot.depth / 2 },
        { x: lot.x - lot.width / 2, y: 0, z: lot.y + lot.depth / 2 },
        { x: lot.x + lot.width / 2, y: 0, z: lot.y + lot.depth / 2 },
        { x: lot.x + lot.width / 2, y: 0, z: lot.y - lot.depth / 2 }
      ]
    };

    return shg.run(axiom);
  }
};
