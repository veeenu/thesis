uniform mat4 viewMatrix;

attribute vec2 position;
varying vec2 coord;

void main() {
  gl_Position = vec4(position, 0., 1.);
  coord = .5 + .5 * position;
}
