var ShapeGrammar = require('ShapeGrammar'),
    Context      = require('Context'),
    SHAPE        = require('../lib/SHAPE.js'),
    Geom         = require('Geom'),
    PRNG         = require('PRNG'),
    FurnitureSHG = require('./FurnitureSHG.js');

var shgRoom = new ShapeGrammar(),
    rng     = new PRNG(12345);

// Inspired by http://procworld.blogspot.it/2012/03/building-rooms.html
shgRoom.define('Apartment', null, function() {

  var outerWalls = SHAPE.extrudeAll(this.points.slice().reverse(), shgRoom.floorHeight, 'Quad', [0, 1, 0]);

  outerWalls.push({
    sym: 'Room',
    points: this.points
  });

  return outerWalls;

});

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
    
    var ret = SHAPE.splitXZ(this, [ shgRoom.ratio, 1 - shgRoom.ratio ], [1], 'Room');

    return ret;

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
    
    var ret = SHAPE.splitXZ(this, [1], [ shgRoom.ratio, 1 - shgRoom.ratio ], 'Room');

    return ret;

  });

shgRoom.define('Room', null,
  function(context) {

    var pts = this.points, ret = [], ptsI = SHAPE.inset(this.points, .05), 
        bds = SHAPE.bounds(this), ret = [];

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
        length: Math.sqrt(dx * dx + dz * dz),
        angle: th
      });
    }

    ret.push({
      sym: 'Quad',
      points: this.points
    });
    /*ret.push({
      sym: 'Quad',
      points: this.points.map(function(i) {
        return {
          x: i.x,
          y: i.y + shgRoom.floorHeight,
          z: i.z
        }
      })
    });*/

    var ipts = 1 / pts.length;

    var gnode = {
      sym: 'GraphNode',
      isTerminal: true,
      neighbors: [],
      width: bds.width,
      depth: bds.depth,
      roomCentroid: this.points.reduce(function(o, i) {
        o.x += ipts * i.x;
        o.y += ipts * i.y;
        o.z += ipts * i.z;
        return o;
      }, { x: 0, y: 0, z: 0 })
    };

    ret.forEach(function(i) {
      if(i.sym === 'Wall')
        i.room = gnode;
    })

    //ret.push(gnode);
    ret.push({
      sym: 'LastRoomCandidate',
      node: gnode,
      points: pts
    });

    ret.push({
      sym: 'Lamp',
      isTerminal: true,
      point: {
        x: gnode.roomCentroid.x,
        y: this.points[0].y + shgRoom.floorHeight,
        z: gnode.roomCentroid.z
      }
    });

    if(bds.width * bds.depth > 10)
      ret.push({
        sym: 'Table',
        isTerminal: true,
        point: {
          x: gnode.roomCentroid.x + bds.width * .7 * (Math.random() - .5),
          y: this.points[0].y,
          z: gnode.roomCentroid.z + bds.depth * .7 * (Math.random() - .5)
        }
      });

    return ret;
  });

// Passthrough until all rooms have been processed
shgRoom.define('LastRoomCandidate', 
  function(context) { 
    return context.filter(function(i) { return i.sym === 'Room' }).length > 0; 
  },
  function(context) {
    return this;
  });

shgRoom.define('LastRoomCandidate', 
  function(context) {
    return context
      .filter(function(i) { return i.sym === 'LastRoomCandidate' })
      .indexOf(this) === 0;
  },
  function(context) {
    this.node.isFirst = true;
    return this.node;
  });

shgRoom.define('LastRoomCandidate', 
  function(context) {
    return context
      .filter(function(i) { return i.sym === 'LastRoomCandidate' })
      .reverse()
      .indexOf(this) === 0;
  },
  function(context) {
    this.node.isLast = true;
    return [
      this.node,
      {
        sym: 'LastRoom',
        node: this.node
      }
    ];
  });

shgRoom.define('LastRoomCandidate', null,
  function(context) {
    return this.node;
  });

// Passthrough until the graph is known
shgRoom.define('LastRoom', 
  function(context) { 
    return context.filter(function(i) { return i.sym === 'OccludedWall' }).length > 0; 
  },
  function() { 
    return this; 
  });

