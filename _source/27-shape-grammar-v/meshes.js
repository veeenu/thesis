var shgResult = { vertices: [], normals: [], uvs: [] };

// http://procworld.blogspot.it/2012/03/building-rooms.html
var shgRoom = new ShapeGrammar(),
    rng = new MersenneTwister(12345);

shgRoom.define('Room', 
  function() {
    var bds = SHAPE.bounds(this);

    return bds.width > bds.depth && 
           ((
             bds.width > shgRoom.minWidth &&
             rng.random() < shgRoom.density
           ) || bds.width > shgRoom.maxWidth);
  },
  function() {
    
    return SHAPE.splitXZ(this, [ shgRoom.ratio, 1 - shgRoom.ratio ], [1], 'Room');

  });

shgRoom.define('Room', 
  function() {
    var bds = SHAPE.bounds(this);

    return bds.width <= bds.depth && 
           ((
             bds.depth > shgRoom.minWidth &&
             rng.random() < shgRoom.density
           ) || bds.width > shgRoom.maxWidth);
  },
  function() {
    
    return SHAPE.splitXZ(this, [1], [ shgRoom.ratio, 1 - shgRoom.ratio ], 'Room');

  });

shgRoom.define('Room', null,
  function(context) {
    var pts = this.points, ret = [], ptsI = SHAPE.inset(this.points, .05), ret = [];

    for(var i = 0, I = pts.length; i < I; i++) {
      var p0  = ptsI[i], p1 = ptsI[(i + 1) % I], P0, P1,
          dx  = p1.x - p0.x, dz = p1.z - p0.z,
          th  = Math.atan2(dz, dx),
          thp = th + Math.PI / 2,
          sin = Math.sin(th), cos = Math.cos(th),
          sinp = Math.sin(thp), cosp = Math.cos(thp);

      P0 = { x: p0.x + .3 * cos, y: p0.y, z: p0.z + .3 * sin };
      P1 = { x: p1.x - .3 * cos, y: p1.y, z: p1.z - .3 * sin };

      ret.push({
        sym: 'Wall',
        points: [ pts[i], pts[(i + 1) % I] ],
        p0: P0,
        p1: P1,
        boundaries: [
          { x: P0.x - .1 * cosp, z: P0.z - .1 * sinp },
          { x: P0.x + .1 * cosp, z: P0.z + .1 * sinp },
          { x: P1.x + .1 * cosp, z: P1.z + .1 * sinp },
          { x: P1.x - .1 * cosp, z: P1.z - .1 * sinp }
        ].reduce(function(o, i) {
          return {
            maxX: Math.max(o.maxX, i.x),
            maxZ: Math.max(o.maxZ, i.z),
            minX: Math.min(o.minX, i.x),
            minZ: Math.min(o.minZ, i.z)
          }
        }, { 
          maxX: Number.NEGATIVE_INFINITY,
          maxZ: Number.NEGATIVE_INFINITY,
          minX: Number.POSITIVE_INFINITY,
          minZ: Number.POSITIVE_INFINITY
        }),
        length: Math.sqrt(dx * dx + dz * dz)
      });
    }

    ret.push({
      sym: 'Quad',
      points: this.points
    });
    return ret;
  });

shgRoom.define('Wall', function(context) {
    console.log(context.reduce(function(o, i) { return o + (i.sym === 'Wall' ? 1 : 0) }, 0));
    return !context.reduce(function(o, i) { return o || i.sym === 'Room' }, false);
  },
  function(context) {
    //return SHAPE.extrude('Quad', this.points[0], this.points[1], .5, [0,1,0]);
    //return SHAPE.extrudeAll(this.boundaries, .1, 'Quad')

    // A wall is occluded, and thus pruned, if its boundaries collide with 
    // the boundaries of a smaller wall
    var maxX = this.boundaries.maxX,
        maxZ = this.boundaries.maxZ,
        minX = this.boundaries.minX,
        minZ = this.boundaries.minZ,
        _self = this,
        length = this.length,
        occluded = context.reduce(function(o, ii) {
          if(o || ii === _self || ii.occluded === true || ii.sym !== 'Wall')
            return o;

          var i = ii.boundaries;

          return o || (
            ii.length >= length && 
            !(
              maxX < i.minX || i.maxX < minX || maxZ < i.minZ || i.maxZ < minZ
            )
          );
        }, false);

    // Prevent next walls to take this one into account
    if(occluded) {
      this.occluded = true; 
      var extr = SHAPE.extrude('OccludedWall', this.points[0], this.points[1], 1.5, [0,1,0]);
      extr.hspace = .5 / this.length;
      return extr;
    }

    return [];
  });

// Passthrough. Delay evaluation until there are no more rooms
shgRoom.define('Wall', null, function() { return this; });

shgRoom.define('OccludedWall', null, function() {

  var hspace = this.hspace, chspace = (1 - hspace) / 2,
      hsp = SHAPE.split(this, [ chspace, hspace, chspace ], [1], 'Quad'),
      vsp = SHAPE.split(hsp[1], [1], [ .7, .3 ], 'Quad');

  return [ hsp[0], hsp[2], vsp[1] ];

});

shgRoom.define('Quad', null, (function() {

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

shgRoom.minWidth = 2.5;
shgRoom.maxWidth = 5;
shgRoom.density = .8;
shgRoom.ratio = .61;

shgResult = shgRoom.run({
  sym: 'Room',
  points: [
    { x: -3, y: 0, z: -5 },
    { x: -3, y: 0, z: 5 },
    { x: 3, y: 0, z: 5 },
    { x: 3, y: 0, z: -5 }
  ]
}).reduce(function(o, i) {

  for(var j = 0, J = i.vertices.length; j < J; j++) {
    o.vertices.push(i.vertices[j]);
    o.normals.push(i.normals[j]);
    o.uvs.push(i.uvs[j]);
  }

  return o;

}, { vertices: [], normals: [], uvs: [] });

console.log(shgResult);
