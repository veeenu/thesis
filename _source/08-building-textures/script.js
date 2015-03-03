(function() {

  var canvas = document.getElementById('canvas'),
      ctx    = canvas.getContext('2d'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  var side = 16,
      lattice = (function() {
        var l = [];

        for(var x = 0; x < side; x++) {
          for(var y = 0; y < side; y++) {
            var th = Math.random() * 2 * Math.PI;
            l.push({
              x: Math.cos(th),
              y: Math.sin(th)
            });
          }
        }
        return l;

      }());

  var lerp = function(a, b, t) {
    return (b * t) + (a * (1 - t));
  }

  var fade = function(x) {
    return x * x * x * (x * (6 * x - 15) + 10);
  }

  var noise = function(x, y, freq) {
    var fx0 = ((freq * x) % 1.0) * side,
        fy0 = ((freq * y) % 1.0) * side,
        fx1, fy1,
        x0 = fx0 >= 0 ? Math.floor(fx0) : Math.floor(fx0) - 1,
        y0 = fy0 >= 0 ? Math.floor(fy0) : Math.floor(fy0) - 1,
        x1 = (x0 + 1) % side,
        y1 = (y0 + 1) % side,
        dot00, dot01, dot10, dot11,
        grad00, grad01, grad10, grad11;

    fx0 -= x0; fy0 -= y0;
    fx1 = fx0 - 1, fy1 = fy0 - 1;

    grad00 = lattice[x0 + y0 * side];
    grad01 = lattice[x1 + y0 * side];
    grad10 = lattice[x0 + y1 * side];
    grad11 = lattice[x1 + y1 * side];

    dot00 = grad00.x * fx0 + grad00.y * fy0;
    dot01 = grad01.x * fx1 + grad01.y * fy0;
    dot10 = grad10.x * fx0 + grad10.y * fy1;
    dot11 = grad11.x * fx1 + grad11.y * fy1;

    fx0 = fade(fx0);
    fy0 = fade(fy0);

    return lerp(lerp(dot00, dot01, fx0), lerp(dot10, dot11, fx0), fy0);
  }

  var imgd = ctx.createImageData(w, h);

  var size = 128;
  for(var x = 0; x < size; x++)
    for(var y = 0; y < size; y++) {
      var value = 0, i,
          pos = 4 * (y * w + x);

      value = (noise(x / size, y / size, 2  ) + 1) / 2 +
              (noise(x / size, y / size, 4  ) + 1) / 4 +
              (noise(x / size, y / size, 8  ) + 1) / 8 +
              (noise(x / size, y / size, 16 ) + 1) / 16;

      if(y % (size / 4) < (size/64) ||
        ~~(y / (size/4)) % (size/64) < size/64 && x % (size / 3) < size/64 ||
        ~~(y / (size/4)) % (size/64) >=size/64 && (x + size / 4) % (size / 4) < size/64)
        imgd.data[pos] = imgd.data[pos + 1] = imgd.data[pos + 2] = value * 128 + 64;
      else {
        imgd.data[pos] = value * 64 + 96;
        imgd.data[pos + 1] = imgd.data[pos + 2] = 16;
      }
      imgd.data[pos + 3] = 255;
    }

  ctx.putImageData(imgd, 0, 0);

}());