shgRoom.define('LastRoom', null,
  function() { 

    var wallPositions, 
        neigh = this.node.neighbors.map(function(i) { return i.r.roomCentroid }), 
        c = this.node.roomCentroid,
        w = .9 * this.node.width / 2, d = .9 * this.node.depth / 2;
   
    wallPositions = [
      { x: c.x, y: c.y, z: c.z + d, mdd: Number.POSITIVE_INFINITY, th: Math.atan2(d, 0) },
      { x: c.x, y: c.y, z: c.z - d, mdd: Number.POSITIVE_INFINITY, th: Math.atan2(-d, 0) },
      { x: c.x + w, y: c.y, z: c.z, mdd: Number.POSITIVE_INFINITY, th: Math.atan2(0, w) },
      { x: c.x - w, y: c.y, z: c.z, mdd: Number.POSITIVE_INFINITY, th: Math.atan2(0, -w) }
    ];

    wallPositions.forEach(function(i) {
      neigh.forEach(function(j) {
        // Use distance squared since sqrt is strictly monotonic
        var dx = j.x - i.x, dz = j.z - i.z;
        i.mdd = Math.min(i.mdd, dx * dx + dz * dz);
      });
    });

    var cw = wallPositions
      .sort(function(a, b) {
        if(a.mdd > b.mdd)
          return -1;
        if(b.mdd > a.mdd)
          return 1;
        return 0;
      })
      .shift();

    var mm = .15,
        dx = Math.sin(cw.th) * mm * Context.aspectRatio, 
        dz = Math.cos(cw.th) * mm * Context.aspectRatio;

    var monitor = {
      sym: 'Quad',
      texID: 32,
      points: [
        { x: cw.x + dx, y: cw.y + .75 + mm, z: cw.z - dz },
        { x: cw.x + dx, y: cw.y + .75 - mm, z: cw.z - dz },
        { x: cw.x - dx, y: cw.y + .75 - mm, z: cw.z + dz },
        { x: cw.x - dx, y: cw.y + .75 + mm, z: cw.z + dz }
      ]
    }

    var gnode = {
      sym: 'GraphFinalNode',
      isTerminal: true,
      roomCentroid: {
        x: cw.x - dz * .519,
        y: cw.y,
        z: cw.z - dx * .519
      },
      neighbors: [this.node],
      isMonitor: true,
      door: {
        angle: cw.th,
        point: c
      }
    };

    this.node.neighbors.push({
      r: gnode,
      via: gnode.door
    });

    return [ monitor, gnode ];
  });

shgRoom.define('Wall', function(context) {
    return !context.reduce(function(o, i) { return o || i.sym === 'Room' }, false);
  },
  function(context) {
    // A wall is occluded if its boundaries collide with 
    // the boundaries of a larger wall
    var maxX = this.boundaries.maxX,
        maxZ = this.boundaries.maxZ,
        minX = this.boundaries.minX,
        minZ = this.boundaries.minZ,
        len = this.length,
        occluded = false, by = null;

    for(var i = 0, I = context.length; i < I && !occluded; i++) {
      var ii = context[i];
      if(occluded || ii.occluded || ii === this || ii.sym !== 'Wall')
        continue;

      var b = ii.boundaries;

      if(ii.length >= len && 
         !(maxX < b.minX || b.maxX < minX || maxZ < b.minZ || b.maxZ < minZ)) {
        occluded = true;
        by = ii.room;
      }


    }
        /*occluded = context.reduce(function(o, ii) {
          if(o.occluded || ii.occluded || ii === _self || ii.sym !== 'Wall')
            return o;

          var i = ii.boundaries;

          if(ii.length >= len && 
             !(maxX < i.minX || i.maxX < minX || maxZ < i.minZ || i.maxZ < minZ)) {
            o.occluded = true;
            o.by = ii.room;
          }

          return o;
        }, { occluded: false, discard: false, by: null })*/;

    // Prevent next walls to take this one into account
    if(occluded) {
      this.occluded = true; 

      return {
        sym: 'OccludedWall',
        points: this.points,
        angle: this.angle,
        connects: [ this.room, by ],
        length: this.length
      }
    }

    return [];
  });

// Passthrough. Delay evaluation until there are no more rooms
shgRoom.define('Wall', null, function() { return this; });

