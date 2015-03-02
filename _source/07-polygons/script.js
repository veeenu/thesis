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
      //gl     = canvas.getContext('webgl'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;
  //gl.viewport(0, 0, w, h);

  var roads = (function() {
    var g = [], edges = [], S = 16, ident = 0;

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
      //var face = [ edgeB ],
      var edgeDir = Math.atan2(- edgeB.y + edgeA.y, edgeB.x - edgeA.x),
          nextDir, nextVtx, iol,
          rightmost = { th: Number.POSITIVE_INFINITY, vertex: null };
          
      if(!('traversed' in edgeA))
        edgeA.traversed = [];
      if(!('traversed' in edgeB))
        edgeB.traversed = [];

      edgeA.traversed.push(edgeB);

      //console.log('From  ', edgeA.x.toFixed(0), edgeA.y.toFixed(0), '->', edgeB.x.toFixed(0), edgeB.y.toFixed(0));

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
        //console.log(' ', nextDir.toFixed(2), nextVtx.x.toFixed(0), nextVtx.y.toFixed(0));

      }

      if(rightmost.vertex === null)
        return null;

      if(face)
        face.push(edgeB);

      if(face && rightmost.vertex === face[0]) {
        iol = isOverlapping(face, roads);
        //console.log('Closed', face, iol)

        if(iol)
          return null;

        edgeB.traversed.push(face[0]);

        return face;
      }

      //console.log('Θ', rightmost.th.toFixed(2), rightmost.vertex.x.toFixed(0), rightmost.vertex.y.toFixed(0));

      face = traverse(edgeB, rightmost.vertex, face || [ edgeA, edgeB ]);
      if(face === null) {
        edgeB.traversed.splice(edgeB.traversed.indexOf(rightmost.vertex), 1);
      }

      return face || null;
    }

  }());

  var polys = [];

  for(var i = 0; i < roads.length; i++) for(var j = 0; j < roads[i].conns.length; j++){
    setTimeout((function(roads, i, j) { return function() {
      if(!('traversed' in roads[i]))
        roads[i].traversed = [];
      roads[i].traversed[j] = true;
      var poly = traverse(roads[i], roads[i].conns[j]);
      if(poly === null || isPolyIn(poly, polys))
        return; //roads[i].traversed[j] = null;
      
      polys.push(poly);
      var col = 'rgb(' + [ Math.random() * 255, Math.random() * 255, Math.random() * 255].map(Math.floor).join(',') + ')';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(32 + poly[0].x * 32, poly[0].y * 32 + 32);
      for(var k = 1; k < poly.length; k++)
        ctx.lineTo(32 + poly[k].x * 32, poly[k].y * 32 + 32);
      ctx.lineTo(32 + poly[0].x * 32, poly[0].y * 32 + 32);
      ctx.fill();
    }}(roads, i, j)), (i + j) * 20);
  }

  ctx.strokeStyle = 'red'
  ctx.beginPath();
  for(var i = 0; i < roads.length; i++)
    for(var j = 0; j < roads[i].conns.length; j++) {
      ctx.moveTo(32 + 32 * roads[i].x, 32 * roads[i].y + 32);
      ctx.lineTo(32 + 32 * roads[i].conns[j].x, 32 * roads[i].conns[j].y + 32);
    }
  ctx.stroke();

}());
