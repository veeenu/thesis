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

var Cuboid = function(mtx, excludeFaces) {
  var verts,  indices,
      vertices = [], normals = [], uvs = [],
      tangents = [], bitangents = [],
      xn, yn, zn, xt, yt, zt, xb, yb, zb;
  verts = [
    -.5, -.5, -.5,
    -.5, -.5,  .5,
     .5, -.5,  .5,
     .5, -.5, -.5,
    -.5,  .5, -.5,
    -.5,  .5,  .5,
     .5,  .5,  .5,
     .5,  .5, -.5
  ];
  indices = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
    1, 5, 4, 1, 4, 0, 3, 7, 6, 3, 6, 2,
    2, 6, 5, 2, 5, 1, 0, 4, 7, 0, 7, 3
  ];
  // Bottom, top, left, right, back, front
  // 0,      1,   2,    3,     4,    5
  excludeFaces = excludeFaces || [];

  for(var k = 0, o = indices.length; k < o;) {
    if(excludeFaces.indexOf(~~(k / 6)) !== -1) {
      k += 3; continue;
    }
    var i1 = indices[k++], i2 = indices[k++], i3 = indices[k++],
        v1 = vec3.fromValues(verts[i1 * 3], verts[i1 * 3 + 1], verts[i1 * 3 + 2]),
        v2 = vec3.fromValues(verts[i2 * 3], verts[i2 * 3 + 1], verts[i2 * 3 + 2]),
        v3 = vec3.fromValues(verts[i3 * 3], verts[i3 * 3 + 1], verts[i3 * 3 + 2]);
        
    vec3.transformMat4(v1, v1, mtx);
    vec3.transformMat4(v2, v2, mtx);
    vec3.transformMat4(v3, v3, mtx);

    vertices.push.apply(vertices, v1);
    vertices.push.apply(vertices, v2);
    vertices.push.apply(vertices, v3);

    var u = vec3.create(), v = vec3.create(), w = vec3.create();
    vec3.sub(u, v2, v1);
    vec3.sub(v, v3, v1);
    vec3.cross(w, u, v);
    vec3.normalize(w, w);
    normals.push(w[0], w[1], w[2], w[0], w[1], w[2], w[0], w[1], w[2]);
  }

  return {
    vertices: new Float32Array(vertices),
    normals: new Float32Array(normals)
  }

}

var ShapeGrammar = function(rules) {
  for(var i in rules) {
    rules[i].forEach(function(rhs) {
      rhs.R = rhs.R || [ 0, 0, 0 ];
      rhs.T = rhs.T || [ 0, 0, 0 ];
      rhs.S = rhs.S || [ 1, 1, 1 ];
    });
  }

  Object.defineProperty(this, 'rules', {
    value: rules,
    writable: false
  });

  Object.freeze(this.rules);

};

ShapeGrammar.prototype.run = function(axiom, params) {
  
  var result = [], nontermLeft = false;

  axiom.forEach(function(v) {
    if('geom' in v) {
      return result.push(v);
    }

    nontermLeft = true;

    var productions = this.rules[v.sym];
    if(typeof productions[0] === 'function')
      productions = productions[0].apply({ v: v, params: params[v.sym] || null }, productions.slice(1));

    productions.forEach(function(prod) {

      if('sym' in prod) { // Nonterminal
        if('prob' in prod && Math.random() > prod.prob)
          return;

        var rhs = {
          sym: prod.sym,
          translation:  v.translation ? vec3.clone(v.translation) : vec3.create(),
          rotation:     v.rotation    ? quat.clone(v.rotation)    : quat.create(),
          scale:        v.scale       ? vec3.clone(v.scale)       : vec3.create(),
          param:        prod.param || null
        }

        var q = quat.create(), t = vec3.create();

        quat.rotateX(q, q, prod.R[0]);
        quat.rotateY(q, q, prod.R[1]);
        quat.rotateZ(q, q, prod.R[2]);

        vec3.copy(t, prod.T);
        vec3.mul(t, t, rhs.scale);

        quat.mul(rhs.rotation, rhs.rotation, q);
        vec3.add(rhs.translation, rhs.translation, t);
        vec3.mul(rhs.scale, rhs.scale, prod.S);

        result.push(rhs);
      } else if('render' in prod) { // Terminal to render
        result.push({ geom: prod.render.call(v) });
      }    
    });
  }.bind(this));
  console.log(result.map(function(i) { return i.sym}).join(' '));

  return nontermLeft ? this.run(result, params || []) : result;
}

