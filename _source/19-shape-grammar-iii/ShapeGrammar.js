/*
 * General rule: only rectangles allowed.
 * p1 p2
 * p0 p3
 */
var SHAPE = {
  // Input:  segment ends, extrusion height
  // Output: quad
  // Only ever extrude a segment along [0, 1, 0].
  extrude: function(symbol, a, b, h) {
    return {
      sym: symbol,
      x0: a.x, y0: a.y,     z0: a.z,
      x1: a.x, y1: a.y + h, z1: a.z,
      x2: b.x, y2: b.y + h, z2: b.z,
      x3: b.x, y3: b.y,     z3: b.z
    };
  },
  
  // Input:  list of points, symbols
  // Output: [quad]
  extrudeAll: function(path, height, symbols) {
    var out = [];
    for(var i = 0, n = path.length; i < n; i++) {
      var cur = path[i], next = path[(i + 1) % n];
      out.push(SHAPE.extrude(symbols instanceof Array ? symbols[i] : symbols, cur, next, height));
    }
    return out;
  },

  // Input:  quad, list of splits (must sum to 1 in each direction)
  // Output: [quad]
  // Split from top to bottom
  split: function(quad, xSplits, ySplits, symbols) {
    var out = [], symI = 0;

    var accY = 0;
    for(var y = 0, Y = ySplits.length; y < Y; y++) {
      var accX = 0;
      for(var x = 0, X = xSplits.length; x < X; x++) {
        var xa = SHAPE.lerp(quad.x0, quad.x3, accX),
            xb = SHAPE.lerp(quad.x0, quad.x3, accX + xSplits[x]),
            ya = SHAPE.lerp(quad.y0, quad.y1, accY),
            yb = SHAPE.lerp(quad.y0, quad.y1, accY + ySplits[y]),
            za = SHAPE.lerp(quad.z0, quad.z3, accX),
            zb = SHAPE.lerp(quad.z0, quad.z3, accX + xSplits[x]);

        out.push({
          sym: symbols instanceof Array? symbols[symI++] : symbols,
          x0: xa, y0: yb, z0: za,
          x1: xa, y1: ya, z1: za,
          x2: xb, y2: ya, z2: zb,
          x3: xb, y3: yb, z3: zb
        })
        accX += xSplits[x];
      }
      accY += ySplits[y];
    }

    return out;
  },

  // Input: axis, quad, symbol
  // Output: [quad]
  fit: function(axis, quad, symbol, ratio) {

    ratio = ratio || 1;

    if(axis === 'x') {
      var h = quad.y1 - quad.y0,
          w = ratio * h,
          wAvail = Math.sqrt( Math.pow(quad.x3 - quad.x0, 2) + Math.pow(quad.z3 - quad.z0, 2) ),
          count = ~~(wAvail / w),
          splits = [];

      w = wAvail / count; // Correct width

      count = Math.max(1, Math.abs(count));
      for(var i = 0; i < count; i++)
        splits.push(1 / count);

      return SHAPE.split(quad, splits, [1], symbol);
    } else if(axis === 'y') {
      var w = quad.x3 - quad.x0,
          h = w / ratio,
          hAvail = Math.sqrt( Math.pow(quad.y1 - quad.y0, 2) + Math.pow(quad.z1 - quad.z0, 2) ),
          count = ~~(hAvail / h),
          splits = [];

      h = hAvail / count; // Correct width

      for(var i = 0; i < count; i++)
        splits.push(1 / count);

      return SHAPE.split(quad, splits, [1], symbol);
    }
  },

  lerp: function(a, b, t) {
    return a * (1 - t) + b * t;
  }
};

var ShapeGrammar = function() {
  this.rules = [];
}

ShapeGrammar.prototype.define = function(rule, lc, rc, cond, fn) {

  if(!(rule in this.rules))
    this.rules[rule] = [];

  this.rules[rule].push({
    lc: lc, rc: rc, cond: cond, fn: fn
  });
}

