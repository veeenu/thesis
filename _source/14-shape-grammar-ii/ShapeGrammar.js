(function() {

  var Geom = {
    // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
    pnpoly: function(poly, x, y) {
      var n = poly.length, i, j, c = false, a, b;

      for(i = 0, j = n - 1; i < n; j = i++) {
        a = poly[i];
        b = poly[j];
        if( (a.y > y) !== (b.y > y) &&
            (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) )
          c = !c;
      }
      return c;
    },
    isOverlapping: function(poly, vertices) {
      for(var i = vertices.length - 1; i--;) {
        if(Geom.pnpoly(poly, vertices[i].x, vertices[i].y) && poly.indexOf(vertices[i]) === -1)
          return true;
      }
      return false;
    },
    isPolyIn: function(poly, polys) {
      for(var i = polys.length - 1; i > 0; i--)
        if(Geom.isEqualPoly(poly, polys[i]))
          return true;
      return false;
    },
    isEqualPoly: function(a, b) {
      if(a.length !== b.length) return false;

      for(var i = a.length - 1; i--;)
        if(b.indexOf(a[i]) === -1)
          return false;
      return true;
    },
    insetPolygon: function(poly, dist) {
      var a, b, c, out = [];

      b = poly[ poly.length - 1 ];

      for(var i = 0; i < poly.length - 1; i++) {
        a = b;
        b = poly[ i ];
        c = poly[ i + 1 ];
        out.push(Geom.insetCorner(a, b, c, dist));
      }
      out.push(Geom.insetCorner(b, c, poly[ 0 ], dist));

      return out;
    },
    // a      previous point
    // b      current point
    // c      next point
    // dist   distance
    insetCorner: function(a, b, c, dist) {
      var dx1 = b.x - a.x, dy1 = a.y - b.y,
          dx2 = c.x - b.x, dy2 = b.y - c.y,
          dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1),
          dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2),
          insX1, insX2, insY1, insY2, insp,
          b1 = { x: b.x, y: b.y },
          b2 = { x: b.x, y: b.y };

      if(dist1 == 0 || dist2 == 0)
        return null;

      insX1 = dy1 / dist1 * dist;
      insY1 = dx1 / dist1 * dist;
      insX2 = dy2 / dist2 * dist;
      insY2 = dx2 / dist2 * dist;

      b1.x += insX1; b1.y += insY1;
      b2.x += insX2; b2.y += insY2;

      if(b1.x === b2.x && b1.y === b2.y)
        return b1;

      return Geom.lineIntersection(
               { x: a.x + insX1, y: a.y + insY1 }, b1,
               b2, { x: c.x + insX2, y: c.y + insY2 }
             );
    },
    // http://alienryderflex.com/intersect/
    lineIntersection: function(A1, A2, B1, B2) {

      var dist, cos_, sin_, nx, p,
          a1 = { x: A1.x, y: A1.y },
          a2 = { x: A2.x, y: A2.y },
          b1 = { x: B1.x, y: B1.y },
          b2 = { x: B2.x, y: B2.y };

      // Translate by -a1
      a2.x -= a1.x; b1.x -= a1.x; b2.x -= a1.x;
      a2.y -= a1.y; b1.y -= a1.y; b2.y -= a1.y;
      
      dist = Math.sqrt(a2.x * a2.x + a2.y * a2.y);

      // Rotate so a2 lies on the positive x axis
      cos_ = a2.x / dist;
      sin_ = a2.y / dist;

      nx   =   b1.x * cos_ + b1.y * sin_;
      b1.y = - b1.x * sin_ + b1.y * cos_; b1.x = nx; 
      nx   =   b2.x * cos_ + b2.y * sin_;
      b2.y = - b2.x * sin_ + b2.y * cos_; b2.x = nx; 

      // Parallel lines
      if(b1.y == b2.y)
        return null;

      p = b2.x + (b1.x - b2.x) * b2.y / (b2.y - b1.y);

      return { x: a1.x + p * cos_, y: a1.y + p * sin_ };
    },
    triToNormal: function(points) {
      var vA = vec3.fromValues.apply(vec3, points.slice(3,6)),
          vB = vec3.fromValues.apply(vec3, points.slice(0,3)),
          vC = vec3.fromValues.apply(vec3, points.slice(6,9)),
          norm = vec3.create();
      vec3.sub(vB, vB, vA);
      vec3.sub(vC, vC, vA);
      vec3.cross(norm, vB, vC);
      vec3.normalize(norm, norm);
      return norm;
    }

  }

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

      return {
        vertices: vertices,
        normals: normals
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
          vertices, normals;

      vec3.sub(sA, a, b);
      vec3.sub(sB, c, b);
      vec3.cross(normal, sA, sB);

      vertices = [a, b, c, b, c, d].reduce(function(out, v) {
        out.push.apply(out, v);
        return out;
      }, []);

      normals = [];
      for(var i = 6; i--;) normals.push.apply(normals, normal);

      return {
        vertices: vertices,
        normals: normals
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

  window.ShapeGrammar = ShapeGrammar;

}());

/**
 * `points` assumption:
 * - clockwise order
 * - all points coplanar
 * - >= 3 points
 */
var shg = new ShapeGrammar();

shg.define('Lot', function(SHAPE, lot) {
  
  var out = {};
  SHAPE.stochastic(out, [
    { p: .33, lhs: 'Floor', rhs: SHAPE.transform({ points: lot.points_circle.slice(), count: 8 }, lot) },
    { p: .33, lhs: 'Floor', rhs: SHAPE.transform({ points: lot.points_horseshoe.slice(), count: 8 }, lot) },
    { p: .33, lhs: 'Floor', rhs: SHAPE.transform({ points: lot.points_quad.slice(), count: 8 }, lot) }
  ]);

  return out;
    
});

shg.define('Floor', function(SHAPE, floor) {

  floor.count--;
  var out = {
    't0': SHAPE.extrude(floor, .5),
    't1': SHAPE.face(floor),
    't2': SHAPE.face(SHAPE.transform(SHAPE.clone(floor), { t: [0, .5, 0] }))
  };

  if(floor.count > 0)
    SHAPE.stochastic(out, [
      { p: .4, lhs: 'Floor', rhs: SHAPE.transform(SHAPE.clone(floor), { t: [0, .5, 0] }) },
      { p: .3, lhs: 'Floor', rhs: SHAPE.transform(SHAPE.inset(floor, .1), { t: [0, .5, 0] }) },
      { p: .3, lhs: null }
    ]);

  return out;
});

var shgResult = [];

for(var x = -8; x < 8; x++)
  for(var y = -16; y < 0; y++) {
    shgResult.push.apply(shgResult, shg.run('Lot', { 
      t: [x * 1.5, 0, y * 1.5], r: [0, 0, 0], s: [1, 1, 1],
      points_circle: (function() {
        var arr = [];

        for(var r = 0, n = 16; r < n; r++) {
          var ang = r * Math.PI * 2 / n;
          arr.push(.5 + .5 * Math.cos(ang), 0, -.5 + .5 * Math.sin(ang));
        }
        return arr;
      }()),
      points_horseshoe: [ 0, 0, 0,  0, 0, -2,  3, 0, -2,  3, 0, 0,  2, 0, 0,  2, 0, -1,  1, 0, -1,  1, 0, 0 ].map(function(i) { return i / 3 }),
      points_quad: [ 0, 0, 0, 0, 0, -1, 1, 0, -1, 1, 0, 0 ]
    }));
  }

console.log(shgResult);
