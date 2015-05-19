var Mesh = function(gl, geom) {
  this.vbuf = gl.createBuffer();
  this.nbuf = gl.createBuffer();
  this.cbuf = gl.createBuffer();

  this.count = ~~(geom.vertices.length / 3);

  this.gl = gl;

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.nbuf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.cbuf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.colors, gl.STATIC_DRAW);

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
  gl.bindBuffer(gl.ARRAY_BUFFER, this.cbuf);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'extra'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'extra'), 3, gl.FLOAT, false, 0, 0);

}

Mesh.prototype.unbind = function(program) {
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  this.gl.disableVertexAttribArray(this.gl.getAttribLocation(program, 'vertex'));
  this.gl.disableVertexAttribArray(this.gl.getAttribLocation(program, 'normal'));
  this.gl.disableVertexAttribArray(this.gl.getAttribLocation(program, 'extra'));
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

  gl.getExtension('OES_standard_derivatives');

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

  gl.useProgram(this.program);
}

Scene.prototype.add = function(el) {
  this.graph.push(el);
}

Scene.prototype.draw = function(w, h) {
  var ltransf = mat4.create(), 
      shView = mat4.create(),
      gl = this.gl;

  gl.useProgram(this.program);
  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

  gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'projection'), false, this.matrices.projection);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'view'), false, this.matrices.view);
  gl.uniform3fv(gl.getUniformLocation(this.program, 'lightPos'), this.matrices.lightPos);

  this.graph.forEach((function(program) { return function(i) {
    i.bind(program);
    var nmatrix = mat3.create();
    mat3.normalFromMat4(nmatrix, i.modelMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, i.modelMatrix);
    gl.uniformMatrix3fv(gl.getUniformLocation(program, 'nmatrix'), false, nmatrix);
    gl.drawArrays(gl.TRIANGLES, 0, i.count);
    i.unbind(program);

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

//console.log(shg);

(function() {

  var canvas = document.getElementById('canvas'),
      gl     = canvas.getContext('webgl'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  gl.viewport(0, 0, w, h);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  
  var proj = mat4.create(),
      view = mat4.create(),
      model = mat4.create(),
      lightPos = vec3.fromValues(.5, -0.25, -1),
      shProj = mat4.create(),
      scene = new Scene(gl),
      ext = gl.getExtension('EXT_texture_filter_anisotropic');

  /*(function() {
    var vertices = shgResult.vertices,
        normals = shgResult.normals,
        colors = shgResult.colors;

    var bldg = new Mesh(gl, { vertices: new Float32Array(vertices), normals: new Float32Array(normals), colors: new Float32Array(colors) });
    bldg.model = model;
    scene.add(bldg);
  }());*/

  var meshes = [];

  for(var i = 0, I = shgResult.length; i < I; i++) {
    var m = new Mesh(gl, {
      vertices: new Float32Array(shgResult[i].vertices),
      normals: new Float32Array(shgResult[i].normals),
      colors: new Float32Array(shgResult[i].colors)
    }), mat = mat4.create();
    mat4.translate(mat, mat, [ i - I / 2, 0, 0 ]);
    m.model = mat;
    m.dx = i - I / 2;
    scene.add(m)
    meshes.push(m);
  }

  mat4.perspective(proj, Math.PI / 2, w / h, 0.0001, 1000.0);
  mat4.ortho(shProj, -32, 32, -32, 32, -32, 32);

  mat4.identity(view);
  mat4.translate(view, view, [0, 0, -2]);

  scene.projection = proj;
  scene.shadowProjection = shProj;
  scene.view = view;
  var rX = Math.PI / 4, rY = -Math.PI / 6;

  canvas.addEventListener('mousedown', function(evt) {
    
    var x = evt.clientX, y = evt.clientY, irx = rX, iry = rY;
    var omm = function(evt) {
      evt.preventDefault();
      evt.stopPropagation();
      rY = iry + (x - evt.clientX) / 128;
      rX = irx + (y - evt.clientY) / 128;
    }, omu = function(evt) {
      canvas.removeEventListener('mousemove', omm);
      canvas.removeEventListener('mouseup', omu);
    }

    canvas.addEventListener('mousemove', omm);
    canvas.addEventListener('mouseup', omu);

  });

  //////////////////////////////////////////////////////////////////////////////

  function render() {

    meshes.forEach(function(i) {
      var model = mat4.create();
      mat4.translate(model, model, [ i.dx, 0, 0 ]);
      mat4.rotateY(model, model, rY);
      mat4.rotateX(model, model, rX);
      i.model = model;
    })
    scene.view = view;

    render.t += 0.02;

    scene.lightPos = lightPos;
    scene.draw(w, h);

    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);

    requestAnimationFrame(render);
  }
  render.t = 0;
  render();

}());
