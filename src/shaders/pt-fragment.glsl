#extension GL_OES_standard_derivatives : require
precision highp float;

uniform sampler2D tex;
uniform float fade;
varying vec2 coord;

void main() {

  /*vec2 ka = fwidth(coord), kb = vec2(ka.x, -ka.y);
  vec3 color = texture2D(tex, coord).rgb * .2 +
               texture2D(tex, coord + ka).rgb * .2 +
               texture2D(tex, coord - ka).rgb * .2 +
               texture2D(tex, coord + kb).rgb * .2 +
               texture2D(tex, coord - kb).rgb * .2;*/
  vec3 color = texture2D(tex, coord).rgb;

  color = mix(vec3(0.), color, fade);

  gl_FragColor = vec4(color, 1.);

}

