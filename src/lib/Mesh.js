var Context  = require('Context'),
    gl       = Context.gl;

var Mesh = function(vertices, normals, uvs, extra) {
  this.vBuf = gl.createBuffer();
  //this.nBuf = gl.createBuffer();
  this.uBuf = gl.createBuffer();
  this.eBuf = gl.createBuffer();

  this.count = vertices.length / 3;

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  //gl.bindBuffer(gl.ARRAY_BUFFER, this.nBuf);
  //gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.uBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.eBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(extra), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

module.exports = Mesh;