/**
 * Front: 0   Left:  2   Top:    4
 * Back:  1   Right: 3   Bottom: 5
 */

var shg = new ShapeGrammar({
  'F': [
    { sym: 'w', T: [  0, -.45, 0 ], R: [ 0, 0, 0 ], S: [ 1, .1, 1 ] },
    { sym: 'B' }
  ],
  'B': [
    { sym: 'w', T: [    0, 0,  -.45 ], R: [ 0, 0, 0 ], S: [ 1, 1, .1 ] },
    { sym: 'w', T: [ -.45, 0,    0 ], R: [ 0, Math.PI / 2,  0 ], S: [ 1, 1, .1 ] },
    { sym: 'w', T: [  .45, 0,    0 ], R: [ 0, Math.PI / 2,  0 ], S: [ 1, 1, .1 ] },

    //{ sym: 'w', T: [  0, .45,  0 ], R: [ 0, Math.PI / 2,  0 ], S: [ 1, .1, 1 ] },

    { sym: 'D', T: [ 0, 0, 0 ], R: [ 0, 0, 0 ], S: [ 1, 1, 1 ] },
  ],
  'D': [
    function() {
     
      var dfcV = (1 - this.params.bufw) / 2,
          subdWindow = 1 - this.params.bufw * 2,
          subdWindowInner = subdWindow + this.params.subw;
          subdWidth = subdWindowInner / this.params.subdivisionsX,
          subdHeight = subdWindowInner / this.params.subdivisionsY,
          topBuf    = { sym: 'w', T: [ 0, dfcV, .55 ], R: [ 0, 0, 0 ], S: [ 1, this.params.bufw, .1 ]},
          bottomBuf = { sym: 'w', T: [ 0, -dfcV, .55 ], R: [ 0, 0, 0 ], S: [ 1, this.params.bufw, .1 ]},
          leftBuf   = { sym: 'w', T: [ -dfcV, 0, .55 ], R: [ 0, 0, 0 ], S: [ this.params.bufw, subdWindow, .1 ]},
          rightBuf  = { sym: 'w', T: [ dfcV, 0, .55 ], R: [ 0, 0, 0 ], S: [ this.params.bufw, subdWindow, .1 ]},
          aaa = { sym: 'w', T: [ 0, 0, .45 ], R: [ 0, 0, 0 ], S: [ subdWindow, subdWindow, .1]}
          out = [topBuf, bottomBuf, leftBuf, rightBuf] 
          
      for(var y = 1; y <= this.params.subdivisionsY; y++) {
        var horizBar = { sym: 'w', T: [ 0, -subdWindowInner / 2 + y * subdHeight, .55 ], R: [ 0, 0, 0 ], S: [ subdWindow, this.params.subw, .1 ]};
        for(var x = 1; x < this.params.subdivisionsX; x++) {
          var vertBar = { sym: 'w', T: [ -subdWindowInner / 2 + x * subdWidth, horizBar.T[1] - subdHeight / 2, .55 ], R: [ 0, 0, 0 ], S: [ this.params.subw, subdHeight - this.params.subw, .1 ]};
          out.push(vertBar);
        }
        if(y < this.params.subdivisionsY) out.push(horizBar);
      }

      return out;
    }
    /*{ sym: 'w', T: [ -.35, 0, .55 ], R: [ 0, 0, 0 ], S: [ .3, 1, .1] },
    { sym: 'w', T: [ .35, 0, .55 ], R: [ 0, 0, 0 ], S: [ .3, 1, .1] },
    { sym: 'w', T: [ 0, .35, .55 ], R: [ 0, 0, 0 ], S: [ .4, .3, .1] },
    { sym: 'w', T: [ 0, -.45, .55 ], R: [ 0, 0, 0 ], S: [ .4, .1, .1] },*/
  ],
  'w': [
    {
      render: function() {
        var mat = mat4.create(), mat1 = mat4.create();
        mat4.scale(mat, mat, this.scale);
        mat4.fromRotationTranslation(mat1, this.rotation, this.translation);
        mat4.mul(mat, mat1, mat);
        // Bottom, top, right, left, back, front
        // 0,      1,   2,     3,    5,    4

        return new Cuboid(mat);
      }
    }
  ]
})

