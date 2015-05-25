var canvas = document.querySelector('canvas'),
    gl     = canvas.getContext('webgl'),
    bcr    = canvas.getBoundingClientRect(),
    w      = bcr.width,
    h      = bcr.height;

canvas.width = w;
canvas.height = h;

gl.viewport(0, 0, w, h);
gl.clearColor(0, 0, 0, 1);
gl.clear(gl.COLOR_BUFFER_BIT);

var program = gl.createProgram(),
    vsh     = gl.createShader(gl.VERTEX_SHADER),
    fsh     = gl.createShader(gl.FRAGMENT_SHADER);

gl.getExtension('OES_standard_derivatives');

gl.shaderSource(vsh, document.getElementById('vertex').textContent);
gl.shaderSource(fsh, document.getElementById('fragment').textContent);
gl.compileShader(vsh);
gl.compileShader(fsh);
gl.attachShader(program, vsh);
gl.attachShader(program, fsh);
gl.linkProgram(program);
gl.useProgram(program);

console.log(
  gl.getShaderInfoLog(vsh),
  gl.getShaderInfoLog(fsh),
  gl.getProgramInfoLog(program)
);

'perspective,modelview,nmatrix,tex,map,light,campos'.split(',').forEach(function(i) {
  program[i] = gl.getUniformLocation(program, i);
});

'position,uv'.split(',').forEach(function(i) {
  program[i] = gl.getAttribLocation(program, i);
});

console.log(program)

var position = gl.createBuffer(),
    uv       = gl.createBuffer();

gl.bindBuffer(gl.ARRAY_BUFFER, position);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ -1, -1, 0, -1, 1, 0, 1,  1, 0, -1, -1, 0,  1, 1, 0, 1, -1, 0 ]), gl.STATIC_DRAW)
gl.enableVertexAttribArray(program.position);
gl.vertexAttribPointer(program.position, 3, gl.FLOAT, false, 0, 0);
gl.bindBuffer(gl.ARRAY_BUFFER, uv);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 1, 1 ]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(program.uv);
gl.vertexAttribPointer(program.uv, 2, gl.FLOAT, false, 0, 0);

var perspective = mat4.create(),
    modelview   = mat4.create(),
    nmatrix     = mat3.create();

mat4.perspective(perspective, Math.PI / 2, w / h, .001, 1000);

gl.uniformMatrix4fv(program.perspective, false, perspective);
var img1, img2, count = 2, doTextures;

img1 = new Image();
img2 = new Image();

img1.onload = img2.onload = function() {
  if(--count === 0) doTextures();
}

img1.src = 'lion.png';
img2.src = 'lion-bumpnormal.png';

doTextures = function() {
  var tex1 = gl.createTexture(),
      tex2 = gl.createTexture();

  gl.bindTexture(gl.TEXTURE_2D, tex1);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img1);
  gl.bindTexture(gl.TEXTURE_2D, tex2);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img2);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex1);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, tex2);

  gl.uniform1i(program.tex, 0);
  gl.uniform1i(program.map, 1);

  r();

}

gl.uniform3f(program.light, 0., 1., -2.);

var angle = 0;

  mat4.identity(modelview);
  mat4.translate(modelview, modelview, [Math.sin(angle), 0, -1]);
  mat4.rotateX(modelview, modelview, Math.PI / 6);
  var o = vec3.create();
  vec3.transformMat4(o, o, modelview);
  console.log(o);

var r = function() {
  mat4.identity(modelview);
  mat4.translate(modelview, modelview, [0, -.5, -1]);
  //mat4.translate(modelview, modelview, [Math.sin(angle), Math.cos(angle), -1]);
  //mat4.rotateX(modelview, modelview, Math.cos(angle) * Math.PI / 2);
  //mat4.rotateX(modelview, modelview, Math.sin(angle) * Math.PI / 6);
  mat4.rotateX(modelview, modelview, -Math.PI / 2);
  //mat4.rotateY(modelview, modelview, angle);
  mat3.normalFromMat4(nmatrix, modelview);
  gl.uniformMatrix4fv(program.modelview, false, modelview);
  gl.uniformMatrix3fv(program.nmatrix, false, nmatrix);
  gl.uniform3f(program.campos, 0, .5, 1);
  //gl.uniform3f(program.campos, -Math.sin(angle), -Math.cos(angle), 1);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  requestAnimationFrame(r);

  angle += .01;
}
