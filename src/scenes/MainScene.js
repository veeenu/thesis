var glMatrix = require('gl-matrix'),
    Context  = require('Context'),
    Mesh     = require('Mesh'),
    Geom     = require('Geom'),
    QuadTree = require('QuadTree'),
    Loader   = require('Loader'),
    vec3     = glMatrix.vec3,
    mat4     = glMatrix.mat4,
    gl       = Context.gl,
    BuildingSHG = require('../generators/BuildingSHG.js'),
    City = require('../generators/City.js');

var computeBlockMesh = function(block, availColors) {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      lights   = [],
      count    = 0;

  for(var j = 0, n = block.lots.length; j < n; j++) {
    var lot, h, cx, cy, xm, xM, ym, yM;
    lot = block.lots[j];
    h = lot.height, lot = lot.poly;

    cx = cy = 0;
    xm = ym = Number.POSITIVE_INFINITY;
    xM = yM = Number.NEGATIVE_INFINITY;

    for(var k = 0, K = lot.length; k < K; k++) {
      var cur = lot[k];
      cx += cur.x;
      cy += cur.y;

      xm = Math.min(xm, cur.x);
      xM = Math.max(xM, cur.x);
      ym = Math.min(ym, cur.y);
      yM = Math.max(yM, cur.y);

    }
    
    cx /= lot.length;
    cy /= lot.length;

    var bldg = BuildingSHG.create({
      x: cx, y: cy,
      width: Math.abs(xM - xm) * .9,
      depth: Math.abs(yM - ym) * .9
    }), 
    bldgGeom = bldg.geom, 
    color = bldg.color;

    for(var l = 0, L = bldgGeom.length; l < L; l++) {

      var bg = bldgGeom[l]; //.shift();

      if(bg.sym === null)
        for(var k = 0; k < 18; k++) {
          vertices.push(bg.vertices[k]);
          normals.push(bg.normals[k]);
          uvs.push(bg.uvs[k]);
          extra.push(color[k % 3]);
        }
      else
        lights.push(bg.lightPos);

      bldgGeom[l] = null;
    }

  }

  return {
    mesh: new Mesh(vertices, normals, uvs, extra),
    lights: lights,
    x: block.x,
    y: block.y,
    w: block.w
  };
}

var city = new City(0),
    geom = {
      quadtree: null,
      quadtreeLights: null,
      fixedMeshes: []
    };

(function() {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      count = 0,
      block, blockq, lot, h, col,
      mI = 0,
      meshes = [],
      blocks = [],
      lights = [],
      qtree, qtreeL;

  var blocksProgress = 0, blocksCount = city.blocks.length;

  while(city.blocks.length) {
    block = city.blocks.shift();
    setTimeout(function() {
      var m = computeBlockMesh(this);
      blocks.push(m);
      blocksProgress++;
      Loader.progress('Blocks', blocksProgress / blocksCount);
    }.bind(block), 0);
  }

  Loader.subscribe('Blocks', (function(geom, blocks) { return function() {
    var xm, ym, xM, yM;
    xm = ym = Number.POSITIVE_INFINITY;
    xM = yM = Number.NEGATIVE_INFINITY;

    blocks.forEach(function(i) {
      xm = Math.min(xm, i.x - i.w);
      xM = Math.max(xM, i.x + i.w);
      ym = Math.min(ym, i.y - i.w);
      yM = Math.max(yM, i.y + i.w);
    });

    var qx = Math.abs(xM - xm) / 2,
        qy = Math.abs(yM - ym) / 2;

    qtree = new QuadTree(qx, qy, Math.max(qx, qy), 4);
    qtreeL = new QuadTree(qx, qy, Math.max(qx, qy), 8);

    blocks.forEach(function(i) {
      qtree.insert(i);
      i.lights.forEach(function(i) {
        qtreeL.insert({ x: i.x, y: i.z, l: i });
      });
    });

    geom.quadtree = qtree;
    geom.quadtreeLights = qtreeL;

    console.log(geom.quadtreeLights.query(6, 6, .25).length);

  }}(geom, blocks)));

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
      0, -1, 0, 0, -1, 0, 0, -1, 0,
      0, -1, 0, 0, -1, 0, 0, -1, 0
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

  geom.fixedMeshes = [new Mesh(vertices, normals, uvs, extra)];

}());

var scene = {
  meshes: [],
  lights: [],
  lightPos: vec3.create(),
  view:  mat4.create(),
  model: mat4.create(),
  count: 0
};

console.log(geom)

var t = 0., pushFn = function(o, i) { o.push(i); return o; },
    x = 6, z = 6;

scene.update = function(timestamp) {
  vec3.set(scene.lightPos, x,.05, z-.05);
  mat4.identity(scene.view);
  mat4.rotateY(scene.view, scene.view, Math.PI);
  //mat4.rotateX(scene.view, scene.view, -Math.PI / 4);

  mat4.translate(scene.view, scene.view, [ -x, -.05, -z ]);

  scene.meshes = geom.fixedMeshes.reduce(pushFn, []);

  scene.meshes = geom.quadtree
    .query(6, 6, 4)
    .map(function(i) { return i.mesh })
    .reduce(pushFn, scene.meshes);

  scene.lights = geom.quadtreeLights
    .query(x, z, .5)
    .map(function(i) { 
      return [ i.l.x, i.l.y, i.l.z ];
    });

  t += .001;

  //console.log(scene.meshes.reduce(function(o, i) { o += i.count; return o; }, 0));

}

document.body.addEventListener('keydown', function(evt) {

  switch(evt.keyIdentifier) {
    case 'Up':    z += .02; break;
    case 'Down':  z -= .02; break;
    case 'Left':  x += .02; break;
    case 'Right': x -= .02; break;
  }

});

module.exports = scene;
