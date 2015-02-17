(function() {

  var canvas = document.getElementById('canvas'),
      ctx    = canvas.getContext('2d'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  var LSystem = function(productions) {
    this.productions = productions;
  }

  LSystem.prototype.set = function(axiom) {
    this.content = axiom;
  }

  LSystem.prototype.run = function() {
    var nextContent = '';
    for(var i = 0, ch = this.content[0]; i < this.content.length; i++, ch = this.content[i])
      nextContent += (ch in this.productions) ? this.productions[ch] : ch;
    this.content = nextContent;
  
  }

  LSystem.prototype.render = function(methods, scope) {
    scope = scope || {};

    for(var i = 0, ch = this.content[0]; i < this.content.length; i++, ch = this.content[i])
      if(ch in methods)
        methods[ch].call(scope);
  }

  var ls = new LSystem({
    'X': 'F-[[X]+X]+F[+FX]-X',
    'F': 'FF'
  });

  ls.set('X');
  ls.run();
  ls.run();
  ls.run();
  ls.run();
  ls.run();

  ctx.strokeStyle = 'red';
  ctx.moveTo(w / 4, h);
  var drawFn = function() {
    this.stack[0].x += Math.cos(this.stack[0].theta) * this.radius;
    this.stack[0].y += Math.sin(this.stack[0].theta) * this.radius;
    ctx.lineTo(this.stack[0].x, this.stack[0].y);
  }

  ls.render({
    '-': function() {
      this.stack[0].theta -= this.theta;
    },
    '+': function() {
      this.stack[0].theta += this.theta;
    },
    '[': function() {
      this.stack.unshift({
        x: this.stack[0].x,
        y: this.stack[0].y,
        theta: this.stack[0].theta,
      });
    },
    ']': function() {
      this.stack.shift();
      ctx.moveTo(this.stack[0].x, this.stack[0].y);
    },
    'A': drawFn,
    'E': drawFn,
    'F': drawFn
  }, {
    stack: [ { x: w / 4, y: h, theta: -Math.PI / 2 } ],
    theta: Math.PI / 8,
    radius: 8
  });
  ctx.stroke();

  ctx.moveTo(w * 5 / 7, h);
  ls.render({
    '-': function() {
      this.stack[0].theta -= this.theta;
    },
    '+': function() {
      this.stack[0].theta += this.theta;
    },
    '[': function() {
      this.stack.unshift({
        x: this.stack[0].x,
        y: this.stack[0].y,
        theta: this.stack[0].theta,
      });
    },
    ']': function() {
      this.stack.shift();
      ctx.moveTo(this.stack[0].x, this.stack[0].y);
    },
    'A': drawFn,
    'E': drawFn,
    'F': drawFn
  }, {
    stack: [ { x: w * 5 / 7, y: h, theta: -Math.PI / 2 } ],
    theta: Math.PI / 2,
    radius: 8
  });
  ctx.stroke();

  ctx.fillStyle = 'black';
  ctx.font = '24pt Ubuntu';
  ctx.fillText("Θ = 22.5deg, r = 8px", 64, 64);
  ctx.fillText("Θ = 90deg, r = 8px", 64 + w / 2, 64);

}());
