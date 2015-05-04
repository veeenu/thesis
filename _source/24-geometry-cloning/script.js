var SIDE = 200;

var Mesh = function(gl, geom) {
  this.vbuf = gl.createBuffer();
  this.nbuf = gl.createBuffer();
  this.cbuf = gl.createBuffer();

  this.obuf = gl.createBuffer();

  this.count = ~~(geom.vertices.length / 3);

  this.gl = gl;

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.vertices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.nbuf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, this.cbuf);
  gl.bufferData(gl.ARRAY_BUFFER, geom.colors, gl.STATIC_DRAW);

  var offsets = [];
  for(var x = 0; x < SIDE; x++) {
    for(var y = 0; y < SIDE; y++) {
      offsets.push(x/10, y/10, 0);
    }
  }
  
  gl.bindBuffer(gl.ARRAY_BUFFER, this.obuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(offsets), gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

Mesh.prototype.bind = function(program, ext) {
  var gl = this.gl;
  gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vertex'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'vertex'), 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.nbuf);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'normal'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'normal'), 3, gl.FLOAT, false, 0, 0);

  /*gl.bindBuffer(gl.ARRAY_BUFFER, this.obuf);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'offset'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'offset'), 3, gl.FLOAT, false, 0, 0);*/
  //ext.vertexAttribDivisorANGLE(gl.getAttribLocation(program, 'offset'), 1);

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

var Scene = function(gl, ext) {
  this.gl = gl;
  this.graph = [];
  this.ext = ext;
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
  console.log(ext)
}

Scene.prototype.add = function(el) {
  this.graph.push(el);
}

Scene.prototype.draw = function(w, h) {
  var ltransf = mat4.create(), 
      shView = mat4.create(),
      gl = this.gl;

  gl.viewport(0, 0, w, h);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

  gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'projection'), false, this.matrices.projection);
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'view'), false, this.matrices.view);
  gl.uniform3fv(gl.getUniformLocation(this.program, 'lightPos'), this.matrices.lightPos);

  this.graph.forEach((function(program, ext) { return function(i) {
    i.bind(program, ext);
    var nmatrix = mat3.create();
    mat3.normalFromMat4(nmatrix, i.modelMatrix);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, i.modelMatrix);
    gl.uniformMatrix3fv(gl.getUniformLocation(program, 'nmatrix'), false, nmatrix);
    gl.drawArrays(gl.TRIANGLES, 0, i.count);
    //ext.drawArraysInstancedANGLE(gl.TRIANGLES, 0, i.count, SIDE * SIDE);

  }}(this.program, this.ext)));
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
      h      = bcr.height,
      stats  = new Stats();

  stats.setMode(0);
  stats.domElement.style.position = 'absolute';
  stats.domElement.style.right = '1rem';
  stats.domElement.style.top = '1rem';
  document.body.appendChild(stats.domElement);

  canvas.width = w;
  canvas.height = h;

  gl.viewport(0, 0, w, h);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LESS);
  
  var proj = mat4.create(),
      view = mat4.create(),
      model = mat4.create(),
      lightPos = vec3.fromValues(1, 0.25, -1),
      shProj = mat4.create(),
      scene = new Scene(gl, gl.getExtension('ANGLE_instanced_arrays')),
      ext = gl.getExtension('EXT_texture_filter_anisotropic');

  (function() {
    var vertices = [], //shgResult.vertices,
        normals = [], //shgResult.normals,
        colors = []; //shgResult.colors;

    console.time('Geometry creation');
    var ggeom;

    for(var i = 0; i < 32768; i++) {
      ggeom = BuildingSHG.create({ width: .1, x: 0, y: 0, depth: .1 }) ;
    /*ggeom.geom.forEach(function(i) {
      vertices.push.apply(vertices, i.vertices);
      normals.push.apply(normals, i.normals);
    
    })*/
    }
    console.timeEnd('Geometry creation');
    console.time('Geometry cloning');
    for(var i = 0; i < 32768; i++) {
      ggeom.geom.forEach(function(i) {
        vertices.push.apply(vertices, i.vertices.map(function(i, idx) {
          if(idx % 3 === 0)
            return i + .1 * (idx - 2048);
          return i;
        }));
        normals.push.apply(normals, i.normals);

        vertices = [];
        normals = [];
      
      })
    }
    console.timeEnd('Geometry cloning');

    vertices = [];
    normals = [];
    colors = [];

    var bldg = new Mesh(gl, { vertices: new Float32Array(vertices), normals: new Float32Array(normals), colors: new Float32Array(colors) });
    bldg.model = model;
    scene.add(bldg);
  }());

  mat4.perspective(proj, Math.PI / 2, w / h, 0.0001, 1000.0);
  mat4.ortho(shProj, -16, 16, -16, 16, -16, 16);

  mat4.identity(view);
  mat4.translate(view, view, [0, -.5, -1]);

  scene.projection = proj;
  scene.shadowProjection = shProj;
  scene.view = view;
  var rX = 0, rY = 0;

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

  function render() {

    stats.begin();
    scene.view = view;
    mat4.identity(model);
    mat4.rotateY(model, model, rY);
    mat4.rotateX(model, model, rX);

    render.t += 0.02;

    scene.lightPos = lightPos;
    scene.draw(w, h);
    stats.end();

    requestAnimationFrame(render);
  }
  render.t = 0;
  render();

}());
