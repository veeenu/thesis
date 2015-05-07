var canvas = document.getElementById('canvas'),
    gl     = canvas.getContext('webgl'),
    bcr    = canvas.getBoundingClientRect(),
    w      = bcr.width,
    h      = bcr.height,
    stats  = new Stats();

canvas.width = w;
canvas.height = h;
stats.setMode(0);
stats.domElement.style.position = 'absolute';
stats.domElement.style.right = '1rem';
stats.domElement.style.top = '1rem';
document.body.appendChild(stats.domElement);

var xhr = new XMLHttpRequest();
xhr.open('GET', 'greek_vase2.obj', false);
xhr.send();

var geom = xhr.responseText
  .split("\n").reduce(function(o, cur) {

    var a = cur.split(/\s+/);

    switch(a[0]) {
      case 'v':
        o.vertices.push(a.slice(1).map(parseFloat));
        break;
      case 'vn':
        o.normals.push(a.slice(1).map(parseFloat));
        break;
      case 'f':
        o.faces.push(a.slice(1).map(function(i) { return i.split('/').map(parseFloat) }));
        break;
    }

    return o;

  }, { vertices: [], normals: [], faces: [] });

  console.log(geom)
geom = geom.faces.reduce(function(o, i) {
  var dx;

  for(var X = -10; X < 10; X++) for(var Y = -10; Y < 10; Y++) {
    for(var j = 0; j < 3; j++) {
      for(var k = 0; k < 3; k++) {
        dx = (k === 0 ? X * 100 : (k === 2 ? Y * 120 : 0));
        o.vertices.push(this.vertices[ i[j][0] - 1][k] + dx);
        o.normals.push(this.normals[ i[j][2] - 1][k]);
      }
    }
  }
  return o;

}.bind(geom), { vertices: [], normals: [] });

console.log(geom);

var program     = gl.createProgram(),
    vsh         = gl.createShader(gl.VERTEX_SHADER),
    fsh         = gl.createShader(gl.FRAGMENT_SHADER),
    programQ    = gl.createProgram(),
    vshQ        = gl.createShader(gl.VERTEX_SHADER),
    fshQ        = gl.createShader(gl.FRAGMENT_SHADER),
    qbuf        = gl.createBuffer(),
    vbuf        = gl.createBuffer(),
    nbuf        = gl.createBuffer(),
    projection  = mat4.create(),
    view        = mat4.create(),
    model       = mat4.create(),
    mnormal     = mat3.create(),
    depthT      = gl.createTexture(),
    depthRGBT   = gl.createTexture(),
    normalT     = gl.createTexture(),
    colorT      = gl.createTexture(),
    posT        = gl.createTexture(),
    extDB, extTF, framebuffer, bufs = [];

gl.getExtension('OES_standard_derivatives');
gl.getExtension('OES_texture_float');
gl.getExtension('OES_texture_float_linear');
extDB = gl.getExtension('WEBGL_draw_buffers');
extTF = gl.getExtension('WEBGL_depth_texture');

console.log(extDB, extTF);

gl.bindTexture(gl.TEXTURE_2D, depthT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);

gl.bindTexture(gl.TEXTURE_2D, depthRGBT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null);

gl.bindTexture(gl.TEXTURE_2D, normalT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null);

gl.bindTexture(gl.TEXTURE_2D, posT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null);

gl.bindTexture(gl.TEXTURE_2D, colorT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null);

gl.bindTexture(gl.TEXTURE_2D, null);

framebuffer = gl.createFramebuffer();
gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
bufs[0] = extDB.COLOR_ATTACHMENT0_WEBGL;
bufs[1] = extDB.COLOR_ATTACHMENT1_WEBGL;
bufs[2] = extDB.COLOR_ATTACHMENT2_WEBGL;
bufs[3] = extDB.COLOR_ATTACHMENT3_WEBGL;
extDB.drawBuffersWEBGL(bufs);

gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthT, 0);
gl.framebufferTexture2D(gl.FRAMEBUFFER, bufs[0], gl.TEXTURE_2D, normalT, 0);
gl.framebufferTexture2D(gl.FRAMEBUFFER, bufs[1], gl.TEXTURE_2D, posT, 0);
gl.framebufferTexture2D(gl.FRAMEBUFFER, bufs[2], gl.TEXTURE_2D, colorT, 0);
gl.framebufferTexture2D(gl.FRAMEBUFFER, bufs[3], gl.TEXTURE_2D, depthRGBT, 0);

gl.shaderSource(vsh, document.getElementById('vertex-deferred').textContent);
gl.shaderSource(fsh, document.getElementById('fragment-deferred').textContent);
gl.compileShader(vsh);
gl.compileShader(fsh);
console.log(gl.getShaderInfoLog(vsh), gl.getShaderInfoLog(fsh));
gl.attachShader(program, vsh);
gl.attachShader(program, fsh);
gl.linkProgram(program);

gl.shaderSource(vshQ, document.getElementById('vertex-lighting').textContent);
gl.shaderSource(fshQ, document.getElementById('fragment-lighting').textContent);
gl.compileShader(vshQ);
gl.compileShader(fshQ);
console.log(gl.getShaderInfoLog(vshQ), gl.getShaderInfoLog(fshQ));
gl.attachShader(programQ, vshQ);
gl.attachShader(programQ, fshQ);
gl.linkProgram(programQ);