var shgResult = shg.run([
  { sym: 'F', translation: [ 0, 0, 0 ], scale: [ 4, 4, 4 ] },
  { sym: 'F', translation: [ 0, 4, 0 ], scale: [ 4, 4, 4 ] },
  { sym: 'F', translation: [ 0, 8, 0 ], scale: [ 3.5, 4, 3.5 ] },
  { sym: 'w', translation: [ 0, 9.925, .175 ], rotation: [0, 0, 0, 0], scale: [ 2.9, .15, 3.15 ] },
], {
  'D': {
    subdivisionsX: 4,
    subdivisionsY: 3,
    subw: .05,
    bufw: .15
  }
});

console.log(shgResult);

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
  //gl.depthFunc(gl.LEQUAL);
  
  var proj = mat4.create(),
      view = mat4.create(),
      model = mat4.create(),
      lightPos = vec3.fromValues(1, 0.25, 1),
      shProj = mat4.create(),
      scene = new Scene(gl),
      ext = gl.getExtension('EXT_texture_filter_anisotropic');

  (function() {
    var vertices = [], normals = [], 
        objV = '', objN = '', objF = '';
    shgResult.forEach(function(ii) {
      vertices.push.apply(vertices, ii.geom.vertices);
      normals.push.apply(normals, ii.geom.normals);
    });

    // Vertex welding. ~23ms CPU, useful?
    /*for(var i = 0; i < vertices.length; i += 3) {
      var vI = vertices.slice(i, i + 3);
      for(var j = i + 1; j < vertices.length; j += 3) {
        var vJ = vertices.slice(j, j + 3);
        if(vec3.dist(vI, vJ) < 0.1) {
          vertices[i]     = vJ[0];
          vertices[i + 1] = vJ[1];
          vertices[i + 2] = vJ[2];
        }
      }
    }*/
    var bldg = new Mesh(gl, { vertices: new Float32Array(vertices), normals: new Float32Array(normals) });
    bldg.model = model;
    scene.add(bldg);
  }());

  mat4.perspective(proj, Math.PI / 2, w / h, 0.0001, 1000.0);
  mat4.ortho(shProj, -16, 16, -16, 16, -16, 16);
  //mat4.ortho(proj, -12 * w / h, 12 * w / h, -12, 12, -12, 12);

  mat4.identity(view);
  mat4.translate(view, view, [0, -5, -12]);
  //mat4.rotateX(view, view, Math.PI / 6);

  scene.projection = proj;
  scene.shadowProjection = shProj;
  scene.view = view;
  //mat4.rotateY(model, model, Math.PI * 9 / 8);

  canvas.addEventListener('mousedown', function(evt) {
    
    var omm = function(evt) {
      //mat4.translate(view, view, [0, 0, -evt.movementY]);
      mat4.rotateY(model, model, evt.movementX / 128);
    }, omu = function(evt) {
      canvas.removeEventListener('mousemove', omm);
      canvas.removeEventListener('mouseup', omu);
    }

      canvas.addEventListener('mousemove', omm);
      canvas.addEventListener('mouseup', omu);

  });

  function render() {

    /*lightPos[0] = 16 * Math.cos(render.t / 2);
    lightPos[1] = 16;
    lightPos[2] = 16 * Math.sin(render.t / 2);*/
    //vec3.normalize(lightPos, lightPos);
    scene.view = view;

    //mat4.rotateY(model, model, Math.PI / 256);

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
