(function() {

  var canvas = document.getElementById('canvas'),
      ctx    = canvas.getContext('2d'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  var EventQueue = function() {
    this.queue = [];
  }

  EventQueue.prototype.put = function(el) {
    this.queue.push(el);
    this.queue.sort(function(a, b) {
      if(a.y > b.y) return -1;
      else if(a.y < b.y) return 1;
      else if(a.x < b.x) return -1;
      return 1;
    })
  }

  EventQueue.prototype.get = function(el) {
    return this.isEmpty() ? null : this.queue.shift();
  }

  EventQueue.prototype.isEmpty = function() {
    return this.queue.length === 0;
  }

  /*var BSTree = function(value, order) {
    this.value = value || null;
    this.order = order || function(a, b) {
      return a < b;
    }
    this.left = this.right = null;
  }

  BSTree.prototype.push = function(obj) {
    if(this.value === null) {
      this.value = obj;
      return;
    }

    if(this.order(obj, this.value)) {
      if(this.left === null)
        this.left = new BSTree(obj, this.order)
      else
        this.left.push(obj);
    } else {
      if(this.right === null)
        this.right = new BSTree(obj, this.order)
      else
        this.right.push(obj);
    }
    //this.balance();

  }

  BSTree.prototype.getDepth = function() {
    if(this.right === this.left === null)
      return 0;
    return Math.max(this.right !== null ? this.right.getDepth() : 0,
                    this.left !== null  ? this.left.getDepth()  : 0) + 1;

  }

  BSTree.prototype.balance = function() {
    var rd = this.right !== null ? this.right.getDepth() : 0,
        ld = this.left !== null ? this.left.getDepth() : 0,
        ld1, rd1;

    if(ld > rd + 1) {
      ld1 = this.left.left !== null  ? this.left.left.getDepth() : 0;
      rd1 = this.left.right !== null ? this.left.right.getDepth() : 0;
      if(ld1 < rd1)
        this.left.rotR();
      this.rotL();
    } else if(rd > ld + 1) {
      ld1 = this.right.left !== null  ? this.right.left.getDepth() : 0;
      rd1 = this.right.right !== null ? this.right.right.getDepth() : 0;
      if(ld1 > rd1)
        this.right.rotL();
      this.rotR();
    }
  }

  BSTree.prototype.rotL = function() {
    var oldval = this.value,
        oldr   = this.right;
    this.value = this.left.value;
    this.right = this.left;
    this.left = this.left.left;
    this.right.left = this.right.right;
    this.right.right = oldr;
    this.right.value = oldval;
  }

  BSTree.prototype.rotR = function() {
    var oldval = this.value,
        oldl   = this.left;
    this.value = this.right.value;
    this.left = this.right;
    this.right = this.right.right;
    this.left.right = this.left.left;
    this.left.left = oldl;
    this.left.value = oldval;
  }

  BSTree.prototype.render = function(x, y, ctx) {
    var nx, ny;
    ctx.fillText(this.toString(), x, y);
    if(this.left) {
      nx = x - 8 * this.getDepth();
      ny = y + 16;
      this.left.render(nx, ny, ctx);
      ctx.moveTo(x,y)
      ctx.lineTo(nx,ny);
    }
    if(this.right) {
      nx = x + 8 * this.getDepth();
      ny = y + 16;
      this.right.render(nx, ny, ctx);
      ctx.moveTo(x,y)
      ctx.lineTo(nx,ny);
    }
  }

  BSTree.prototype.pushArc = function(obj) {
    if(this.value === null) {
      this.value = obj;
      return;
    }

    if(this.order(obj, this.value)) {
      if(this.left === null)
        this.left = new BSTree(obj, this.order)
      else
        this.left.pushArc(obj);
    } else {
      if(this.right === null)
        this.right = new BSTree(obj, this.order)
      else
        this.right.pushArc(obj);
    }
    //this.balance();

  }

  BSTree.prototype.searchArc = function(obj) {
    if(this.order(obj, this.value) < 0) {
      if(this.left === null)
        return this;
      else
        return this.left.searchArc(obj);
    } else {
      if(this.right === null)
        return this;
      else
        return this.right.searchArc(obj);
    }
  }

  BSTree.prototype.toString = function() {
    if('ax' in this.value) {
      return '<' + this.value.ax+','+this.value.ay +
             ';' + this.value.bx+','+this.value.by + '>'
    } else {
      return this.value.x + ',' + this.value.y
    }
  }*/

  var Tree = function(site) {
    this.site   = site;
    this.isLeaf = site !== null;
    this.cevt   = null;
    this.edge   = null;
    this.parent = null;
    this._left   = null;
    this._right  = null;
  }

  Tree.prototype = {
    constructor: Tree,
    get left() {
      return this._left;
    },
    get right() {
      return this._right;
    },
    set left(el) {
      this._left = el;
      this._left.parent = this;
    },
    set right(el) {
      this._right = el;
      this._right.parent = this;
    }
  }

  Tree.prototype.search = function(px, py) {
    var a = this, x = 0;

    while(!a.isLeaf) {
      x = this.getEdge(a, py);
      if(x > px)
        a = a.left;
      else
        a = a.right;
    }
    return a;
  }

  Tree.prototype.getEdge = function(a, y) {
    var l = this.getLeftChild().site,
        r = this.getRightChild().site,
        dp, a, b, c, x1, x2;

    dp = 2 * (l.y - y);
    a  =  1 / dp,
    b  = -2 * l.x / dp,
    c  = y + dp / 4 + l.x * l.x / dp;

    dp = 2 * (r.y - y);
    a -=  1 / dp,
    b -= -2 * r.x / dp,
    c -= y + dp / 4 + r.x * r.x / dp;

    dp = b * b - 4 * a * c;

    x1 = ( -b + Math.sqrt(dp) ) / ( 2 * a );
    x2 = ( -b - Math.sqrt(dp) ) / ( 2 * a );

    return (l.y < r.y) ?
      Math.max(x1, x2) : Math.min(x1, x2);
  }

  Tree.prototype.getLeftChild = function() {
    if(!this.left)
      return null;
    var a = this.left;
    while(!a.isLeaf)
      a = a.right;
    return a;
  }

  Tree.prototype.getRightChild = function() {
    if(!this.right)
      return null;
    var a = this.right;
    while(!a.isLeaf)
      a = a.left;
    return a;
  }

  Tree.prototype.getLeftParent = function() {
    var p = this.parent,
        last = this;
    while(p.left === last) {
      if(!p.parent)
        return null;
      last = p;
      p = p.parent;
    }
    return p;
  }

  Tree.prototype.getRightParent = function() {
    var p = this.parent,
        last = this;
    while(p.right === last) {
      if(!p.parent)
        return null;
      last = p;
      p = p.parent;
    }
    return p;
  }

  Tree.prototype.getY = function(x, y) {
    var dp =  2 * (this.site.y - y),
        a  =  1 / dp,
        b  = -2 * this.site.x / dp,
        c  = y + dp / 4 + x * x / dp;
    return a * x * x + b * x + c;
  }
 
  var Voronoi = function(points) {
    // 1. Initialize the event queue `q` with all site events,
    //    initialize an empty status structure `t` and an empty
    //    doubly-connceted edge list `d`.
    var q = new EventQueue(),
        t = null,
        d = [],
        checkCircle = function(tree, evt) {
          var lp = tree.getLeftParent(),
              rp = tree.getRightParent(),
              a  = lp && lp.getLeftChild(),
              c  = rp && rp.getRightChild();

          if(!a || !c || a.site == c.site) return;

          var s = (function(a, b) {
            var af  = (a.right.x - a.left.x) / (a.left.y - a.right.y),
                ag  = a.y - af * a.x,
                adx = a.right.y - a.left.y,
                ady = a.left.x - a.right.x,
                bf = (b.right.x - b.left.x) / (b.left.y - b.right.y),
                bg = b.y - bf * b.x,
                bdx = b.right.y - b.left.y,
                bdy = b.left.x - b.right.x,
                x = (bg - ag) / (bf - af),
                y = af * x + ag;

            if( (x - a.x) / adx < 0 ||
                (y - a.y) / ady < 0 ||
                (x - b.x) / bdx < 0 ||
                (y - b.y) / bdy < 0 ) return null;

            return { x: x, y: y };
          }(lp.edge, rp.edge));

          if(s === null) return;

          var dx = a.site.x - s.x,
              dy = a.site.y - s.y,
              d  = Math.sqrt(dx * dx + dy * dy);

          if(s.y - d >= evt.y) return;
          tree.cevt = { x: s.x, y: s.y - d, deleted: false, arch: tree, type: 'circle' };
          q.put(tree.cevt);
        };

    points.forEach(function(p) {
      q.put({
        x: p.x,
        y: p.y,
        type: 'site'
      });
    });

    while(!q.isEmpty()) {
      var evt = q.get();
      console.log(evt);
      if(evt.type === 'site') {
        if(t === null) {
          t = new Tree(evt);
          continue;
        }

        if(t.isLeaf && t.site.y - evt.y < 1) {
          t.isLeaf = false;
          t.left  = new Tree(t.site); //t.left.parent  = t;
          t.right = new Tree(evt);    //t.right.parent = t;
          t.edge = { 
            x: (t.site.x + evt.x) / 2, y: h,
            left: evt.x < t.site.x ? evt : t.site,
            right: evt.x < t.site.x ? t.site : evt
          };
          d.push(t.edge);
          continue;
        }

        var alpha = t.search(evt.x, evt.y);

        if(alpha.cevt)
          alpha.cevt.deleted = true;

        var p = { x: evt.x, y: alpha.getY(evt.x, evt.y) },
            el = {
              x: p.x, y: p.y,
              left: alpha.site,
              right: evt
            },
            er = {
              x: p.x, y: p.y,
              right: alpha.site,
              left: evt
            };
        el.neigh = er;
        d.push(el);

        alpha.edge = er;
        alpha.isLeaf = false;
        alpha.right = new Tree(alpha.site); //alpha.right.parent = alpha;
        alpha.left = new Tree(null); //alpha.left.parent = alpha;
        alpha.left.edge = el;
        alpha.left.left = new Tree(alpha.site); //alpha.left.left.parent = alpha.left;
        alpha.left.right = new Tree(evt); //alpha.right.right.parent = alpha.right;

        checkCircle(alpha.left.left, evt);
        checkCircle(alpha.right, evt);

      } else if(!evt.deleted) {
        var xl = evt.arch.getLeftParent(),
            xr = evt.arch.getRightParent(),
            p0 = xl.getLeftChild(),
            p1 = evt.arch,
            p2 = xr.getRightChild();
        if(p0.cevt)
          p0.cevt.deleted = true;
        if(p1.cevt)
          p1.cevt.deleted = true;

        var p = { x: evt.x, y: p1.getY(evt.x, evt.y) };
        xl.edge.end = xr.edge.end = p;

        var topmost, par = p;
        while(par !== t) {
          par = par.parent;
          if(par === xl) topmost = xl;
          if(par === xr) topmost = xr;
        }

        topmost.edge = {
          x: p.x, y: p.y,
          left: p0.site,
          right: p2.site
        };

        d.push(topmost.edge);

        var gp = p1.parent.parent;
        if(p1.parent.left === p1) {
          if(gp.left === p1.parent)
            gp.left = p1.parent.right;
          else if(gp.right === p1.parent)
            gp.right = p1.parent.right;
        } else {
          if(gp.left === p1.parent)
            gp.left = p1.parent.left;
          else if(gp.right === p1.parent)
            gp.right = p1.parent.left;
        }

        checkCicle(p0, evt);
        checkCicle(p2, evt);
      }
    }
  
  }

  Voronoi.cmp = function(a, b) {
    if(a.x > b.x) return -1;
    return 1;
  }

  var points = [ ];
  ctx.clearRect(0, 0, w, h);

  for(var i = 0; i < 16; i++) {
    var p = {
      x: parseInt(Math.random() * w),
      y: parseInt(Math.random() * h)
    };

    points.push(p);

    ctx.beginPath();
    ctx.fillRect(p.x-1, p.y-1, 3, 3);
    ctx.closePath();
  }

  Voronoi(points)

  /*var bst = new BSTree();
  bst.order = function(a, b) {
    return a < b;
  }

  for(var i = 16; i > 0; i--)
    bst.push(i);
  console.log(bst);
  console.log(bst.getDepth());
  ctx.beginPath();
  bst.render(w / 2, 16, ctx)
  ctx.closePath();
  ctx.stroke();*/

}());
