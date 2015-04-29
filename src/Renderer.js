var fs        = require('fs');
var PRNG      = new (require('PRNG')),
    Util      = require('./lib/util.js'),
    Textures  = require('./generators/Textures.js'),
    glMatrix  = require('gl-matrix'),
    vec3      = glMatrix.vec3,
    mat4      = glMatrix.mat4,
    BuildingSHG = require('./lib/BuildingSHG.js'),
    vertSrc, fragSrc;

vertSrc = fs.readFileSync(__dirname + '/shaders/vertex.glsl', 'utf-8');
fragSrc = fs.readFileSync(__dirname + '/shaders/fragment.glsl', 'utf-8');

var Renderer = function(gl, city, w, h) {

  var vsh, fsh;

  this.gl = gl;
  this.geometry = Renderer.computeGeometry(city);
  this.program = gl.createProgram();

  this.view = glMatrix.mat4.create();
  this.model = glMatrix.mat4.create();
  this.proj = glMatrix.mat4.create();

  mat4.perspective(this.proj, Math.PI / 2, 
                   gl.drawingBufferWidth / gl.drawingBufferHeight,
                   0.001, 1000.0);

  mat4.scale(this.model, this.model, [16, 16, 16]);

  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path'),
      count = 0, 
      curp = city.roads[Math.floor(PRNG.random() * city.roads.length)],
      newp = curp, oldp = curp, firstp = curp,
      attrStr = 'M' + curp.x + ',' + curp.y + ' ';

  while(true) {
    do {
      newp = curp.conns[ Math.floor(curp.conns.length * PRNG.random()) ];
    } while(newp.x === oldp.x && newp.y === oldp.y);
    oldp = curp;
    curp = newp;
    attrStr += 'L' + curp.x + ',' + curp.y + ' ';
    if(curp === firstp)
      break;
    count++;
  }

  path.setAttribute('d', attrStr);

  this.incr = 0.0025 / count;
  this.posFn = (function(count, path) { return function(t) {
    var tl = path.getTotalLength(),
        eye = path.getPointAtLength(tl * (t % 1)),
        center = path.getPointAtLength(tl * ((t + 0.2 / count) % 1));

    mat4.lookAt(this.view, 
                [eye.x * 16, 0.1, eye.y * 16], 
                [center.x * 16, 0.2, center.y * 16], 
                [0,1,0]
                );
  }}(count, path)).bind(this); 

  this.posFn(0);

  Textures.generate(gl); // TODO

  gl.getExtension('OES_standard_derivatives');
  vsh = gl.createShader(gl.VERTEX_SHADER);
  fsh = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(vsh, vertSrc);
  gl.shaderSource(fsh, fragSrc);
  gl.compileShader(vsh);
  gl.compileShader(fsh);
  gl.attachShader(this.program, vsh);
  gl.attachShader(this.program, fsh);
  gl.linkProgram(this.program);
  gl.useProgram(this.program);

  [ 'vertex', 'uv', 'normal', 'extra' ].forEach(function(i) {
    this.program[i] = gl.getAttribLocation(this.program, i);
  }.bind(this));

  [ 'tex', 'projection', 'view', 'model' ].forEach(function(i) {
    this.program[i] = gl.getUniformLocation(this.program, i);
  }.bind(this));

  var geom = this.geometry;
  /*(function() {
  
    var obj = "o City\n";
    console.log(geom.vertices.length / 3);
    for(var i = 0; i < geom.vertices.length; i += 3) {
      obj += 'v ' + geom.vertices.slice(i, i + 3).join(' ') + "\n";
    }
    for(var i = 0; i < geom.normals.length; i += 3) {
      obj += 'vn ' + geom.normals.slice(i, i + 3).join(' ') + "\n";
    }
    for(var i = 0; i < geom.vertices.length / 3; i += 3) {
      obj += 'f ' + [i + 1, i + 2, i + 3].map(function(ii) { return ii + '//' + ii }).join(' ') + "\n";
    }
    var a = document.createElement('a'),
        blob = new Blob([obj], {type:'application/octet-stream'});
        url = URL.createObjectURL(blob);
    a.href = url;
    a.download = 'tesi.obj';
    a.click();

  }());*/

  this.t = 0;

  var vbuf = gl.createBuffer(),
      nbuf = gl.createBuffer(),
      cbuf = gl.createBuffer(),
      ebuf = gl.createBuffer(),
      ubuf = gl.createBuffer();

  gl.enableVertexAttribArray(gl.getAttribLocation(this.program, 'vertex'));
  gl.enableVertexAttribArray(gl.getAttribLocation(this.program, 'uv'));
  gl.enableVertexAttribArray(gl.getAttribLocation(this.program, 'extra'));
  gl.enableVertexAttribArray(gl.getAttribLocation(this.program, 'normal'));

  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geometry.vertices),
                gl.STATIC_DRAW);
  gl.vertexAttribPointer(this.program.vertex, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ubuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geometry.uvs),
                gl.STATIC_DRAW);
  gl.vertexAttribPointer(this.program.uv, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ebuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geometry.extra),
                gl.STATIC_DRAW);
  gl.vertexAttribPointer(this.program.extra, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geometry.normals),
                gl.STATIC_DRAW);
  gl.vertexAttribPointer(this.program.normal, 3, gl.FLOAT, false, 0, 0);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  //gl.clearColor(.678, .941, 1, 1);
  gl.clearColor(0, 0, 0, 0);

  gl.uniform1i(this.program.tex, 0);

  this.transf = {
    x: path.getPointAtLength(0).x, 
    z: path.getPointAtLength(0).y,
    alpha: 0, beta: 0
  };
  this.transform();

  //gl.viewport(0, 0, w, h);
  gl.uniformMatrix4fv(this.program.projection, false, this.proj);
  gl.uniformMatrix4fv(this.program.model, false, this.model);
}