shgRoom.define('OccludedWall', null, function() {

  var p0 = this.points[0], p1 = this.points[1],
      angle = Math.atan2(p0.x - p1.x, p1.z - p0.z), //Math.atan2(p1.z - p0.z, p1.x - p0.x),
      sin = Math.sin(angle) * shgRoom.wallDepth / 2,
      cos = Math.cos(angle) * shgRoom.wallDepth / 2,
      p10 = { x: p0.x + cos, y: p0.y, z: p0.z + sin },
      p11 = { x: p1.x + cos, y: p1.y, z: p1.z + sin },
      p20 = { x: p0.x - cos, y: p0.y, z: p0.z - sin },
      p21 = { x: p1.x - cos, y: p1.y, z: p1.z - sin },
      extr1 = SHAPE.extrude('OccludedWall', p10, p11, shgRoom.floorHeight, [0,1,0]),
      extr2 = SHAPE.extrude('OccludedWall', p21, p20, shgRoom.floorHeight, [0,1,0]),
      hspace = .5 / this.length, chspace = (1 - hspace) / 2,
      hsp1 = SHAPE.split(extr1, [ chspace, hspace, chspace ], [1], 'Quad'),
      vsp1 = SHAPE.split(hsp1[1], [1], [ .7, .3 ], 'Quad'),
      hsp2 = SHAPE.split(extr2, [ chspace, hspace, chspace ], [1], 'Quad'),
      vsp2 = SHAPE.split(hsp2[1], [1], [ .7, .3 ], 'Quad'),
      q0 = vsp1[0], q1 = vsp2[0],
      //lA = chspace, lB = chspace + hspace,
      lA = (1 - hspace / 8) / 2, lB = lA + hspace / 8,
      wsA = { 
        x: SHAPE.lerp(p0.x, p1.x, lA),
        y: SHAPE.lerp(p0.y, p1.y, lA),
        z: SHAPE.lerp(p0.z, p1.z, lA)
      },
      wsB = {
        x: SHAPE.lerp(p0.x, p1.x, lB),
        y: SHAPE.lerp(p0.y, p1.y, lB),
        z: SHAPE.lerp(p0.z, p1.z, lB)
      }, door;

  door = {
    sym: 'Door',
    angle: angle,
    point: {
      x: .5 * (p0.x + p1.x),
      y: .5 * (p0.y + p1.y),
      z: .5 * (p0.z + p1.z)
    }
  }; 

  // TODO warning: duplication
  this.connects[0].neighbors.push({
    r: this.connects[1], via: door
  });
  this.connects[1].neighbors.push({
    r: this.connects[0], via: door
  });

  return [ 
    hsp1[0], hsp1[2], vsp1[1],
    hsp2[0], hsp2[2], vsp2[1],
    {
      sym: 'Quad',
      points: [ q1.points[0], q1.points[1], q0.points[2], q0.points[3] ]
    },
    {
      sym: 'Quad',
      points: [ q1.points[2], q1.points[1], q0.points[2], q0.points[1] ]
    },
    {
      sym: 'Quad',
      points: [ q1.points[3], q1.points[2], q0.points[1], q0.points[0] ]
    },
    door,
    //
    // Wall segments are oversized to occupy part of the
    // door frame, so the pathfinding algorithm can
    // compute points somewhere around the middle of the
    // door and not close to the wall
    //
    {
      sym: 'WallSegment',
      points: [ p0, wsA ]
    }, {
      sym: 'WallSegment',
      points: [ wsB, p1 ]
    }
  ];

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
    texID = this.texID || 3;

    uvs = [
      u0.s, u0.t, texID, u1.s, u1.t, texID, u2.s, u2.t, texID,
      u0.s, u0.t, texID, u2.s, u2.t, texID, u3.s, u3.t, texID
    ];

    return {
      sym: 'Quad',
      isTerminal: true,
      vertices: vertices,
      normals: normals,
      uvs: uvs
    }

  }

}()));

shgRoom.define('Door', null, function() {

  return {
    sym: 'Door',
    isTerminal: true,
    point: this.point,
    angle: this.angle
  }

});

shgRoom.define('WallSegment', null, function() {

  return {
    sym: 'WallT',
    isTerminal: true,
    p0: this.points[0],
    p1: this.points[1]
  }
});

