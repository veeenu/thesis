var fs      = require('fs');
var PRNG    = new (require('PRNG')),
    vertSrc, fragSrc,
    texSize = 512;

vertSrc = fs.readFileSync(__dirname + '/../shaders/textures-v.glsl', 'utf-8');
fragSrc = fs.readFileSync(__dirname + '/../shaders/textures-f.glsl', 'utf-8');

var createTexture = function(gl) {
  var renderBuffer = gl.createRenderbuffer(),
      frameBuffer  = gl.createFramebuffer(),
      tex          = gl.createTexture(),
      program      = gl.createProgram(),
      vsh          = gl.createShader(gl.VERTEX_SHADER),
      fsh          = gl.createShader(gl.FRAGMENT_SHADER),
      vbuf         = gl.createBuffer(),
      vertLoc;

  gl.shaderSource(vsh, vertSrc);
  gl.shaderSource(fsh, fragSrc);
  gl.compileShader(vsh);
  gl.compileShader(fsh);
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);
  gl.useProgram(program);

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
  //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texSize, texSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindRenderbuffer(gl.RENDERBUFFER, renderBuffer);
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, texSize, texSize);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderBuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  gl.viewport(0, 0, texSize, texSize);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  vertLoc = gl.getAttribLocation(program, 'vertex');
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1 ]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(vertLoc, 2, gl.FLOAT, false, 0, 0);

  gl.enableVertexAttribArray(vertLoc);
 
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.generateMipmap(gl.TEXTURE_2D);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}


module.exports = {
  
  generate: function(gl) {
    createTexture(gl);
    /*var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, createTexture(brickColor));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    //gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.generateMipmap(gl.TEXTURE_2D);
    return tex;*/
  }
};
