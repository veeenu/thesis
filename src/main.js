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

function r() {
  renderer.render(gl);
  requestAnimationFrame(r);
}

r();
