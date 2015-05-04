var shg = new ShapeGrammar(),
    context = { 
      vertices: [],
      normals: [],
      extra: [],
      uvs: [],
      totalLights: 0,
      rng: new MersenneTwister(31337)
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
  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return 'Facade' } ))
    .map(function(i) {
      i.hasBalcony = this.hasBalcony;
      i.hasStairs = this.hasStairs;
      return i;
    }.bind(this));
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

// Balcony
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

// Staircase

shg.define('Staircase', null, null, null, function() {
  var stairHeightTot = (this.stairHeight + this.stairSpace),
      stairCount = Math.abs(this.height / stairHeightTot),
      stairPosm  = Math.abs(this.width / stairCount),
      stairs = [];

      console.log(stairCount);

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

/*shg.define('TQuad', null, null, null, function() {
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
});*/

var availColors = [
  [ .88, .88, .88 ],
  [ .66, .66, .66 ],
  [ 1,   .97, .83 ],
  [ .68, .53, .46 ]
];

window.BuildingSHG = {
  shg: shg,
  create: function(lot) {
    //context.rng.seed(10);

    var dx = lot.width / 2, dy = lot.depth / 2,
        x0 = lot.x - dx, x1 = lot.x + dx,
        y0 = lot.y - dy, y1 = lot.y + dy;

    var axiom = {
      sym: 'GndFloor',
      floorHeight: .1,
      floors: 10,// + ~~(context.rng.random() * 10),
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
