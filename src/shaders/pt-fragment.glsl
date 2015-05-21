precision highp float;

uniform sampler2D tex;
uniform float fade;
varying vec2 coord;

void main() {

  vec3 color = mix(vec3(0.), texture2D(tex, coord).rgb, fade);

  gl_FragColor = vec4(color, 1.);

}

