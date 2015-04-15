precision highp float;

varying vec3 fnorm, texCoord;
varying float dist;

uniform sampler2D tex;

void main(void) {

  vec2 tp;
  /*if(texCoord.z < 0.5)
    tp = vec2(0., 0.);
  else if(texCoord.z < 1.5)
    tp = vec2(.125, 0.);
  else if(texCoord.z < 2.5)
    tp = vec2(0., .125);
  else
    tp = vec2(.125, .125);*/
  tp = texCoord.yx;

  //vec4 color = texture2D(tex, tp + mod(texCoord.xy * 16.0, .125));
  vec4 color = texture2D(tex, tp * 4.);
  vec3 lightDir = normalize(vec3(0.5, 1., 0.5));
  float lambert = clamp(dot( fnorm, -lightDir ), 0.0, 1.0);
  float att = min(1.0, 1.0 / (.2 + .6 * dist + .4 * dist * dist));

  gl_FragColor = vec4(color.xyz * (att * .2 + lambert * .6 + 0.2), 1.0);
}

