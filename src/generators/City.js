var PRNG  = new (require('PRNG')),
    Geom  = require('Geom'),
    Roads = require('./Roads.js'),
    Block = require('./Block.js'),
    ShapeGrammar = require('../lib/ShapeGrammar.js');

var traverse = (function() {

  var pi2 = Math.PI * 2;

  return function(edgeA, edgeB, roads, face) {
    var edgeDir = Math.atan2(- edgeB.y + edgeA.y, edgeB.x - edgeA.x),
        nextDir, nextVtx, iol,
        rightmost = { th: Number.POSITIVE_INFINITY, vertex: null };
        
    if(!('traversed' in edgeA))
      edgeA.traversed = [];
    if(!('traversed' in edgeB))
      edgeB.traversed = [];

    edgeA.traversed.push(edgeB);

    for(var i = 0; i < edgeB.conns.length; i++) {
      nextVtx = edgeB.conns[i];

      if(nextVtx === edgeA || edgeB.traversed.indexOf(nextVtx) !== -1 || (face && nextVtx !== face[0] && face.indexOf(nextVtx) !== -1))
        continue;

      nextDir = Math.atan2(- nextVtx.y + edgeB.y, nextVtx.x - edgeB.x) - edgeDir;
      if(nextDir > Math.PI)
        nextDir -= pi2;
      else if(nextDir < - Math.PI)
        nextDir += pi2;
      if(nextDir < rightmost.th) {
        rightmost.th = nextDir;
        rightmost.vertex = edgeB.conns[i];
      }
    }

    if(rightmost.vertex === null)
      return null;

    if(face)
      face.push(edgeB);

    if(face && rightmost.vertex === face[0]) {
      iol = Geom.isOverlapping(face, roads);

      if(iol)
        return null;

      edgeB.traversed.push(face[0]);

      return face;
    }

    face = traverse(edgeB, rightmost.vertex, roads, face || [ edgeA, edgeB ]);
    if(face === null) {
      edgeB.traversed.splice(edgeB.traversed.indexOf(rightmost.vertex), 1);
    }

    return face || null;
  }

}());

var City = function(seed) {
  PRNG.seed(seed);

  var polys = [];

  this.roads = Roads();
  console.log(this.roads)
  this.blocks = [];

  for(var i = 0; i < this.roads.length; i++) {
    for(var j = 0; j < this.roads[i].conns.length; j++) {
      if(!('traversed' in this.roads[i]))
        this.roads[i].traversed = [];
      this.roads[i].traversed[j] = true;
      var poly = traverse(this.roads[i], this.roads[i].conns[j], this.roads);
      if(poly === null || Geom.isPolyIn(poly, polys))
        continue;
      
      polys.push(poly);
      this.blocks.push(new Block(poly, seed));
    }
  }
}

module.exports = City;
