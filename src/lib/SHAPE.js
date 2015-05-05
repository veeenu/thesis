/*
 * General rule: only rectangles allowed.
 * p1 p2
 * p0 p3
 */
var SHAPE = {
  // Input:  segment ends, extrusion height, normal
  // Output: quad
  extrude: function(symbol, a, b, len, norm) {

    var nX = 0, nY = len, nZ = 0;

    if(norm !== undefined) {
      nX = norm[0] * len; 
      nY = norm[1] * len;
      nZ = norm[2] * len;
    }

    return {
      sym: symbol,
      points: [
        { x: a.x,      y: a.y,      z: a.z },
        { x: a.x + nX, y: a.y + nY, z: a.z + nZ },
        { x: b.x + nX, y: b.y + nY, z: b.z + nZ },
        { x: b.x,      y: b.y,      z: b.z }
      ]
    };
  },
  
  // Input:  list of points, symbols
  // Output: [quad]
  extrudeAll: function(path, len, symbols, norm) {
    var out = [];
    for(var i = 0, n = path.length; i < n; ++i) {
      var cur = path[i], next = path[(i + 1) % n];
      out.push(SHAPE.extrude(symbols instanceof Array ? symbols[i] : symbols, cur, next, len, norm));
    }
    return out;
  },

  // Input:  quad, list of splits (must sum to 1 in each direction)
  // Output: [quad]
  // Split from top to bottom
  split: function(quad, xSplits, ySplits, symbols) {
    var out = [], symI = 0, sioa = symbols instanceof Array,
        qp = quad.points, qu = quad.uvs,
        p0 = qp[0], p1 = qp[1], p2 = qp[2], p3 = qp[3],
        x0 = p0.x, x1 = p1.x, x2 = p2.x, x3 = p3.x,
        y0 = p0.y, y1 = p1.y, y2 = p2.y, y3 = p3.y,
        z0 = p0.z, z1 = p1.z, z2 = p2.z, z3 = p3.z,
        ds = 1, dt = 1, ms = 0, mt = 0;

    if(qu instanceof Array)
      ds = qu[3].s - qu[0].s, dt = qu[1].t - qu[0].t,
      ms = qu[0].s, mt = qu[1].t;

    var accY = 0;
    for(var y = 0, Y = ySplits.length; y < Y; ++y) {
      var accX = 0, accYY = accY + ySplits[y];
      for(var x = 0, X = xSplits.length; x < X; ++x) {
        var accXX = accX + xSplits[x], 
            xa = SHAPE.lerp(x0, x3, accX),
            xb = SHAPE.lerp(x0, x3, accXX),
            ya = SHAPE.lerp(y0, y1, accY),
            yb = SHAPE.lerp(y0, y1, accYY),
            za = SHAPE.lerp(z0, z3, accX),
            zb = SHAPE.lerp(z0, z3, accXX);

        out.push({
          sym: sioa ? symbols[symI++] : symbols,
          points: [
            { x: xa, y: ya, z: za },
            { x: xa, y: yb, z: za },
            { x: xb, y: yb, z: zb },
            { x: xb, y: ya, z: zb }
          ],
          uvs: [
            { s: ms + ds * accX,  t: mt + dt * accY },
            { s: ms + ds * accX,  t: mt + dt * accYY },
            { s: ms + ds * accXX, t: mt + dt * accYY },
            { s: ms + ds * accXX, t: mt + dt * accY },
          ]
        })
        accX = accXX;
      }
      accY = accYY;
    }

    return out;
  },

  splitXZ: function(quad, xSplits, zSplits, symbols) {
    var out = [], symI = 0,
        qp = quad.points,
        p0 = qp[0], p1 = qp[1], p2 = qp[2], p3 = qp[3],
        x0 = p0.x, x1 = p1.x, x2 = p2.x, x3 = p3.x,
        y0 = p0.y, y1 = p1.y, y2 = p2.y, y3 = p3.y,
        z0 = p0.z, z1 = p1.z, z2 = p2.z, z3 = p3.z;

    var accZ = 0;
    for(var z = 0, Z = zSplits.length; z < Z; ++z) {
      var accX = 0;
      for(var x = 0, X = xSplits.length; x < X; ++x) {
        var xa = SHAPE.lerp(x0, x3, accX),
            xb = SHAPE.lerp(x0, x3, accX + xSplits[x]),
            ya = SHAPE.lerp(y0, y1, accX),
            yb = SHAPE.lerp(y0, y1, accX + xSplits[x]),
            za = SHAPE.lerp(z0, z1, accZ),
            zb = SHAPE.lerp(z0, z1, accZ + zSplits[z]);

        out.push({
          sym: symbols instanceof Array? symbols[symI++] : symbols,
          points: [
            { x: xa, y: ya, z: za },
            { x: xa, y: ya, z: zb },
            { x: xb, y: yb, z: zb },
            { x: xb, y: yb, z: za }
          ]
        })
        accX += xSplits[x];
      }
      accZ += zSplits[z];
    }

    return out;
  },

  splitZX: function(quad, xSplits, zSplits, symbols) {
    var out = [], symI = 0,
        qp = quad.points,
        p0 = qp[0], p1 = qp[1], p2 = qp[2], p3 = qp[3],
        x0 = p0.x, x1 = p1.x, x2 = p2.x, x3 = p3.x,
        y0 = p0.y, y1 = p1.y, y2 = p2.y, y3 = p3.y,
        z0 = p0.z, z1 = p1.z, z2 = p2.z, z3 = p3.z;

    var accZ = 0;
    for(var z = 0, Z = zSplits.length; z < Z; ++z) {
      var accX = 0;
      for(var x = 0, X = xSplits.length; x < X; ++x) {
        var xa = SHAPE.lerp(x0, x1, accX),
            xb = SHAPE.lerp(x0, x1, accX + xSplits[x]),
            ya = SHAPE.lerp(y0, y1, accX),
            yb = SHAPE.lerp(y0, y1, accX + xSplits[x]),
            za = SHAPE.lerp(z0, z3, accZ),
            zb = SHAPE.lerp(z0, z3, accZ + zSplits[z]);

        out.push({
          sym: symbols instanceof Array? symbols[symI++] : symbols,
          points: [
            { x: xa, y: ya, z: za },
            { x: xa, y: ya, z: zb },
            { x: xb, y: yb, z: zb },
            { x: xb, y: yb, z: za }
          ]
        })
        accX += xSplits[x];
      }
      accZ += zSplits[z];
    }

    return out;
  },

  // Input: axis, quad, symbol
  // Output: [quad]
  fit: function(axis, quad, symbol, ratio) {

    ratio = ratio || 1;

    var qp = quad.points,
        p0 = qp[0], p1 = qp[1], p2 = qp[2], p3 = qp[3],
        x0 = p0.x, x1 = p1.x, x2 = p2.x, x3 = p3.x,
        y0 = p0.y, y1 = p1.y, y2 = p2.y, y3 = p3.y,
        z0 = p0.z, z1 = p1.z, z2 = p2.z, z3 = p3.z,
        dx = x3 - x0, dy = y1 - y0, dz = z3 - z0, dzdy = z1 - z0;

    if(axis === 'x') {
      var h = dy,
          w = ratio * h,
          wAvail = Math.sqrt( dx * dx + dz * dz ),
          count = Math.round(wAvail / w),
          splits = [];

      w = wAvail / count; // Correct width

      count = Math.max(1, Math.abs(count));
      for(var i = 0; i < count; i++)
        splits.push(1 / count);

      return SHAPE.split(quad, splits, [1], symbol);
    } else if(axis === 'y') {
      var w = x3 - x0,
          h = w / ratio,
          hAvail = Math.sqrt( dy * dy + dzdy * dzdy ),
          count = Math.round(hAvail / h),
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
