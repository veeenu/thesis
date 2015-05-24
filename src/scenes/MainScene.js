var glMatrix = require('glMatrix'),
    Context  = require('Context'),
    Mesh     = require('Mesh'),
    QuadTree = require('QuadTree'),
    Timeline = require('Timeline'),
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
      lights   = [],
      meshes   = [];

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

      //bldgGeom[l] = null;
    }

    meshes.push({
      mesh: new Mesh(vertices, normals, uvs, extra),
      x: cx,
      y: cy,
      w: Math.max(xM - xm, yM - ym)
    });

    vertices.splice(0);
    normals.splice(0);
    uvs.splice(0);
    extra.splice(0);

  }

  return {
    //mesh: new Mesh(vertices, normals, uvs, extra),
    meshes: meshes,
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
      lights.push({ x: r.x, y: .5, z: r.y });
      r.conns.forEach(function(r1) {
        if(doneRoads.indexOf(r1) === -1) {
          lights.push({
            x: lerp(r.x, r1.x, .33),
            y: .5,
            z: lerp(r.y, r1.y, .33)
          });
          lights.push({
            x: lerp(r.x, r1.x, .66),
            y: .5,
            z: lerp(r.y, r1.y, .66)
          });
        }
      });
      doneRoads.push(r);
    });
  }());

  (function() {
  
    var processBlock = function() {
      var block = city.blocks.shift(),
          m = computeBlockMesh(block);
      blocks.push(m);
      blocksProgress++;
      Loader.progress('Blocks', blocksProgress / blocksCount);
      if(city.blocks.length > 0) setTimeout(processBlock, 0);
    }

    setTimeout(processBlock, 0);

  }());

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

    qtree = new QuadTree(qx, qy, Math.max(qx, qy), 16);

    blocks.forEach(function(i) {
      i.meshes.forEach(function(j) {
        qtree.insert(j);
      })
    });

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
  lightParameters: [ 12, 0, 6, 32 ],
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
    _x = 2.71, _y = .38, _z = 1.31, _alpha = 0.26, _beta = 0.79,
    dx = 0, dz = 0;

var timeline = new Timeline();

(function() {
  var x = timeline.property('x'), y = timeline.property('y'),
      z = timeline.property('z'), a = timeline.property('a'),
      b = timeline.property('b'), f = timeline.property('f');

  f.at(    0, 0).at( 2000, 1, 'h01')

  x.at(    0,  1.54).at( 2000,  1.54, 'no').at( 8000,  1.91, 'h01')
  y.at(    0,  1.19)
  z.at(    0,   .19).at( 2000,   .19, 'no').at( 8000,   .03, 'h01')
  a.at(    0,  0   ).at( 2000,  0   , 'no').at( 8000,   .24, 'h01')
  b.at(    0, -3.54).at( 2000, -3.54, 'no').at( 8000, -3.45, 'h01')

  x.at( 9000,   .78, 'no')
  y.at( 9000,   .10, 'no')
  z.at( 9000,  2.03, 'no')
  a.at( 9000, - .75, 'no').at(12000, - .65, 'h01')
  b.at( 9000,   .65, 'no').at(12000,   .75, 'h01')

  x.at(13000,  2.97, 'no')
  y.at(13000,   .97, 'no').at(14500,   .02, 'h01')
  z.at(13000,  2.16, 'no')
  a.at(13000,   .34, 'no').at(14500, - .04, 'h01')
  b.at(13000, -3.66, 'no').at(15500, -6.84, 'h01')

  f.at(15400,  1,    'no').at(15500,  0   , 'h01').at(15600,  1, 'h01')
  x.at(15500,  5.45, 'no').at(16500,  5.45, 'in3').at(17500,  5.45, 'lin').at(18500,  5.45, 'out3')
  y.at(15500,  1.28, 'no').at(16500,  1.28, 'in3').at(17500,   .08, 'lin').at(18500,   .08, 'out3')
  z.at(15500,   .56, 'no').at(16500,   .09, 'in3').at(17500,  0   , 'lin').at(18500,  0   , 'out3')
  a.at(15500,   .26, 'no').at(16500,  1.24, 'in3').at(17000,  1.56, 'lin').at(18500,   .37, 'out3')
  b.at(15500, -2.72, 'no').at(16500,   .04, 'in3').at(17000,  0   , 'lin').at(18500, -1.61, 'out3')

  x.at(20000,  4   , 'h01')                        .at(30000,  3.84, 'out2').at(32000,  3.825, 'in3')
  y.at(20000,   .01, 'h01')                        .at(30000,   .28, 'out2')
  z.at(20000,   .02, 'h01').at(26000,  4.65, 'in2').at(30000,  5.20, 'out2')
  a.at(20000,  0   , 'h01').at(26000,   .17, 'in2').at(30000,  0   , 'out2')
  b.at(20000, -3.14, 'h01').at(26000, -3.14, 'no') .at(30000, -1.56, 'out2')
}());

window.followTimeline = true;

Context.canvas.addEventListener('click', function(evt) { if(evt.which === 2) window.followTimeline = !window.followTimeline });

scene.update = function(timestamp) {
  
  var x, y, z, alpha, beta;

  if(window.followTimeline) {

    var state = timeline.update(timestamp);

    _x = x = state.x;
    _y = y = state.y;
    _z = z = state.z;
    _alpha = alpha = state.a;
    _beta = beta = state.b;
    scene.fade = state.f;

  } else {
    _x += (Math.cos(_beta) * dx - Math.sin(_beta) * dz) * Math.cos(_alpha);
    _y += Math.sin(_alpha) * dz;
    _z += (Math.sin(_beta) * dx + Math.cos(_beta) * dz) * Math.cos(_alpha);

    x = _x;
    y = _y;
    z = _z;
    alpha = _alpha;
    beta = _beta;
    scene.fade = 1;
  }

  log.textContent = [x,y,z,scene.fade].map(function(i) { return i.toFixed(2) }).join(', ') + ' ' +
    (alpha).toFixed(2) + ' ' + 
    (beta).toFixed(2);
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

  scene.lights = geom.allLights.reduce(function(o, i) {
    for(var k = 0; k < 6; k++)
      o.push(i.x, i.y, i.z);
    return o;
  }, []);

  log.textContent += "\nTime: " + timestamp.toFixed(2);
  log.textContent += "\nVertices: " + scene.meshes.reduce(function(o, i) {
    return o + i.count;
  }, 0);

  t += .001;

  log.textContent += ", Lights: " + scene.lights.length / 18;

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

    _alpha += dy * .005;
    _beta += dx * .005;

    x0 = evt.clientX;
    y0 = evt.clientY;

    log.textContent = [_x,_y,_z].map(function(i) { return i.toFixed(2) }).join(', ') + ' ' +
      (_alpha).toFixed(2) + ' ' + 
      (_beta).toFixed(2);
    }

  onUp = function(evt) {
    Context.canvas.removeEventListener('mousemove', onMove);
    Context.canvas.removeEventListener('mouseup', onUp);
  }

  Context.canvas.addEventListener('mousemove', onMove);
  Context.canvas.addEventListener('mouseup', onUp);

});

module.exports = scene;
