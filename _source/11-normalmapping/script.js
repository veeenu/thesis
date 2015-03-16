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
   * Normal map generation.
   * Result is stored in c2d, ready to be used as a texture.
   */
  (function() {
    var imd1 = ctx.createImageData(512, 512),
        imd2 = ctx.createImageData(512, 512), 
        pos, nx, ny, kern, rad;

    for(var x = 512; x--;) for(var y = 512; y--;) {
      pos = 4 * (y * 512 + x);

      rad = Math.sqrt(Math.pow(x - 256, 2) + Math.pow(y - 256, 2));

      imd1.data[pos] = imd1.data[pos + 1] = imd1.data[pos + 2] =
        128 * Math.sin(rad * Math.PI / 32) + 128;
      imd1.data[pos + 3] = 255;
    }

    for(var x = 0; x < 512; x++) for(var y = 0; y < 512; y++) {
      pos = 4 * (y * 512 + x);

      kern = [
        imd1.data[Math.max(pos - 4 * 513, 0)],
        imd1.data[Math.max(pos - 4 * 512, 0)],
        imd1.data[Math.max(pos - 4 * 511, 0)],
        imd1.data[pos - 4],       
        imd1.data[pos],           
        imd1.data[pos + 4],
        imd1.data[pos + 4 * 511], 
        imd1.data[pos + 4 * 512], 
        imd1.data[pos + 4 * 513]
      ];

      nx = (-kern[0] - 2 * kern[1] - kern[2] + kern[6] + 2 * kern[7] + kern[8]) / 128;
      ny = (-kern[0] - 2 * kern[3] - kern[6] + kern[2] + 2 * kern[5] + kern[8]) / 128;

      nx = Math.cos(Math.atan2(1, nx));
      ny = Math.cos(Math.atan2(1, ny));

      imd2.data[pos]     = 128 + nx * 128;
      imd2.data[pos + 1] = 128 + ny * 128;
      imd2.data[pos + 2] = Math.sqrt(1 - nx * nx - ny * ny) * 255;
      imd2.data[pos + 3] = 255;
    }

    ctx.putImageData(imd2, 0, 0);
  }());

  /**
   * Cube mesh generation with per-vertex normals
   */
  var mesh = (function() {
  
    var verts,  indices,
        vertices = [], normals = [], uvs = [],
        tangents = [], bitangents = [],
        uvh = 8/512, 
        uvx0 = 0 + uvh, uvx1 = 1 - uvh,
        uvy0 = 0 + uvh, uvy1 = 1 - uvh,
        uvsBase1 = [ uvx0, uvy0, uvx0, uvy1, uvx1, uvy1 ],
        uvsBase2 = [ uvx0, uvy0, uvx1, uvy1, uvx1, uvy0 ],
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
          x1 = verts[i1 * 3], y1 = verts[i1 * 3 + 1], z1 = verts[i1 * 3 + 2],
          x2 = verts[i2 * 3], y2 = verts[i2 * 3 + 1], z2 = verts[i2 * 3 + 2],
          x3 = verts[i3 * 3], y3 = verts[i3 * 3 + 1], z3 = verts[i3 * 3 + 2];

      vertices.push(x1, y1, z1, x2, y2, z2, x3, y3, z3);

      var u = vec3.fromValues(x2 - x1, y2 - y1, z2 - z1), // deltaPos1
          v = vec3.fromValues(x3 - x1, y3 - y1, z3 - z1), // deltaPos2
          w = vec3.fromValues(x3 - x2, y3 - y2, z3 - z2),
          xn = u[1] * v[2] - u[2] * v[1],
          yn = u[2] * v[0] - u[0] * v[2],
          zn = u[0] * v[1] - u[1] * v[0];
      normals.push(xn, yn, zn, xn, yn, zn, xn, yn, zn);

      var useUV = (k % 6 === 0 ? uvsBase2 : uvsBase1),
          deltaUV1 = { x: useUV[2] - useUV[0], y: useUV[3] - useUV[1] },
          deltaUV2 = { x: useUV[4] - useUV[0], y: useUV[5] - useUV[1] },
          r = 1 / (deltaUV1.x * deltaUV2.y - deltaUV1.y * deltaUV2.x),
          tangent = vec3.fromValues(
            r * (u[0] * deltaUV2.y - v[0] * deltaUV1.y),
            r * (u[1] * deltaUV2.y - v[1] * deltaUV1.y),
            r * (u[2] * deltaUV2.y - v[2] * deltaUV1.y)
          ),
          bitangent = vec3.fromValues(
            r * (v[0] * deltaUV1.x - u[0] * deltaUV2.x),
            r * (v[1] * deltaUV1.x - u[1] * deltaUV2.x),
            r * (v[2] * deltaUV1.x - u[2] * deltaUV2.x)
          );
      tangents.push.apply(tangents, tangent);
      tangents.push.apply(tangents, tangent);
      tangents.push.apply(tangents, tangent);
      bitangents.push.apply(bitangents, bitangent);
      bitangents.push.apply(bitangents, bitangent);
      bitangents.push.apply(bitangents, bitangent);

      uvs.push.apply(uvs, useUV);
    }

    return {
      vertices: new Float32Array(vertices),
      normals: new Float32Array(normals),
      uvs: new Float32Array(uvs),
      tgt: new Float32Array(tangents),
      btgt: new Float32Array(bitangents)
    }

  }());

  var program = gl.createProgram(),
      vsh = gl.createShader(gl.VERTEX_SHADER),
      fsh = gl.createShader(gl.FRAGMENT_SHADER),
      vbuf = gl.createBuffer(),
      nbuf = gl.createBuffer(),
      ubuf = gl.createBuffer(),
      tex = gl.createTexture();

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0, 0, 0, 1);
  gl.getExtension('OES_standard_derivatives');
  gl.shaderSource(vsh, document.getElementById('vertex-shader').textContent);
  gl.shaderSource(fsh, document.getElementById('fragment-shader').textContent);
  gl.compileShader(vsh);
  gl.compileShader(fsh);
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);
  gl.useProgram(program);

  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vertex'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'vertex'), 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, nbuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'normal'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'normal'), 3, gl.FLOAT, false, 0, 0);
  
  gl.bindBuffer(gl.ARRAY_BUFFER, ubuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.uvs, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'UV'));
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'UV'), 2, gl.FLOAT, false, 0, 0);

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c2d);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);

  var proj = mat4.create(),
      view = mat4.create(),
      model = mat4.create(),
      lightPos = vec3.fromValues(3, 3, -1);

  mat4.perspective(proj, Math.PI * 2 / 3, w / h, 0.0001, 1000.0);
  mat4.identity(view);
  mat4.translate(view, view, [0, -.25, -3]);
  mat4.rotateX(view, view, Math.PI / 6);
  mat4.identity(model);
  mat4.rotateY(model, model, Math.PI / 3);

  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, proj);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
  gl.uniform1i(gl.getUniformLocation(program, 'texture'), 0);
  function render() {

    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'model'), false, model);
    gl.uniform3fv(gl.getUniformLocation(program, 'lightPos'), lightPos);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.vertices.length / 3);

    //lightPos[0] = 5 * Math.cos(render.t);
    //lightPos[1] = 5 * Math.sin(render.t);

    render.t += 0.03;

    mat4.rotateY(model, model, Math.PI / 256);
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

  console.log(mesh)

}());
