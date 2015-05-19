var ShapeGrammar = require('ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('Geom'),
    PRNG         = require('PRNG');

var shgFurniture = new ShapeGrammar();

var cubeReduce = function(hh) { 
  return function(o, i) {
    o = o.concat(SHAPE.extrudeAll(i, hh, 'Quad', [0, -1, 0]));
    o.push({
      sym: 'Quad',
      points: i
    });
    o.push({
      sym: 'Quad',
      points: i.map(function(i) {
        return { x: i.x, y: i.y -hh, z: i.z };
      })
    });
    return o;
  }
}

var uv3project = function(shgResult) {
  var bbox = shgResult.vertices.reduce(function(o, i, idx) {
    var c = idx % 3;
    switch(c) {
      case 0: 
        o.mX = Math.min(o.mX, i);
        o.MX = Math.max(o.MX, i);
        break;
      case 1: 
        o.mY = Math.min(o.mY, i);
        o.MY = Math.max(o.MY, i);
        break;
      case 2: 
        o.mZ = Math.min(o.mZ, i);
        o.MZ = Math.max(o.MZ, i);
        break;
    }
    return o;
  }, {
    mX: Number.POSITIVE_INFINITY,
    MX: Number.NEGATIVE_INFINITY,
    mY: Number.POSITIVE_INFINITY,
    MY: Number.NEGATIVE_INFINITY,
    mZ: Number.POSITIVE_INFINITY,
    MZ: Number.NEGATIVE_INFINITY
  });

  bbox.lX = bbox.MX - bbox.mX;
  bbox.lY = bbox.MY - bbox.mY;
  bbox.lZ = bbox.MZ - bbox.mZ;

  var c = shgResult.extra, v = shgResult.vertices;
  for(var i = 0, I = shgResult.vertices.length; i < I; i += 3) {
    c[i]     = (v[i]     - bbox.mX) / bbox.lX;
    c[i + 1] = (v[i + 1] - bbox.mY) / bbox.lY;
    c[i + 2] = (v[i + 2] - bbox.mZ) / bbox.lZ;
  }

  return shgResult;

}

shgFurniture.define('Chair', null, function() {

  var wt = this.woodThk, w = this.width, h = this.height,
      a = 2 * wt - .5, b = -a, cy = this.cy,
      hw = w / 2, hh = h / 2, wwt = 2 * wt,
      legTop = [
          { x: a, z: a }, { x: a, z: b }, { x: b, z: b }, { x: b, z: a }
        ].map(function(i) {
          return [
            { x: w * i.x - wt, y: cy, z: w * i.z - wt },
            { x: w * i.x - wt, y: cy, z: w * i.z + wt },
            { x: w * i.x + wt, y: cy, z: w * i.z + wt },
            { x: w * i.x + wt, y: cy, z: w * i.z - wt }
          ];
        }),
      parts = [];
     
  parts = legTop.reduce(cubeReduce(hh), parts);

  parts = cubeReduce(-wwt).call(null, parts, [ 
    { x: -hw, y: cy, z:  hw },
    { x: -hw, y: cy, z: -hw },
    { x:  hw, y: cy, z: -hw },
    { x:  hw, y: cy, z:  hw }
  ]);

  parts = cubeReduce(-hh).call(null, parts, [ 
    { x: -hw, y: wwt + cy, z: -hw + wwt },
    { x: -hw, y: wwt + cy, z: -hw },
    { x:  hw, y: wwt + cy, z: -hw },
    { x:  hw, y: wwt + cy, z: -hw + wwt }
  ]).map(function(i) {
    i.texID = 7;
    return i;
  });

  return parts;
});

shgFurniture.define('Table', null, function() {

  var wt = this.woodThk, w = this.width, h = this.height,
      a = 2 * wt - .5, b = -a, cy = this.cy,
      hw = w / 2, hh = h / 2, wwt = 2 * wt,
      legTop = [
          { x: a, z: a }, { x: a, z: b }, { x: b, z: b }, { x: b, z: a }
        ].map(function(i) {
          return [
            { x: w * i.x - wt, y: cy, z: w * i.z - wt },
            { x: w * i.x - wt, y: cy, z: w * i.z + wt },
            { x: w * i.x + wt, y: cy, z: w * i.z + wt },
            { x: w * i.x + wt, y: cy, z: w * i.z - wt }
          ];
        }),
      parts = [];
     
  parts = legTop.reduce(cubeReduce(h), parts);

  parts = cubeReduce(-wwt).call(null, parts, [ 
    { x: -hw, y: cy, z:  hw },
    { x: -hw, y: cy, z: -hw },
    { x:  hw, y: cy, z: -hw },
    { x:  hw, y: cy, z:  hw }
  ]).map(function(i) {
    i.texID = 7;
    return i;
  });

  return parts;
});

shgFurniture.define('Lamp', null, function() {
  var R = this.rings, S = this.sectors, 
      rP = null, rC = [], ret = [];

  for(var r = 0; r < R; r++) {
    for(var s = 0; s < S; s++) {
      var rad = Math.sin(.5 * Math.PI * (r + 1) / R) * this.radius;
      rC.push({
        x: Math.cos(2 * Math.PI * s / S) * rad,
        z: Math.sin(2 * Math.PI * s / S) * rad,
        y: (- r / R) * this.height
      });
    }

    if(rP !== null) {
      for(var s = 0; s < S; s++) {
        var a = rC[s], b = rP[s],
            c = rP[(s + 1) % S], d = rC[(s + 1) % S];
        ret.push({
          sym: 'Quad',
          texID: 7,
          points: [
            { x: a.x, y: a.y, z: a.z },
            { x: b.x, y: b.y, z: b.z },
            { x: c.x, y: c.y, z: c.z },
            { x: d.x, y: d.y, z: d.z }
          ]
        })
      }
    }

    rP = rC;
    rC = [];
  }

  return ret;

});

shgFurniture.define('Quad', null, (function() {

  var defaultUVS = [ 
    { s: 0, t: 1 }, 
    { s: 0, t: 0 }, 
    { s: 1, t: 0 }, 
    { s: 1, t: 1 } 
  ];

  return function() {
    
    var vertices, normals = [], uvs,
        normal, texID,
        u0, u1, u2, u3,
        p0, p1, p2, p3, ps = this.points;

    p0 = ps[0], p1 = ps[1], p2 = ps[2], p3 = ps[3];

    vertices = [
      p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
      p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z
    ];

    normal = this.normal || Geom.triToNormal(vertices);
    for(var i = 0; i < 6; i++)
      normals.push(normal[0], normal[1], normal[2]);

    uvs = this.uvs || defaultUVS;
    u0 = uvs[0], u1 = uvs[1], u2 = uvs[2], u3 = uvs[3];
    texID = this.texID || 0;

    uvs = [
      u0.s, u0.t, texID, u1.s, u1.t, texID, u2.s, u2.t, texID,
      u0.s, u0.t, texID, u2.s, u2.t, texID, u3.s, u3.t, texID
    ];

    return {
      sym: ShapeGrammar.TERMINAL,
      vertices: vertices,
      normals: normals,
      uvs: uvs
    }

  }

}()));

var table = shgFurniture.run({
  sym: 'Table',
  cy: .4,
  width: .75,
  height: .4,
  woodThk: .025
}).reduce(function(o, i) {
  for(var j = 0, J = i.vertices.length; j < J; j++) {
    o.vertices.push(i.vertices[j]);
    o.normals.push(i.normals[j]);
    o.uvs.push(i.uvs[j]);
  }
  return o;
}, { 
  vertices: [], 
  normals: [], 
  uvs: [],
  extra: []
});

var chair = shgFurniture.run({
  sym: 'Chair',
  cy: -.5,
  width: .5,
  height: 1,
  woodThk: .03125
}).reduce(function(o, i) {
  for(var j = 0, J = i.vertices.length; j < J; j++) {
    o.vertices.push(i.vertices[j]);
    o.normals.push(i.normals[j]);
    o.uvs.push(i.uvs[j]);
  }
  return o;
}, { 
  vertices: [], 
  normals: [], 
  uvs: [],
  extra: []
});

var lamp = shgFurniture.run({
  sym: 'Lamp',
  rings: 8,
  sectors: 16,
  radius: .125,
  height: .25
}).reduce(function(o, i) {
  for(var j = 0, J = i.vertices.length; j < J; j++) {
    o.vertices.push(i.vertices[j]);
    o.normals.push(i.normals[j]);
    o.uvs.push(i.uvs[j]);
  }
  return o;
}, { 
  vertices: [], 
  normals: [], 
  uvs: [],
  extra: []
});

lamp = uv3project(lamp);
chair = uv3project(chair);
table = uv3project(table);

var transform = function(mesh) {
  return function(x, y, z) {
    return {
      vertices: mesh.vertices.map(function(i, idx) {
        switch(idx % 3) {
          case 0: return i + x; break;
          case 1: return i + y; break;
          case 2: return i + z; break;
        }
      }),
      normals: mesh.normals,
      uvs: mesh.uvs,
      extra: mesh.extra
    }
  }
}

module.exports = {
  lamp: transform(lamp),
  table: transform(table),
  chair: transform(chair)
}
