var ShapeGrammar = require('ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('Geom'),
    PRNG         = require('PRNG'),
    BalconySHG   = require('./BalconySHG.js');

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
      }),
      facadeLayout: this.facadeLayout
    };

    if('frontFacade' in this)
      floor.frontFacade = this.frontFacade;
    if('hasBalcony' in this) {
      floor.hasBalcony = this.hasBalcony;
      if(i >= I - 2) {
        floor.hasBalconyTop = this.hasBalcony;
      }
    }

    curHeight += fli.height;
    
    ret.push(floor);
  }

  return ret;

});

shg.define('FL_GndFloor', null, (function() {
  
  return function() {
  
    var facades = SHAPE.extrudeAll(this.points, this.height, 'Facade', [0, 1, 0]);
    

    switch(this.params.tiles) {
      case 'OneDoor':

        for(var i = 0, I = facades.length; i < I; i++) {
          facades[i].type = this.facadeLayout[i] || 'Windows';
        }

        facades[this.frontFacade].type = 'OneDoor';
        break;
    }

    return facades;
  }

}()));

shg.define('FL_Floor', null, function() {
  
  var facades = SHAPE.extrudeAll(this.points, this.height, 'Facade', [0, 1, 0]);

  for(var i = 0, I = facades.length; i < I; i++) {
    facades[i].type = this.facadeLayout[i] || 'Windows';
    facades[i].windows = this.params.windows;
  }
  if('hasBalcony' in this) facades[this.frontFacade].hasBalcony = this.hasBalcony;
  if('hasBalconyTop' in this) facades[this.frontFacade].hasBalconyTop = this.hasBalconyTop;

  return facades;

});

shg.define('FL_Ledge', null, function() {

  var extrPoints = [], h = this.height, yy = this.points[0].y;

  extrPoints = Geom.insetPolygon(this.points.map(function(i) { 
                 return { x: i.x, y: i.z }
               }), this.params.width).map(function(i) {
                 return { x: i.x, y: yy, z: i.y }
               });

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

  var extrPoints = [], h = this.height, yy = this.points[0].y;

  extrPoints = Geom.insetPolygon(this.points.map(function(i) { 
                 return { x: i.x, y: i.z }
               }), -this.params.width).map(function(i) {
                 return { x: i.x, y: yy, z: i.y }
               });

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

  return quads;

});

shg.define('Facade', null, function() {

  var dx = this.points[3].x - this.points[0].x,
      dy = this.points[1].y - this.points[0].y,
      dz = this.points[3].z - this.points[0].z,
      len = Math.sqrt(dx * dx + dz * dz),
      t  = dy / shg.UVSCALE,
      s  = t * len / dy,
      bs = null;

  this.uvs = [
    { s: 0, t: t },
    { s: 0, t: 0 },
    { s: s, t: 0 },
    { s: s, t: t }
  ];

  var quads = SHAPE.fit('x', this, 'Window', 1);

  if(this.type === 'Window') {
    // Do nothing
  } else if(typeof this.type === 'function') {
    for(var i = 0, I = quads.length; i < I; i++) {
      if(!this.type(i)) {
        quads[i].sym = 'Quad';
        quads[i].texID = 6;
      }
    }
  }

  if(this.hasBalcony) {
    var ratio = (quads.length % 2 === 0 ? 2 : 3) / quads.length;
    var pars = {
      x0: this.points[0].x, z0: this.points[0].z,
      x1: this.points[3].x, z1: this.points[3].z,
      y: this.points[0].y,
      height: dy,
      width: len * .9 * ratio,
      depth: len * .4 * ratio,
      angle: Math.atan2(-dz, dx)
    };

    if(this.hasBalconyTop)
      bs = BalconySHG.createBalcony(
        pars
      );
    else
      bs = BalconySHG.createBalconyWithStairs(
        pars
      );

    bs.sym = ShapeGrammar.TERMINAL;

  }

  if(bs !== null) {
    quads.push(bs)
  }

  return quads;

});

