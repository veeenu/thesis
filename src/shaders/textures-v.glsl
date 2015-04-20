attribute vec2 vertex;
varying vec2 uv;

void main() {

  gl_Position = vec4(2. * vertex - 1., 1., 1.);
  uv = vertex;
  
}
