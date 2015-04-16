var fs        = require('fs');
var PRNG      = new (require('PRNG')),
    Textures  = require('./generators/Textures.js'),
    glMatrix  = require('gl-matrix'),
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
      ubuf = gl.createBuffer();

  Textures.generate(gl); // TODO
  gl.enableVertexAttribArray(gl.getAttribLocation(this.program, 'vertex'));
  gl.enableVertexAttribArray(gl.getAttribLocation(this.program, 'uv'));
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

  gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.geometry.normals),
                gl.STATIC_DRAW);
  gl.vertexAttribPointer(gl.getAttribLocation(this.program, 'normal'), 3, 
                         gl.FLOAT, false, 0, 0);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0, 0, 0, 1);

  gl.uniform1i(gl.getUniformLocation(this.program, 'tex'), 0);

}

Renderer.prototype.render = function(gl) {
  this.posFn(this.t);
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

Renderer.computeGeometry = function(city) {
  var vertices = [],
      normals  = [],
      uvs      = [],
      indices  = [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        1, 5, 4, 1, 4, 0, 3, 7, 6, 3, 6, 2,
        2, 6, 5, 2, 5, 1, 0, 4, 7, 0, 7, 3
      ],
      colors   = [],
      count = 0,
      lot, h, col,
      mI = 0;

  for(var i = 0, m = city.blocks.length; i < m; i++) {
    for(var j = 0, n = city.blocks[i].lots.length; j < n; j++) {
      lot = city.blocks[i].lots[j];
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
        width: Math.abs(size.xM - size.xm),
        depth: Math.abs(size.yM - size.ym)
      });
      for(var k in bldgGeom) {
        vertices.push.apply(vertices, bldgGeom[k].vertices);
        normals.push.apply(normals, bldgGeom[k].normals);
        uvs.push.apply(uvs, bldgGeom[k].uvs);
      }

      /*h = .25;
      var verts = [
          lot[0].x, 0, lot[0].y,
          lot[1].x, 0, lot[1].y,
          lot[2].x, 0, lot[2].y,
          lot[3].x, 0, lot[3].y,
          lot[0].x, h, lot[0].y,
          lot[1].x, h, lot[1].y,
          lot[2].x, h, lot[2].y,
          lot[3].x, h, lot[3].y
        ],
        uvh = 8/512, uvz = Math.random() * 3,
        uvx0 = 0 + uvh, uvx1 = .125 - uvh,
        uvy0 = 0 + uvh, uvy1 = .125 - uvh,
        uvsBase1 = [ uvx0, uvy0, uvz, uvx0, uvy1, uvz, uvx1, uvy1, uvz ],
        uvsBase2 = [ uvx0, uvy0, uvz, uvx1, uvy1, uvz, uvx1, uvy0, uvz ];

      // Compute normals
      for(var k = 0, o = indices.length; k < o;) {
        var i1 = indices[k++], i2 = indices[k++], i3 = indices[k++],
            x1 = verts[i1 * 3], y1 = verts[i1 * 3 + 1], z1 = verts[i1 * 3 + 2],
            x2 = verts[i2 * 3], y2 = verts[i2 * 3 + 1], z2 = verts[i2 * 3 + 2],
            x3 = verts[i3 * 3], y3 = verts[i3 * 3 + 1], z3 = verts[i3 * 3 + 2];

        vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);

        var u = glMatrix.vec3.fromValues(x2 - x1, y2 - y1, z2 - z1),
            v = glMatrix.vec3.fromValues(x3 - x1, y3 - y1, z3 - z1),
            w = glMatrix.vec3.fromValues(x3 - x2, y3 - y2, z3 - z2),
            xn = u[1] * v[2] - u[2] * v[1],
            yn = u[2] * v[0] - u[0] * v[2],
            zn = u[0] * v[1] - u[1] * v[0];
        normals.push(xn, yn, zn, xn, yn, zn, xn, yn, zn);

        var ratio = Math.abs(
          k % 6 === 0 ?
            glMatrix.vec3.length(w) / glMatrix.vec3.length(u) 
            :
            glMatrix.vec3.length(v) / glMatrix.vec3.length(u) 
          );

        uvs.push.apply(uvs, (k % 6 === 0 ? uvsBase2 : uvsBase1).map(function(v, i) {
          if(i % 3 === 0)
            return v * ratio;
          return v;
        }));

        colors.push.apply(colors, col);
        colors.push.apply(colors, col);
        colors.push.apply(colors, col);
        count += 3;
      }*/

    }
  }

  return {
    vertices: vertices,
    normals: normals,
    colors: colors,
    count: vertices.length / 3, //count,
    uvs: uvs
  }
}

module.exports = Renderer;
