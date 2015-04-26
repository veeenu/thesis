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
          x3: xb, y3: yb, z3: zb,
          uvs: [
            { s: accX,              t: accY + ySplits[y] },
            { s: accX,              t: accY },
            { s: accX + xSplits[x], t: accY },
            { s: accX + xSplits[x], t: accY + ySplits[y] },
          ]
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

module.exports = SHAPE;
