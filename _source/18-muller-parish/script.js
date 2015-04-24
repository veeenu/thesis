(function() {

  var canvas = document.getElementById('canvas'),
      ctx    = canvas.getContext('2d'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  console.time('asd')
  var densityMap = (function() {
  
    var imgdata = ctx.createImageData(w, h),
        imgd = imgdata.data,
        map = new Uint8Array(w * h);

    for(var y = 0; y < h; y++) {
      var base = y * w;
      for(var x = 0; x < w; x++) {
        var ptt = base + x, pt = 4 * ptt;
        map[ptt] = imgd[pt + 0] = imgd[pt + 1] = imgd[pt + 2] = 
          255 - ~~(127 + Math.sin(4 * Math.PI * x  / w) * Math.sin(4 * Math.PI * y / h) * 128);
        imgd[pt + 3] = 255;
      }
    
    }

    ctx.putImageData(imgdata, 0, 0);
    return map;

  }());

  var plotDens = function() {
    var imgdata = ctx.createImageData(w, h),
        imgd = imgdata.data;

    for(var i = 0, n = w * h; i < n; i++) {
      var b = i * 4;
      imgd[b] = imgd[b + 1] = imgd[b + 2] = densityMap[i];
      imgd[b + 3] = 255;
    }
    ctx.putImageData(imgdata, 0, 0);
  }

  var roadMap = new Uint8Array(w * h);

  console.timeEnd('asd')

  var drawLineA = function(p, ang, len) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y)
    ctx.lineTo(p.x + Math.cos(ang) * len, p.y + Math.sin(ang) * len);
    ctx.stroke();
  }
  var drawLine = function(p, q) {
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
    ctx.stroke();
    ctx.fillRect(p.x - 1, p.y - 1, 3, 3);
  }

  var clamp = function(x, a, b) {
    return Math.min(b, Math.max(a, x));
  }

  var globalConstraints = (function() {
    
    var smpDistances = [],
        smpAngles = [];

    for(var x = - Math.PI / 4; x < Math.PI / 4; x += Math.PI / 16)
      smpAngles.push(x);
    for(var x = 2; x < 256; x += 8)
      smpDistances.push(x);

    smpDistances = smpDistances.map(function(i) { return i });

    return function(p, a) {
      var chosen = smpAngles
        .map(function(da) {
          var angle = da + a,
              pop = smpDistances.reduce(function(o, cur) {
            var x = clamp(Math.round(p.x + Math.cos(angle) * cur), 0, w),
                y = clamp(Math.round(p.y + Math.sin(angle) * cur), 0, h),
                point;
               
            point = ~~(y * w + x);

            drawLine(p, {x:x,y:y})
            if(roadMap[point] !== 0)
              return -1;

            return o + densityMap[point] * 1 / cur;
          }, 0);

          return { pop: pop, angle: angle };
        })
        .sort(function(a, b) {
          if(a.pop > b.pop) return -1;
          else if(a.pop < b.pop) return 1;
          return 0;
        })
        .shift();

      var top = 32, rad = top * 4;

      chosen.x = clamp(Math.round(p.x + Math.cos(chosen.angle) * top), 0, w);
      chosen.y = clamp(Math.round(p.y + Math.sin(chosen.angle) * top), 0, h);
      for(var x = -rad; x < rad; x++)
        for(var y = -rad; y < rad; y++) {
          var dm = (chosen.x + x) + (chosen.y + y) * w,
              fact = clamp(1 - Math.sqrt(x * x + y * y) /  Math.abs(rad), 0, 1);
          densityMap[dm] = Math.max(0, densityMap[dm] - fact * fact * 128);
        }
      return chosen;
    }
  }());

  ctx.strokeStyle = 'rgba(255,0,0,.05)';

  var p  = { x: Math.random() * w, y: Math.random() * h },
      ch = globalConstraints(p, Math.random() * 2 * Math.PI),
      last = ch;
      points = [ p, ch ];

  var i = 1000;
  var doStep = function() {
    plotDens();
    ch = globalConstraints(ch, ch.angle);
    points.push( { x: ch.x, y: ch.y } );
    if(i-- > 0 && ch.pop > 2)
      setTimeout(doStep, 4);
    else
      doClose();
  };

  doStep();

  var doClose = function() {
    ctx.strokeStyle = '#00ff00';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach(function(i) {
      ctx.lineTo(i.x, i.y);
    });
    ctx.stroke();
  }

  var OpenLSystem = function() {
  
  }

}());
