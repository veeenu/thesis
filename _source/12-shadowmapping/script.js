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
  c2d.width = c2d.height = 512;

  gl.viewport(0, 0, w, h);

  /**
   * Cube mesh generation with per-vertex normals
   */
  var Cuboid = function(translate, scale) {
  
    var verts,  indices,
        vertices = [], normals = [], uvs = [],
        tangents = [], bitangents = [],
        xn, yn, zn, xt, yt, zt, xb, yb, zb;
    verts = [
      -1, -1, -1,
      -1, -1,  1,
       1, -1,  1,
       1, -1, -1,
      -1,  1, -1,
      -1,  1,  1,
       1,  1,  1,
       1,  1, -1
    ];
    indices = [
      0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
      1, 5, 4, 1, 4, 0, 3, 7, 6, 3, 6, 2,
      2, 6, 5, 2, 5, 1, 0, 4, 7, 0, 7, 3
    ];

    for(var k = 0, o = indices.length; k < o;) {
      var i1 = indices[k++], i2 = indices[k++], i3 = indices[k++],
          x1 = scale[0] * verts[i1 * 3] + translate[0], 
          y1 = scale[1] * verts[i1 * 3 + 1] + translate[1], 
          z1 = scale[2] * verts[i1 * 3 + 2] + translate[2],
          x2 = scale[0] * verts[i2 * 3] + translate[0], 
          y2 = scale[1] * verts[i2 * 3 + 1] + translate[1], 
          z2 = scale[2] * verts[i2 * 3 + 2] + translate[2],
          x3 = scale[0] * verts[i3 * 3] + translate[0], 
          y3 = scale[1] * verts[i3 * 3 + 1] + translate[1], 
          z3 = scale[2] * verts[i3 * 3 + 2] + translate[2];

      vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);

      var u = vec3.fromValues(x2 - x1, y2 - y1, z2 - z1),
          v = vec3.fromValues(x3 - x1, y3 - y1, z3 - z1),
          w = vec3.fromValues(x3 - x2, y3 - y2, z3 - z2),
          xn = u[1] * v[2] - u[2] * v[1],
          yn = u[2] * v[0] - u[0] * v[2],
          zn = u[0] * v[1] - u[1] * v[0];
      normals.push(xn, yn, zn, xn, yn, zn, xn, yn, zn);
    }

    return {
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals)
    }

  };

  var Mesh = function(geom) {
    this.vbuf = gl.createBuffer();
    this.nbuf = gl.createBuffer();

    this.count = ~~(geom.vertices.length / 3);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.vertices, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.nbuf);
    gl.bufferData(gl.ARRAY_BUFFER, geom.normals, gl.STATIC_DRAW);

    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  Mesh.prototype.bind = function() {
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbuf);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vertex'));
    gl.vertexAttribPointer(gl.getAttribLocation(program, 'vertex'), 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.nbuf);
    gl.enableVertexAttribArray(gl.getAttribLocation(program, 'normal'));
    gl.vertexAttribPointer(gl.getAttribLocation(program, 'normal'), 3, gl.FLOAT, false, 0, 0);
  
  }

  Mesh.prototype.unbind = function() {
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  var Shader = function(vshSrc, fshSrc) {
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
    //gl.useProgram(program);

    return program;
  }

  window.geoms = [Cuboid([0, -2, 0], [32, 1, 32])];
  var mesh2 = new Mesh(window.geoms[0]),
      cubes = [];
  [-2, -1, 0, 1, 2].forEach(function(x) {
    [-2, -1, 0, 1, 2].forEach(function(y) {
      [-2, -1, 0, 1, 2].forEach(function(z) {
        var geom = Cuboid([4 * x, 4 * y + 8, 4 * z], [1, 1, 1]);
        var mesh = new Mesh(geom);
        cubes.push(mesh);
        window.geoms.push(geom);
      });
    });
  });


  var program = Shader(document.getElementById('vertex-shader').textContent, 
                       document.getElementById('fragment-shader').textContent),
      shadowMapProgram = Shader(document.getElementById('vertex-shadow').textContent,
                                document.getElementById('fragment-shadow').textContent),
      tex = gl.createTexture();

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.useProgram(shadowMapProgram);

  /**
   * Super simple OBJ importer.
   */
  /*var cube = (function() {
  
    var objdata = document.getElementById('cube').textContent.split(/\n/g),
        verts = [], inds = [], norms = [];

    for(var i = 0; i < objdata.length; i++) {
      var s = objdata[i].split(/\s+/);
      if(s[0] === 'v')
        verts.push(s.slice(1).map(parseFloat));
      else if(s[0] === 'vn')
        norms.push(s.slice(1).map(parseFloat));
      else if(s[0] === 'f')
        inds.push.apply(inds, s.slice(1).map(function(i) {
          return i.split('//').map(parseFloat);
        }));
    }

    var cmesh = inds.reduce(function(mesh, i) {
      mesh.vertices.push.apply(mesh.vertices, verts[i[0] - 1]);
      mesh.normals.push.apply(mesh.normals, norms[i[1] - 1]);
      return mesh;
    }, { vertices: [], normals: [] });

    return cmesh;

  }());*/

  
  var proj = mat4.create(),
      view = mat4.create(),
      model = mat4.create(),
      lightTransf = mat4.create(),
      lightPos = vec3.fromValues(1, 0.25, 1),
      shProj = mat4.create(),
      shView = mat4.create(),
      shFb = gl.createFramebuffer(),
      shTex = gl.createTexture(),
      shRb = gl.createRenderbuffer(),
      ext = gl.getExtension('EXT_texture_filter_anisotropic');

  gl.bindFramebuffer(gl.FRAMEBUFFER, shFb);
  shFb.size = 1024;
  gl.bindTexture(gl.TEXTURE_2D, shTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, shFb.size, shFb.size, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.generateMipmap(gl.TEXTURE_2D);

  gl.bindRenderbuffer(gl.RENDERBUFFER, shRb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, shFb.size, shFb.size);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, shTex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, shRb);

  mat4.perspective(proj, Math.PI / 2, w / h, 0.0001, 1000.0);
  mat4.ortho(shProj, -48, 48, -48, 48, -48, 48);

  mat4.identity(view);
  mat4.translate(view, view, [0, 0, -20]);
  //mat4.scale(view, view, [.5, .5, .5]);
  mat4.rotateX(view, view, Math.PI / 12);

  mat4.identity(shView);

  function render() {

    gl.bindFramebuffer(gl.FRAMEBUFFER, shFb);
    gl.bindRenderbuffer(gl.RENDERBUFFER, shRb);
    gl.viewport(0, 0, shFb.size, shFb.size);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

    mat4.lookAt(shView, lightPos, [0, 0, 0], [0, 1, 0]);

    gl.useProgram(shadowMapProgram);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowMapProgram, 'projection'), false, shProj);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowMapProgram, 'view'), false, shView);

    mesh2.bind();
    mat4.identity(model);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowMapProgram, 'model'), false, model);
    gl.drawArrays(gl.TRIANGLES, 0, mesh2.count);

    mat4.translate(model, model, [0, 1 + Math.sin(render.t), 0]);
    mat4.rotateY(model, model, render.t * .5);
    gl.uniformMatrix4fv(gl.getUniformLocation(shadowMapProgram, 'model'), false, model);
    cubes.forEach(function(cube) {
      cube.bind();
      gl.drawArrays(gl.TRIANGLES, 0, cube.count);
    })

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);

    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

    mat4.multiply(lightTransf, shProj, shView);

    gl.useProgram(program);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, proj);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'ltransf'), false, lightTransf);
    gl.uniform3fv(gl.getUniformLocation(program, 'lightPos'), lightPos);
    gl.uniform1i(gl.getUniformLocation(program, 'texture'), 0);

    mesh2.bind();
    mat4.identity(model);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
    gl.drawArrays(gl.TRIANGLES, 0, mesh2.count);

    mat4.translate(model, model, [0, 1 + Math.sin(render.t), 0]);
    mat4.rotateY(model, model, render.t * .5);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
    cubes.forEach(function(cube) {
      cube.bind();
      gl.drawArrays(gl.TRIANGLES, 0, cube.count);
    })

    lightPos[0] = 16 * Math.cos(render.t / 2);
    lightPos[1] = 16;
    lightPos[2] = 16 * Math.sin(render.t / 2);
    vec3.normalize(lightPos, lightPos);

    render.t += 0.02;

    //mat4.lookAt(shView, lightPos, [0, 0, 0], [0, 1, 0]);

    //mat4.rotateY(model, model, Math.PI / 1024);
    //mat4.rotateY(view, view, Math.PI / 1024);
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