shg.define('Window', null, function() {
  
  var hsp = SHAPE.split(this, [ .3, .4, .3 ], [1], 'Quad'),
      vsp = SHAPE.split(hsp[1], [1], [.15, .7, .15], 'Quad'),
      windowPane = vsp[1];

  var isLit = litWindowsRNG.random() > .8;
  windowPane.uvs = null;
  windowPane.texID = (isLit ? 5 : 4);

  hsp[0].texID = hsp[2].texID = vsp[0].texID = vsp[2].texID = 6;

  var ret = [ hsp[0], hsp[2], vsp[0], vsp[2] ];

  var norm = this.normal || Geom.triToNormal([
    windowPane.points[0].x, windowPane.points[0].y, windowPane.points[0].z, 
    windowPane.points[1].x, windowPane.points[1].y, windowPane.points[1].z, 
    windowPane.points[2].x, windowPane.points[2].y, windowPane.points[2].z
  ]);

  var borders = SHAPE.extrudeAll(windowPane.points, -.0025, 'Quad', norm);
  var nX = norm[0],
      nY = norm[1],
      nZ = norm[2];
  
  nX *= .0025;
  nY *= .0025;
  nZ *= .0025;

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

  /*if(isLit) {
    var light = {
      sym: ShapeGrammar.TERMINAL,
      light: windowPane.points.reduce(function(o, i) {
        o.x += i.x * .25;
        o.y += i.y * .25;
        o.z += i.z * .25;
        return o;
      }, { x: 0, y: 0, z: 0 })
    };

    light.light.x += norm[0] * .0125;
    light.light.y += norm[1] * .0125;
    light.light.z += norm[2] * .0125;

    ret.push(light);
  }*/

  return ret;

});

shg.define('Door', null, function() {
  
  var hsp = SHAPE.split(this, [ .15, .7, .15 ], [1], 'Quad'),
      vsp = SHAPE.split(hsp[1], [1], [.7, .3 ], 'Quad'),
      windowPane = vsp[0];

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
    
    var vertices, uvs, texID,
        u0, u1, u2, u3,
        p0, p1, p2, p3, ps = this.points;

    p0 = ps[0], p1 = ps[1], p2 = ps[2], p3 = ps[3];

    vertices = [
      p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
      p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z
    ];

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
      uvs = [];

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
  }

  return {
    sym: ShapeGrammar.TERMINAL,
    vertices: vertices,
    uvs: uvs
  }

});

/*
  var hex2rgbf = function(i) { 
    return i.replace(/#(..)(..)(..)/g, '$1,$2,$3')
            .split(',')
            .map(function(j) { 
              return (parseInt(j, 16) / 255).toFixed(2) 
            }); 
  }
*/
var availColors = [
  [ .90, .65, .48 ],
  [ .75, .73, .69 ],
  [ .82, .67, .42 ],
  [ .60, .39, .33 ]
  //[ .72, .43, .35 ]
];

shg.UVSCALE = .1;

