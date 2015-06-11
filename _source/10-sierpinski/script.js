(function() {

  var canvas = document.getElementById('canvas'),
      ctx    = canvas.getContext('2d'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  var ShapeGrammar = function(symbols, prods) {
    this.symbols = symbols;
    this.prods = prods;
    this.state = null;
  }

  ShapeGrammar.prototype.axiom = function(axiom) {
    this.state = [{
      sym:   axiom,
      bound: [0, 0, 1, 1]
    }];
    return this;
  }

  ShapeGrammar.prototype.run = function() {
    var newState = [], prod;

    for(var i = 0; i < this.state.length; i++) {
      prod = this.prods[this.state[i].sym];
      for(var j = 0; j < prod.length; j++) {
        newState.push({
          sym: prod[j].sym,
          bound: ShapeGrammar.subBound(this.state[i].bound, prod[j].bound)
        })
      }
    }
    this.state = newState;

    return this;
  }

  ShapeGrammar.prototype.draw = function(bounds) {
    for(var i = 0; i < this.state.length; i++) {
      var sym    = this.symbols[this.state[i].sym],
          points = [], a, b, c;
      for(var j = 0; j < sym.points.length; j++) {
        a = this.state[i].bound[j % 2];
        b = this.state[i].bound[j % 2 + 2] - a;
        c = (a + b * sym.points[j]);
        points[j] = (j % 2 === 0) ? 
          bounds.x + c * bounds.width
          :
          bounds.y + c * bounds.height;
      }
      sym.draw.call(sym, ctx, points);
    }
  }

  ShapeGrammar.subBound = function(outer, inner) {
    return [
      outer[0] + (outer[2] - outer[0]) * inner[0],
      outer[1] + (outer[3] - outer[1]) * inner[1],
      outer[0] + (outer[2] - outer[0]) * inner[2],
      outer[1] + (outer[3] - outer[1]) * inner[3]
    ]

  }

  var sierpinski = new ShapeGrammar(
    {
      'A': {
        points: [ 0, 1, 1, 1, .5, 0 ],
        draw: function(ctx, points) {
          ctx.beginPath();
          ctx.moveTo(points[0], points[1]);
          ctx.lineTo(points[2], points[3]);
          ctx.lineTo(points[4], points[5]);
          ctx.closePath();
          ctx.fill();
        }
      }
    },
    {
      'A': [
        { sym: 'A', bound: [ .25,   0, .75,  .5] },
        { sym: 'A', bound: [   0,  .5,  .5,   1] },
        { sym: 'A', bound: [  .5,  .5,   1,   1] }
      ]
    }
  );

  ctx.strokeStyle = 'black';
  ctx.font = '48pt Ubuntu';

  sierpinski.axiom('A');

  var render = function() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillText('Run #' + render.count, 32, 64);
    //console.profile('sierpinski');
    sierpinski.run();
    sierpinski.draw({ x: 0, y: 0, width: w, height: h });
    //console.profileEnd();
    if(++render.count <= 10)
      setTimeout(render, 1000);
  }
  render.count = 1;

  render();

}());
