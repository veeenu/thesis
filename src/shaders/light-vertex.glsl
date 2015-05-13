uniform mat4 viewMatrix;

attribute vec3 lightPos;
attribute vec2 position;
varying vec2 sscoord, coord;

varying vec3 lPos;

void main() {
  gl_Position = vec4(position, 0., 1.);
  coord = .5 + .5 * position;
  sscoord = position;
  lPos = (viewMatrix * vec4(lightPos, 1.)).xyz;
}