module.exports = {
  shg: shg,
  create: function(lot) {
    //context.rng.seed(10);

    var dx = lot.width / 2, dy = lot.depth / 2,
        x0 = lot.x - dx, x1 = lot.x + dx,
        y0 = lot.y - dy, y1 = lot.y + dy,
        ratio = Math.max(dx / dy, dy / dx),
        seed = (x1 + x0 + y1 + y0) * 1000,
        frontFacade = null, hasBalcony = false;

    litWindowsRNG.seed(seed);
    buildingSidesRNG.seed(seed);
    buildingLayoutRNG.seed(seed);

    var pts = [];

    if(ratio < 1.3 && buildingSidesRNG.random() < .3) {
      //
      // Octagon building base. Uncommon
      //
      for(var i = 0; i < 8; i++) {
        var ang = -lot.angle - i * Math.PI / 4;
        pts.push({ 
          x : lot.x + dx * Math.cos(ang), 
          y: 0, 
          z: lot.y + dy * Math.sin(ang) 
        }); 
        frontFacade = 0;
      }
    } else if(ratio > 1.1 && buildingSidesRNG.random() < .8) {
      //
      // Building with an inward-extruded part, facing the
      // front of the street
      //
      hasBalcony = true;

      var balck = 2 / 2.7;
      if(dx > dy) {
        //
        // Lot angle can either be 0 (front facing) or π (back facing)
        //
        if(lot.angle < 10e-2) {
          pts.push(
            { x: x0, y: 0, z: y0 },
            { x: x0, y: 0, z: y1 },
            { x: x0 + dx * balck, y: 0, z: y1 },
            { x: x0 + dx * balck, y: 0, z: y1 - dy * balck },
            { x: x1 - dx * balck, y: 0, z: y1 - dy * balck },
            { x: x1 - dx * balck, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 },
            { x: x1, y: 0, z: y0 }
          );
          frontFacade = 3;
        } else {
          pts.push(
            { x: x0, y: 0, z: y0 },
            { x: x0, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 },
            { x: x1, y: 0, z: y0 },
            { x: x1 - dx * balck, y: 0, z: y0 },
            { x: x1 - dx * balck, y: 0, z: y0 + dy * balck },
            { x: x0 + dx * balck, y: 0, z: y0 + dy * balck },
            { x: x0 + dx * balck, y: 0, z: y0 }
          );
          frontFacade = 5;
        } 
      } else {
        //
        // Lot angle can either be π/2 (right facing) or -π/2 (left facing)
        //
        if(lot.angle > 0) {
          pts.push(
            { x: x0, y: 0, z: y0 },
            { x: x0, y: 0, z: y0 + dy * balck },
            { x: x0 + dx * balck, y: 0, z: y0 + dy * balck },
            { x: x0 + dx * balck, y: 0, z: y1 - dy * balck },
            { x: x0, y: 0, z: y1 - dy * balck },
            { x: x0, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 },
            { x: x1, y: 0, z: y0 }
          );
          frontFacade = 2;
        } else {
          pts.push(
            { x: x0, y: 0, z: y0 },
            { x: x0, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 - dy * balck },
            { x: x1 - dx * balck, y: 0, z: y1 - dy * balck },
            { x: x1 - dx * balck, y: 0, z: y0 + dy * balck },
            { x: x1, y: 0, z: y0 + dy * balck },
            { x: x1, y: 0, z: y0 }
          );
          frontFacade = 4;
        
        }
      }
    } else {
      pts.push(
        { x: x0, y: 0, z: y0 },
        { x: x0, y: 0, z: y1 },
        { x: x1, y: 0, z: y1 },
        { x: x1, y: 0, z: y0 }
      );
      if(dx > dy) {
        if(lot.angle < 10e-2) frontFacade = 1;
        else frontFacade = 3;
      } else {
        if(lot.angle < 0) frontFacade = 2;
        else frontFacade = 0;
      }
    }

    var floorLayout = [], 
        flId = ~~(buildingLayoutRNG.random() * 2),
        facadeLayout = [];

    switch(flId) {
      case 0: // With ledge
        floorLayout.push(
          { type: 'FL_GndFloor', height: .05, tiles: 'OneDoor', 
                                 frontSide: lot.angle },
          { type: 'FL_Ledge',    height: .00625, width: .00625 }
        );
        for(var i = 0, I = 4 + ~~(rng.random() * 20); i < I; i++)
          floorLayout.push(
            { type: 'FL_Floor',  height: .05, windows: 'Double' }
          );
        floorLayout.push(
          { type: 'FL_Ledge',    height: .00625, width: .00625 },
          { type: 'FL_Floor',    height: .0625, windows: 'Single' },
          { type: 'FL_Rooftop',  height: .00625, width: .00625 }
        );
        break;
      case 1: // Without ledge
        floorLayout.push(
          { type: 'FL_GndFloor', height: .05, tiles: 'OneDoor',
                                 frontSide: lot.angle }
        );
        for(var i = 0, I = 4 + ~~(rng.random() * 10); i < I; i++)
          floorLayout.push(
            { type: 'FL_Floor',  height: .05, windows: 'Double' }
          );
        floorLayout.push(
          { type: 'FL_Floor',    height: .05, windows: 'Single' },
          { type: 'FL_Rooftop',  height: .00625, width: .00625 }
        );
        break;
    }

    for(var i = 0, I = pts.length; i < I; i++) {
      var ft = ~~(rng.random() * 3);

      switch(ft) {
        case 0:
          facadeLayout[i] = 'Windows';
          break;
        case 1: 
          facadeLayout[i] = function(i) { return !(i % 3 === 0) } // Two windows, one space
          break;
        case 2:
          facadeLayout[i] = function(i) { return (i % 2 === 0) } // One window, one space
          break;
      }
    }

    var axiom = {
      sym: 'Building',
      floorsLayout: floorLayout,
      facadeLayout: facadeLayout,
      points: pts
    };

    if(frontFacade !== null)
      axiom.frontFacade = frontFacade;
    if(hasBalcony)
      axiom.hasBalcony = true;

    var color = availColors[ ~~(rng.random() * availColors.length) ];

    var ret = shg.run(axiom);
    return { geom: ret, color: color };
  },
  getGeom: function() {
    return context;
  }

}
