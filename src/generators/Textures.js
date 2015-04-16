var PRNG    = new (require('PRNG')),
    texSize = 512;

var step = function(edge, x) {
  return x < edge ? 0. : 1.;
}

var lerp = function(a, b, t) {
  return (b * t) + (a * (1 - t));
}

var fade = function(x) {
  return x * x * x * (x * (6 * x - 15) + 10);
}

var mix = function(v1, v2, t) {
  return [
    lerp(v1[0], v2[0], t),
    lerp(v1[1], v2[1], t),
    lerp(v1[2], v2[2], t)
  ]
};

var snoise = (function() {
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

  return function(x, y, freq) {
    freq = freq || 1;
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

}());

var brickColor = (function() {
  var bW = .125,
      bH = .0625,
      mS = 1 / 128,
      mWf = mS * .5 / bW,
      mHf = mS * .5 / bH,
      brickC  = [.5,  0, .1],
      mortarC = [.5, .5, .5];

  return function(s, t) {
    var u = s / bW,
        v = t / bH,
        brU, brV;

    if(v * .5 % 1 > .5)
      u += .5;

    brU = ~~u;
    brV = ~~v;
    u -= brU;
    v -= brV;

    var noiseV = 1 + 
                 snoise(u * 16, v * 16, 1024) * .0625 +
                 Math.abs(snoise(u * 256, v * 256, 1024)) * .25,
        //noiseI = Math.abs(snoise(brU * 64, brV * 64)),
        brickDamp = 1 + .25 * (Math.sin(2 * (brU + 1)) + Math.sin(2 * (brV + 1)));
    return mix(mortarC, brickC.map(function(i) { return i * brickDamp }),
               (step(mWf, u) - step(1 - mWf, u)) *
               (step(mHf, v) - step(1 - mHf, v))
              ).map(function(i) { return i * noiseV })
  }
}());

var createTexture = function(fn) {
  var canvas = document.createElement('canvas'),
      ctx    = canvas.getContext('2d'),
      imgd   = ctx.createImageData(texSize, texSize);
  canvas.width = canvas.height = texSize;

  for(var x = 0; x < texSize; x++)
    for(var y = 0; y < texSize; y++) {
      var pos = 4 * (y * texSize + x);

      var color = fn(x / texSize, y / texSize);
      [0,1,2].forEach(function(i) {
        imgd.data[pos + i] = color[i] * 255;
      });

      imgd.data[pos + 3] = 255;
    }

  ctx.putImageData(imgd, 0, 0);
  return canvas;
}


module.exports = {
  
  generate: function(gl) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, createTexture(brickColor));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;
  }
};
