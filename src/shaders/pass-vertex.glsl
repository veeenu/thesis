uniform mat4 projection, viewmodel;
uniform mat3 normalM;

attribute vec3 vertex, normal, uv, extra;

varying vec4 vPosition, clipPosition;
varying vec3 texUV, vNormal, vExtra;

void main() {
  
  vec4 viewPos = viewmodel * vec4(vertex, 1.);
  clipPosition = projection * viewPos;
  gl_Position = clipPosition;

  vPosition = viewPos;
  //vNormal = normalM * normal;
  vExtra = extra;
  texUV = uv;

}

