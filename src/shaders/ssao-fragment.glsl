#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform sampler2D target0, lightBuffer;

varying vec2 sscoord, coord;

#define DL 2.399963229728653
#define EULER 2.718281828459045

vec2 vrand( const vec2 coord ) {
 
  vec2 noise;
 
  float nx = dot ( coord, vec2( 12.9898, 78.233 ) );
  float ny = dot ( coord, vec2( 12.9898, 78.233 ) * 2.0 );
 
  noise = clamp( fract ( 43758.5453 * sin( vec2( nx, ny ) ) ), 0.0, 1.0 );
 
  return ( noise * 2.0  - 1.0 ) * .0003;
 
}

float readDepth(const vec2 coord) {
  return (96. * .001) / (1000.001 - texture2D(target0, coord).w * 999.999);
}

float cmpDepth(const float d1, const float d2, inout int far) {

  float ga = 2., diff = (d1 - d2) * 100.;

  if(diff < .4)
    ga = .3;
  else
    far = 1;

  float dd = diff - .4,
        gauss = pow(EULER, -2. * dd * dd / (ga * ga));
  
  return gauss;
}

float calcAO(float depth, vec2 uv, float dw, float dh) {
  float dd = 5. - depth * 5.;

  vec2 vv = vec2(dw, dh),
       coord1 = uv + dd * vv,
       coord2 = uv - dd * vv;

  int far = 0;
  float tmp1 = 0., tmp2 = 0.;
  
  tmp1 = cmpDepth(depth, readDepth(coord1), far);
  if(far > 0) {
    tmp2 = cmpDepth(readDepth(coord2), depth, far);
    tmp1 += (1. - tmp1) * tmp2;
  }

  return tmp1;
}

void main() {

  vec3 color = texture2D(lightBuffer, coord).rgb;
  float occlusion = 0., 
        vdepth = readDepth(coord),
        tt = clamp(vdepth, .5, 1.);
  vec2 noisev = vrand(coord);

  float w = (1. / 1280.) / tt + (noisev.x * (1. - noisev.x)),
        h = (1. / 800.)  / tt + (noisev.y * (1. - noisev.y)),
        dz = 1. / 16.,
        z = 1. - dz * .5,
        l = 0.;
  for(int i = 0; i <= 16; i++) {
    float r = sqrt(1. - z),
          pw = cos(l) * r,
          ph = sin(l) * r;
    occlusion += calcAO(vdepth, coord, pw * w, ph * h);
    z -= dz;
    l += DL;
  }

  occlusion *= dz;

  color = mix(color, vec3(0.), occlusion);
  //color = pow(color, vec3(1. / 2.2));

  gl_FragColor = vec4(color, 1.);

  //gl_FragColor = vec4(lambert * att * 2.5 * color, 1.);
}

