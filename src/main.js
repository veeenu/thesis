var glMatrix = require('glMatrix'),
    Context  = require('Context'),
    canvas   = Context.canvas,
    gl       = Context.gl,
    Renderer = require('./Renderer.js'),
    Loader   = require('Loader'),
    City     = require('./generators/City.js'),
    Stats    = require('stats-js'),
    mainScene = require('./scenes/MainScene.js'),
    roomScene = require('./scenes/RoomScene.js'),
    stats = new Stats();

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

  Renderer.init(mainScene, roomScene);

  sceneLoop();
});

function loadingLoop() {
  if(loadingStatus === 0)
    requestAnimationFrame(loadingLoop);
  Loader.render();
}

//var screencast = [], scLen = 60 * 10;

function sceneLoop(ts) {

  if(isNaN(sceneLoop.t0))
    sceneLoop.t0 = ts;

  stats.begin();
  Renderer.render(mainScene);
  mainScene.update(ts - sceneLoop.t0);
  Renderer.render(roomScene);
  roomScene.update(ts - sceneLoop.t0);
  stats.end();

  if(window.STAHP !== true)
    requestAnimationFrame(sceneLoop);

  //if(screencast.length < scLen)
  //  screencast.push(canvas.toDataURL());

}
gl.viewport(0, 0, Context.w, Context.h);

loadingLoop();

/*window.downloadScreencast = function() {
  if(screencast.length < scLen) {
    console.log((600 - screencast.length) + ' more frames');
    return;
  }

  var ws = new WebSocket('ws://localhost:4001');
  ws.onopen = function() {
  
    screencast.forEach(function(i, idx) {
      ws.send(idx + ' --- ' + i);
    })
  }

}*/
