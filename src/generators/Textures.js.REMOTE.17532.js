var PRNG   = new (require('PRNG')),
    canvas = document.createElement('canvas'),
    ctx    = canvas.getContext('2d'),
    imgd   = ctx.createImageData(512, 512);

canvas.width = canvas.height = 512;

canvas.setAttribute('style', 'position: fixed; top: 64px; left: 64px;');

// #D0C9C9 - mortar
// #B74E27 - brick
for(var x = 0; x < 64; x++) {
  for(var y = 0; y < 64; y++) {
    var pos0 = y * 512 + x,
        pos1 = y * 512 + (x + 64),
        pos2 = (y + 64) * 512 + x,
        pos3 = (y + 64) * 512 + (x + 64),
        color0, color1, color2, color3,
        dim = 0.9 + Math.random() * 0.2;
   
    if((y + 1) % 16  < 2 ||
      (~~(y / 16) % 2 == 0 && (x + 1) % 32 < 2) ||
      (~~(y / 16) % 2 == 1 && (x + 17) % 32 < 2)
      ) {
      color0 = color1 = color2 = color3 = 0xD0C9C9;
      dim = 1;
    } else {
      color0 = 0xB74E27;
      color1 = 0x8DD300;
      color2 = 0x750495;
      color3 = 0x353377;
    }

    imgd.data[4 * pos0]     = ~~(dim * ((color0 >> 16) & 0xFF));
    imgd.data[4 * pos0 + 1] = ~~(dim * ((color0 >> 8) & 0xFF));
    imgd.data[4 * pos0 + 2] = ~~(dim * ((color0) & 0xFF));
    imgd.data[4 * pos0 + 3] = 0xFF;
    imgd.data[4 * pos1]     = ~~(dim * ((color1 >> 16) & 0xFF));
    imgd.data[4 * pos1 + 1] = ~~(dim * ((color1 >> 8) & 0xFF));
    imgd.data[4 * pos1 + 2] = ~~(dim * ((color1) & 0xFF));
    imgd.data[4 * pos1 + 3] = 0xFF;
    imgd.data[4 * pos2]     = ~~(dim * ((color2 >> 16) & 0xFF));
    imgd.data[4 * pos2 + 1] = ~~(dim * ((color2 >> 8) & 0xFF));
    imgd.data[4 * pos2 + 2] = ~~(dim * ((color2) & 0xFF));
    imgd.data[4 * pos2 + 3] = 0xFF;
    imgd.data[4 * pos3]     = ~~(dim * ((color3 >> 16) & 0xFF));
    imgd.data[4 * pos3 + 1] = ~~(dim * ((color3 >> 8) & 0xFF));
    imgd.data[4 * pos3 + 2] = ~~(dim * ((color3) & 0xFF));
    imgd.data[4 * pos3 + 3] = 0xFF;

  }
}

ctx.putImageData(imgd, 0, 0)

document.body.appendChild(canvas);

module.exports = function(gl) {
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}
