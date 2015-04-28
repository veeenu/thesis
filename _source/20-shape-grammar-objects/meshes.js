var shgResult = { vertices: [], normals: [], uvs: [] };

/**
 * Balcony
 */

var shgBalcony = new ShapeGrammar(),
    shgStaircase = new ShapeGrammar();

////////////////////////////////////////////////////////////////////////////////
// Balcony
////////////////////////////////////////////////////////////////////////////////

shgBalcony.define('Balcony', null, null, null, function() {

  var p = this.points,
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

  fence.pop();
  border.push.apply(border, fence)
  border.push(floorFace, floorFace1);
  return border;

});

shgBalcony.define('BalconyFloor', null, null, null, function() {

  var fl = SHAPE.splitXZ(this, [ .8, .15, .05 ], [ .05, .45, .5 ], 'TQuad'),
      p = fl.splice(4, 1).shift();

  if('extrudeBorders' in this) {
    var borders = SHAPE.extrudeAll([
      { x: p.x0, y: p.y0, z: p.z0 },
      { x: p.x1, y: p.y1, z: p.z1 },
      { x: p.x2, y: p.y2, z: p.z2 },
      { x: p.x3, y: p.y3, z: p.z3 }
    ], this.extrudeBorders, 'TQuad');
    console.log(p, borders)
    fl.push.apply(fl, borders);
  }

  return fl;

});

shgBalcony.define('Fence', null, null, null, function() {
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
        x1: this.x0 + Math.cos(angle) * .05,
        x2: this.x3 + Math.cos(angle) * .05,
        z1: this.z0 + Math.sin(angle) * .05,
        z2: this.z3 + Math.sin(angle) * .05
      },
      p1 = {
        sym: 'TQuad',
        x0: this.x0, y0: this.y1 + .05, z0: this.z0,
        x3: this.x3, y3: this.y1 + .05, z3: this.z3,
        y1: this.y1 + .05, y2: this.y1 + .05,
        x1: this.x0 + Math.cos(angle) * .05,
        x2: this.x3 + Math.cos(angle) * .05,
        z1: this.z0 + Math.sin(angle) * .05,
        z2: this.z3 + Math.sin(angle) * .05
      };

  stickBase.push(p);
  stickBase.push(p1);
  stickBase.push.apply(stickBase, SHAPE.extrudeAll([
    { x: p.x0, y: p.y0, z: p.z0 },
    { x: p.x1, y: p.y1, z: p.z1 },
    { x: p.x2, y: p.y2, z: p.z2 },
    { x: p.x3, y: p.y3, z: p.z3 }
  ], .05, 'TQuad'));

  return stickBase;
});

shgBalcony.define('StickBase', null, null, null, function() {

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

shgBalcony.define('Stick', null, null, null, function() {
  
  var p = this;
  return SHAPE.extrudeAll([
    { x: p.x0, y: p.y0, z: p.z0 },
    { x: p.x1, y: p.y1, z: p.z1 },
    { x: p.x2, y: p.y2, z: p.z2 },
    { x: p.x3, y: p.y3, z: p.z3 }
  ], this.stickHeight, 'TQuad');
});

shgBalcony.define('TQuad', null, null, null, function() {
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

////////////////////////////////////////////////////////////////////////////////
// Staircase
////////////////////////////////////////////////////////////////////////////////

shgStaircase.define('Staircase', null, null, null, function() {
  var stairHeightTot = (this.stairHeight + this.stairSpace),
      stairCount = this.height / stairHeightTot,
      stairPosm  = this.width / stairCount,
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
    x0: this.x - stairPosm / 4, y0: this.y, z0: this.z - this.stairDepth / 2,
    x1: this.x - stairPosm / 4 + this.width, y1: this.y + this.height, z1: this.z - this.stairDepth / 2,
    x2: this.x + stairPosm / 4 + this.width, y2: this.y + this.height, z2: this.z - this.stairDepth / 2,
    x3: this.x + stairPosm / 4, y3: this.y, z3: this.z - this.stairDepth / 2
  }, {
    sym: 'TQuad',
    x0: this.x - stairPosm / 4, y0: this.y, z0: this.z + this.stairDepth / 2,
    x1: this.x - stairPosm / 4 + this.width, y1: this.y + this.height, z1: this.z + this.stairDepth / 2,
    x2: this.x + stairPosm / 4 + this.width, y2: this.y + this.height, z2: this.z + this.stairDepth / 2,
    x3: this.x + stairPosm / 4, y3: this.y, z3: this.z + this.stairDepth / 2
  })

  return stairs;
});

shgStaircase.define('Stair', null, null, null, function() {

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

shgStaircase.define('TQuad', null, null, null, function() {
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

shgResult = shgBalcony
  .run({
    sym: 'Balcony',
    points: {
      x0: -1.5, y0: -1.5, z0: -1,
      x1: -1.5, y1: -1.5, z1: 0,
      x2: 1.5, y2: -1.5, z2: 0,
      x3: 1.5, y3: -1.5, z3: -1
    },
    floorHeight: .05,
    fenceHeight: 1
  })
  .reduce(function(sr, cur) {
  
    for(var i = 0, I = cur.vertices.length; i < I; i++) {
      sr.vertices.push(cur.vertices[i]);
      sr.normals.push(cur.normals[i]);
      sr.uvs.push(cur.uvs[i]);
    }
    return sr;
  }, shgResult);

shgResult = shgStaircase
  .run({
    sym: 'Staircase',
    x: -1.25 + .0625, y: -1.5, z: -.725,
    height: 3,
    width: 2.5,
    stairDepth: .4,
    stairHeight: .025,
    stairSpace: .125
  })
  .reduce(function(sr, cur) {
  
    for(var i = 0, I = cur.vertices.length; i < I; i++) {
      sr.vertices.push(cur.vertices[i]);
      sr.normals.push(cur.normals[i]);
      sr.uvs.push(cur.uvs[i]);
    }
    return sr;
  }, shgResult);

shgResult = shgBalcony
  .run({
    sym: 'Balcony',
    points: {
      x0: -1.5, y0: 1.5, z0: -1,
      x1: -1.5, y1: 1.5, z1: 0,
      x2: 1.5, y2: 1.5, z2: 0,
      x3: 1.5, y3: 1.5, z3: -1
    },
    floorHeight: .05,
    fenceHeight: 1
  })
  .reduce(function(sr, cur) {
  
    for(var i = 0, I = cur.vertices.length; i < I; i++) {
      sr.vertices.push(cur.vertices[i]);
      sr.normals.push(cur.normals[i]);
      sr.uvs.push(cur.uvs[i]);
    }
    return sr;
  }, shgResult);
