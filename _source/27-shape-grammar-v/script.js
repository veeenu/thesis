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

}

Mesh.prototype.unbind = function(program) {
  this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
  this.gl.disableVertexAttribArray(this.gl.getAttribLocation(program, 'vertex'));
  this.gl.disableVertexAttribArray(this.gl.getAttribLocation(program, 'normal'));
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
      lightPos = vec3.fromValues(1, 0.25, -1),
      shProj = mat4.create(),
      scene = new Scene(gl),
      ext = gl.getExtension('EXT_texture_filter_anisotropic');

  (function() {
    var vertices = shgResult.vertices,
        normals = shgResult.normals,
        colors = shgResult.colors;

    var bldg = new Mesh(gl, { vertices: new Float32Array(vertices), normals: new Float32Array(normals), colors: new Float32Array(colors) });
    bldg.model = model;
    scene.add(bldg);
  }());

  mat4.perspective(proj, Math.PI / 2, w / h, 0.0001, 1000.0);
  mat4.ortho(shProj, -32, 32, -32, 32, -32, 32);

  mat4.identity(view);
  mat4.translate(view, view, [0, 1, -8]);

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
  var points = new Float32Array(shgResult.lines),
      pbuf   = gl.createBuffer(),
      fb     = gl.createFramebuffer(),
      tex    = gl.createTexture(),
      fw     = shgResult.width * 2,
      fh     = shgResult.height * 2,
      tfw    = fw,
      tfh    = fh,
      pprog  = Shader(gl, document.getElementById('vertex-2d').textContent, document.getElementById('fragment-2d').textContent);

  // To next power of two
  [1,2,4,8,16].forEach(function(i) {
    tfw |= tfw >> i;
    tfh |= tfh >> i;
  })
  tfw++; tfh++;

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tfw, tfh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
  gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
  gl.useProgram(pprog);
  gl.viewport(0, 0, fw, fh);

  gl.lineWidth(1);
  gl.bindBuffer(gl.ARRAY_BUFFER, pbuf);
  gl.enableVertexAttribArray(gl.getAttribLocation(pprog, 'point'));
  gl.vertexAttribPointer(gl.getAttribLocation(pprog, 'point'), 2, gl.FLOAT, false, 0, 0);
  gl.uniform1f(gl.getUniformLocation(pprog, 'ps'), w / 16);
  gl.uniform3f(gl.getUniformLocation(pprog, 'color'), 1, 0, 0);

  gl.drawArrays(gl.LINES, 0, points.length / 2);

  console.log(tfw, tfh)
  var pixels = new Uint8Array(tfw * tfh * 4), pp = [];
  gl.readPixels(0, 0, tfw, tfh, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  for(var i = 0, I = pixels.length; i < I; i += 4)
    pp.push(pixels[i]);

  var newcanv = document.createElement('canvas'), 
      newctx = newcanv.getContext('2d'),
      imgd = newctx.createImageData(tfw, tfh);
  newcanv.width = tfw * 8; newcanv.height = tfh * 8;
  newcanv.style.position = 'absolute';
  newcanv.style.top = (bcr.top + window.scrollY) + 'px';
  newctx.imageSmoothingEnabled = false;

  var pathfind = function(pp, w, h, start, end) {
    var frontier = [],
        visited = [];

    var X = end.x, Y = end.y;

    var elem = function(x, y) {
      return pp[y * w + x];
    }

    var neighbors = function(x, y) {
      var ret = [];

      if(y > 0) ret.push({ x: x, y: y - 1 });
      if(y < h) ret.push({ x: x, y: y + 1 });
      if(x > 0) ret.push({ x: x - 1, y: y });
      if(x < w) ret.push({ x: x + 1, y: y });
      if(y > 0 && x > 0)
        ret.push({ x: x - 1, y: y - 1});
      if(y > 0 && x < w)
        ret.push({ x: x + 1, y: y - 1});
      if(y < h && x < w)
        ret.push({ x: x + 1, y: y + 1});
      if(y < h && x > 0)
        ret.push({ x: x - 1, y: y + 1});

      return ret.reduce(function(o, i) {
        if(elem(i.x, i.y) === 0)
          o.push(i);
        return o;
      }, []);
    }

    var hasBeenVisited = function(x, y) {
      return visited[y * w + x] !== undefined;
    }

    frontier.push(start);
    visited[start.y * w + start.x] = null;
    var k = 0;
    while(frontier.length > 0 && k < 10000) {
      k++;
      var current = frontier.shift();

      if(current.x === X && current.y === Y)
        break;

      neighbors(current.x, current.y).forEach(function(i) {
        if(!hasBeenVisited(i.x, i.y)) {
          frontier.push(i);
          visited[i.y * w + i.x] = current;
        }
      });

    }

    var path = [], cur = visited[Y * w + X];

    while(cur !== null && path.length < 5000) {
      path.push(cur);
      cur = visited[cur.y * w + cur.x];
    }

    path.unshift(end);

    return path;

  };

  var path = [], rooms;

  rooms = shgResult.rooms.reduce(function(o, i) {
    o.push({
      x: ~~(i.x * fw),
      y: ~~(i.z * fh)
    });

    return o;
  }, []);
  
  var intv = setInterval(function() {
    path = pathfind(pp, tfw, tfh, rooms[0], rooms[1]);
    rooms.shift();

    path.forEach(function(i) {
      pixels[(i.y * tfw + i.x) * 4 + 1] = 255;
      pixels[(i.y * tfw + i.x) * 4 + 3] = 255;
    });
    
    imgd.data.set(pixels);
    newctx.putImageData(imgd, 0, 0);
    var im = new Image();
    im.onload = function() {
      newctx.clearRect(0, 0, newcanv.width, newcanv.height);
      newctx.drawImage(im, 0, 0);
    }
    im.src = newcanv.toDataURL();

    if(rooms.length === 1)
      clearInterval(intv);
  
  }, 1000);

  var im = new Image();
  im.onload = function() {
    newctx.clearRect(0, 0, newcanv.width, newcanv.height);
    newctx.scale(8, 8);
    newctx.drawImage(im, 0, 0);
  }
  im.src = newcanv.toDataURL();

  document.body.appendChild(newcanv);

  gl.disableVertexAttribArray(gl.getAttribLocation(pprog, 'point'));
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);


  //////////////////////////////////////////////////////////////////////////////

  function render() {

    scene.view = view;
    mat4.identity(model);
    mat4.rotateY(model, model, rY);
    mat4.rotateX(model, model, rX);

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