ShapeGrammar.prototype.run = function(axiom) {

  var out = [], nonempty = false;
  axiom = axiom instanceof Array? axiom : [axiom];

  for(var i = 0, n = axiom.length; i < n; i++) {
    var symbol = axiom[i],
        lc = (i > 0 ?     axiom[i - 1] : null),
        rc = (i < n - 1 ? axiom[i + 1] : null),
        rlhs, rule = null;
    
    rlhs = this.rules[symbol.sym];
    if(!rlhs) {
      out.push(symbol);
      continue;
    }

    for(var j = 0, J = rlhs.length; j < J && rule === null; j++) {
      var r = rlhs[j];
      if( (r.lc   === null || r.lc === lc.sym) &&
          (r.rc   === null || r.rc === rc.sym) &&
          (r.cond === null || r.cond.call(symbol, lc, rc)) ) {
        rule = r;
      }
    }

    if(rule === null) {
      out.push(symbol);
      continue;
    }

    nonempty = true;

    var res = rule.fn.call(symbol, lc, rc);
    out.push.apply(out, res instanceof Array? res : [res]);

  }

  return nonempty ? this.run(out) : axiom;
}

var shg = new ShapeGrammar();

shg.define('GndFloor', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return idx === 0 ? 'FrontDoor' : 'Facade'} )),
      floorFace = {
        sym: 'TPolyFloor',
        points: this.points
      },
      ceilFace = {
        sym: 'TPolyFloor',
        points: this.points.map(function(i) {
          return { x: i.x, y: i.y + this.floorHeight * (this.floors + 1) + this.ledgeHeight, z: i.z }
        }.bind(this))
      },
      gceilFace = {
        sym: 'TPolyFloor',
        points: this.points.map(function(i) {
          return { x: i.x, y: i.y + this.floorHeight, z: i.z }
        }.bind(this))
      };

  for(var i = 0; i < this.floors; i++) {
    var fs = this.points.reduce(function(o, cur) {
      o.points.push({
        x: cur.x, y: cur.y + this.ledgeHeight + o.floorHeight * (i + 1), z: cur.z
      });
      return o;
    }.bind(this), { sym: 'Floor', floorHeight: this.floorHeight, points: [] });
    ret.push(fs);
  }

  ret.push(floorFace);
  ret.push(ceilFace);
  ret.push(gceilFace);
  var insp = Geom.insetPolygon(this.points.map(function(i) { 
               return { x: i.x, y: i.z }
             }), this.ledgeInset).map(function(i, idx) {
               return {
                 x: i.x,
                 y: this.points[idx].y + this.floorHeight,
                 z: i.y
               }
             }.bind(this)),
      ceilp = insp.map(function(i) {
        return { x: i.x, y: i.y + this.floorHeight * this.floors + this.ledgeHeight, z: i.z };
      }.bind(this));

  ret.push({
    sym: 'Ledge',
    ledgeHeight: this.ledgeHeight,
    points: insp
  })
  ret.push({
    sym: 'Ledge',
    ledgeHeight: this.ledgeHeight,
    points: ceilp,
    hasCeil: true
  })
  return ret;
});

shg.define('Floor', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.floorHeight,
                             this.points.map(function(i, idx) { return 'Facade' } )),
      floorFace = {
        sym: 'TPolyFloor',
        points: this.points
      };
  ret.push(floorFace);
  return ret;
});

shg.define('Ledge', null, null, null, function() {
  var ret = SHAPE.extrudeAll(this.points, this.ledgeHeight,
                             this.points.map(function(i, idx) { return 'TQuad' } )),
      ceilFace = this.hasCeil ? {
        sym: 'TPolyFloor',
        points: this.points.map(function(i) { 
          return { x: i.x, y: i.y + this.ledgeHeight, z: i.z }
        }.bind(this))
      } : null;
  if(ceilFace !== null)
    ret.push(ceilFace);
  return ret;
});

shg.define('Facade', null, null, null, function() {

  return SHAPE.fit('x', this, 'Tile', .7);
});

