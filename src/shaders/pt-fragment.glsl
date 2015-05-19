precision highp float;

uniform sampler2D tex;
varying vec2 coord;

void main() {

  vec3 color = texture2D(tex, coord).rgb;

  gl_FragColor = vec4(color, 1.);

}

