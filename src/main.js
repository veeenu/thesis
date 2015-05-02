var glMatrix = require('gl-matrix'),
    Context  = require('Context'),
    canvas   = Context.canvas,
    gl       = Context.gl,
    Renderer = require('./Renderer.js'),
    Loader   = require('Loader'),
    City     = require('./generators/City.js'),
    Stats    = require('stats-js'),
    mainScene = require('./scenes/MainScene.js');

/*var moveIntervals = {
  W: null, A: null, S: null, D: null
}


document.body.addEventListener('keydown', function(evt) {
  var c = String.fromCharCode(evt.keyCode);
  var speed = 10e-2;
  switch(c) {
    case 'W': 
      if(moveIntervals.W === null)
        moveIntervals.W = setInterval(function() {
          renderer.move(0, speed); 
        }, 16);
      break;
    case 'A': 
      if(moveIntervals.A === null)
        moveIntervals.A = setInterval(function() {
          renderer.move(speed, 0); 
        }, 16);
      break;
    case 'S': 
      if(moveIntervals.S === null)
        moveIntervals.S = setInterval(function() {
          renderer.move(0, -speed); 
        }, 16);
      break;
    case 'D': 
      if(moveIntervals.D === null)
        moveIntervals.D = setInterval(function() {
          renderer.move(-speed, 0); 
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
}());*/

var stats = new Stats();
stats.setMode(0);

stats.domElement.style.position = 'absolute';
stats.domElement.style.right = '1rem';
stats.domElement.style.top = '1rem';

canvas.parentNode.appendChild(stats.domElement);

function r() {

  stats.begin();
  Renderer.render(mainScene);
  mainScene.update();
  stats.end();

  requestAnimationFrame(r);
  Loader.render();
}
gl.viewport(0, 0, Context.w, Context.h);

r();