gl.enable(gl.DEPTH_TEST);
gl.depthFunc(gl.LESS);

['vertex', 'normal'].forEach(function(i) {
  program[i] = gl.getAttribLocation(program, i);
});

['projection', 'view', 'model', 'mnormal'].forEach(function(i) {
  program[i] = gl.getUniformLocation(program, i);
});

['position'].forEach(function(i) {
  programQ[i] = gl.getAttribLocation(programQ, i);
});

['depthTex', 'normalTex', 'positionTex', 'colorTex', 'lightPos', 'doccl'].forEach(function(i) {
  programQ[i] = gl.getUniformLocation(programQ, i);
});


gl.useProgram(program);

gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.vertices), gl.STATIC_DRAW);
gl.enableVertexAttribArray(program.vertex);
gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 0, 0);

gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(geom.normals), gl.STATIC_DRAW);
gl.enableVertexAttribArray(program.normal);
gl.vertexAttribPointer(program.normal, 3, gl.FLOAT, false, 0, 0);

gl.useProgram(programQ);

gl.bindBuffer(gl.ARRAY_BUFFER, qbuf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([ 1, -1, -1, -1, -1, 1,  1, -1, -1, 1, 1, 1 ]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(programQ.position);
gl.vertexAttribPointer(programQ.position, 2, gl.FLOAT, false, 0, 0);

mat4.perspective(projection, Math.PI / 2, w / h, .001, 1000.);
mat4.scale(view, view, [.00001, .00001, .00001]);
mat4.translate(view, view, [0, -100, -200]);
mat4.rotateX(view, view, Math.PI / 4);

gl.clearColor(0, 0, 0, 1);
gl.viewport(0, 0, w, h);

console.log(program, programQ);

var lightPos = [], lp = vec3.create(), doccl = false,
    x = 60, y = 30, z = 0, t = 0;

/*document.body.addEventListener('keydown', function(evt) {
  switch(evt.keyIdentifier) {
    case 'Right': x += 0.1; break;
    case 'Left': x -= 0.1; break;
    case 'Up': z += 0.1; break;
    case 'Down': z -= 0.1; break;
    default: break;
  }

  evt.preventDefault();
  evt.stopPropagation();
});*/

document.body.addEventListener('keydown', function(evt) {

  if(evt.which === 79) doccl = !doccl;

});

var r = function() {

  stats.begin();

  t += .025;
  z -= 1;

  lightPos = [];

  vec3.set(lp, Math.cos(t) * 600., 80, Math.sin(t) * 600);
  vec3.transformMat4(lp, lp, view);
  lightPos.push.apply(lightPos, lp);
  vec3.set(lp, Math.cos(t + Math.PI / 2) * 600., 80, Math.sin(t + Math.PI / 2) * 600);
  vec3.transformMat4(lp, lp, view);
  lightPos.push.apply(lightPos, lp);
  vec3.set(lp, Math.cos(t + Math.PI) * 600., 80, Math.sin(t + Math.PI) * 600);
  vec3.transformMat4(lp, lp, view);
  lightPos.push.apply(lightPos, lp);
  vec3.set(lp, Math.cos(t + 3 * Math.PI / 2) * 600., 80, Math.sin(t + 3 * Math.PI / 2) * 600);
  vec3.transformMat4(lp, lp, view);
  lightPos.push.apply(lightPos, lp);

  //mat4.rotateY(view, view, Math.PI / 1024);
  //vec3.set(lightPos, Math.cos(t) * 400., 20, Math.sin(t) * 400.);
  //vec3.set(lightPos, x, y, z);
  //vec3.transformMat4(lightPos, lightPos, view);

  // Framebuffer
  gl.useProgram(program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.uniformMatrix4fv(program.projection, false, projection);
  gl.uniformMatrix4fv(program.model, false, model);
  gl.uniformMatrix3fv(program.mnormal, false, mnormal);
  gl.uniformMatrix4fv(program.view, false, view);

  gl.enableVertexAttribArray(program.vertex);
  gl.enableVertexAttribArray(program.normal);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
  gl.vertexAttribPointer(program.normal, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, geom.vertices.length / 3);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disableVertexAttribArray(program.vertex);
  gl.disableVertexAttribArray(program.normal);

  // Quad
  gl.useProgram(programQ);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, depthRGBT);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, normalT);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, posT);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, colorT);
  gl.uniform1i(programQ.depthTex, 0);
  gl.uniform1i(programQ.normalTex, 1);
  gl.uniform1i(programQ.positionTex, 2);
  gl.uniform1i(programQ.colorTex, 3);
  gl.uniform3fv(programQ.lightPos, lightPos);
  gl.uniform1i(programQ.doccl, doccl);

  gl.bindBuffer(gl.ARRAY_BUFFER, qbuf);
  gl.vertexAttribPointer(programQ.position, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(programQ.position);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.disableVertexAttribArray(programQ.position);

  stats.end();

  requestAnimationFrame(r);
}
r();
