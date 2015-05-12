var QuadTree = function(x, y, w, limit) {

  this.nw = this.sw = this.ne = this.se = null;

  this.x = x;
  this.y = y;
  this.w = Math.abs(w);
  this.limit = limit;

  this.points = [];
};

QuadTree.prototype.contains = function(el) {
  return (Math.abs(el.x - this.x) < this.w && Math.abs(el.y - this.y) < this.w);
}

QuadTree.prototype.insert = function(el) {
  if(!this.contains(el))
    return false;

  if(this.points.length < this.limit) {
    this.points.push(el);
    return true;
  }

  if(this.nw === null)
    this.subdivide();

  return this.nw.insert(el) ||
         this.ne.insert(el) ||
         this.sw.insert(el) ||
         this.se.insert(el);
}

QuadTree.prototype.subdivide = function() {
  var x = this.x, y = this.y, w = this.w / 2;
  this.nw = new QuadTree(x - w, y - w, w, this.limit);
  this.sw = new QuadTree(x - w, y + w, w, this.limit);
  this.ne = new QuadTree(x + w, y - w, w, this.limit);
  this.se = new QuadTree(x + w, y + w, w, this.limit);
}

QuadTree.prototype.intersect = function(x, y, w) {
  return Math.abs(this.x - x) < this.w + w &&
         Math.abs(this.y - y) < this.w + w;
}

QuadTree.prototype.query = function(x, y, w) {
  var pts = [], cpts = [], tp = this.points;

  if(!this.intersect(x, y, w)) {
    return pts;
  }

  for(var i = 0, I = tp.length; i < I; i++) {
    if(pointInRange(tp[i], x, y, w))
      pts.push(tp[i]);
  }

  if(this.nw === null)
    return pts;

  cpts = this.nw.query(x, y, w);
  for(var i = 0, I = cpts.length; i < I; i++)
    pts.push(cpts[i]);

  cpts = this.ne.query(x, y, w);
  for(var i = 0, I = cpts.length; i < I; i++)
    pts.push(cpts[i]);

  cpts = this.sw.query(x, y, w);
  for(var i = 0, I = cpts.length; i < I; i++)
    pts.push(cpts[i]);

  cpts = this.se.query(x, y, w);
  for(var i = 0, I = cpts.length; i < I; i++)
    pts.push(cpts[i]);

  return pts;
}

var pointInRange = function(el, x, y, w) {
  return Math.abs(el.x - x) < w && Math.abs(el.y - y) < w;
};

module.exports = QuadTree;
