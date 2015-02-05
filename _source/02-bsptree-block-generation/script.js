(function() {

  var canvas = document.getElementById('canvas'),
      ctx    = canvas.getContext('2d'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  var BSPTree = function(x, y, w, h) {
    this.left = this.right = null;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  BSPTree.prototype.split = function() {
    if(this.left !== null || this.right !== null)
      return;

    // 0 = horizontal, 1 = vertical
    var direction =  (Math.random() > 0.5 ? 0 : 1),
        split = 0.5 / Math.round(1 + Math.random() * 4) + 0.25;
    if(this.w > this.h && this.h / this.w >= 0.05)
      direction = 1;
    else if(this.h > this.w && this.w / this.h >= 0.05)
      direction = 0;

    if(direction === 0) {
      this.left  = new BSPTree(this.x, this.y,                  this.w, this.h  * split);
      this.right = new BSPTree(this.x, this.y + this.h * split, this.w, this.h  * (1 - split));
    } else {
      this.left  = new BSPTree(this.x,                  this.y, this.w * split, this.h);
      this.right = new BSPTree(this.x + this.w * split, this.y, this.w * (1 - split), this.h);
    }

    if(Math.min(this.w, this.h) > 256) {
      this.left.split();
      this.right.split();
    } else {
      // Shrink blocks
      this.right.x += 16;
      this.right.y += 16;
      this.right.w -= 32;
      this.right.h -= 32;
      this.left.x += 16;
      this.left.y += 16;
      this.left.w -= 32;
      this.left.h -= 32;
      this.left.createBuildings();
      this.right.createBuildings();
    }

  }

  /**
   * Idea: let `minW` be the minimum width of a building.
   * Let `side` be the length of each of the four sides of
   * the block. Split `side` in up to `side / minW` equal parts,
   * then displace them randomly. Make a rectangle out of each of
   * the resulting segments, paying attention to the angles.
   * Packing problem?
   */
  BSPTree.prototype.createBuildings = function() {
    var minW = 64, size, buildings = {
      north: {
        count: 1 + Math.floor(Math.random() * this.w / minW),
        sizes: [ 0 ]
      },
      west: {
        count: 1 + Math.floor(Math.random() * this.h / minW),
        sizes: [ 0 ]
      },
      south: {
        count: 1 + Math.floor(Math.random() * this.w / minW),
        sizes: [ 0 ]
      },
      east: {
        count: 1 + Math.floor(Math.random() * this.h / minW),
        sizes: [ 0 ]
      },
    };

    BSPTree.partitionUnit(buildings.north.count, buildings.north.sizes);
    BSPTree.partitionUnit(buildings.west.count, buildings.west.sizes);
    BSPTree.partitionUnit(buildings.south.count, buildings.south.sizes);
    BSPTree.partitionUnit(buildings.east.count, buildings.east.sizes);

    this.buildings = buildings;
  }

  BSPTree.partitionUnit = function(parts, out) {
    var size = 1 / parts;
    for(var i = 0; i < parts; i++) {
      out[i] = size;
    }
    for(var i = 0; i < parts - 1; i++) {
      var displ = size * Math.random() * 0.5;
      out[i] += displ;
      out[i + 1] -= displ;
    }

    return out;
  
  }

  BSPTree.prototype.render = function(ctx) {
    if(this.left !== null || this.right !== null) {
      this.left.render(ctx);
      this.right.render(ctx);
    } else {
      ctx.fillStyle = '#666';
      ctx.fillRect(this.x, this.y, this.w, this.h);
      var disp = 0, size;
      for(var i = 0; i < this.buildings.north.count; i++) {
        size = this.buildings.north.sizes[i] * this.w;
        ctx.fillStyle = (i % 2 === 0 ? 'green' : 'red');
        ctx.fillRect(this.x + disp, this.y, size, 16);
        disp += size;
      }
      disp = 0;
      for(var i = 0; i < this.buildings.west.count; i++) {
        size = this.buildings.west.sizes[i] * this.h;
        ctx.fillStyle = (i % 2 === 0 ? 'yellow' : 'blue');
        ctx.fillRect(this.x, this.y + disp, 16, size);
        disp += size;
      }
      disp = 0;
      for(var i = 0; i < this.buildings.south.count; i++) {
        size = this.buildings.south.sizes[i] * this.w;
        ctx.fillStyle = (i % 2 === 0 ? 'green' : 'red');
        ctx.fillRect(this.x + disp, this.y + this.h - 16, size, 16);
        disp += size;
      }
      disp = 0;
      for(var i = 0; i < this.buildings.east.count; i++) {
        size = this.buildings.east.sizes[i] * this.h;
        ctx.fillStyle = (i % 2 === 0 ? 'yellow' : 'blue');
        ctx.fillRect(this.x + this.w - 16, this.y + disp, 16, size);
        disp += size;
      }
    }
  }

  var size = Math.min(w,h), tree = new BSPTree(0, 0, size, size);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  tree.split();
  tree.render(ctx);

}());
