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

var Renderer = function(gl, city) {

  var vsh, fsh;

  this.gl = gl;
  this.geometry = Renderer.computeGeometry(city);
  this.program = gl.createProgram();

  this.view = glMatrix.mat4.create();
  this.proj = glMatrix.mat4.create();

  glMatrix.mat4.perspective(this.proj, Math.PI / 2, 
                            gl.drawingBufferWidth / gl.drawingBufferHeight,
                            0.0001, 1000.0);

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

    glMatrix.mat4.lookAt(this.view, 
                         [eye.x, 0.1, eye.y], 
                         [center.x, 0.2, center.y], 
                         [0,1,0]
                        );
  }}(count, path)).bind(this); 

  //this.posFn(0);

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

  console.log(city, this.geometry)

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
  gl.vertexAttribPointer(gl.getAttribLocation(this.program, 'vertex'), 3, 
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ubuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geometry.uvs),
                gl.STATIC_DRAW);
  gl.vertexAttribPointer(gl.getAttribLocation(this.program, 'uv'), 3, 
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, ebuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geometry.extra),
                gl.STATIC_DRAW);
  gl.vertexAttribPointer(gl.getAttribLocation(this.program, 'extra'), 3, 
                         gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geometry.normals),
                gl.STATIC_DRAW);
  gl.vertexAttribPointer(gl.getAttribLocation(this.program, 'normal'), 3, 
                         gl.FLOAT, false, 0, 0);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(.678, .941, 1, 1);

  gl.uniform1i(gl.getUniformLocation(this.program, 'tex'), 0);

  this.transf = {
    x: 0, z: 0, alpha: 0, beta: 0
  };
}

Renderer.prototype.render = function(gl, w, h) {

  gl.viewport(0, 0, w, h);
  //this.posFn(this.t);
  gl.uniformMatrix4fv(
    gl.getUniformLocation(this.program, 'projection'), 
    false, this.proj
  );
  gl.uniformMatrix4fv(
    gl.getUniformLocation(this.program, 'view'), 
    false, this.view
  );

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
  this.transf.beta += beta;
  this.transform();
}

Renderer.prototype.transform = function() {
  glMatrix.mat4.identity(this.view);
  glMatrix.mat4.rotateX(this.view, this.view, this.transf.beta);
  glMatrix.mat4.rotateY(this.view, this.view, this.transf.alpha);
  glMatrix.mat4.translate(this.view, this.view, [- 24 - this.transf.x, -0.1, - 24 - this.transf.z]);
}

Renderer.computeGeometry = function(city) {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      count = 0,
      block, blockq, lot, h, col,
      mI = 0;

  for(var i = 0, m = city.blocks.length; i < m; i++) {
    block = city.blocks[i];
    blockq = block.block;
    vertices.push.apply(vertices, [
      blockq[0].x, 0, blockq[0].y,  blockq[1].x, 0, blockq[1].y,  blockq[2].x, 0, blockq[2].y, 
      blockq[0].x, 0, blockq[0].y,  blockq[2].x, 0, blockq[2].y,  blockq[3].x, 0, blockq[3].y
    ].map(function(i, idx) {
      return (idx % 3 === 1 ? i - 10e-5 : i);
    }));
    normals.push.apply(normals, [
      0, 1, 0,  0, 1, 0,  0, 1, 0,
      0, 1, 0,  0, 1, 0,  0, 1, 0
    ]);
    uvs.push.apply(uvs, [
      0, 0, 3,  0, 1, 3,  1, 1, 3,  
      0, 0, 3,  1, 1, 3,  1, 0, 3
    ]);
    extra.push.apply(extra, [
      0, 0, 0,  0, 0, 0,  0, 0, 0,
      0, 0, 0,  0, 0, 0,  0, 0, 0
    ]);
     
    for(var j = 0, n = block.lots.length; j < n; j++) {
      lot = block.lots[j];
      h = lot.height, lot = lot.poly;
      col = glMatrix.vec3.fromValues(
              Math.random(), Math.random(), Math.random()
            );
      glMatrix.vec3.normalize(col, col);
      var centroid, size;

      centroid = lot.reduce(function(c, cur) {
        c.x += cur.x;
        c.y += cur.y;
        return c;
      }, { x: 0, y: 0 });

      size = lot.reduce(function(c, cur) {
        if(c.xm > cur.x)
          c.xm = cur.x;
        if(c.ym > cur.y)
          c.ym = cur.y;
        if(c.xM < cur.x)
          c.xM = cur.x;
        if(c.yM < cur.y)
          c.yM = cur.y;
        return c;
      }, { xm: Number.POSITIVE_INFINITY, ym: Number.POSITIVE_INFINITY, xM: Number.NEGATIVE_INFINITY, yM: Number.NEGATIVE_INFINITY });
      centroid.x /= lot.length;
      centroid.y /= lot.length;

      var bldgGeom = BuildingSHG.create({
        x: centroid.x, y: centroid.y,
        width: Math.abs(size.xM - size.xm) * .9,
        depth: Math.abs(size.yM - size.ym) * .9
      });
      var color = [ .68, .53, .46 ];
      for(var k in bldgGeom) {
        vertices.push.apply(vertices, bldgGeom[k].vertices);
        normals.push.apply(normals, bldgGeom[k].normals);
        uvs.push.apply(uvs, bldgGeom[k].uvs);
        extra.push.apply(extra, bldgGeom[k].uvs.map(function(i, idx) {
          return color[idx % 3];
        }));
      }

    }
  }

  vertices.push.apply(vertices, city.roadQuads.vertices);
  normals.push.apply(normals, city.roadQuads.normals);
  uvs.push.apply(uvs, city.roadQuads.uvs);
  extra.push.apply(extra, city.roadQuads.extra);

  return {
    vertices: vertices,
    normals: normals,
    extra: extra,
    count: vertices.length / 3, //count,
    uvs: uvs
  }
}

module.exports = Renderer;
