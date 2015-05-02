var canvas   = document.getElementById('thesis-canvas'),
    gl       = canvas.getContext('webgl'),
    bcr      = canvas.getBoundingClientRect(),
    w        = bcr.width,
    h        = bcr.height;

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