shgRoom.minWidth = 4;
shgRoom.maxWidth = 7;
shgRoom.density = .8;
shgRoom.ratio = .61;
shgRoom.floorHeight = 1.5;
shgRoom.wallDepth = .2;

module.exports = {
  shg: shgRoom,
  create: function(points) {
  
    var ret = shgRoom.run({
      sym: 'Apartment',
      points: points
    }).reduce(function(o, i) {
      switch(i.sym) {
        case 'Quad':
          for(var j = 0, J = i.vertices.length; j < J; j++) {
            o.vertices.push(i.vertices[j]);
            o.normals.push(i.normals[j]);
            o.uvs.push(i.uvs[j]);
          }
          break;
        case 'Lamp':
          var lamp = FurnitureSHG.lamp(i.point.x, i.point.y, i.point.z);
          for(var j = 0, J = lamp.vertices.length; j < J; j++) {
            o.lamp.vertices.push(lamp.vertices[j]);
            o.lamp.normals.push(lamp.normals[j]);
            o.lamp.uvs.push(lamp.uvs[j]);
            o.lamp.extra.push(lamp.extra[j]);
          }
          break;
        case 'Table':
          var table = FurnitureSHG.table(i.point.x, i.point.y, i.point.z);
          for(var j = 0, J = table.vertices.length; j < J; j++) {
            o.table.vertices.push(table.vertices[j]);
            o.table.normals.push(table.normals[j]);
            o.table.uvs.push(table.uvs[j]);
            o.table.extra.push(table.extra[j]);
          }
          break;
        case 'Chair':
          var chair = FurnitureSHG.chair(i.point.x, i.point.y, i.point.z);
          for(var j = 0, J = chair.vertices.length; j < J; j++) {
            o.chair.vertices.push(chair.vertices[j]);
            o.chair.normals.push(chair.normals[j]);
            o.chair.uvs.push(chair.uvs[j]);
            o.chair.extra.push(chair.extra[j]);
          }
          break;
        case 'WallT':
          o.walls.push(i);
          break;
        case 'Door':
          o.doors.push(i);
          break;
        case 'GraphNode':
          o.rooms.push(i);
          o.nodes.push(i);
          break;
        case 'GraphFinalNode':
          o.monitor = i;
          break;
        /*case 'GraphArc':
          o.arcs.push(i);
          break;*/
      }

      return o;
    }, {
      vertices: [], normals: [], uvs: [], 
      walls: [], rooms: [], nodes: [], arcs: [], doors: [],
      lamp: { vertices: [], normals: [], uvs: [], extra: [] },
      table: { vertices: [], normals: [], uvs: [], extra: [] },
      chair: { vertices: [], normals: [], uvs: [], extra: [] },
      monitor: null
    });

    console.log(ret.rooms.map(function(i) { return i.roomCentroid }));

    var bbox = points.reduce(function(o, i) {
      o.minX = Math.min(i.x, o.minX);
      o.minZ = Math.min(i.z, o.minZ);
      o.maxX = Math.max(i.x, o.maxX);
      o.maxZ = Math.max(i.z, o.maxZ);

      return o;

    }, { 
      minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY, maxZ: Number.NEGATIVE_INFINITY,
    });

    bbox.lenX = bbox.maxX - bbox.minX;
    bbox.lenZ = bbox.maxZ - bbox.minZ;

    ret.lines = ret.walls.reduce(function(o, i) {

      o.push(
        (i.p0.x - bbox.minX) / bbox.lenX, 
        (i.p0.z - bbox.minZ) / bbox.lenZ, 
        (i.p1.x - bbox.minX) / bbox.lenX, 
        (i.p1.z - bbox.minZ) / bbox.lenZ
      );
      return o;

    }, []);

    ret.roomsWorld = ret.rooms.map(function(i) { return i.roomCentroid });
    ret.rooms = ret.rooms.reduce(function(o, i) {

      o.push({
        x: (i.roomCentroid.x - bbox.minX) / bbox.lenX,
        y: (i.roomCentroid.y - bbox.minY) / bbox.lenY,
        z: (i.roomCentroid.z - bbox.minZ) / bbox.lenZ
      });

      return o;

    }, []);

    ret.width = bbox.lenX;
    ret.height = bbox.lenZ;
    ret.bbox = bbox;

    return ret;

  }
}
