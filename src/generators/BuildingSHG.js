var ShapeGrammar = require('ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('Geom'),
    PRNG         = require('PRNG');
    //BalconySHG   = require('./BalconySHG.js'),
    //StaircaseSHG = require('./StaircaseSHG.js');

var shg = new ShapeGrammar(),
    litWindowsRNG     = new PRNG(31337),
    buildingSidesRNG  = new PRNG(31338),
    buildingLayoutRNG = new PRNG(31339),
    rng = new PRNG(31337);

shg.define('Building', null, function() {

  var ret = [],
      curHeight = 0;
  
  for(var i = 0, I = this.floorsLayout.length; i < I; i++) {
    var fli = this.floorsLayout[i], floor = {
      sym: fli.type,
      height: fli.height,
      params: fli,
      points: this.points.map(function(i) {
        return { x: i.x, y: i.y + curHeight, z: i.z };
      })
    };

    curHeight += fli.height;
    
    ret.push(floor);
  }

  return ret;

});

shg.define('FL_GndFloor', null, (function() {

  var p2 = Math.PI * 2, p4 = 2 * p2,
      fixTH = function(th) { return (th + p4) % p2 };
  
  return function() {
  
    var facades = SHAPE.extrudeAll(this.points, this.height, 'Facade', [0, 1, 0]),
        th = this.params.frontSide;

    switch(this.params.tiles) {
      case 'OneDoor':
        var doorf = 0, minAD = Number.POSITIVE_INFINITY;

        for(var i = 0, I = facades.length; i < I; i++) {
          var fi = facades[i],
              x0 = fi.points[0].x,
              z0 = fi.points[0].z,
              x1 = fi.points[3].x,
              z1 = fi.points[3].z,
              ad = Math.abs(Math.atan2(z1 - z0, x1 - x0) - th);

          fi.type = 'Windows';
          if(ad < minAD) {
            minAD = ad; doorf = i;
          }

        }

        facades[doorf].type = 'OneDoor';
        break;
    }

    return facades;
  }

}()));

shg.define('FL_Floor', null, function() {
  
  var facades = SHAPE.extrudeAll(this.points, this.height, 'Facade', [0, 1, 0]);

  for(var i = 0, I = facades.length; i < I; i++) {
    facades[i].type = 'Windows';
    facades[i].windows = this.params.windows;
  }

  return facades;

});

shg.define('FL_Ledge', null, function() {

  var extrPoints = [], h = this.height;

  for(var i = 0, I = this.points.length; i < I; i++) {
    var p0 = this.points[i], p1 = this.points[(i + 1) % I],
        angle = Math.atan2(p1.z - p0.z, p1.x - p0.x),
        anglep = angle - Math.PI / 2,
        cos = Math.cos(angle) + Math.cos(anglep),
        sin = Math.sin(angle) + Math.sin(anglep);

    extrPoints.push({
      x: p0.x - this.params.width * cos,
      y: p0.y, 
      z: p0.z - this.params.width * sin
    })
  }

  var facades = SHAPE.extrudeAll(extrPoints, this.height, 'Quad', [0, 1, 0]);

  facades.forEach(function(i) {
    var dx = i.points[3].x - i.points[0].x,
        dy = i.points[1].y - i.points[0].y,
        dz = i.points[3].z - i.points[0].z;
    var t = h / shg.UVSCALE,
        s = t * Math.sqrt(dx * dx + dz * dz) / dy;

    i.uvs = [
      { s: 0, t: t },
      { s: 0, t: 0 },
      { s: s, t: 0 },
      { s: s, t: t }
    ];
    i.texID = 6;
  });

  facades.push({
    sym: 'Poly',
    texID: 6,
    points: extrPoints
  });

  facades.push({
    sym: 'Poly',
    texID: 6,
    points: extrPoints.map(function(i) {
      return { x: i.x, y: i.y + h, z: i.z }
    })
  });

  return facades;

});

shg.define('FL_Rooftop', null, function() {

  var extrPoints = [], h = this.height;

  for(var i = 0, I = this.points.length; i < I; i++) {
    var p0 = this.points[i], p1 = this.points[(i + 1) % I],
        angle = Math.atan2(p1.z - p0.z, p1.x - p0.x),
        anglep = angle - Math.PI / 2,
        cos = Math.cos(angle) + Math.cos(anglep),
        sin = Math.sin(angle) + Math.sin(anglep);

    extrPoints.push({
      x: p0.x + this.params.width * cos,
      y: p0.y, 
      z: p0.z + this.params.width * sin
    })
  }

  var facadesOut = SHAPE.extrudeAll(this.points, this.height, 'Quad', [0, 1, 0]),
      facadesIn  = SHAPE.extrudeAll(extrPoints,  this.height, 'Quad', [0, 1, 0]);

  while(facadesOut.length)
    facadesIn.push(facadesOut.shift());

  facadesIn.forEach(function(i) {
    var dx = i.points[3].x - i.points[0].x,
        dy = i.points[1].y - i.points[0].y,
        dz = i.points[3].z - i.points[0].z;
    var t = h / shg.UVSCALE,
        s = t * Math.sqrt(dx * dx + dz * dz) / dy;

    i.uvs = [
      { s: 0, t: t },
      { s: 0, t: 0 },
      { s: s, t: 0 },
      { s: s, t: t }
    ];
    i.texID = 6;
  });

  facadesIn.push({
    sym: 'Poly',
    points: extrPoints,
    texID: 3
  });

  for(var i = 0, I = extrPoints.length; i < I; i++) {
    var ii = (i + 1) % I,
        p0 = this.points[i], p1 = extrPoints[i],
        p2 = extrPoints[ii], p3 = this.points[ii];

    var poly = {
      sym: 'Poly',
      points: [ p0, p1, p2, p0, p2, p3 ].map(function(i) { return { x: i.x, y: i.y + h, z: i.z }; }),
      texID: 6
    };

    facadesIn.push(poly);
  }

  return facadesIn;
});

shg.define('Facade', function() { return this.type === 'OneDoor' }, function() {

  var dx = this.points[3].x - this.points[0].x,
      dy = this.points[1].y - this.points[0].y,
      dz = this.points[3].z - this.points[0].z,
      t  = dy / shg.UVSCALE,
      s  = t * Math.sqrt(dx * dx + dz * dz) / dy;

  this.uvs = [
    { s: 0, t: t },
    { s: 0, t: 0 },
    { s: s, t: 0 },
    { s: s, t: t }
  ];

  var quads = SHAPE.fit('x', this, 'Window', 1);

  quads[ ~~(quads.length / 2) ].sym = 'Door';
  //quads.splice(Math.floor(quads.length / 2), 1);
  
  for(var i = 0, I = quads.length; i < I; i++)
    quads[i].normal = this.normal;

  return quads;

});

shg.define('Facade', null, function() {

  var dx = this.points[3].x - this.points[0].x,
      dy = this.points[1].y - this.points[0].y,
      dz = this.points[3].z - this.points[0].z,
      t  = dy / shg.UVSCALE,
      s  = t * Math.sqrt(dx * dx + dz * dz) / dy;

  this.uvs = [
    { s: 0, t: t },
    { s: 0, t: 0 },
    { s: s, t: 0 },
    { s: s, t: t }
  ];

  var quads = SHAPE.fit('x', this, 'Window', 1);

  //quads[ Math.round(quads.length / 2) ].sym = 'Door';
  
  for(var i = 0, I = quads.length; i < I; i++)
    quads[i].normal = this.normal;

  return quads;

});

shg.define('Window', null, function() {
  
  var hsp = SHAPE.split(this, [ .3, .4, .3 ], [1], 'Quad'),
      vsp = SHAPE.split(hsp[1], [1], [.15, .7, .15], 'Quad'),
      windowPane = vsp[1];

  var wpuvs = windowPane.uvs;
  windowPane.uvs = null;
  windowPane.texID = (litWindowsRNG.random() > .3 ? 4 : 5);

  hsp[0].texID = hsp[2].texID = vsp[0].texID = vsp[2].texID = 6;

  var ret = [ hsp[0], hsp[2], vsp[0], vsp[2] ];

  var norm = Geom.triToNormal([
    windowPane.points[0].x, windowPane.points[0].y, windowPane.points[0].z, 
    windowPane.points[1].x, windowPane.points[1].y, windowPane.points[1].z, 
    windowPane.points[2].x, windowPane.points[2].y, windowPane.points[2].z
  ]);

  var borders = SHAPE.extrudeAll(windowPane.points, -.005, 'Quad', norm);
  var nX = norm[0],
      nY = norm[1],
      nZ = norm[2];
  
  nX *= .005;
  nY *= .005;
  nZ *= .005;

  for(var i = 0, I = windowPane.points.length; i < I; i++) {
    var p = windowPane.points[i];
    p.x -= nX;
    p.y -= nY;
    p.z -= nZ;
  }

  for(var i = 0, I = borders.length; i < I; i++) {
    borders[i].texID = 3;
    ret.push(borders[i]);
  }
  ret.push(windowPane);

  return ret;

});

shg.define('Door', null, function() {
  
  var hsp = SHAPE.split(this, [ .15, .7, .15 ], [1], 'Quad'),
      vsp = SHAPE.split(hsp[1], [1], [.7, .3 ], 'Quad'),
      windowPane = vsp[0];

  var wpuvs = windowPane.uvs;
  windowPane.uvs = null;
  windowPane.texID = (litWindowsRNG.random() > .3 ? 4 : 5);

  hsp[0].texID = hsp[2].texID = vsp[1].texID = 6;

  var ret = [ hsp[0], hsp[2], vsp[1] ];

  var norm = Geom.triToNormal([
    windowPane.points[0].x, windowPane.points[0].y, windowPane.points[0].z, 
    windowPane.points[1].x, windowPane.points[1].y, windowPane.points[1].z, 
    windowPane.points[2].x, windowPane.points[2].y, windowPane.points[2].z
  ]);

  var borders = SHAPE.extrudeAll(windowPane.points, -.005, 'Quad', norm);
  var nX = norm[0],
      nY = norm[1],
      nZ = norm[2];
  
  nX *= .005;
  nY *= .005;
  nZ *= .005;

  for(var i = 0, I = windowPane.points.length; i < I; i++) {
    var p = windowPane.points[i];
    p.x -= nX;
    p.y -= nY;
    p.z -= nZ;
  }

  for(var i = 0, I = borders.length; i < I; i++) {
    borders[i].texID = 3;
    ret.push(borders[i]);
  }
  ret.push(windowPane);

  return ret;

});

shg.define('Quad', null, (function() {

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

shg.define('Poly', null, function() {
  var rings = this.points.map(function(i) {
    return [i.x, i.z];
  }), y = this.points[0].y;

  var triverts = earcut([rings]),
      vertices = triverts.reduce(function(o, i) {
        o.push(i[0], y, i[1]);
        return o;
      }, []),
      normal = this.normal || Geom.triToNormal(vertices),
      normals = [], uvs = [];

  var minX, minZ, maxX, maxZ, dx, dz, p;

  minX = minZ = Number.POSITIVE_INFINITY;
  maxX = maxZ = Number.NEGATIVE_INFINITY;

  for(var i = 0, I = this.points.length; i < I; i++) {
    p = this.points[i];
    if(minX > p.x) minX = p.x;
    if(maxX < p.x) maxX = p.x;
    if(minZ > p.z) minZ = p.z;
    if(maxZ < p.z) maxZ = p.z;
  }

  dx = maxX - minX;
  dz = maxZ - minZ;

  for(var i = 0, I = vertices.length; i < I; i += 3) {
    var x = vertices[i], z = vertices[i + 2];
    uvs.push( (x - minX) / dx, (z - minZ) / dz, this.texID );
    normals.push(normal[0], normal[1], normal[2]);
  }

  return {
    sym: ShapeGrammar.TERMINAL,
    vertices: vertices,
    normals: normals,
    uvs: uvs
  }

});

var availColors = [
  [ .88, .88, .88 ],
  [ .66, .66, .66 ],
  [ 1,   .97, .83 ],
  [ .68, .53, .46 ]
];

shg.UVSCALE = .1;

module.exports = {
  shg: shg,
  create: function(lot) {
    //context.rng.seed(10);

    var dx = lot.width / 2, dy = lot.depth / 2,
        x0 = lot.x - dx, x1 = lot.x + dx,
        y0 = lot.y - dy, y1 = lot.y + dy,
        ratio = Math.max(dx / dy, dy / dx);

    var pts = [];

    if(ratio < 1.3 && buildingSidesRNG.random() < .5) {
      for(var i = 0; i < 8; i++)
        pts.push({ 
          x : lot.x + dx * Math.cos(-i * Math.PI / 4), 
          y: 0, 
          z: lot.y + dy * Math.sin(-i * Math.PI / 4) }); 
    } else {
      pts.push(
        { x: x0, y: 0, z: y0 },
        { x: x0, y: 0, z: y1 },
        { x: x1, y: 0, z: y1 },
        { x: x1, y: 0, z: y0 }
      );
    }

    var floorLayout = [], flId = ~~(buildingLayoutRNG.random() * 2);

    switch(flId) {
      case 0: // With ledge
        floorLayout.push(
          { type: 'FL_GndFloor', height: .1, tiles: 'OneDoor', 
                                 frontSide: lot.angle },
          { type: 'FL_Ledge',    height: .025, width: .003125 }
        );
        for(var i = 0, I = 4 + ~~(rng.random() * 10); i < I; i++)
          floorLayout.push(
            { type: 'FL_Floor',  height: .1, windows: 'Double' }
          );
        floorLayout.push(
          { type: 'FL_Ledge',    height: .025, width: .003125 },
          { type: 'FL_Floor',    height: .15, windows: 'Single' },
          { type: 'FL_Rooftop',  height: .025, width: .00625 }
        );
        break;
      case 1: // Without ledge
        floorLayout.push(
          { type: 'FL_GndFloor', height: .1, tiles: 'OneDoor',
                                 frontSide: lot.angle }
        );
        for(var i = 0, I = 4 + ~~(rng.random() * 10); i < I; i++)
          floorLayout.push(
            { type: 'FL_Floor',  height: .1, windows: 'Double' }
          );
        floorLayout.push(
          { type: 'FL_Floor',    height: .15, windows: 'Single' },
          { type: 'FL_Rooftop',  height: .025, width: .00625 }
        );
        break;
    }

    var axiom = {
      sym: 'Building',
      floorsLayout: floorLayout,
      points: pts
    };

    var color = availColors[ ~~(rng.random() * availColors.length) ];

    var ret = shg.run(axiom);
    return { geom: ret, color: color };
  },
  getGeom: function() {
    return context;
  }

}
