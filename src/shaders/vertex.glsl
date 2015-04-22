uniform mat4 view, projection, model;

attribute vec3 vertex, normal, uv, extra;
varying highp vec3 fnorm, fvert, texCoord, fextra;
varying highp float dist;

void main(void) {

  gl_Position = projection * view * model * vec4(vertex.xyz, 1.0);
  //c = color;
  // TODO model matrix
  fnorm = normalize(normal);
  fvert = vertex.xyz;
  fextra = extra;
  dist = max(length(gl_Position), 1.);
  texCoord = uv;

}
