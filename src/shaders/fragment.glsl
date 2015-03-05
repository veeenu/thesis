precision highp float;

varying vec3 c, fnorm;
varying float dist;

void main(void) {
  vec3 lightDir = normalize(vec3(0.5, 1., 0.5));
  float lambert = clamp(dot( fnorm, -lightDir ), 0.0, 1.0);
  float att = min(1.0, 1.0 / (.2 + .6 * dist + .4 * dist * dist));

  gl_FragColor = vec4(c * (att * .4 + lambert * .4 + 0.2), 1.0);
}

