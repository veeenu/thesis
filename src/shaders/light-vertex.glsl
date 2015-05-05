uniform mat4 viewMatrix;
uniform vec3 lightPos;

attribute vec2 position;
//attribute vec3 lightPosition;
varying vec2 coord;

varying vec3 lPos;

void main() {
  gl_Position = vec4(position, 0., 1.);
  coord = .5 + .5 * position;
  lPos = vec3(0., 0., 0.); //(viewMatrix * vec4(lightPos, 1.)).xyz;
  //lPos = (viewMatrix * vec4(lightPos, 1.)).xyz;
}
