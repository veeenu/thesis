var canvas   = document.getElementById('thesis-canvas'),
    gl       = canvas.getContext('webgl'),
    w, h;

if(process.env.NODE_ENV !== 'production') {
  bcr      = canvas.getBoundingClientRect(),
  w        = bcr.width,
  h        = bcr.height;
} else {
  w = innerWidth, h = innerHeight;
}

canvas.width  = w;
canvas.height = h;
canvas.style.background = 'black';

module.exports = {
  canvas: canvas,
  gl: gl,
  w: w,
  h: h,
  aspectRatio: w / h
}
