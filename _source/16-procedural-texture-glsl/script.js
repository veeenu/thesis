(function() {

  var canvas = document.getElementById('canvas'),
      gl     = canvas.getContext('webgl'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height,
      vbuf   = gl.createBuffer();

  canvas.width = h;
  canvas.height = h;
  canvas.style.width = canvas.style.height = 'auto';

  gl.viewport(0, 0, h, h);

  //gl.enable(gl.DEPTH_TEST);
  //gl.depthFunc(gl.LESS);
  gl.clearColor(0, 0, 0, 1);

  var program = gl.createProgram(),
      vsh     = gl.createShader(gl.VERTEX_SHADER),
      fsh     = gl.createShader(gl.FRAGMENT_SHADER);

  gl.shaderSource(vsh, document.getElementById('vertex-shader').textContent);
  gl.shaderSource(fsh, document.getElementById('fragment-shader').textContent);
  gl.compileShader(vsh);
  gl.compileShader(fsh);
  console.log(gl.getShaderInfoLog(vsh));
  console.log(gl.getShaderInfoLog(fsh));
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);
  gl.useProgram(program);

  program.vertex = gl.getAttribLocation(program, 'vertex');
  console.log(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ 0, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, 1 ]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(program.vertex, 2, gl.FLOAT, false, 0, 0);

  gl.enableVertexAttribArray(program.vertex);
  
  function render() {
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
    //requestAnimationFrame(render);
  }
  render();

}());
