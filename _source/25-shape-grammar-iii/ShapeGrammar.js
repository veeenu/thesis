var ShapeGrammar = (function() {

  var _ = function() {
    this.rules = [];
  };

  _.prototype.define = function(lhs, cond, rhs) {
    this.rules.push({
      lhs: lhs,
      cond: cond,
      rhs: rhs
    });
  };

  _.prototype.run = function(state) {
    
    var output = [], rules = this.rules, nonterminals = 0;

    state = (state instanceof Array? state : [state]);

    while(state.length) {

      var lhs = state.shift();

      if(lhs.sym === _.TERMINAL) {
        output.push(lhs);
      } else for(var i = 0, I = rules.length; i < I; i++) {
        
        var rule = rules[i];
        if(lhs.sym === rule.lhs && 
          (rule.cond === null || rule.cond.call(lhs))) {
          
          var ret = rule.rhs.call(lhs);
          ret = (ret instanceof Array? ret : [ret]);

          for(var j = 0, J = ret.length; j < J; j++) {
            output.push(ret[j]);
            ++nonterminals;
          }

          break;
        }
      }
    }

    return (nonterminals > 0 ? this.run(output) : output);
  }

  _.TERMINAL = 'TERMINAL';

  return _;
  
}());

var shg = new ShapeGrammar();

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

shg.define('FL_GndFloor', null, function() {
  
  var facades = SHAPE.extrudeAll(this.points, this.height, 'Facade', [0, 1, 0]);

  switch(this.params.tiles) {
    case 'OneDoor':
      for(var i = 1, I = facades.length; i < I; i++)
        facades[i].type = 'Windows';
      facades[0].type = 'OneDoor';
      break;
  }

  return facades;

});

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
  });

  facades.push({
    sym: 'Poly',
    points: extrPoints
  });

  facades.push({
    sym: 'Poly',
    points: extrPoints.map(function(i) {
      i.y += h;
      return i;
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

  facadesIn.push({
    sym: 'Poly',
    points: extrPoints
  });

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
  });

  for(var i = 0, I = extrPoints.length; i < I; i++) {
    var ii = (i + 1) % I,
        p0 = this.points[i], p1 = extrPoints[i],
        p2 = extrPoints[ii], p3 = this.points[ii];

    var poly = {
      sym: 'Poly',
      points: [ p0, p1, p2, p0, p2, p3 ].map(function(i) { return { x: i.x, y: i.y + h, z: i.z }; })
    };

    facadesIn.push(poly);
  }

  return facadesIn;
});

shg.define('Facade', function() { return this.type === 'OneDoor' }, function() {

  var quads = SHAPE.fit('x', this, 'Window', 1);

  quads[ ~~(quads.length / 2) ].sym = 'Door';
  
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
      vsp = SHAPE.split(hsp[1], [1], [.15, .7, .15], 'Quad');

  vsp[1].uvs = null;

  var ret = [ hsp[0], hsp[2], vsp[0], vsp[2] ];

  ret.push(vsp[1]);

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

    normals.push(normal[0], normal[1], normal[2]);
  }

  for(var i = 0, I = vertices.length; i < I; i += 3) {
    var x = vertices[i], z = vertices[i + 2];
    uvs.push( (x - minX) / shg.UVSCALE, (z - minZ) / shg.UVSCALE, 0 );
  }

  return {
    sym: ShapeGrammar.TERMINAL,
    vertices: vertices,
    normals: normals,
    uvs: uvs
  }

})

var pts = [];

for(var i = 0; i < 16; i++)
  pts.push({ x : .3 * Math.cos(-i * Math.PI / 8), y: 0, z: .3 * Math.sin(-i * Math.PI / 8) });

shg.UVSCALE = .2;

var shgResult = shg.run({
  sym: 'Building',
  floorsLayout: [
    { type: 'FL_GndFloor', height: .2, tiles: 'OneDoor' },
    { type: 'FL_Ledge',    height: .025, width: .0125 },
    { type: 'FL_Floor',    height: .1, windows: 'Double' },
    { type: 'FL_Floor',    height: .1, windows: 'Double' },
    { type: 'FL_Floor',    height: .1, windows: 'Double' },
    { type: 'FL_Floor',    height: .1, windows: 'Double' },
    { type: 'FL_Ledge',    height: .025, width: .0125 },
    { type: 'FL_Floor',    height: .15, windows: 'Single' },
    { type: 'FL_Rooftop',  height: .05, width: .025 }
  ],
  /*points: [
    { x: -.3, y: 0, z: -.3 },
    { x: -.3, y: 0, z:  .3 },
    { x:  .3, y: 0, z:  .3 },
    { x:  .3, y: 0, z: -.3 }
  ]*/
  points: pts
});
