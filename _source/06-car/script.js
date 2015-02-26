(function() {

  var canvas = document.getElementById('canvas'),
      //ctx    = canvas.getContext('2d'),
      gl     = canvas.getContext('webgl'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;
  gl.viewport(0, 0, w, h);

  var roads = (function() {
    var g = [], S = 4;

    for(var x = 0; x < S; x++) for(var y = 0; y < S; y++) {
      var p = g[y * S + x] = { x: x, y: y, conns: [] };
      if(x > 0) {
        p.conns.push(g[y * S + x - 1]);
        g[y * S + x - 1].conns.push(p);
      }
      if(y > 0) {
        p.conns.push(g[(y - 1) * S + x]);
        g[(y - 1) * S + x].conns.push(p);
      }
    }

    return g;

  }());

  var buildings = (function() {
    var vertices = [], indices = [], colors = [], mI = 0, S = 8;
    // Create 4 buildings on the right side of each road segment
    for(var i = 0; i < roads.length; i++) {
      var p0 = roads[i], p1;
      for(var j = 0; j < p0.conns.length; j++) {
        p1 = p0.conns[j];
        var side = Math.sqrt(Math.pow(p1.y - p0.y, 2) + Math.pow(p1.x - p0.x, 2)) / 6,
            th = Math.atan2(p1.y - p0.y, p1.x - p0.x),
            cth = Math.cos(th),
            sth = Math.sin(th);
        for(var k = 0; k < 3; k++) {
          var xa = side * (k + 1),
              ya = side,
              xb = side * (k + 2),
              yb = side * 2,
              b = {
                x0 : p0.x + xa * cth - ya * sth,
                y0 : p0.y + xa * sth + ya * cth,
                x1 : p0.x + xb * cth - yb * sth,
                y1 : p0.y + xb * sth + yb * cth,
                h  : Math.random() + .5
              },
              col = [ Math.random(), Math.random(), Math.random() ];

          vertices.push.apply(vertices, [
            b.x0, b.y0, 0,
            b.x0, b.y1, 0,
            b.x1, b.y1, 0,
            b.x1, b.y0, 0,
            b.x0, b.y0, b.h,
            b.x0, b.y1, b.h,
            b.x1, b.y1, b.h,
            b.x1, b.y0, b.h
          ].map(function(v) { return v; }));
          for(var C = 8; C--;)
            colors.push.apply(colors, col);
          indices.push.apply(indices, [
            0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7,
            0, 1, 5, 0, 5, 4, 3, 2, 6, 3, 6, 7,
            1, 5, 6, 1, 6, 2, 0, 4, 7, 0, 7, 3
          ].map(function(i) { return i + mI }));
          mI += 8;
        }
      }
    }

    return { v: vertices, i: indices, c: colors }

  }());

  console.log(roads)

  var projection = mat4.create(),
      view = mat4.create(),
      program, vsh, fsh,
      vbuf, ibuf, cbuf;

  mat4.identity(view);

  program = gl.createProgram();
  vsh = gl.createShader(gl.VERTEX_SHADER);
  fsh = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(vsh, document.getElementById('vertex-shader').textContent);
  gl.shaderSource(fsh, document.getElementById('fragment-shader').textContent);
  gl.compileShader(vsh);
  gl.compileShader(fsh);
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);
  gl.useProgram(program);
  
  vbuf = gl.createBuffer();
  ibuf = gl.createBuffer();
  cbuf = gl.createBuffer();

  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'vertex'));
  gl.enableVertexAttribArray(gl.getAttribLocation(program, 'color'));

  gl.bindBuffer(gl.ARRAY_BUFFER, vbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(buildings.v), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(buildings.i), gl.STATIC_DRAW);

  gl.vertexAttribPointer(gl.getAttribLocation(program, 'vertex'), 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, cbuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(buildings.c), gl.STATIC_DRAW);
  gl.vertexAttribPointer(gl.getAttribLocation(program, 'color'), 3, gl.FLOAT, false, 0, 0);

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.clearColor(0, 0, 0, 1);

  var angle = 0,
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path'),
      posfn = function(t, count, view) {
        var tl = path.getTotalLength(),
            eye = path.getPointAtLength(tl * (t % 1)),
            center = path.getPointAtLength(tl * ((t + 0.2 / count) % 1));

        mat4.lookAt(view, [eye.x, 0.5, eye.y], [center.x, 0.5, center.y], [0,1,0]);
      }

  var attrStr = 'M0,0 ', count = 0, curp = roads[0], newp = curp, oldp = curp;
  while(true) {
    do {
      newp = curp.conns[ Math.floor(curp.conns.length * Math.random()) ];
    } while(newp.x === oldp.x && newp.y === oldp.y);
    oldp = curp;
    curp = newp;
    attrStr += 'L' + curp.x + ',' + curp.y + ' ';
    if(curp.x === 0 && curp.y === 0)
      break;
    count++;
  }
  //console.log(attrStr);
  path.setAttribute('d', attrStr);
  var render = function() {

    mat4.identity(view);
    mat4.rotateY(view, view, - Math.PI);
    mat4.translate(view, view, [0, 0, -angle]);
    point = posfn(angle, count, view);
    
    mat4.perspective(projection, Math.PI / 2, w / h, 0.0001, 1000.0);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'view'), false, view);
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projection'), false, projection);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.drawElements(gl.TRIANGLES, buildings.i.length, gl.UNSIGNED_SHORT, 0);
    angle += 0.005 / count;
    requestAnimationFrame(render);
  }
  render();


}());
