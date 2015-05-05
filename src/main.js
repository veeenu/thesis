var glMatrix = require('gl-matrix'),
    Context  = require('Context'),
    canvas   = Context.canvas,
    gl       = Context.gl,
    Renderer = require('./Renderer.js'),
    Loader   = require('Loader'),
    City     = require('./generators/City.js'),
    Stats    = require('stats-js'),
    mainScene = require('./scenes/MainScene.js');

var stats = new Stats();
stats.setMode(0);

stats.domElement.style.position = 'absolute';
stats.domElement.style.right = '1rem';
stats.domElement.style.top = '1rem';

canvas.parentNode.appendChild(stats.domElement);

var loadingStatus = 0;
var t0 = NaN;

Loader.subscribe('Blocks', function() {
  console.log('Loading complete');
  loadingStatus = 1;
  t0 = NaN;
  sceneLoop();
});

function loadingLoop() {
  if(loadingStatus === 0)
    requestAnimationFrame(loadingLoop);
  Loader.render();
}


function sceneLoop(ts) {

  if(isNaN(sceneLoop.t0))
    sceneLoop.t0 = ts;

  stats.begin();
  Renderer.render(mainScene);
  mainScene.update(ts - sceneLoop.t0);
  stats.end();

  requestAnimationFrame(sceneLoop);
}
gl.viewport(0, 0, Context.w, Context.h);

loadingLoop();