Renderer.prototype.render = function(gl, w, h) {

  //this.posFn(this.t);
  /*this.transf.x = -13;
  this.transf.z = 92.47;
  this.transf.alpha = 1.5875;
  this.transf.beta = -0.02;
  this.transform();*/
  gl.uniformMatrix4fv(this.program.view, false, this.view);

  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, this.geometry.count);

  this.t += this.incr;
}

Renderer.prototype.move = function(x, z) {
  this.transf.x += -x * Math.cos(this.transf.alpha) + z * Math.sin(this.transf.alpha);
  this.transf.z += -x * Math.sin(this.transf.alpha) - z * Math.cos(this.transf.alpha);
  this.transform();
}

Renderer.prototype.rotate = function(alpha, beta) {
  this.transf.alpha += alpha;
  this.transf.beta = Math.min(Math.PI / 2, Math.max(this.transf.beta + beta, -Math.PI / 2));
  this.transform();
}

Renderer.prototype.transform = function() {
  glMatrix.mat4.identity(this.view);
  glMatrix.mat4.rotateX(this.view, this.view, this.transf.beta);
  glMatrix.mat4.rotateY(this.view, this.view, this.transf.alpha);
  glMatrix.mat4.translate(this.view, this.view, [-this.transf.x, -0.025, -this.transf.z]);
}

