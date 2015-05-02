var PRNG = new (require('PRNG')),
    Geom = require('Geom'),
    ShapeGrammar = require('ShapeGrammar');

var lerp = function(a, b, t) { return (1 - t) * a + t * b; }

// Inspired to https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf
var subdivideStrip = function(block, strip) {
  var points = [], quads = [], i1, i2, i3, 
      b1, b2, dx, dy, i, j, m, n, p, len,
      lots = [];

  for(i = 0, n = block.length; i < n; i++) {
    i1 = (i + 1) % n;
    i2 = (i + 2) % n;
    i3 = (i - 1 + n) % n;
    b1 = Geom.lineIntersection(block[i], block[i1],
                          strip[i3], strip[i]);
    b2 = Geom.lineIntersection(block[i], block[i1],
                          strip[i1], strip[i2]);
    dx = b1.x - b2.x;
    dy = b1.y - b2.y;
    len = Math.sqrt(dx * dx + dy * dy);
    m = ~~(PRNG.random() * 3 + 1);
    if(len < 0.35)
      m = 1;
    else if(len < .6)
      m = Math.min(m, 2);
    else if(len < .8)
      m = Math.min(m, 3);

    quads.push(m + 1);

    for(j = 0; j <= m; j++) {
      var jm = j / m;
      px1 = lerp(b1.x, b2.x, jm);
      py1 = lerp(b1.y, b2.y, jm);
      px2 = lerp(strip[i].x, strip[i1].x, jm);
      py2 = lerp(strip[i].y, strip[i1].y, jm);
      points.push(
        { x: lerp(b1.x, b2.x, jm), y: lerp(b1.y, b2.y, jm) },
        { x: lerp(strip[i].x, strip[i1].x, jm), y: lerp(strip[i].y, strip[i1].y, jm) }
      );
    }
  }
  points.push(points[0]);

  for(i = 0, n = block.length; i < n; i++) {
    p = [];
    for(j = 0; j < quads[i]; j++) {
      p.push(points.shift());
      p.push(points.shift());
    }
    p.push(block[(i + 1) % n]);
    p.push(points[0] || block[0]);
    for(var k = 0, m = p.length; k < m - 2; k+= 2) {
      lots.push(new Building(
        [p[k], p[(k + 1) % m], p[(k + 3) % m], p[(k + 2) % m]], 
        PRNG.random() + .5 
      ));
    }
  }

  return lots;
}

var Building = function(poly, height) {
  this.poly = poly;
  this.height = height;

}

var Block = function(poly, seed) {
  PRNG.seed(seed);
  this.poly = poly;
  this.block = Geom.insetPolygon(this.poly, 0.05);
  this.lots = subdivideStrip(Geom.insetPolygon(this.block, 0.1), Geom.insetPolygon(this.block, 0.4));

  var cd = poly.reduce(function(o, i) {
  
    o.cx += i.x;
    o.cy += i.y;

    if(o.xm > i.x)
      o.xm = i.x;
    if(o.xM < i.x)
      o.xM = i.x;
    if(o.ym > i.y)
      o.ym = i.y;
    if(o.yM < i.y)
      o.yM = i.y;

    return o;

  }, { 
    xm: Number.POSITIVE_INFINITY, 
    ym: Number.POSITIVE_INFINITY, 
    xM: Number.NEGATIVE_INFINITY, 
    yM: Number.NEGATIVE_INFINITY, 
    cx: 0, cy: 0
  });

  this.x = cd.cx / poly.length;
  this.y = cd.cy / poly.length;
  this.w = Math.max(Math.abs(cd.xM - cd.xm), Math.abs(cd.yM - cd.ym));
}

module.exports = Block;
