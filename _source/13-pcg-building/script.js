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
  this.shFb.size = 1024;
  gl.bindTexture(gl.TEXTURE_2D, this.shTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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

var ShapeGrammar = function(rules) {
  Object.defineProperty(this, 'rules', {
    value: rules,
    writable: false
  });

  Object.freeze(this.rules);

};

ShapeGrammar.prototype.run = function(axiom) {
  
  var result = [], nontermLeft = false;

  axiom.forEach(function(v) {
    if('geom' in v) {
      return result.push(v);
    }

    nontermLeft = true;

    var productions = this.rules[v.sym];
    productions.forEach(function(prod) {

      if('sym' in prod) { // Nonterminal
        var bndD, bndS;
        bndD = vec3.fromValues(
          v.bounds[0] + v.bounds[3] * prod.bound[0],
          v.bounds[1] + v.bounds[4] * prod.bound[1],
          v.bounds[2] + v.bounds[5] * prod.bound[2]
        ); 
        bndS = vec3.fromValues(
          v.bounds[3] * prod.bound[3],
          v.bounds[4] * prod.bound[4],
          v.bounds[5] * prod.bound[5]
        );
        var rhs = {
          sym: prod.sym,
          transl: v.transl ? vec3.clone(v.transl) : vec3.create(),
          quat: v.quat ? quat.clone(v.quat) : quat.create()
        }

        var q = quat.create(),
            transl = vec3.create();

        quat.rotateX(q, q, prod.transform[3]);
        quat.rotateY(q, q, prod.transform[4]);
        quat.rotateZ(q, q, prod.transform[5]);
        vec3.add(transl, transl, prod.transform.slice(0,3));

        //vec3.transformMat4(bndD, bndD, I);
        //vec3.transformMat4(bndS, bndS, I);
        rhs.bounds = [
          bndD[0], bndD[1], bndD[2],
          bndS[0], bndS[1], bndS[2]
        ]

        //mat4.mul(rhs.mat, rhs.mat, I);
        quat.mul(rhs.quat, rhs.quat, q);
        vec3.add(rhs.transl, rhs.transl, transl);

        //console.log(rhs.sym, rhs.bounds.map(function(i) { return i.toFixed(1).replace(/^(\d)/, ' $1') }));
        result.push(rhs);
      } else if('render' in prod) { // Terminal to render
        result.push({ geom: prod.render.call(v) });
      }    
    });
  }.bind(this));
  console.log(result.map(function(i) { return i.sym}).join(' '));

  return nontermLeft ? this.run(result) : result;
}

ShapeGrammar.renderQuad = function() {
  var b = this.bounds,
      mtx = this.mat,
      q = this.quat,
      transl = this.transl,
      nmtx = mat3.create(), 
      x0 = b[0], x1 = b[3] + x0,
      y0 = b[1], y1 = b[4] + y0,
      z0 = b[2], z1 = b[5] + z0,
      vertices = [], normals = [], u, v, w, nx, ny, nz, nv;

  //mat3.normalFromMat4(nmtx, mtx);

  [
    [x0, y0, z0],  [x0, y1, z0],  [x1, y1, z0],
    [x0, y0, z0],  [x1, y1, z0],  [x1, y0, z0]
  ].forEach(function(i) {
    var v = vec3.fromValues(i[0], i[1], i[2]);
    vec3.transformQuat(v, v, q);
    vec3.add(v, v, transl);
    vertices.push(v[0], v[1], v[2]);
  });

  x0 = vertices[0]; x1 = vertices[6];
  y0 = vertices[1]; y1 = vertices[7];

  u = vec3.fromValues(0,        y1 - y0, 0);
  v = vec3.fromValues(x1 - x0,  y1 - y0, 0);
  w = vec3.fromValues(x1 - x0,  0,       0);
  nx = u[1] * v[2] - u[2] * v[1];
  ny = u[2] * v[0] - u[0] * v[2];
  nz = u[0] * v[1] - u[1] * v[0];
  nv = vec3.fromValues(nx, ny, nz);
  //vec3.transformMat4(nv, nv, nmtx);
  vec3.transformQuat(nv, nv, q);
  vec3.normalize(nv, nv);
  normals.push(nv[0], nv[1], nv[2]);
  normals.push(nv[0], nv[1], nv[2]);
  normals.push(nv[0], nv[1], nv[2]);

  u = vec3.fromValues(x1 - x0,  y1 - y0, 0);
  v = vec3.fromValues(x1 - x0,  0,       0);
  w = vec3.fromValues(x1 - x0,  y1 - y0, 0);
  nx = u[1] * v[2] - u[2] * v[1];
  ny = u[2] * v[0] - u[0] * v[2];
  nz = u[0] * v[1] - u[1] * v[0];
  nv = vec3.fromValues(nx, ny, nz);
  //vec3.transformMat4(nv, nv, nmtx);
  vec3.transformQuat(nv, nv, q);
  vec3.normalize(nv, nv);
  normals.push(nv[0], nv[1], nv[2]);
  normals.push(nv[0], nv[1], nv[2]);
  normals.push(nv[0], nv[1], nv[2]);

  return { vertices: vertices, normals: normals };

};

var shg = new ShapeGrammar({
  'F': [
    { sym: 'C', transform: [ 0, 3.6, 0,  0, 0, 0 ],              bound: [ 0, 0, 0,  1, 1, 1 ]},
    { sym: 'D', transform: [ 0, 0, 0,  0, 0, 0 ],          bound: [ 0, 0, 0,  1, 1, 1 ]},
    { sym: 'W', transform: [ 0, 0, 0,  0, Math.PI / 2, 0 ],      bound: [ 0, 0, 0,  1, 1, 1 ]},
    { sym: 'W', transform: [ 0, 0, 0,  0, Math.PI, 0 ],                bound: [ 0, 0, 0,  1, 1, 1 ]},
    { sym: 'W', transform: [ 0, 0, 0,  0, Math.PI * 3 / 2, 0 ],  bound: [ 0, 0, 0,  1, 1, 1 ]},
    { sym: 'f', transform: [ 0, 0, 0,  Math.PI / 2, 0, 0 ],      bound: [ 0, 0, 0,  1, 1, 1 ]},
    { sym: 'f', transform: [ 0, 0, 0,  -Math.PI / 2, 0, 0 ],     bound: [ 0, 0, 0,  1, 1, 1 ]},
  ],
  'C': [
    { sym: 'D', transform: [ 0, 0, 0,  0, 0, 0 ],          bound: [ .1, .1, .1,  .8, .8, .8 ]},
    { sym: 'W', transform: [ 0, 0, 0,  0, Math.PI / 2, 0 ],      bound: [ .1, .1, .1,  .8, .8, .8 ]},
    { sym: 'W', transform: [ 0, 0, 0,  0, Math.PI, 0 ],                bound: [ .1, .1, .1,  .8, .8, .8 ]},
    { sym: 'W', transform: [ 0, 0, 0,  0, Math.PI * 3 / 2, 0 ],  bound: [ .1, .1, .1,  .8, .8, .8 ]},
    { sym: 'f', transform: [ 0, 0, 0,  Math.PI / 2, 0, 0 ],      bound: [ .1, .1, .1,  .8, .8, .8 ]},
    { sym: 'f', transform: [ 0, 0, 0,  -Math.PI / 2, 0, 0 ],     bound: [ 0, 0, 0,  1, 1, 1 ]}
  ],
  'W': [
    { sym: 'w', transform: [ 0, 0, 0, 0, 0, 0 ], bound: [  0, 0, 0,  1, 1, 1 ]},
  ],
  'D': [
    { sym: 'P', transform: [ 0, 0, 0, 0, 0, 0 ], bound: [  0, 0, 0,  .3, 1, 1 ]},
    { sym: 'P', transform: [ 0, 0, 0, 0, 0, 0 ], bound: [ .7, 0, 0,  .3, 1, 1 ]},
    { sym: 'P', transform: [ 0, 0, 0, 0, 0, 0 ], bound: [ .3, .7, 0,  .4, .3, 1 ]},
  ],
  'P': [
    { sym: 'w', transform: [ 0, 0, 0, 0, 0, 0 ], bound: [ 0, 0, 0, 1, 1, 1 ]}
  ],
  'f': [
    {
      render: ShapeGrammar.renderQuad
    }
  ],
  'w': [
    { 
      render: ShapeGrammar.renderQuad
    }
  ]
});

var shgResult = shg.run([
  { sym: 'F', bounds: [ -2, -2, -2, 4, 4, 4 ] }
]);

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
  gl.depthFunc(gl.LEQUAL);
  
  var proj = mat4.create(),
      view = mat4.create(),
      model = mat4.create(),
      lightPos = vec3.fromValues(1, 0.25, 1),
      shProj = mat4.create(),
      scene = new Scene(gl),
      ext = gl.getExtension('EXT_texture_filter_anisotropic');

  /*(function() {
    var floor = new Mesh(gl, Cuboid([0, -2, 0], [32, 1, 32]));
    floor.model = mat4.create();
    scene.add(floor);
    var geom = Cuboid([0, 2, 0], [3, 3, 3]);
    var mesh = new Mesh(gl, geom);
    mesh.model = model;
    scene.add(mesh);
  }());*/

  (function() {
    var vertices = [], normals = [];
    shgResult.forEach(function(i) {
      vertices.push.apply(vertices, i.geom.vertices);
      normals.push.apply(normals, i.geom.normals);
    });

    var bldg = new Mesh(gl, { vertices: new Float32Array(vertices), normals: new Float32Array(normals) });
    bldg.model = model;
    scene.add(bldg);
  }());

  mat4.perspective(proj, Math.PI / 2, w / h, 0.0001, 1000.0);
  mat4.ortho(shProj, -8, 8, -8, 8, -8, 8);
  //mat4.ortho(proj, -3 * w / h, 3 * w / h, -3, 3, -3, 3);

  mat4.identity(view);
  mat4.translate(view, view, [0, -.5, -8]);
  mat4.rotateX(view, view, Math.PI / 12);

  scene.projection = proj;
  scene.shadowProjection = shProj;
  scene.view = view;
  //console.log(scene)
  mat4.rotateY(model, model, Math.PI / 8);

  function render() {

    /*lightPos[0] = 16 * Math.cos(render.t / 2);
    lightPos[1] = 16;
    lightPos[2] = 16 * Math.sin(render.t / 2);
    vec3.normalize(lightPos, lightPos);*/

    mat4.rotateY(model, model, Math.PI / 512);

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
