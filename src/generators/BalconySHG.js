var ShapeGrammar = require('ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    Geom         = require('Geom');

var shgBalcony = new ShapeGrammar(),
    shgStaircase = new ShapeGrammar();

////////////////////////////////////////////////////////////////////////////////
// Balcony
////////////////////////////////////////////////////////////////////////////////

shgBalcony.define('Balcony', null, function() {

  var p = this.points,
      floorFace  = { 
        sym: 'BalconyFloor', 
        points: [
          { x: p[0].x, y: p[0].y, z: p[0].z },
          { x: p[1].x, y: p[1].y, z: p[1].z },
          { x: p[2].x, y: p[2].y, z: p[2].z },
          { x: p[3].x, y: p[3].y, z: p[3].z }
        ],
        extrudeBorders: this.floorHeight
      },
      floorFace1 = { 
        sym: 'BalconyFloor', 
        points: [
          { x: p[0].x, y: p[0].y + this.floorHeight, z: p[0].z },
          { x: p[1].x, y: p[1].y + this.floorHeight, z: p[1].z },
          { x: p[2].x, y: p[2].y + this.floorHeight, z: p[2].z },
          { x: p[3].x, y: p[3].y + this.floorHeight, z: p[3].z }
        ]
      },
      border = SHAPE.extrudeAll(floorFace.points, this.floorHeight, 'TQuad'),
      fence = SHAPE.extrudeAll(floorFace1.points, this.fenceHeight, 'Fence');

  fence.pop();
  border.push.apply(border, fence)
  border.push(floorFace, floorFace1);
  return border;

});

shgBalcony.define('BalconyFloor', null, function() {

  var fl = SHAPE.splitXZ(this, [ .8, .15, .05 ], [ .05, .45, .5 ], 'TQuad'),
      p = fl.splice(4, 1).shift().points;

  if('extrudeBorders' in this) {
    var borders = SHAPE.extrudeAll([
      { x: p[0].x, y: p[0].y, z: p[0].z },
      { x: p[1].x, y: p[1].y, z: p[1].z },
      { x: p[2].x, y: p[2].y, z: p[2].z },
      { x: p[3].x, y: p[3].y, z: p[3].z }
    ], this.extrudeBorders, 'TQuad');
    fl.push.apply(fl, borders);
  }

  return fl;

});

shgBalcony.define('Fence', null, function() {
  var stickBase = SHAPE.fit('x', this, 'StickBase', .25),
      p0 = this.points[0], p1 = this.points[1], p3 = this.points[3],
      dx = p3.x - p0.x,
      dz = p3.z - p0.z,
      angle = Math.atan2(dz, dx) - Math.PI / 2,
      cosa = Math.cos(angle) * .05,
      sina = Math.sin(angle) * .05,
      pa = { // Handle base
        sym: 'TQuad',
        points: [
          { x: p0.x,        y: p1.y, z: p0.z },
          { x: p0.x + cosa, y: p1.y, z: p0.z + sina },
          { x: p3.x + cosa, y: p1.y, z: p3.z + sina },
          { x: p3.x,        y: p1.y, z: p3.z }
        ]
      },
      pb = {
        sym: 'TQuad',
        points: [
          { x: p0.x,        y: p1.y + .05, z: p0.z },
          { x: p0.x + cosa, y: p1.y + .05, z: p0.z + sina },
          { x: p3.x + cosa, y: p1.y + .05, z: p3.z + sina },
          { x: p3.x,        y: p1.y + .05, z: p3.z }
        ]
      };

  stickBase.push(pa);
  stickBase.push(pb);

  var p = pa.points;

  stickBase.push.apply(stickBase, SHAPE.extrudeAll([
    { x: p[0].x, y: p[0].y, z: p[0].z },
    { x: p[1].x, y: p[1].y, z: p[1].z },
    { x: p[2].x, y: p[2].y, z: p[2].z },
    { x: p[3].x, y: p[3].y, z: p[3].z }
  ], .05, 'TQuad'));

  return stickBase;
});

shgBalcony.define('StickBase', null, function() {

  var subds = SHAPE.split(this, [ .45, .1, .45 ], [1], null),
      stick = subds[1],
      p = stick.points,
      dx = p[3].x - p[0].x,
      dy = p[1].y - p[0].y,
      dz = p[3].z - p[0].z,
      angle = Math.atan2(dz, dx) - Math.PI / 2,
      width = Math.sqrt(dx * dx + dz * dz),
      height = Math.abs(dy),
      cosw = Math.cos(angle) * width,
      sinw = Math.sin(angle) * width;

  return {
    sym: 'Stick',
    points: [
      { x: p[0].x, y: p[0].y, z: p[0].z },
      { x: p[0].x + cosw, y: p[0].y, z: p[0].z + sinw },
      { x: p[3].x + cosw, y: p[0].y, z: p[3].z + sinw },
      { x: p[3].x, y: p[0].y, z: p[3].z }
    ],
    stickHeight: height
  }

});

shgBalcony.define('Stick', null, function() {
  
  var p = this.points;
  return SHAPE.extrudeAll([
    { x: p[0].x, y: p[0].y, z: p[0].z },
    { x: p[1].x, y: p[1].y, z: p[1].z },
    { x: p[2].x, y: p[2].y, z: p[2].z },
    { x: p[3].x, y: p[3].y, z: p[3].z }
  ], this.stickHeight, 'TQuad');
});

shgBalcony.define('TQuad', null, function() {
  var vertices = [], normals = [], uvs = [], normal;
  this.uvs = this.uvs || [ { s:  0, t:  1 }, { s:  0, t:  0 }, { s:  1, t:  0 }, { s:  1, t:  1 } ];
  var p0 = this.points[0],
      p1 = this.points[1],
      p2 = this.points[2],
      p3 = this.points[3];

  vertices = [
    p0.x, p0.y, p0.z,
    p1.x, p1.y, p1.z,
    p2.x, p2.y, p2.z,
    p0.x, p0.y, p0.z,
    p2.x, p2.y, p2.z,
    p3.x, p3.y, p3.z
  ];

  uvs = [ 0, 1, 2, 0, 2, 3 ].reduce(function(o, i) {
    o.push(this.uvs[i].s, this.uvs[i].t, this.texID || 0);
    return o;
  }.bind(this), []);

  normal = Geom.triToNormal(vertices);
  for(var i = 0; i < 6; i++) {
    normals.push.apply(normals, normal);
  }

  return { sym: ShapeGrammar.TERMINAL, vertices: vertices, normals: normals, uvs: uvs };
});

////////////////////////////////////////////////////////////////////////////////
// Staircase
////////////////////////////////////////////////////////////////////////////////

shgStaircase.define('Staircase', null, function() {
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
    points: [
      { x: this.x - stairPosm / 2, y: this.y, z: this.z - this.stairDepth / 2 },
      { x: this.x - stairPosm / 2 + this.width, y: this.y + this.height, z: this.z - this.stairDepth / 2 },
      { x: this.x + stairPosm / 2 + this.width, y: this.y + this.height, z: this.z - this.stairDepth / 2 },
      { x: this.x + stairPosm / 2, y: this.y, z: this.z - this.stairDepth / 2 }
    ]
  }, {
    sym: 'TQuad',
    points: [
      { x: this.x - stairPosm / 2, y: this.y, z: this.z + this.stairDepth / 2 },
      { x: this.x - stairPosm / 2 + this.width, y: this.y + this.height, z: this.z + this.stairDepth / 2 },
      { x: this.x + stairPosm / 2 + this.width, y: this.y + this.height, z: this.z + this.stairDepth / 2 },
      { x: this.x + stairPosm / 2, y: this.y, z: this.z + this.stairDepth /  2 }
    ]
  })

  return stairs;
});

