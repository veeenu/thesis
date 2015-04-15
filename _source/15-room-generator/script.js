(function() {

  var canvas = document.getElementById('canvas'),
      ctx    = canvas.getContext('2d'),
      bcr    = canvas.getBoundingClientRect(),
      w      = bcr.width,
      h      = bcr.height;

  canvas.width = w;
  canvas.height = h;

  var hw = w * .5, hh = h * .5;

  var rect = [
    /*hw * Math.random(),      hh * Math.random(),
    hw * Math.random() + hw, hh * Math.random(),
    hw * Math.random() + hw, hh * Math.random() + hh,
    hw * Math.random(),      hh * Math.random() + hh*/
   hw * 0.5, hh * 0.5,
   hw * 1.5, hh * 0.5,
   hw * 1.5, hh * 1.5,
   hw * 0.5, hh * 1.5
  ], sides = [
    rect.slice(0, 4),
    rect.slice(2, 6),
    rect.slice(4, 8),
    [rect[6],rect[7],rect[0],rect[1]]
  ];

  var lerp = function(a, b, t) {
    return a * (1 - t) + b * t;
  }

  var lerp2 = function(edge, t) {
    return [
      lerp(edge[0], edge[2], t),
      lerp(edge[1], edge[3], t)
    ];
  }

  var lineIntersection = function(A1, A2, B1, B2) {

    var dist, cos_, sin_, nx, p,
        a1 = { x: A1[0], y: A1[1] },
        a2 = { x: A2[0], y: A2[1] },
        b1 = { x: B1[0], y: B1[1] },
        b2 = { x: B2[0], y: B2[1] };

    // Translate by -a1
    a2.x -= a1.x; b1.x -= a1.x; b2.x -= a1.x;
    a2.y -= a1.y; b1.y -= a1.y; b2.y -= a1.y;
    
    dist = Math.sqrt(a2.x * a2.x + a2.y * a2.y);

    // Rotate so a2 lies on the positive x axis
    cos_ = a2.x / dist;
    sin_ = a2.y / dist;

    nx   =   b1.x * cos_ + b1.y * sin_;
    b1.y = - b1.x * sin_ + b1.y * cos_; b1.x = nx; 
    nx   =   b2.x * cos_ + b2.y * sin_;
    b2.y = - b2.x * sin_ + b2.y * cos_; b2.x = nx; 

    // Parallel lines
    if(b1.y == b2.y)
      return null;

    p = b2.x + (b1.x - b2.x) * b2.y / (b2.y - b1.y);

    return { x: a1.x + p * cos_, y: a1.y + p * sin_ };
  }

  // edges: list of couple of points
  // subp: subdivision point for each edge
  var quadPartition = function(edges, subp) {
    subp = subp || [.5, .5, .5, .5];
    var p0 = lerp2(edges[0], subp[0]),
        p1 = lerp2(edges[1], subp[1]),
        p2 = lerp2(edges[2], subp[2]),
        p3 = lerp2(edges[3], subp[3]),
        p4 = lineIntersection(p0, p2, p1, p3);

    /*ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p2[0], p2[1]);
    ctx.moveTo(p1[0], p1[1]);
    ctx.lineTo(p3[0], p3[1]);
    ctx.stroke();*/

    var newQuads = [
      {
        edges: [
          [edges[0][0], edges[0][1],  p0[0],        p0[1]],
          [p0[0],       p0[1],        p4.x,         p4.y],
          [p4.x,        p4.y,         p3[0],        p3[1]],
          [p3[0],       p3[1],        edges[0][0],  edges[0][1]]
        ],
      }, {
        edges: [
          [p0[0],       p0[1],        edges[0][2],  edges[0][3]],
          [edges[0][2], edges[0][3],  p1[0],        p1[1]],
          [p1[0],       p1[1],        p4.x,         p4.y],
          [p4.x,        p4.y,         p0[0],        p0[1]]
        ],
      }, {
        edges: [
          [p1[0],       p1[1],        edges[1][2],  edges[1][3]],
          [edges[1][2], edges[1][3],  p2[0],        p2[1]],
          [p2[0],       p2[1],        p4.x,         p4.y],
          [p4.x,        p4.y,         p1[0],        p1[1]]
        ],
      }, {
        edges: [
          [p2[0],       p2[1],        edges[2][2],  edges[2][3]],
          [edges[2][2], edges[2][3],  p3[0],        p3[1]],
          [p3[0],       p3[1],        p4.x,         p4.y],
          [p4.x,        p4.y,         p2[0],        p2[1]]
        ]
      }
    ];

    return newQuads;

  }

  var quadDraw = function(quad, color) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.lineTo(quad[0][0], quad[0][1]);
    quad.forEach(function(edge) {
      ctx.lineTo(edge[0], edge[1]);
      ctx.lineTo(edge[2], edge[3]);
    })
    //ctx.closePath();
    //ctx.stroke();
    ctx.fill();
  
  }

  var doPart = function(sides, j) {
    var mr0 = Math.random() * .5 + .25,
        mr1 = Math.random() * .5 + .25;

    var qq = quadPartition(sides, [mr0, mr1, mr0, mr1]);
    qq.forEach(function(q) {
      var color = 'rgb(' + [Math.random(),Math.random(),Math.random()].map(function(i) { return parseInt(i * 255) }).join(',') + ')';
      quadDraw(q.edges, color);
      if(j < 1)
        doPart(q.edges, j + 1);
    });
  }
  doPart(sides, 0);
  //quadDraw(sides, 'rgb(0, 0, 0)');


}());
