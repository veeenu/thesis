(function() {

  var canvas    = document.getElementById('canvas'),
      ctx       = canvas.getContext('2d'),
      bcr       = canvas.getBoundingClientRect(),
      w         = Math.floor(bcr.width / 4),
      h         = Math.floor(bcr.height / 4),
      automaton = new Uint8Array(w * h);

  // Next two lines are just boilerplate. Canvas' size is defined by
  // CSS responsive media queries, but its drawbuffer's size must be
  // set manually because it defaults to 300x150 and CSS stretches
  // it out. These prototypes will require substantial pixel precision
  // so we set the internal size to the size provided by the bounding
  // rectangle.
  canvas.width = bcr.width;
  canvas.height = bcr.height;

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 32, 0, 1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(0, 64, 0, 1)';
    for(var x = 0; x < w; x++)
      for(var y = 0; y < h; y++)
        if(automaton[y * w + x] > 0)
          ctx.fillRect(x * 4, y * 4, 4, 4);
  }

  function step() {
    var next = new Uint8Array(automaton.length);

    for(var x = 0; x < w; x++) for(var y = 0; y < h; y++) {
      var neighSum = (function(x, y) {
        // Sum Moore's neighborhood
        var r = 0;
        for(var _x = Math.max(x - 1, 0); _x <= Math.min(x + 1, w); _x++)
          for(var _y = Math.max(y - 1, 0); _y <= Math.min(y + 1, h); _y++)
            if(_x != 0 && _y != 0)
              r += automaton[ _y * w + _x ];
        return r;
      }(x, y));
      next[y * w + x] = (neighSum > 4 ? 1 : 0);
    }
    automaton = next;
  }

  for(var i = 0; i < automaton.length; i++)
    automaton[i] = (Math.random() > 0.5 ? 1 : 0);

  function run() {
    run.count++;
    //console.profile('Step ' + run.count);
    step();
    //console.profileEnd();
    render();
    ctx.font = '48px Ubuntu';
    ctx.fillStyle = 'white';
    ctx.fillText('Step ' + run.count, 32, 64);
    if(run.count < 10)
      setTimeout(run, 1000);
  }
  run.count = 0;
  run();

}());