shgStaircase.define('Stair', null, function() {

  var dx = this.width / 2,
      dy = this.height / 2,
      dz = this.depth / 2;

  var ret = [{
      sym: 'TQuad',
      points: [
        { x: this.x - dx, y: this.y - dy, z: this.z - dz },
        { x: this.x - dx, y: this.y - dy, z: this.z + dz },
        { x: this.x + dx, y: this.y - dy, z: this.z + dz },
        { x: this.x + dx, y: this.y - dy, z: this.z - dz }
      ]
    }, {
      sym: 'TQuad',
      points: [
        { x: this.x - dx, y: this.y + dy, z: this.z - dz },
        { x: this.x - dx, y: this.y + dy, z: this.z + dz },
        { x: this.x + dx, y: this.y + dy, z: this.z + dz },
        { x: this.x + dx, y: this.y + dy, z: this.z - dz }
      ]
    },
  ];

  ret.push.apply(ret, SHAPE.extrudeAll(ret[0].points, this.height, 'TQuad'));

  return ret;
});

shgStaircase.define('TQuad', null, function() {
  var vertices = [], normals = [], uvs = [], normal;
  this.uvs = this.uvs || [ { s:  0, t:  1 }, { s:  0, t:  0 }, { s:  1, t:  0 }, { s:  1, t:  1 } ];
  var p0 = this.points[0],
      p1 = this.points[1],
      p2 = this.points[2],
      p3 = this.points[3];

  vertices = [
    p0.x, p0.y, p0.z,
    p1.x, p1.y, p1.z,
    p2.x, p2.y, p2.z,
    p0.x, p0.y, p0.z,
    p2.x, p2.y, p2.z,
    p3.x, p3.y, p3.z
  ];

  uvs = [ 0, 1, 2, 0, 2, 3 ].reduce(function(o, i) {
    o.push(this.uvs[i].s, this.uvs[i].t, this.texID || 0);
    return o;
  }.bind(this), []);

  normal = Geom.triToNormal(vertices);
  for(var i = 0; i < 6; i++) {
    normals.push.apply(normals, normal);
  }

  return { sym: ShapeGrammar.TERMINAL, vertices: vertices, normals: normals, uvs: uvs };
});

