var canvas = document.querySelector('canvas'),
    ctx    = canvas.getContext('2d'),
    bcr    = canvas.getBoundingClientRect(),
    w      = bcr.width,
    h      = bcr.height;

canvas.width = w;
canvas.height = h;

var QuadTree = function(x, y, w) {

  this.nw = this.sw = this.ne = this.se = null;

  this.x = x;
  this.y = y;
  this.w = w;

  this.points = [];
};

QuadTree.prototype.contains = function(el) {
  return (Math.abs(el.x - this.x) < this.w && Math.abs(el.y - this.y) < this.w);
}

QuadTree.prototype.insert = function(el) {
  if(!this.contains(el))
    return false;

  if(this.points.length < 32) {
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
  this.nw = new QuadTree(x - w, y - w, w);
  this.sw = new QuadTree(x - w, y + w, w);
  this.ne = new QuadTree(x + w, y - w, w);
  this.se = new QuadTree(x + w, y + w, w);
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

var drawTree = function(tree, fs) {
  //fs = fs || 'rgba(' + [1,2,3].map(Math.random).map(function(i) { return ~~(i * 255); }) + ',1)';
  ctx.fillStyle = fs;
  ctx.strokeStyle = fs;
  ctx.strokeRect(tree.x - tree.w, tree.y - tree.w, tree.w * 2, tree.w * 2);

  tree.points.forEach(function(i) {
    ctx.fillRect(i.x - 1, i.y - 1, 3, 3);
  });

  if(tree.nw !== null) {
    drawTree(tree.nw);
    drawTree(tree.ne);
    drawTree(tree.sw);
    drawTree(tree.se);
  }
}

var qt = new QuadTree(512, 512, 512);

for(var i = 0; i < 20000; i++)
  qt.insert({ x: Math.random() * 1024, y: Math.random() * 1024 });

console.time('draw')
drawTree(qt, '#aaa');
console.timeEnd('draw')

var bg = ctx.getImageData(0, 0, 1024, 1024);

ctx.fillStyle = '#00F';

canvas.addEventListener('mousemove', function(evt) {

  ctx.putImageData(bg, 0, 0);
  console.time('query');
  var arr = qt.query(evt.clientX - bcr.left, evt.clientY - bcr.top, 64);
  console.timeEnd('query');
  console.log(arr.length);
  arr.forEach(function(i) {
    ctx.fillRect(i.x - 1, i.y - 1, 3, 3);
  });

});

console.profile('query');
qt.query(123, 123, 64);
console.profileEnd();
