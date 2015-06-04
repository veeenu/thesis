var Context  = require('Context'),
    canvas   = Context.canvas,
    gl       = Context.gl,
    Renderer = require('./Renderer.js'),
    Loader   = require('Loader'),
    Timeline = require('Timeline'),
    Stats    = require('stats-js'),
    mainScene = require('./scenes/MainScene.js'),
    roomScene = require('./scenes/RoomScene.js'),
    stats = new Stats();

stats.setMode(0);

stats.domElement.style.position = 'absolute';
stats.domElement.style.right = '1rem';
stats.domElement.style.top = '1rem';

canvas.parentNode.appendChild(stats.domElement);

var loadingStatus = 0, loadingProgress = 0;
var t0 = NaN;

Loader.subscribe('Blocks', function() {
  loadingProgress += .5;
  Loader.progress('City', loadingProgress);
});

Loader.subscribe('Rooms', function() {
  loadingProgress += .5;
  Loader.progress('City', loadingProgress);
});

Loader.subscribe('City', function() {
  console.log('Loading complete');
  loadingStatus = 1;
  t0 = NaN;

  Renderer.init(mainScene, roomScene);

  mainScene.update(0);
  Renderer.render(mainScene, true);
  roomScene.update(0);
  Renderer.render(roomScene);

  //requestAnimationFrame(sceneLoop);
  setTimeout(sceneLoop, 1000);
});

function loadingLoop() {
  if(loadingStatus === 0)
    requestAnimationFrame(loadingLoop);
  Loader.render();
}

var TS = 0, paused = false;

document.addEventListener('keydown', function(evt) {
  if(evt.keyCode === 32) {
    evt.preventDefault();
    evt.stopPropagation();
    paused = !paused;
  }
});

document.addEventListener('wheel', function(evt) {
  evt.preventDefault();
  evt.stopPropagation();
  TS += evt.deltaY;

  TS = Math.max(TS, 0);
})

window.JMP = function(d) { TS = d; }

/* dev */

/*function sceneLoop(ts) {

  if(isNaN(sceneLoop.t0) || sceneLoop.t0 === undefined)
    sceneLoop.t0 = ts;

  stats.begin();

  var dt = (ts - sceneLoop.t1);

  if(!paused) {
    TS += dt;
  }

  dt = TS;
    mainScene.update(dt);
    Renderer.render(mainScene, true);

  stats.end();

  requestAnimationFrame(sceneLoop);

  sceneLoop.t1 = ts;

}*/

function sceneLoop(ts) {

  if(isNaN(sceneLoop.t0) || sceneLoop.t0 === undefined)
    sceneLoop.t0 = ts;

  if(sceneLoop.t1 !== undefined && !isNaN(sceneLoop.t1) &&
     ts - sceneLoop.t1 > 32) {
    console.log('WARN', ts - sceneLoop.t1);
  }

  stats.begin();

  var dt = (ts - sceneLoop.t0);

  if(dt < 80000) {
    mainScene.update(dt);
    Renderer.render(mainScene, true);
  } else {
    dt -= 4000;
    dt %= 76000 + roomScene.totalTime;
    if(dt < 76000) {
      mainScene.update(dt + 4000);
      Renderer.render(mainScene, true);
    } else {
      mainScene.update(Math.max(0, dt - (76000 + roomScene.totalTime) + 4000));
      roomScene.update(dt - 76000);
      Renderer.render(mainScene);
      Renderer.render(roomScene, true);
    }
  }

  stats.end();

  requestAnimationFrame(sceneLoop);

  sceneLoop.t1 = ts;
  //if(screencast.length < scLen)
  //  screencast.push(canvas.toDataURL());

}

gl.viewport(0, 0, Context.w, Context.h);

roomScene.init();
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
