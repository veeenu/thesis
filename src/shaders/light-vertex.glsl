uniform mat4 viewMatrix;
//uniform vec3 lightPos;

attribute vec3 lightPos;
attribute vec2 position;
varying vec2 sscoord, coord;

varying vec3 lPos;

void main() {
  gl_Position = vec4(position, 0., 1.);
  coord = .5 + .5 * position;
  sscoord = position;
  //lPos = vec3(0., 0., 0.); 
  lPos = (viewMatrix * vec4(lightPos, 1.)).xyz;
}
