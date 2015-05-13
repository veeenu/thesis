var glMatrix = require('glMatrix'),
    Context  = require('Context'),
    Mesh     = require('Mesh'),
    Geom     = require('Geom'),
    QuadTree = require('QuadTree'),
    Loader   = require('Loader'),
    vec3     = glMatrix.vec3,
    mat4     = glMatrix.mat4,
    gl       = Context.gl,
    RoomSHG  = require('../generators/RoomSHG.js'),
    grid, pathFind, geom;

var scene = {
  meshes: [],
  lights: [],
  view: mat4.create(),
  model: mat4.create(),
  count: 0
};

////////////////////////////////////////////////////////////////////////////////
// Compute geometry
////////////////////////////////////////////////////////////////////////////////

var computeGeometry = function(room) {

  var vertices = room.vertices,
      normals  = room.normals,
      uvs      = room.uvs,
      extra    = [], 
      lights   = [ { x: 0, y: 0, z: 0 } ],
      count    = 0;

  extra = vertices.map(function(i, idx) {
    return .4;
  });

  return {
    room: room,
    mesh: new Mesh(vertices, normals, uvs, extra),
    lights: lights
  };

}

////////////////////////////////////////////////////////////////////////////////
// Generate a coarse occlusion grid from the room layout
////////////////////////////////////////////////////////////////////////////////

var computeGrid = function(room) {

  var lines  = new Float32Array(room.lines),
      canvas = document.createElement('canvas'),
      gl     = canvas.getContext('webgl'),
      prog   = gl.createProgram(),
      vsh    = gl.createShader(gl.VERTEX_SHADER),
      fsh    = gl.createShader(gl.FRAGMENT_SHADER),
      vsrc   = "attribute vec2 point;\nvoid main() { gl_Position = vec4(-1. + 2. * point.xy, 0., 1.); }",
      fsrc   = "precision highp float;\nvoid main() { gl_FragColor = vec4(1.); }",
      lBuf   = gl.createBuffer(),
      tex    = gl.createTexture(),
      fb     = gl.createFramebuffer(),
      width  = Math.round(room.width * 10),
      height = Math.round(room.height * 10),
      tw     = width,
      th     = height,
      grid   = [],
      pixels;


  // Next power of two
  [1,2,4,8,16].forEach(function(i) { tw |= tw >> i; th |= th >> i; });
  tw++, th++;
  
  pixels = new Uint8Array(tw * th * 4);
  
  gl.shaderSource(vsh, vsrc);
  gl.shaderSource(fsh, fsrc);
  gl.compileShader(vsh);
  gl.compileShader(fsh);
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, lBuf);
  gl.bufferData(gl.ARRAY_BUFFER, lines, gl.STATIC_DRAW);
  gl.viewport(0, 0, width, height);

  gl.lineWidth(1);
  gl.enableVertexAttribArray(gl.getAttribLocation(prog, 'point'));
  gl.vertexAttribPointer(gl.getAttribLocation(prog, 'point'), 2, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.LINES, 0, lines.length / 2);

  gl.readPixels(0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  for(var i = 0, I = pixels.length; i < I; i += 4)
    grid.push(pixels[i]);

  return { grid: grid, w: tw, h: th };

};

////////////////////////////////////////////////////////////////////////////////
// A* algorithm as a curried function. Replace with partial application
// as soon as the grid is ready.
////////////////////////////////////////////////////////////////////////////////

var AStar = function(grid, w, h) {
  
  var el, neigh, hasBeenVisited;
 
  el = function(x, y) {
    return y * w + x;
  };

  neigh = function(x, y) {
    var ret = [];

    if(y > 0) ret.push({ x: x, y: y - 1 });
    if(y < h) ret.push({ x: x, y: y + 1 });
    if(x > 0) ret.push({ x: x - 1, y: y });
    if(x < w) ret.push({ x: x + 1, y: y });
    if(y > 0 && x > 0)
      ret.push({ x: x - 1, y: y - 1});
    if(y > 0 && x < w)
      ret.push({ x: x + 1, y: y - 1});
    if(y < h && x < w)
      ret.push({ x: x + 1, y: y + 1});
    if(y < h && x > 0)
      ret.push({ x: x - 1, y: y + 1});

    return ret.reduce(function(o, i) {
      if(grid[ el(i.x, i.y) ] === 0)
        o.push(i);
      return o;
    }, []);

  }

  return function(from, to) {
    var frontier = [ from ],
        visited = [],
        path = [], cur,
        k = 0, cn;

    visited[el(from.x, from.y)] = null;

    while(frontier.length > 0 && k++ < 10000) {
      cur = frontier.shift();

      if(cur.x === to.x && cur.y === to.y)
        break;

      neigh(cur.x, cur.y).forEach(function(i) {
        cn = el(i.x, i.y);
        if(visited[cn] === undefined) {
          frontier.push(i);
          visited[cn] = cur;
        }
      });
    }

    cur = visited[el(to.x, to.y)];

    while(cur !== null && path.length < 5000) {
      path.unshift(cur);
      cur = visited[el(cur.x, cur.y)];
    }

    return path;
  }
};

