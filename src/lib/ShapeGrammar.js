var Geom = require('Geom'),
    glMatrix = require('gl-matrix'),
    earcut = require('earcut'),
    vec3 = glMatrix.vec3,
    mat4 = glMatrix.mat4;

var SHAPE = {
  extrude: function(path, len) {
    var vA = vec3.fromValues.apply(vec3, path.points.slice(3,6)),
        vB = vec3.fromValues.apply(vec3, path.points.slice(0,3)),
        vC = vec3.fromValues.apply(vec3, path.points.slice(6,9)),
        mat = SHAPE.t2m(path),
        norm = vec3.create(),
        sideA = vec3.create(), sideB = vec3.create(),
        sideC = vec3.create(), sideD = vec3.create();

    vec3.transformMat4(vA, vA, mat);
    vec3.transformMat4(vB, vB, mat);
    vec3.transformMat4(vC, vC, mat);

    vec3.sub(vB, vB, vA);
    vec3.sub(vC, vC, vA);
    vec3.cross(norm, vB, vC);
    vec3.normalize(norm, norm);
    vec3.scale(norm, norm, len);

    var out = [];

    for(var ii = 0, N = path.points.length, n = ~~(N / 3); ii < n; ii++) {
      var i = ii * 3;
      vec3.set(sideA, path.points[i], path.points[i + 1], path.points[i + 2]);
      vec3.set(sideB, path.points[(i + 3) % N], path.points[(i + 4) % N], path.points[(i + 5) % N]);
      vec3.transformMat4(sideA, sideA, mat);
      vec3.transformMat4(sideB, sideB, mat);
      vec3.add(sideC, sideA, norm);
      vec3.add(sideD, sideB, norm);
      out.push(SHAPE.quad(sideA, sideB, sideC, sideD));
    }

    return out;
  },
  inset: function(path, dist) {
    var points = path.points.reduce(function(out, val, i) {
      if(i % 3 === 0)
        out.push({ x: val });
      else if(i % 3 === 1)
        return out;

      out[ out.length - 1 ].y = val;
      return out;
    }, []);

    return SHAPE.transform({ 
      points: Geom.insetPolygon(points, dist).reduce(function(out, i) {
        out.push(i.x, 0, i.y);
        return out;
      }, [])
    }, path);
  },
  face: function(path) {
    var rings = path.points.reduce(function(out, val, i) {
      if(i % 3 === 0)
        out.push([]);
      else if(i % 3 === 1)
        return out;

      out[ out.length - 1 ].push(val);
      return out;
    }, []);

    var triverts = earcut([rings]),
        mat = SHAPE.t2m(path),
        vertices = [], normals = [], normal;

    triverts.forEach(function(i) {
      var vec = vec3.fromValues(i[0], 0, i[1]);
      vec3.transformMat4(vec, vec, mat);
      vertices.push(vec[0], vec[1], vec[2]);
    });

    normal = Geom.triToNormal(vertices);

    for(var i = 0, n = vertices.length; i < n; i += 3) {
      normals.push.apply(normals, normal);
    }

    var uvs = [], minX, minY, maxX, maxY;

    minX = minY = Number.POSITIVE_INFINITY;
    maxX = maxY = Number.NEGATIVE_INFINITY;

    path.points.forEach(function(p, i) {
      switch(i % 2) {
        case 0:
          if(p < minX) minX = p;
          if(p > maxX) maxX = p;
          break;
        case 1:
          if(p < minY) minY = p;
          if(p > maxY) maxY = p;
          break;
        /*case 2:
          if(p < minZ) minZ = p;
          if(p > maxZ) maxZ = p;
          break;*/
      }
    });

    var lX = maxX - minX,
        lY = maxY - minY,
        iX = 0, iY = 1;

    if(normal[0] > normal[1] && normal[0] > normal[2]) { iX = 2; iY = 1; }
    else if(normal[1] > normal[0] && normal[1] > normal[2]) { iX = 0; iY = 2; }

    for(var i = 0, n = vertices.length; i < n; i += 3) {
      var u = (vertices[i + iX] - minX),// / lX,
          v = (vertices[i + iY] - minY);// / lY;
      uvs.push(u, v, 0);
    }
    /*for(var i = 0, n = path.points.length; i < n; i += 2) {
      var u = (path.points[i]     - minX) / lX,
          v = (path.points[i + 1] - minY) / lY;
      uvs.push(u, v, 0);
    }*/

    return {
      vertices: vertices,
      normals: normals,
      uvs: uvs
    }
  },
  /**
   * Creates VBO quad.
   * a, b, c, d: points in their final transform
   */
  quad: function(a, b, c, d) {
    var normal = vec3.create(),
        sA = vec3.create(),
        sB = vec3.create(),
        lX, lY,
        vertices, normals, uvs;

    vec3.sub(sA, a, b);
    vec3.sub(sB, c, b);
    lY = vec3.length(sA);
    lX = vec3.length(sB);
    vec3.cross(normal, sA, sB);
    vec3.normalize(normal, normal);

    vertices = [a, c, b, b, c, d].reduce(function(out, v) {
      out.push.apply(out, v);
      return out;
    }, []);

    normals = [];
    for(var i = 6; i--;) normals.push.apply(normals, normal);

    lY /= lX;
    lX /= lX;

    uvs = [
      0, 0, 0,
      lX, 0, 0,
      0, lY, 0,
      0, lY, 0,
      lX, 0, 0,
      lX, lY, 0
    ];
    /*uvs = [
      0, 0, 0,
      1, 0, 0,
      0, 1, 0,
      0, 1, 0,
      1, 0, 0,
      1, 1, 0
    ];*/

    return {
      vertices: vertices,
      normals: normals,
      uvs: uvs
    }
  },
  clone: function(shape) {
    var cl = {
      points: shape.points.slice(),
      t: shape.t ? vec3.clone(shape.t) : vec3.fromValues(0, 0, 0),
      r: shape.r ? vec3.clone(shape.r) : vec3.fromValues(0, 0, 0),
      s: shape.s ? vec3.clone(shape.s) : vec3.fromValues(1, 1, 1)
    };

    for(var i in shape) if(!(i in cl) && shape.hasOwnProperty(i)) {
      cl[i] = shape[i];
    }

    return cl;
  },
  /**
   * Translates, rotates and scales the internal
   * transformation representation.
   */
  transform: function(shape, transform) {
    shape.t = shape.t || vec3.fromValues(0, 0, 0);
    shape.r = shape.r || vec3.fromValues(0, 0, 0);
    shape.s = shape.s || vec3.fromValues(1, 1, 1);

    vec3.add(shape.t, shape.t, transform.t || [0, 0, 0]);
    vec3.add(shape.r, shape.r, transform.r || [0, 0, 0]);
    vec3.mul(shape.s, shape.s, transform.s || [1, 1, 1]);

    return shape;
  },
  /**
   * Computes a 4x4 transform matrix from the transform
   * information contained in the shape
   */
  t2m: function(transform) {
    var mat = mat4.create();
    if(transform) {
      var t = transform.t || [0, 0, 0],
          r = transform.r || [0, 0, 0],
          s = transform.s || [1, 1, 1]
      mat4.scale(mat, mat, s);
      mat4.rotateX(mat, mat, r[0]);
      mat4.rotateY(mat, mat, r[1]);
      mat4.rotateZ(mat, mat, r[2]);
      mat4.translate(mat, mat, t);
    }

    return mat;
  },
  /**
   * Picks the next production rule from a
   * discrete probability distribution
   */
  stochastic: function(out, cases) {
    var cdfCases = cases.reduce(function(c, cur) {
          var out = {
            cdfP: (c.length > 0 ? c[c.length - 1].cdfP : 0) + cur.p,
            p: cur.p,
            lhs: cur.lhs,
            rhs: cur.rhs
          }
          c.push(out);
          return c;
        }, []),
        value = Math.random() * cdfCases[cdfCases.length - 1].cdfP;

    var chosen = cdfCases.reduce(function(c, cur) {
      var ret = (value < cur.cdfP && value > cur.cdfP - cur.p) ? cur : c;
      return ret;
    }, null);

    //console.log(chosen.lhs, cdfCases)

    if(chosen.lhs)
      out[chosen.lhs] = chosen.rhs;
  }
};

var ShapeGrammar = function() {
  this.rules = {};
}

ShapeGrammar.prototype.define = function(lhs, rule) {
  this.rules[lhs] = rule;
}

ShapeGrammar.prototype.run = function(lhs, content) {
  var terminals = [],
      rule = this.rules[lhs] || null;

  if(rule === null) return null;
  if(typeof rule === 'function') {
    var prod = rule(SHAPE, content);
    for(var i in prod) {
      if(i in this.rules) {
        terminals.push.apply(terminals, this.run(i, prod[i]));
      } else if(prod[i] instanceof Array) {
        terminals.push.apply(terminals, prod[i]);
      } else {
        terminals.push(prod[i]);
      }
    }
  } else if(typeof rule === 'object') {
    terminals.push(content);
  }

  return terminals;

}

module.exports = ShapeGrammar;
