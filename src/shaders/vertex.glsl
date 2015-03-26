uniform mat4 view, projection;

attribute vec3 vertex, color, normal, uv;
varying highp vec3 fnorm, c, texCoord;
varying highp float dist;

void main(void) {

  gl_Position = projection * 2.0 * view * vec4(vertex.xzy, 1.0);
  c = color;
  // TODO model matrix
  fnorm = normalize(normal);
  dist = max(length(gl_Position), 1.);
  texCoord = uv;

}