geom = computeGeometry(RoomSHG.create([
  { x: -3, y: 0, z: -5 },
  { x: -3, y: 0, z:  5 },
  { x:  3, y: 0, z:  5 },
  { x:  3, y: 0, z: -5 }
]));

grid = computeGrid(geom.room);
pathFind = AStar(grid.grid, grid.w, grid.h);

var roomCenters = geom.room.rooms.map(function(i) {
      return {
        x: ~~(i.x * geom.room.width * 10),
        y: ~~(i.z * geom.room.height * 10)
      };

    }),
    path = [];

for(var i = 0, I = roomCenters.length; i < I; i++) {
  path = path.concat(pathFind(roomCenters[i], roomCenters[(i + 1) % I]));
}

var bbox = geom.room.bbox;

path = path.map(function(i) {
  return {
    x: bbox.minX + bbox.lenX * (i.x / (geom.room.width * 10)),
    y: bbox.minZ + bbox.lenZ * (i.y / (geom.room.height * 10))
  }
});


scene.meshes = [ geom.mesh ];
scene.lights = geom.lights.reduce(function(o, i) {
  for(var k = 0; k < 6; k++)
    o.push(i.x, i.y, i.z);
  
  return o;
}, []);

mat4.translate(scene.view, scene.view, [0,0, -8]);
mat4.rotateX(scene.view, scene.view, Math.PI / 2);

scene.update = function(timestamp) {

  var t = (timestamp % 80) / 80,
      dt = ((timestamp + 40) % 80) / 80,
      i = ~~(timestamp / 80) % path.length,
      rc  = path[i],
      rc2 = path[(i + 1) % path.length],
      rc3 = path[(i + 2) % path.length],
      x = rc.x * (1 - t) + rc2.x * t,
      y = rc.y * (1 - t) + rc2.y * t,
      x1 = rc2.x * (1 - t) + rc3.x * t,
      y1 = rc2.y * (1 - t) + rc3.y * t,
      dx = x1 - x, dy = y1 - y,
      angle = Math.atan2(-dy, dx) - Math.PI / 2,
      cos = Math.cos(angle), sin = Math.sin(angle);
    //x - .0625, .25, y + .0625,
    //x, .25, y - .0625,
    //x + .0625, .25, y + .0625

  var p0 = vec3.fromValues(-.0625, .25, .0625),
      p1 = vec3.fromValues(0, .25, -.0625),
      p2 = vec3.fromValues(.0625, .25, .0625),
      m  = mat4.create();

  mat4.translate(m, m, [ x, 0, y ]);
  mat4.rotateY(m, m, angle);
  vec3.transformMat4(p0, p0, m);
  vec3.transformMat4(p1, p1, m);
  vec3.transformMat4(p2, p2, m);

  scene.meshes[1] = new Mesh([
    p0[0], p0[1], p0[2],
    p1[0], p1[1], p1[2],
    p2[0], p2[1], p2[2]
  ], [ 
    0, 1, 0, 0, 1, 0, 0, 1, 0 
  ], [
    0, 0, 6, 0, 1, 6, 1, 1, 6
  ], [
    0, 1, 0, 0, 1, 0, 0, 1, 0
  ]);

  mat4.identity(scene.view);
  mat4.rotateX(scene.view, scene.view, Math.PI / 12);
  mat4.rotateY(scene.view, scene.view, -angle);
  mat4.translate(scene.view, scene.view, [ -x, -.5, -y ]);

}

module.exports = scene;
