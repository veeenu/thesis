uniform mat4 view, projection;

attribute vec3 vertex, normal, uv;
varying highp vec3 fnorm, texCoord;
varying highp float dist;

void main(void) {

  gl_Position = projection * view * vec4(vertex.xyz, 1.0);
  //c = color;
  // TODO model matrix
  fnorm = normalize(normal);
  dist = max(length(gl_Position), 1.);
  texCoord = uv;

}
