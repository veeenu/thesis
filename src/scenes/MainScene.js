var glMatrix = require('gl-matrix'),
    Context  = require('Context'),
    vec3     = glMatrix.vec3,
    mat4     = glMatrix.mat4,
    gl       = Context.gl,
    BuildingSHG = require('../generators/BuildingSHG.js'),
    City = require('../generators/City.js');

var computeGeometry = function(city) {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      count = 0,
      block, blockq, lot, h, col,
      mI = 0;

  var availColors = [
    [ .88, .88, .88 ],
    [ .66, .66, .66 ],
    [ 1,   .97, .83 ],
    [ .68, .53, .46 ]
  ];

  console.profile('Geom');
  while(city.blocks.length) {
    block = city.blocks.shift();

    for(var j = 0, n = block.lots.length; j < n; j++) {
      lot = block.lots[j];
      h = lot.height, lot = lot.poly;
      var cx, cy, xm, xM, ym, yM;

      cx = cy = 0;
      xm = ym = Number.POSITIVE_INFINITY;
      xM = yM = Number.NEGATIVE_INFINITY;

      for(var k = 0, K = lot.length; k < K; k++) {
        var cur = lot[k];
        cx += cur.x;
        cy += cur.y;

        if(xm > cur.x)
          xm = cur.x;
        if(xM < cur.x)
          xM = cur.x;
        if(ym > cur.y)
          ym = cur.y;
        if(yM < cur.y)
          yM = cur.y;
      }
      
      cx /= lot.length;
      cy /= lot.length;

      var bldgGeom = BuildingSHG.create({
        x: cx, y: cy,
        width: Math.abs(xM - xm) * .9,
        depth: Math.abs(yM - ym) * .9
      });

      var color = color = availColors[ ~~(Math.random() * availColors.length) ];
      //while(bldgGeom.length) {
      for(var l = 0, L = bldgGeom.length; l < L; l++) {

        var bg = bldgGeom[l]; //.shift();

        for(var k = 0; k < 18; k++) {
          /*vertices.push(bg.vertices[k]);
          normals.push(bg.normals[k]);
          uvs.push(bg.uvs[k]);*/
          extra.push(color[k % 3]);
        }

        bldgGeom[l] = null;
      }

    }
  }
  console.profileEnd();

  var g = BuildingSHG.getGeom();
  vertices = g.vertices;
  normals = g.normals;
  uvs = g.uvs;
  console.log(g.totalLights + ' lights');

  vertices.push.apply(vertices, [
    -20, -10e-4, -20,  -20, -10e-4, 20,  20, -10e-4, 20,
    -20, -10e-4, -20,   20, -10e-4, 20,  20, -10e-4, -20
  ]);
  normals.push.apply(normals, [
    0, 1, 0,  0, 1, 0,  0, 1, 0,
    0, 1, 0,  0, 1, 0,  0, 1, 0
  ]);
  uvs.push.apply(uvs, [
    0, 0, 3,  0, 40, 3,  40, 40, 3,  
    0, 0, 3,  40, 40, 3,  40, 0, 3
  ]);
  extra.push.apply(extra, [
    0, 0, 0,  0, 0, 0,  0, 0, 0,
    0, 0, 0,  0, 0, 0,  0, 0, 0
  ]);

  var roadQuads = city.roadQuads.reduce((function() { 
    var N, U;
    N = [
      0, 1, 0, 0, 1, 0, 0, 1, 0,
      0, 1, 0, 0, 1, 0, 0, 1, 0
    ];
    U = [
      0, 0, 2,  0, 1, 2,  1, 1, 2,  
      0, 0, 2,  1, 1, 2,  1, 0, 2
    ];
    return function(out, i) {
  
      var aa = i[0], bb = i[1],
          slope = Math.atan2(bb.y - aa.y, bb.x - aa.x) + Math.PI / 2,
          dx = Math.abs(.09 * Math.cos(slope)), 
          dy = Math.abs(.09 * Math.sin(slope)),
          //b = bb, a = aa,
          a = { x: aa.x + dy, y: aa.y + dx },
          b = { x: bb.x - dy, y: bb.y - dx },
          len = Math.sqrt( Math.pow(b.y - a.y, 2) + Math.pow(b.x - a.x, 2) );

      var vertices = [
        a.x - dx, 0, a.y - dy,  b.x - dx, 0, b.y - dy,  b.x + dx, 0, b.y + dy,
        a.x - dx, 0, a.y - dy,  b.x + dx, 0, b.y + dy,  a.x + dx, 0, a.y + dy
      ], uvs = U.map(function(i, idx) {
        switch(idx % 3) {
          case 0: return i; break;
          case 1: return i * len; break;
          default: return i;
        }
       return i;
      });

      for(var k = 0, K = vertices.length; k < K; k++) {
        out.vertices.push(vertices[k]);
        out.normals.push(N[k]);
        out.uvs.push(uvs[k]);
        out.extra.push(0);
      }

      return out;
    }
  }()), { vertices: [], normals: [], uvs: [], extra: [] });

  for(var k = 0, K = roadQuads.vertices.length; k < K; k++) {
    vertices.push(roadQuads.vertices[k]);
    normals.push(roadQuads.normals[k]);
    uvs.push(roadQuads.uvs[k]);
    extra.push(roadQuads.extra[k]);
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals),
    extra: new Float32Array(extra),
    count: vertices.length / 3,
    uvs: new Float32Array(uvs)
  }
}

var city = new City(0),
    geom = computeGeometry(city);

var scene = {
  vBuf:  gl.createBuffer(),
  nBuf:  gl.createBuffer(),
  uBuf:  gl.createBuffer(),
  eBuf:  gl.createBuffer(),
  lightPos: vec3.create(),
  view:  mat4.create(),
  model: mat4.create(),
  count: geom.vertices.length / 3
};

mat4.translate(scene.view, scene.view, [2., -0.1, 0]);
mat4.rotateY(scene.view, scene.view, Math.PI * 16 / 16);

gl.bindBuffer(gl.ARRAY_BUFFER, scene.vBuf);
gl.bufferData(gl.ARRAY_BUFFER, geom.vertices, gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, scene.nBuf);
gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, scene.uBuf);
gl.bufferData(gl.ARRAY_BUFFER, geom.uvs, gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, scene.eBuf);
gl.bufferData(gl.ARRAY_BUFFER, geom.extra, gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, null);

var t = 0.;
scene.update = function(timestamp) {
  //vec3.set(scene.lightPos, .38, .2, -.3);
  //vec3.set(scene.lightPos, 1, 1, 1);
  vec3.set(scene.lightPos, 0,.05,-.05);
  //t += .01;
  mat4.translate(scene.view, scene.view, [0, 0, -.002]);
}

window.setLight = function(a,b,c) {
  vec3.set(scene.lightPos, a,b,c);
}

module.exports = scene;
