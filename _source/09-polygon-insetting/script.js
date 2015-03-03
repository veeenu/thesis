/*
 * TODO: Refactor code. This is ugly and unpleasant.
 * Ideally create a `GraphToPolys` module that exports
 * only one function that takes the planar graph as
 * input and returns the collection of polygons and
 * that's it.
 */
(function() {

  var canvas = document.getElementById('canvas'),
      ctx    = canvas.getContext('2d'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  var roads = (function() {
    var g = [], edges = [], S = 5, ident = 0;

    for(var y = 0; y < S; y++) for(var x = 0; x < S; x++) {
      var p = g[y * S + x] = { x: x + Math.random() * .4, y: y + Math.random() * .4, conns: [] };
      if(x > 0) {
        p.conns.push(g[y * S + x - 1]);
        g[y * S + x - 1].conns.push(p);
      }
      if(y > 0) {
        p.conns.push(g[(y - 1) * S + x]);
        g[(y - 1) * S + x].conns.push(p);
      }
    }

    return g;

  }());

  // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
  var pnpoly = function(poly, x, y) {
    var n = poly.length, i, j, c = false, a, b;

    for(i = 0, j = n - 1; i < n; j = i++) {
      a = poly[i];
      b = poly[j];
      if( (a.y > y) !== (b.y > y) &&
          (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) )
        c = !c;
    }
    return c;
  }

  var isOverlapping = function(poly, vertices) {
    for(var i = vertices.length - 1; i--;) {
      if(pnpoly(poly, vertices[i].x, vertices[i].y) && poly.indexOf(vertices[i]) === -1)
        return true;
    }
    return false;
  }

  var isPolyIn = function(poly, polys) {
    for(var i = polys.length - 1; i > 0; i--)
      if(isPolyIn.isEqualPoly(poly, polys[i]))
        return true;
    return false;
  }
  isPolyIn.isEqualPoly = function(a, b) {
    if(a.length !== b.length) return false;

    for(var i = a.length - 1; i--;)
      if(b.indexOf(a[i]) === -1)
        return false;
    return true;
  }

  var traverse = (function() {

    var pi2 = Math.PI * 2;

    return function(edgeA, edgeB, face) {
      var edgeDir = Math.atan2(- edgeB.y + edgeA.y, edgeB.x - edgeA.x),
          nextDir, nextVtx, iol,
          rightmost = { th: Number.POSITIVE_INFINITY, vertex: null };
          
      if(!('traversed' in edgeA))
        edgeA.traversed = [];
      if(!('traversed' in edgeB))
        edgeB.traversed = [];

      edgeA.traversed.push(edgeB);

      for(var i = 0; i < edgeB.conns.length; i++) {
        nextVtx = edgeB.conns[i];

        if(nextVtx === edgeA || edgeB.traversed.indexOf(nextVtx) !== -1 || (face && nextVtx !== face[0] && face.indexOf(nextVtx) !== -1))
          continue;

        nextDir = Math.atan2(- nextVtx.y + edgeB.y, nextVtx.x - edgeB.x) - edgeDir;
        if(nextDir > Math.PI)
          nextDir -= pi2;
        else if(nextDir < - Math.PI)
          nextDir += pi2;
        if(nextDir < rightmost.th) {
          rightmost.th = nextDir;
          rightmost.vertex = edgeB.conns[i];
        }
      }

      if(rightmost.vertex === null)
        return null;

      if(face)
        face.push(edgeB);

      if(face && rightmost.vertex === face[0]) {
        iol = isOverlapping(face, roads);

        if(iol)
          return null;

        edgeB.traversed.push(face[0]);

        return face;
      }

      face = traverse(edgeB, rightmost.vertex, face || [ edgeA, edgeB ]);
      if(face === null) {
        edgeB.traversed.splice(edgeB.traversed.indexOf(rightmost.vertex), 1);
      }

      return face || null;
    }

  }());

  //
  // TODO the following algorithms may be cleaned up a bit
  // since we can assume polygon convexity, which may make
  // a few edge cases impossible.
  //
  // http://alienryderflex.com/polygon_inset/
  var insetPolygon = function(poly, dist) {
    var a, b, c, out = [];

    b = poly[ poly.length - 1 ];

    for(var i = 0; i < poly.length - 1; i++) {
      a = b;
      b = poly[ i ];
      c = poly[ i + 1 ];
      out.push(insetCorner(a, b, c, dist));
    }
    out.push(insetCorner(b, c, poly[ 0 ], dist));

    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.moveTo(out[0].x * 128 + 128, out[0].y * 128 + 128);
    for(var i = 1; i < out.length; i++) {
      ctx.lineTo(out[i % out.length].x * 128 + 128, out[i % out.length].y * 128 + 128);
    }
    ctx.fill();

    return out;
  };
  // a      previous point
  // b      current point
  // c      next point
  // dist   distance
  var insetCorner = function(a, b, c, dist) {
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

    return lineIntersection(
             { x: a.x + insX1, y: a.y + insY1 }, b1,
             b2, { x: c.x + insX2, y: c.y + insY2 }
           );
  }

  // http://alienryderflex.com/intersect/
  var lineIntersection = function(a1, a2, b1, b2) {

    var dist, cos_, sin_, nx, p;

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
  }

  var polys = [];

  for(var i = 0; i < roads.length; i++) for(var j = 0; j < roads[i].conns.length; j++) {
    if(!('traversed' in roads[i]))
      roads[i].traversed = [];
    roads[i].traversed[j] = true;
    var poly = traverse(roads[i], roads[i].conns[j]);
    if(poly === null || isPolyIn(poly, polys))
      continue;
    
    polys.push(poly);
    var col = 'rgb(' + [ Math.random() * 255, Math.random() * 255, Math.random() * 255 ].map(Math.floor).join(',') + ')';
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(128 + poly[0].x * 128, poly[0].y * 128 + 128);
    for(var k = 1; k < poly.length; k++)
      ctx.lineTo(128 + poly[k].x * 128, poly[k].y * 128 + 128);
    ctx.lineTo(128 + poly[0].x * 128, poly[0].y * 128 + 128);
    ctx.fill();
  }

  for(var i = 0; i < polys.length; i++)
    insetPolygon(polys[i], 0.1);

}());