Renderer.computeGeometry = function(city) {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      count = 0,
      block, blockq, lot, h, col,
      mI = 0;

  var availColors = [
    [ .88, .88, .88 ],
    [ .66, .66, .66 ],
    [ 1,   .97, .83 ],
    [ .68, .53, .46 ]
  ];

  console.profile('Geom');
  while(city.blocks.length) {
    block = city.blocks.shift();

    for(var j = 0, n = block.lots.length; j < n; j++) {
      lot = block.lots[j];
      h = lot.height, lot = lot.poly;
      var cx, cy, xm, xM, ym, yM;

      cx = cy = 0;
      xm = ym = Number.POSITIVE_INFINITY;
      xM = yM = Number.NEGATIVE_INFINITY;

      for(var k = 0, K = lot.length; k < K; k++) {
        var cur = lot[k];
        cx += cur.x;
        cy += cur.y;

        if(xm > cur.x)
          xm = cur.x;
        if(xM < cur.x)
          xM = cur.x;
        if(ym > cur.y)
          ym = cur.y;
        if(yM < cur.y)
          yM = cur.y;
      }
      
      cx /= lot.length;
      cy /= lot.length;

      var bldgGeom = BuildingSHG.create({
        x: cx, y: cy,
        width: Math.abs(xM - xm) * .9,
        depth: Math.abs(yM - ym) * .9
      });
      //bldgGeom.texture = ~~(Math.random() * 2) + 4;

      //var bldgGeom = BuildingSHG.create(lot);
      var color = color = availColors[ ~~(Math.random() * availColors.length) ];
      //while(bldgGeom.length) {
      for(var l = 0, L = bldgGeom.length; l < L; l++) {

        var bg = bldgGeom[l]; //.shift();

        for(var k = 0, K = 18; /*bg.vertices.length;*/ k < K; k++) {
          /*vertices.push(bg.vertices[k]);
          normals.push(bg.normals[k]);
          uvs.push(bg.uvs[k]);*/
          extra.push(color[k % 3]);
        }

        bldgGeom[l] = null;
      }

    }
  }
  console.profileEnd();

  var g = BuildingSHG.getGeom();
  vertices = g.vertices;
  normals = g.normals;
  uvs = g.uvs;
  console.log(g.totalLights + ' lights');

  vertices.push.apply(vertices, [
    -20, -10e-4, -20,  -20, -10e-4, 20,  20, -10e-4, 20,
    -20, -10e-4, -20,   20, -10e-4, 20,  20, -10e-4, -20
  ]);
  normals.push.apply(normals, [
    0, 1, 0,  0, 1, 0,  0, 1, 0,
    0, 1, 0,  0, 1, 0,  0, 1, 0
  ]);
  uvs.push.apply(uvs, [
    0, 0, 3,  0, 40, 3,  40, 40, 3,  
    0, 0, 3,  40, 40, 3,  40, 0, 3
  ]);
  extra.push.apply(extra, [
    0, 0, 0,  0, 0, 0,  0, 0, 0,
    0, 0, 0,  0, 0, 0,  0, 0, 0
  ]);

  var roadQuads = city.roadQuads.reduce((function() { 
    var N, U;
    N = [
      0, 1, 0, 0, 1, 0, 0, 1, 0,
      0, 1, 0, 0, 1, 0, 0, 1, 0
    ];
    U = [
      0, 0, 2,  0, 1, 2,  1, 1, 2,  
      0, 0, 2,  1, 1, 2,  1, 0, 2
    ];
    return function(out, i) {
  
      var aa = i[0], bb = i[1],
          slope = Math.atan2(bb.y - aa.y, bb.x - aa.x) + Math.PI / 2,
          dx = Math.abs(.09 * Math.cos(slope)), 
          dy = Math.abs(.09 * Math.sin(slope)),
          //b = bb, a = aa,
          a = { x: aa.x + dy, y: aa.y + dx },
          b = { x: bb.x - dy, y: bb.y - dx },
          len = Math.sqrt( Math.pow(b.y - a.y, 2) + Math.pow(b.x - a.x, 2) );

      var vertices = [
        a.x - dx, 0, a.y - dy,  b.x - dx, 0, b.y - dy,  b.x + dx, 0, b.y + dy,
        a.x - dx, 0, a.y - dy,  b.x + dx, 0, b.y + dy,  a.x + dx, 0, a.y + dy
      ], uvs = U.map(function(i, idx) {
        switch(idx % 3) {
          case 0: return i; break;
          case 1: return i * len; break;
          default: return i;
        }
       return i;
      });

      for(var k = 0, K = vertices.length; k < K; k++) {
        out.vertices.push(vertices[k]);
        out.normals.push(N[k]);
        out.uvs.push(uvs[k]);
        out.extra.push(0);
      }

      return out;
    }
  }()), { vertices: [], normals: [], uvs: [], extra: [] });

  for(var k = 0, K = roadQuads.vertices.length; k < K; k++) {
    vertices.push(roadQuads.vertices[k]);
    normals.push(roadQuads.normals[k]);
    uvs.push(roadQuads.uvs[k]);
    extra.push(roadQuads.extra[k]);
  }
  /*vertices.push.apply(vertices, roadQuads.vertices);
  normals.push.apply(normals, roadQuads.normals);
  uvs.push.apply(uvs, roadQuads.uvs);
  extra.push.apply(extra, roadQuads.extra);*/

  return {
    vertices: vertices,
    normals: normals,
    extra: extra,
    count: vertices.length / 3, //count,
    uvs: uvs
  }
}

module.exports = Renderer;