/*(function() {

  var canvas = document.createElement('canvas'),
      gl = canvas.getContext('webgl');

  canvas.width = 1280;
  canvas.height = 800;

  var scene = new THREE.Scene(),
      cam   = new THREE.PerspectiveCamera(90, 1280/800, .0001, 1000),
      light = new THREE.DirectionalLight(0xffffff, 1.),
      objects = [],
      rnd = new THREE.WebGLRenderer({canvas: canvas, antialias: true});

  light.castShadow = true;
  light.shadowMapWidth = light.shadowMapHeight = 1024;
  light.shadowCameraLeft = light.shadowCameraBottom = light.shadowCameraNear = -48;
  light.shadowCameraRight = light.shadowCameraTop = light.shadowCameraFar = 48;

  window.geoms.forEach(function(i) {
    var bufg = new THREE.BufferGeometry(), mat = new THREE.MeshPhongMaterial({ color: 0x3333cc });
    bufg.addAttribute('position', new THREE.BufferAttribute(i.vertices, 3));
    bufg.addAttribute('normal', new THREE.BufferAttribute(i.normals, 3));
    var obj = new THREE.Mesh(bufg, mat);
    obj.castShadow = obj.receiveShadow = true
    objects.push(obj);
    scene.add(obj);
  });

  scene.add(light);
  cam.rotation.set(-Math.PI / 12, 0, 0);
  cam.position.set(0, 0, 20);

  document.body.appendChild(canvas);
  rnd.shadowMapEnabled = true;
  rnd.shadowMapCullFace = THREE.CullFaceBack;
  rnd.setClearColor(0x000000, 255);

  var render = function() {
    rnd.clear(true,true,false);
    rnd.render(scene, cam);

    light.position.set(16 * Math.cos(render.t / 2), 16, 16 * Math.sin(render.t / 2));
    render.t += 0.05;
    requestAnimationFrame(render);
  }

  render.t = 0;
  render()
  console.dir(cam);

}());
*/
