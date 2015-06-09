var canvas = document.querySelector('canvas'),
    gl     = canvas.getContext('webgl'),
    bcr    = canvas.getBoundingClientRect(),
    w      = innerWidth,
    h      = innerHeight;

canvas.width = w;
canvas.height = h;
var st = { position: 'fixed', top: 0, left: 0, width: w + 'px', height: h + 'px' };
for(var i in st) canvas.style[i] = st[i];

gl.clearColor(0, 0, 0, 1);
gl.viewport(0, 0, w, h);

var program = gl.createProgram(),
    vsh     = gl.createShader(gl.VERTEX_SHADER),
    fsh     = gl.createShader(gl.FRAGMENT_SHADER),
    buf     = gl.createBuffer(),
    pos;

gl.getExtension('OES_standard_derivatives');
gl.shaderSource(vsh, document.getElementById('vertex-shader').textContent);
gl.shaderSource(fsh, document.getElementById('fragment-shader').textContent);
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

gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]), gl.STATIC_DRAW);

pos = gl.getAttribLocation(program, 'pos');

gl.enableVertexAttribArray(pos);
gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

gl.drawArrays(gl.TRIANGLES, 0, 6);
