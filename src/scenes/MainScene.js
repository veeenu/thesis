var glMatrix = require('glMatrix'),
    Context  = require('Context'),
    Mesh     = require('Mesh'),
    QuadTree = require('QuadTree'),
    Loader   = require('Loader'),
    mat4     = glMatrix.mat4,
    gl       = Context.gl,
    BuildingSHG = require('../generators/BuildingSHG.js'),
    City = require('../generators/City.js');

var tlerp = function(start, end, ts) {
  return (ts - start) / (end - start);
}

var lerp = function(a, b, t) {
  return a * (1 - t) + b * t;
}

var computeBlockMesh = function(block, availColors) {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      lights   = [];

  for(var j = 0, n = block.lots.length; j < n; j++) {
    var lot, h, angle, cx, cy, xm, xM, ym, yM;
    lot = block.lots[j];
    h = lot.height, angle = lot.angle, lot = lot.poly;

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
      depth: Math.abs(yM - ym) * .9,
      angle: angle
    }), 
    bldgGeom = bldg.geom, 
    color = bldg.color;

    for(var l = 0, L = bldgGeom.length; l < L; l++) {

      var bg = bldgGeom[l];

      if('light' in bg)
        lights.push(bg.light);
      else
        for(var k = 0, K = bg.vertices.length; k < K; k++) {
          vertices.push(bg.vertices[k]);
          normals.push(bg.normals[k]);
          uvs.push(bg.uvs[k]);
          extra.push(color[k % 3]);
        }

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

var log = document.createElement('pre');
log.style.background = 'white';
log.style.color = 'black';
log.style.position = 'absolute';
log.style.right = '1rem';
log.style.top = '7rem';

Context.canvas.parentElement.appendChild(log);

(function() {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      block,
      blocks = [],
      lights = [],
      qtree;

  var blocksProgress = 0, blocksCount = city.blocks.length;

  (function() {
  
    var doneRoads = [];

    city.roads.forEach(function(r) {
      lights.push({ x: r.x, y: .25, z: r.y });
      r.conns.forEach(function(r1) {
        if(doneRoads.indexOf(r1) === -1) {
          lights.push({
            x: lerp(r.x, r1.x, .5),
            y: .25,
            z: lerp(r.y, r1.y, .5)
          });
        }
      });
      doneRoads.push(r);
    });
  }());

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

    blocks.forEach(function(i) {
      qtree.insert(i);
    });

    console.log(blocks);

    geom.quadtree = qtree;
    geom.allLights = lights;

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
          case 0: return i;
          case 1: return i * len;
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
  lightParameters: [ 16, 0, 8, 64 ],
  view:  mat4.create(),
  model: mat4.create(),
  count: 0,
  texture: gl.createTexture()
};

gl.bindTexture(gl.TEXTURE_2D, scene.texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Context.w, Context.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

gl.bindTexture(gl.TEXTURE_2D, null);

var t = 0., pushFn = function(o, i) { o.push(i); return o; },
    x = 2, y = .19, z = 1.8, alpha = 0, beta = 0,
    dx = 0, dz = 0;

var polyEasing = function(x) { return x * x * x * (x * (6 * x - 15) + 10) };

var calcPositions = function(ts) {

  log.textContent = parseInt(ts);
  if(ts < 5000) {
    var t = polyEasing(tlerp(0, 5000, ts));
    y = lerp(20, .05, t);
  }

  if(ts >= 4000 && ts < 5000) {
    var t = polyEasing(tlerp(4000, 5000, ts));
    alpha = lerp(Math.PI / 2, 0, t);
    beta = lerp(0, Math.PI, t);
  }

  if(ts >= 4000 && ts < 20000) {
    var t = polyEasing(tlerp(4000, 20000, ts));
    x = lerp(6, 10, t);
  }

  if(ts >= 5000 && ts < 19500) {
    var t = polyEasing(tlerp(5000, 20000, ts));
    beta = lerp(Math.PI, Math.PI * 3/2, t);
  }

  if(ts >= 19500 && ts < 20500) {
    var t = polyEasing(tlerp(19500, 20500, ts));
    alpha = lerp(0, - Math.PI / 2, t);
  }

  if(ts >= 20000 && ts < 22500) {
    var t = polyEasing(tlerp(20000, 22500, ts));
    beta = lerp(Math.PI * 3 / 2, Math.PI, t);
    y = lerp(.05, 1.05, t);
    z = lerp(6, 0, t);
  }

  if(ts >= 20500 && ts < 22500) {
    var t = polyEasing(tlerp(20500, 22500, ts));
    alpha = lerp(- Math.PI / 2, 0, t);
  }

  if(ts >= 22500 && ts < 30000) {
    var t = polyEasing(tlerp(22500, 30000, ts));
    z = lerp(0, 14, t);
  }

  if(ts >= 30000) {
    var t = tlerp(30000, 40000, ts);
    z = 0;
    alpha = Math.PI / 8;
    x = lerp(12, 0, t);
  }

}

scene.update = function(timestamp) {

  //calcPositions(timestamp);
  //////////////////////////////////////////////////////////////////////////////
  x += (Math.cos(beta) * dx - Math.sin(beta) * dz) * Math.cos(alpha);
  y += Math.sin(alpha) * dz;
  z += (Math.sin(beta) * dx + Math.cos(beta) * dz) * Math.cos(alpha);

  log.textContent = [x,y,z].map(function(i) { return i.toFixed(2) }).join(', ') + ' ' +
    (Math.PI / alpha).toFixed(2) + ' ' + 
    (Math.PI / beta).toFixed(2);
  //////////////////////////////////////////////////////////////////////////////

  mat4.identity(scene.view);

  mat4.rotateX(scene.view, scene.view, alpha);
  mat4.rotateY(scene.view, scene.view, beta);
  mat4.translate(scene.view, scene.view, [ -x, -y, -z ]);

  var shownMeshes = geom.quadtree.query(x, z, 4);

  scene.meshes = geom.fixedMeshes.reduce(pushFn, []);

  scene.meshes = shownMeshes
    .map(function(i) { return i.mesh })
    .reduce(pushFn, scene.meshes);

  //scene.lights = shownLights;
  scene.lights = geom.allLights.reduce(function(o, i) {
    for(var k = 0; k < 6; k++)
      o.push(i.x, i.y, i.z);
    return o;
  }, []);

  //for(var k = 0; k < 6; k++)
  //  scene.lights.push(x, y, z);

  log.textContent += "\nVertices: " + scene.meshes.reduce(function(o, i) {
    return o + i.count;
  }, 0);

  t += .001;

  log.textContent += "\nLights: " + scene.lights.length / 18;

  //console.log(scene.meshes.reduce(function(o, i) { o += i.count; return o; }, 0));

}
// 87 65 83 68;

document.body.addEventListener('keydown', function(evt) {

  switch(evt.which) {
    case 87: dz = -.008; break;
    case 83: dz = .008; break;
    case 65: dx = -.008; break;
    case 68: dx = .008; break;
  }

});

document.body.addEventListener('keyup', function(evt) {

  switch(evt.which) {
    case 87: dz = 0; break;
    case 83: dz = 0; break;
    case 65: dx = 0; break;
    case 68: dx = 0; break;
  }

});

Context.canvas.addEventListener('mousedown', function(evt) {

  var onMove, onUp, x0 = evt.clientX, y0 = evt.clientY;

  onMove = function(evt) {
    var dx = evt.clientX - x0,
        dy = evt.clientY - y0;

    alpha += dy * .005;
    beta += dx * .005;

    x0 = evt.clientX;
    y0 = evt.clientY;

    log.textContent = [x,y,z].map(function(i) { return i.toFixed(2) }).join(', ') + ' ' +
      (Math.PI / alpha).toFixed(2) + ' ' + 
      (Math.PI / beta).toFixed(2);
    }

  onUp = function(evt) {
    Context.canvas.removeEventListener('mousemove', onMove);
    Context.canvas.removeEventListener('mouseup', onUp);
  }

  Context.canvas.addEventListener('mousemove', onMove);
  Context.canvas.addEventListener('mouseup', onUp);

});

module.exports = scene;
