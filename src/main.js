var glMatrix = require('gl-matrix'),
    Renderer = require('./Renderer.js'),
    City     = require('./generators/City.js'),
    canvas   = document.getElementById('thesis-canvas'),
    gl       = canvas.getContext('webgl'),
    bcr      = canvas.getBoundingClientRect(),
    w        = bcr.width,
    h        = bcr.height;

canvas.width  = w;
canvas.height = h;
gl.viewport(0, 0, w, h);

var city      = new City(0),
    renderer  = new Renderer(gl, city);

var moveIntervals = {
  W: null, A: null, S: null, D: null
}
document.body.addEventListener('keydown', function(evt) {
  var c = String.fromCharCode(evt.keyCode);
  switch(c) {
    case 'W': 
      if(moveIntervals.W === null)
        moveIntervals.W = setInterval(function() {
          renderer.move(0, 10e-3); 
        }, 16);
      break;
    case 'A': 
      if(moveIntervals.A === null)
        moveIntervals.A = setInterval(function() {
          renderer.move(10e-3, 0); 
        }, 16);
      break;
    case 'S': 
      if(moveIntervals.S === null)
        moveIntervals.S = setInterval(function() {
          renderer.move(0, -10e-3); 
        }, 16);
      break;
    case 'D': 
      if(moveIntervals.D === null)
        moveIntervals.D = setInterval(function() {
          renderer.move(-10e-3, 0); 
        }, 16);
      break;
  }
});

document.body.addEventListener('keyup', function(evt) {
  var c = String.fromCharCode(evt.keyCode);
  switch(c) {
    case 'W': 
    case 'A': 
    case 'S': 
    case 'D': 
      if(moveIntervals[c] !== null) {
        clearInterval(moveIntervals[c]);
        moveIntervals[c] = null;
      }
      break;
    default: break;
  }
});

(function() {
  var x = null, y = null;
  canvas.addEventListener('mousemove', function(evt) {
    if(x === null) {
      x = evt.clientX;
      y = evt.clientY;
    }

    renderer.rotate((evt.clientX - x)  * 16 / w,(evt.clientY - y)  * 8 / h);
    x = evt.clientX;
    y = evt.clientY;
  })
}());

function r() {
  renderer.render(gl, w, h);
  requestAnimationFrame(r);
}

r();
