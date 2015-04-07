var Mesh = function(gl, geom) {
  this.vbuf = gl.createBuffer();
  this.nbuf = gl.createBuffer();

  this.count = ~~(geom.vertices.length / 3);

  this.gl = gl;

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.nbuf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

Mesh.prototype.bind = function(program) {
  var gl = this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vertex'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'vertex'), 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.nbuf);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'normal'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'normal'), 3, gl.FLOAT, false, 0, 0);

}

Mesh.prototype.unbind = function() {
  this.gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

Object.defineProperty(Mesh.prototype, 'model', {
  set: function(matrix) {
    this.modelMatrix = matrix;
  }
});

var Shader = function(gl, vshSrc, fshSrc) {
  var program = gl.createProgram(),
      vsh = gl.createShader(gl.VERTEX_SHADER),
      fsh = gl.createShader(gl.FRAGMENT_SHADER);

  gl.shaderSource(vsh, vshSrc);
  gl.shaderSource(fsh, fshSrc);
  gl.compileShader(vsh);
  gl.compileShader(fsh);
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);

  return program;
}

var Scene = function(gl) {
  this.gl = gl;
  this.graph = [];
  this.matrices = {
    projection: mat4.create(),
    view: mat4.create(),
    shadowProjection: mat4.create(),
    shadowView: mat4.create(),
    lightPos: vec3.create()
  };

  this.shFb = gl.createFramebuffer();
  this.shTex = gl.createTexture();
  this.shRb = gl.createRenderbuffer();

  this.program = Shader(gl, document.getElementById('vertex-shader').textContent, 
                        document.getElementById('fragment-shader').textContent);
  this.shadowMapProgram = Shader(gl, document.getElementById('vertex-shadow').textContent,
                                 document.getElementById('fragment-shadow').textContent);

  gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFb);
  this.shFb.size = 2048;
  gl.bindTexture(gl.TEXTURE_2D, this.shTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.shFb.size, this.shFb.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.bindRenderbuffer(gl.RENDERBUFFER, this.shRb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.shFb.size, this.shFb.size);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.shTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.shRb);

}

Scene.prototype.add = function(el) {
  this.graph.push(el);
}

Scene.prototype.draw = function(w, h) {
  var ltransf = mat4.create(), 
      shView = mat4.create(),
      gl = this.gl;

  gl.bindFramebuffer(gl.FRAMEBUFFER, this.shFb);
  gl.bindRenderbuffer(gl.RENDERBUFFER, this.shRb);
  gl.viewport(0, 0, this.shFb.size, this.shFb.size);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

  mat4.lookAt(shView, this.matrices.lightPos, [0, 0, 0], [0, 1, 0]);

  gl.useProgram(this.shadowMapProgram);
  mat4.multiply(ltransf, this.matrices.shadowProjection, shView);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.shadowMapProgram, 'ltransf'), false, ltransf);

  this.graph.forEach((function(program, mp) { return function(i) {
    i.bind(mp);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, i.modelMatrix);
    gl.drawArrays(gl.TRIANGLES, 0, i.count);

  }}(this.shadowMapProgram, this.program)));

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

  gl.useProgram(this.program);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'projection'), false, this.matrices.projection);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'view'), false, this.matrices.view);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'ltransf'), false, ltransf);
  gl.uniform3fv(gl.getUniformLocation(this.program, 'lightPos'), this.matrices.lightPos);
  gl.uniform1i(gl.getUniformLocation(this.program, 'texture'), 0);

  this.graph.forEach((function(program) { return function(i) {
    i.bind(program);
    var nmatrix = mat3.create();
    mat3.normalFromMat4(nmatrix, i.modelMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, i.modelMatrix);
    gl.uniformMatrix3fv(gl.getUniformLocation(program, 'nmatrix'), false, nmatrix);
    gl.drawArrays(gl.TRIANGLES, 0, i.count);

  }}(this.program)));
}

Scene.prototype.setView = function(view) {
  mat4.copy(this.matrices.view, view);
}

Object.defineProperty(Scene.prototype, "projection", {
  set: function(p) {
    mat4.copy(this.matrices.projection, p);
  }
});
Object.defineProperty(Scene.prototype, "shadowProjection", {
  set: function(p) {
    mat4.copy(this.matrices.shadowProjection, p);
  }
});
Object.defineProperty(Scene.prototype, "view", {
  set: function(p) {
    mat4.copy(this.matrices.view, p);
  }
});
Object.defineProperty(Scene.prototype, "lightPos", {
  set: function(p) {
    vec3.copy(this.matrices.lightPos, p);
  }
});

console.log(shg);

(function() {

  var canvas = document.getElementById('canvas'),
      c2d    = document.createElement('canvas'),
      ctx    = c2d.getContext('2d'),
      gl     = canvas.getContext('webgl'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;
  c2d.width = c2d.height = 1024;

  gl.viewport(0, 0, w, h);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  
  var proj = mat4.create(),
      view = mat4.create(),
      model = mat4.create(),
      lightPos = vec3.fromValues(1, 0.25, 1),
      shProj = mat4.create(),
      scene = new Scene(gl),
      ext = gl.getExtension('EXT_texture_filter_anisotropic');

  (function() {
    var vertices = [], normals = [];
    shgResult.forEach(function(ii) {
      vertices.push.apply(vertices, ii.vertices);
      normals.push.apply(normals, ii.normals);
    });

    var bldg = new Mesh(gl, { vertices: new Float32Array(vertices), normals: new Float32Array(normals) });
    bldg.model = model;
    scene.add(bldg);
  }());

  mat4.perspective(proj, Math.PI / 2, w / h, 0.0001, 1000.0);
  mat4.ortho(shProj, -32, 32, -32, 32, -32, 32);

  mat4.identity(view);
  mat4.translate(view, view, [0, -3, -6]);

  scene.projection = proj;
  scene.shadowProjection = shProj;
  scene.view = view;
  var rX = 0, rY = 0;

  canvas.addEventListener('mousedown', function(evt) {
    
    var omm = function(evt) {
      evt.preventDefault();
      evt.stopPropagation();
      rY += evt.movementX / 128;
      rX += evt.movementY / 128;
    }, omu = function(evt) {
      canvas.removeEventListener('mousemove', omm);
      canvas.removeEventListener('mouseup', omu);
    }

    canvas.addEventListener('mousemove', omm);
    canvas.addEventListener('mouseup', omu);

  });

  function render() {

    scene.view = view;
    mat4.identity(model);
    mat4.rotateY(model, model, rY);
    mat4.rotateX(model, model, rX);

    render.t += 0.02;

    scene.lightPos = lightPos;
    scene.draw(w, h);

    requestAnimationFrame(render);
  }
  render.t = 0;
  render();

  c2d.style.position = 'absolute';
  c2d.style.top = canvas.getBoundingClientRect().top + 'px';
  c2d.style.left = canvas.getBoundingClientRect().left + 'px';
  c2d.style.transform = 'scale(0.25, 0.25)';
  c2d.style.transformOrigin = '0 0';
  document.body.appendChild(c2d);

}());