var balconyOnly, balconyWithStairs;

balconyOnly = shgBalcony
  .run({
    sym: 'Balcony',
    points: [
      { x: -.5, y: 0, z: 0 },
      { x: -.5, y: 0, z: 1 },
      { x: .5, y: 0, z: 1 },
      { x: .5, y: 0, z: 0 }
    ],
    floorHeight: .025,
    fenceHeight:.4 
  })
  .reduce(function(sr, cur) {

    for(var i = 0, I = cur.vertices.length; i < I; i++) {
      sr.vertices.push(cur.vertices[i]);
      sr.normals.push(cur.normals[i]);
      sr.uvs.push(cur.uvs[i]);
    }
    return sr;
  }, { vertices: [], normals: [], uvs: [] });

balconyWithStairs = shgStaircase
  .run({
    sym: 'Staircase',
    x: -.5 + .2625, y: .0125, z: .35,
    height: 1,
    width: .7,
    stairDepth: .2,
    stairHeight: .025,
    stairSpace: .0625
  })
  .reduce(function(sr, cur) {
  
    for(var i = 0, I = cur.vertices.length; i < I; i++) {
      sr.vertices.push(cur.vertices[i]);
      sr.normals.push(cur.normals[i]);
      sr.uvs.push(cur.uvs[i]);
    }
    return sr;
  }, { 
    vertices: balconyOnly.vertices.slice(), 
    normals: balconyOnly.normals.slice(), 
    uvs: balconyOnly.uvs.slice()
  });

var transform = function(model) {

  var inVertices = model.vertices,
      inNormals = model.normals,
      inUVs = model.uvs;

  // Scale first, then rotate, then translate
  return function(bbox) {

    var angle = bbox.angle,
        costh = Math.cos(angle),
        sinth = Math.sin(angle),
        dx = bbox.x1 - bbox.x0,
        dz = bbox.z1 - bbox.z0,
        cx = bbox.x0 + dx / 2,
        cz = bbox.z0 + dz / 2,
        cy = bbox.y,
        scaleX = bbox.width,
        scaleY = bbox.height,
        scaleZ = bbox.depth,
        count = inVertices.length,
        mVertices = new Float32Array(count),
        mNormals = new Float32Array(count),
        mUVs = new Float32Array(inUVs);

    for(var i = 0; i < count; i += 3) {
      var x = inVertices[i]     * scaleX,
          y = inVertices[i + 1] * scaleY + cy,
          z = inVertices[i + 2] * scaleZ;

      mVertices[i    ] =   x * costh + z * sinth + cx;
      mVertices[i + 1] =   y;
      mVertices[i + 2] = - x * sinth + z * costh + cz;

      x = inNormals[i];
      y = inNormals[i + 1];
      z = inNormals[i + 2];

      x =  x * costh + z * sinth + cx;
      z = -x * sinth + z * costh + cz;

      mNormals[i    ] = x;
      mNormals[i + 1] = y;
      mNormals[i + 2] = z;
    }

    return {
      vertices: mVertices,
      normals: mNormals,
      uvs: mUVs
    }
  }

};

module.exports = {
  createBalcony: transform(balconyOnly),
  createBalconyWithStairs: transform(balconyWithStairs)
};