shg.define('FrontDoor', null, null, 
           function(i) { 
             var dx = this.x3 - this.x0, dz = this.z3 - this.z0,
                 len = Math.sqrt(dx * dx + dz * dz);
             return len > 1;
           }, function() {
             return SHAPE.split(this, [ .25, .5, .25 ], [1], [ 'Facade', 'Door', 'Facade' ]);
           });
shg.define('FrontDoor', null, null, 
           function(i) { 
             var dx = this.x3 - this.x0, dz = this.z3 - this.z0,
                 len = Math.sqrt(dx * dx + dz * dz);
             return len <= 1;
           }, function() {
             return SHAPE.split(this, [1], [1], [ 'Door' ]);
           });

shg.define('Tile', null, null, null, function() {

  return SHAPE.split(this, [ .3, .4, .3 ], [ .2, .6, .2 ], [
    'TQuad', 'TQuad', 'TQuad',
    'TQuad', 'TWin',  'TQuad',
    'TQuad', 'TQuad', 'TQuad'
  ]);
});

shg.define('Door', null, null, null, function() {

 return SHAPE.split(this, [ .2, .6, .2 ], [ .3, .7 ], [
   'TQuad', 'TQuad', 'TQuad',
   'TQuad', 'TDoor',  'TQuad'
 ]);
});

shg.define('TQuad', null, null, null, function() {
  var vertices = [], normals = [],
      colors = [], normal;

  vertices = [
    this.x0, this.y0, this.z0,
    this.x1, this.y1, this.z1,
    this.x2, this.y2, this.z2,
    this.x0, this.y0, this.z0,
    this.x2, this.y2, this.z2,
    this.x3, this.y3, this.z3
  ];

  normal = Geom.triToNormal(vertices);
  for(var i = 0; i < 6; i++) {
    normals.push.apply(normals, normal);
    colors.push( 
      'r' in this ? this.r : 1,
      'g' in this ? this.g : 0, 
      'b' in this ? this.b : 0
    );
  }

  return { sym: null, vertices: vertices, normals: normals, colors: colors };
});

shg.define('TPolyFloor', null, null, null, function() {
  var rings = this.points.reduce(function(out, val) {
    out.push([val.x, val.z]);
    return out;
  }, []), y = this.points[0].y;

  var triverts = earcut([rings]),
      vertices = triverts.reduce(function(out, val, i) {
        out.push(val[0], y, val[1]);
        return out;
      }, []),
      normal = Geom.triToNormal(vertices),
      normals = vertices.map(function(i, idx) {
        return normal[idx % 3];
      }),
      color = [ 0, 1, 0 ],
      colors = vertices.map(function(i, idx) {
        return color[idx % 3];
      });

  return { sym: null, vertices: vertices, normals: normals, colors: colors };
});

shg.define('TWin', null, null, null, function() {
  this.r = 0;
  this.g = 1;
  this.b = 1;
  this.sym = 'TQuad';

  return this;
});

shg.define('TDoor', null, null, null, function() {
  this.r = 0;
  this.g = 0;
  this.b = 1;
  this.sym = 'TQuad';

  return this;
});

var axiom = {
  sym: 'GndFloor',
  points: (function() {
    var r = [], ang;
    for(ang = 0; ang < 2 * Math.PI; ang += Math.PI / 4)
      r.push({ x: Math.sin(ang - Math.PI / 8), y: 0, z: Math.cos(ang - Math.PI / 8) });

    return r;

  }()),
  floorHeight: .3,
  floors: 6,
  ledgeHeight: .05,
  ledgeInset: -.025
  /*points: [
    { x: -1, y: 0, z: -1 },
    { x: -1, y: 0, z:  1 },
    { x:  1, y: 0, z:  1 },
    { x:  1, y: 0, z: -1 }
  ]*/
};

axiom = shg.run(axiom);

shgResult = axiom.reduce(function(sr, cur) {
  
  sr.vertices.push.apply(sr.vertices, cur.vertices);
  sr.normals.push.apply(sr.normals, cur.normals);
  sr.colors.push.apply(sr.colors, cur.colors);

  return sr;
}, { vertices: [], normals: [], colors: [] });
