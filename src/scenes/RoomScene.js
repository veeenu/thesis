var glMatrix = require('glMatrix'),
    Context  = require('Context'),
    Loader   = require('Loader'),
    Mesh     = require('Mesh'),
    vec3     = glMatrix.vec3,
    mat4     = glMatrix.mat4,
    gl       = Context.gl,
    RoomSHG  = require('../generators/RoomSHG.js'),
    PRNG     = require('PRNG'),
    geom, apt, rng,
    computeGeometry,
    pathFn;

var scene = {
  meshes: [],
  lights: [],
  lightBuf: gl.createBuffer(),
  lightParameters: [ 6, 0, 2, .1 ],
  view: mat4.create(),
  model: mat4.create(),
  count: 0,
  texture: gl.createTexture()
};

rng = new PRNG(54321);

gl.bindTexture(gl.TEXTURE_2D, scene.texture);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Context.w, Context.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

gl.bindTexture(gl.TEXTURE_2D, null);

////////////////////////////////////////////////////////////////////////////////
// Compute geometry
////////////////////////////////////////////////////////////////////////////////

scene.init = function() {

  var loadingProgress = 0, loadStep = .25;

  computeGeometry = function(room, path) {

    var vertices = room.vertices,
        normals  = room.normals,
        uvs      = room.uvs,
        extra    = [];

    path = path.reduce(function(o, i) {
    
      if(i.door !== undefined)
        o.push(i.door.point);

      o.push(i.room.roomCentroid);

      return o;

    }, []);

    extra = vertices.map(function(i, idx) {
      return .4;
    });

    return {
      room: room,
      mesh: new Mesh(vertices, uvs, extra),
      lampMesh: new Mesh(
        new Float32Array(room.lamp.vertices),
        new Float32Array(room.lamp.uvs),
        new Float32Array(room.lamp.extra)
      ),
      tableMesh: new Mesh(
        new Float32Array(room.table.vertices),
        new Float32Array(room.table.uvs),
        new Float32Array(room.table.extra)
      ),
      lights: room.roomsWorld.map(function(i) {
        return {
          x: i.x, y: i.y + .75, z: i.z
        }
      }),
      path: path
    };

  }

  var AStar = function(from, to, nodes) {

    var frontier = [ from ],
        cameFrom = [], 
        via = [],
        path = [], cur, cn;

    cameFrom[nodes.indexOf(from)] = null;

    while(frontier.length > 0) {
      cur = frontier.shift();

      if(cur === to) break;

      cur.neighbors.forEach(function(i) {
        var cn = nodes.indexOf(i.r);

        if(cameFrom[cn] === undefined) {
          frontier.push(i.r);
          cameFrom[cn] = cur;
          via[cn] = i.via;
        }

      });
    }

    cur = to;

    while(cur !== null) {
      cn = nodes.indexOf(cur);
      if(via[cn] !== undefined)
        path.unshift({
          room: cur,
          door: via[cn]
        });
      cur = cameFrom[cn];
      if(cur === undefined)
        return path;
    }

    return path;

  }

  apt = RoomSHG.create([
    { x: -4, y: 0, z: -8 },
    { x: -4, y: 0, z:  8 },
    { x:  4, y: 0, z:  8 },
    { x:  4, y: 0, z: -8 }
  ]);

  loadingProgress += loadStep;
  Loader.progress('Rooms', loadingProgress);

  var p = [];

  var nodes = apt.nodes.reduce(function(o, i) {
        if(i.isFirst) o.first = i;
        if(i.isLast) o.last = i;
        return o;
      }, { first: null, last: null }),
      shuffledNodes = apt.nodes.filter(function(i) { return !i.isMonitor });
      
  shuffledNodes.sort(function() { var ret = rng.random() - .5; return ret; });

  for(var i = 0, I = apt.nodes.length; i < I - 1; i++)
    p = p.concat(AStar(shuffledNodes[i], shuffledNodes[(i + 1) % I], shuffledNodes));
  p = p.concat(AStar(shuffledNodes[shuffledNodes.length - 1], nodes.first, shuffledNodes));

  p = p.concat({ door: undefined, room: nodes.first });
  p = p.concat(AStar(nodes.first, nodes.last, apt.nodes));

  p.push({
    door: apt.monitor.door,
    room: apt.monitor
  });

  loadingProgress += loadStep;
  Loader.progress('Rooms', loadingProgress);

  geom = computeGeometry(apt, p);

  scene.meshes = [ geom.mesh, geom.lampMesh, geom.tableMesh ];
  //scene.meshes = [ geom.mesh ];
  scene.lights = geom.lights.reduce(function(o, i) {
    for(var k = 0; k < 6; k++)
      o.push(i.x, i.y, i.z);
    
    return o;
  }, []);
  gl.bindBuffer(gl.ARRAY_BUFFER, scene.lightBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(scene.lights), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  loadingProgress += loadStep;
  Loader.progress('Rooms', loadingProgress);

  pathFn = (function(path, us) { 
    
    var samples = [];

    for(var i = 0, I = path.length; i < I - 1; i++) {
    
      var a = path[i], b = path[Math.min(i + 1, I - 1)], c = path[Math.min(i + 2, I - 1)],
          dx = b.x - a.x,
          dz = b.z - a.z,
          arclen = Math.sqrt(dx * dx + dz * dz),
          th1 = (Math.atan2(-b.z + a.z, b.x - a.x) + Math.PI * 3 / 2) % (2 * Math.PI),
          th2 = (Math.atan2(-c.z + b.z, c.x - b.x) + Math.PI * 3 / 2) % (2 * Math.PI),
          t = 0;

      if(i >= I - 4)
        th2 = th1;

      while(th2 - th1 > Math.PI)
        th2 -= 2 * Math.PI;
      while(th1 - th2 > Math.PI)
        th1 -= 2 * Math.PI;

      for(var j = 0, J = ~~(arclen / us); j < J; j++) {
        t = j / J;
        samples.push({ 
          x: a.x * (1 - t) + b.x * t,
          y: a.y * (1 - t) + b.y * t,
          z: a.z * (1 - t) + b.z * t,
          th: th1 * (1 - t) + th2 * t
        });
      }

    }

    return function(x) {

      var t = x; //x * x * (22 + x * x * (-17 + 4 * x * x)) / 9;

      var I = samples.length,
          j = t * (I - 1), i = Math.floor(j),
          d = j - i,
          a = samples[i], b = samples[(i + 1) % I];

      return {
        x: a.x * (1 - d) + b.x * d,
        y: a.y * (1 - d) + b.y * d,
        z: a.z * (1 - d) + b.z * d,
        th: a.th * (1 - d) + b.th * d
      }

    }
  }(geom.path, .025));

  loadingProgress += loadStep;
  Loader.progress('Rooms', loadingProgress);

  mat4.translate(scene.view, scene.view, [0,0, -6]);
  mat4.rotateX(scene.view, scene.view, Math.PI / 2);
  mat4.rotateY(scene.view, scene.view, Math.PI / 2);

  var totalTime = 750 * geom.path.length,
      arrowidx = scene.meshes.length,
      wobbleFreq = Math.PI * 2 / 1000;

  scene.totalTime = totalTime;

  scene.update = function(timestamp) {

    var px = Math.min(timestamp / totalTime, 1),
        p = pathFn(isNaN(px) ? 0 : px),
        x = p.x, y = p.z, angle = p.th,
        wobble = 0, wobbleX = 0, wobbleZ = 0;

    /*if(px < 1) {
      var wobbleTh = angle + Math.PI, 
          wcos = -Math.cos(timestamp * wobbleFreq) * .125,
          wsin = Math.sin(timestamp * wobbleFreq) * .125;
      wobble  = wsin;
      wobbleX = Math.cos(wobbleTh) * wcos;
      wobbleZ = Math.sin(wobbleTh) * wcos;
    }*/

    var p0 = vec3.fromValues(-.0625, .25, .0625),
        p1 = vec3.fromValues(0, .25, -.25),
        p2 = vec3.fromValues(.0625, .25, .0625),
        m  = mat4.create();

    mat4.translate(m, m, [ x, 0, y ]);
    mat4.scale(m, m, [2,1,2]);
    mat4.rotateY(m, m, angle);
    vec3.transformMat4(p0, p0, m);
    vec3.transformMat4(p1, p1, m);
    vec3.transformMat4(p2, p2, m);

    /*scene.meshes[arrowidx] = new Mesh([
      p0[0], p0[1], p0[2],
      p1[0], p1[1], p1[2],
      p2[0], p2[1], p2[2]
    ], [ 
      0, 1, 0, 0, 1, 0, 0, 1, 0 
    ], [
      0, 0, 6, 0, 1, 6, 1, 1, 6
    ], [
      0, 1, 0, 0, 1, 0, 0, 1, 0
    ]);*/

    mat4.identity(scene.view);
    mat4.rotateY(scene.view, scene.view, -angle);
    mat4.translate(scene.view, scene.view, [ -x + wobbleX, -.75 + wobble, -y + wobbleZ ]);

  }
};


module.exports = scene;
