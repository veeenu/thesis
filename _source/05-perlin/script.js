(function() {

  var canvas = document.getElementById('canvas'),
      gl     = canvas.getContext('webgl'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;
  gl.viewport(0, 0, w, h);

  var side = 4,
      lattice = (function() {
        var l = [];

        for(var x = 0; x < 8; x++) {
          for(var y = 0; y < 8; y++) {
            var th = Math.random() * 2 * Math.PI;
            l.push({
              x: Math.cos(th),
              y: Math.sin(th)
            });
          }
        }
        return l;

      }());

  var lerp = function(a, b, t) {
    return (b * t) + (a * (1 - t));
  }

  var fade = function(x) {
    return x * x * x * (x * (6 * x - 15) + 10);
  }

  var noise = function(x, y, w) {
    var freq = 0.75,
        fx0 = freq * x * side / w,
        fy0 = freq * y * side / w,
        fx1, fy1,
        x0 = fx0 >= 0 ? Math.floor(fx0) : Math.floor(fx0) - 1,
        y0 = fy0 >= 0 ? Math.floor(fy0) : Math.floor(fy0) - 1,
        x1 = (x0 + 1) % side,
        y1 = (y0 + 1) % side,
        dot00, dot01, dot10, dot11,
        grad00, grad01, grad10, grad11;

    fx0 -= x0; fy0 -= y0;
    fx1 = fx0 - 1, fy1 = fy0 - 1;

    grad00 = lattice[x0 + y0 * side];
    grad01 = lattice[x1 + y0 * side];
    grad10 = lattice[x0 + y1 * side];
    grad11 = lattice[x1 + y1 * side];

    dot00 = grad00.x * fx0 + grad00.y * fy0;
    dot01 = grad01.x * fx1 + grad01.y * fy0;
    dot10 = grad10.x * fx0 + grad10.y * fy1;
    dot11 = grad11.x * fx1 + grad11.y * fy1;

    fx0 = fade(fx0);
    fy0 = fade(fy0);

    return lerp(lerp(dot00, dot01, fx0), lerp(dot10, dot11, fx0), fy0);
  }

  var N = 128,
      vertices = new Float32Array(N * N * 3),
      indices  = new Uint16Array(N * N * 6);

  for(var x = 0; x < N; x++)
    for(var y = 0; y < N; y++) {
      var v = noise(x, y, N),
          index = (N * y + x);
      vertices[3 * index] = x / N;
      vertices[3 * index + 1] = y / N;
      vertices[3 * index + 2] = v;

      if(y < N - 1 && x < N - 1) {
        indices[6 * index] = index;
        indices[6 * index + 1] = indices[6 * index + 3] = index + 1;
        indices[6 * index + 2] = indices[6 * index + 4] = index + N;
        indices[6 * index + 5] = index + N + 1;
      }
    }

  var program = gl.createProgram(),
      vsh = gl.createShader(gl.VERTEX_SHADER),
      fsh = gl.createShader(gl.FRAGMENT_SHADER),
      m = mat4.create(),
      v = mat4.create(),
      p = mat4.create(),
      vb = gl.createBuffer(), ib = gl.createBuffer();

  mat4.perspective(p, Math.PI / 2, w / h, 0.1, 1000);
  mat4.rotateX(m, m, Math.PI / 3);
  mat4.translate(v, v, [-0.5, -0.5, 0.0]);

  gl.shaderSource(vsh, document.getElementById('vertex-shader').textContent);
  gl.shaderSource(fsh, document.getElementById('fragment-shader').textContent);
  gl.compileShader(vsh);
  gl.compileShader(fsh);
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);
  gl.useProgram(program);

  program.model       = gl.getUniformLocation(program, 'model');
  program.view        = gl.getUniformLocation(program, 'view');
  program.projection  = gl.getUniformLocation(program, 'projection');
  program.vertex      = gl.getAttribLocation(program, 'vertex');

  gl.uniformMatrix4fv(program.model, false, m);
  gl.uniformMatrix4fv(program.view, false, v);
  gl.uniformMatrix4fv(program.projection, false, p);

  gl.enableVertexAttribArray(program.vertex);

  gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.vertexAttribPointer(program.vertex, 3, gl.FLOAT, false, 0, 0);
  gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.enable(gl.DEPTH_TEST);
  gl.clearColor(0, 0, 0, 1);
  var render = (function() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
    mat4.rotateZ(m, m, Math.PI / 128);
    gl.uniformMatrix4fv(program.model, false, m);
    requestAnimationFrame(render);
  });

  render();

}());
