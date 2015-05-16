var glMatrix = require('glMatrix'),
    Context  = require('Context'),
    Mesh     = require('Mesh'),
    Geom     = require('Geom'),
    Spline   = require('cardinal-spline'),
    QuadTree = require('QuadTree'),
    Loader   = require('Loader'),
    vec3     = glMatrix.vec3,
    mat4     = glMatrix.mat4,
    gl       = Context.gl,
    RoomSHG  = require('../generators/RoomSHG.js'),
    grid, pathFind, geom, apt;

var scene = {
  meshes: [],
  lights: [],
  lightParameters: [ 6, 0, .2, 2 ],
  view: mat4.create(),
  model: mat4.create(),
  count: 0
};

var rsm = 20;

////////////////////////////////////////////////////////////////////////////////
// Compute geometry
////////////////////////////////////////////////////////////////////////////////

var computeGeometry = function(room, path) {

  var vertices = room.vertices,
      normals  = room.normals,
      uvs      = room.uvs,
      extra    = [], 
      lights   = [],
      count    = 0;

  path = path.reduce(function(o, i) {
  
    if(i.door !== undefined)
      o.push(i.door.point);

    o.push(i.room.roomCentroid);

    return o;

  }, []);

  /*for(var i = 0, I = path.length; i < I - 1; i++) {
    var a = path[i], b = path[(i + 1) % I],
        th = Math.atan2(b.z - a.z, b.x - a.x),
          cos = Math.cos(th) * .025 + .025, sin = Math.sin(th) * .025 + .025,
          p0 = { x: a.x - cos, y: .5, z: a.z - sin },
          p1 = { x: a.x + cos, y: .5, z: a.z + sin },
          p3 = { x: b.x - cos, y: .5, z: b.z - sin },
          p2 = { x: b.x + cos, y: .5, z: b.z + sin };

    vertices.push(
      p0.x, p0.y, p0.z,
      p1.x, p1.y, p1.z,
      p2.x, p2.y, p2.z,
      p0.x, p0.y, p0.z,
      p2.x, p2.y, p2.z,
      p3.x, p3.y, p3.z
    );
    normals.push(
      0, 1, 0, 0, 1, 0, 0, 1, 0,
      0, 1, 0, 0, 1, 0, 0, 1, 0
    );
    uvs.push(
      0, 1, 4, 1, 1, 4, 1, 0, 4,
      0, 1, 4, 1, 0, 4, 0, 0, 4
    );
    
  }*/

  extra = vertices.map(function(i, idx) {
    return .4;
  });

  return {
    room: room,
    mesh: new Mesh(vertices, normals, uvs, extra),
    lights: room.roomsWorld.map(function(i) {
      return {
        x: i.x, y: i.y + 1, z: i.z
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
  }

  return path;

}

apt = RoomSHG.create([
  { x: -3, y: 0, z: -5 },
  { x: -3, y: 0, z:  5 },
  { x:  3, y: 0, z:  5 },
  { x:  3, y: 0, z: -5 }
]);
var p = [];

//apt.nodes = apt.nodes.sort(function(i) { return Math.random() - .5; });

for(var i = 0, I = apt.nodes.length; i < I; i++)
  p = p.concat(AStar(apt.nodes[i], apt.nodes[(i + 1) % I], apt.nodes));

geom = computeGeometry(apt, p);

var bbox = geom.room.bbox;

scene.meshes = [ geom.mesh ];
scene.lights = geom.lights.reduce(function(o, i) {
  for(var k = 0; k < 6; k++)
    o.push(i.x, i.y, i.z);
  
  return o;
}, []);

var pathFn = (function(path, us) { 
  
  var samples = [];

  for(var i = 0, I = path.length; i < I; i++) {
  
    var a = path[i], b = path[(i + 1) % I], c = path[(i + 2) % I],
        dx = b.x - a.x,
        dz = b.z - a.z,
        arclen = Math.sqrt(dx * dx + dz * dz),
        th1 = (Math.atan2(-b.z + a.z, b.x - a.x) + Math.PI * 3 / 2) % (2 * Math.PI),
        th2 = (Math.atan2(-c.z + b.z, c.x - b.x) + Math.PI * 3 / 2) % (2 * Math.PI),
        swidth = us / arclen, t = 0;

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

  console.log(samples)

  return function(x) {

    var t = x; //x * x * (22 + x * x * (-17 + 4 * x * x)) / 9;

    var I = samples.length,
        j = t * I, i = ~~j,
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

mat4.translate(scene.view, scene.view, [0,0, -8]);
mat4.rotateX(scene.view, scene.view, Math.PI / 2);

scene.update = function(timestamp) {

  var p = pathFn((timestamp % 30000) / 30000),
      x = p.x, y = p.z, angle = p.th;

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

  /*scene.meshes[1] = new Mesh([
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
  //mat4.rotateX(scene.view, scene.view, Math.PI / 6);
  mat4.rotateY(scene.view, scene.view, -angle);
  mat4.translate(scene.view, scene.view, [ -x, -.75, -y ]);

}

module.exports = scene;
