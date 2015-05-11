#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform sampler2D target0, depthBuffer;
uniform mat4 inverseProjection, viewMatrix;
uniform vec3 lightPos;

varying vec2 sscoord, coord;

////////////////////////////////////////////////////////////////////////////////
// Main
////////////////////////////////////////////////////////////////////////////////

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
  return (2. * .001) / (1000.001 - texture2D(target0, coord).w * 999.999);
}

float cmpDepth(const float d1, const float d2, inout int far) {

  float ga = 2., diff = (d1 - d2) * 100.;

  if(diff < .2)
    ga = .2;
  else
    far = 1;

  float dd = diff - .2,
        gauss = pow(EULER, -2. * dd * dd / (ga * ga));
  
  return gauss;
}

float calcAO(float depth, vec2 uv, float dw, float dh) {
  float dd = 20. - depth * 20.;

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

  //////////////////////////////////////////////////////////////////////////////
  // SSAO
  //////////////////////////////////////////////////////////////////////////////

  float occlusion = 0., vdepth = readDepth(coord);
  vec2 noisev = vrand(coord);

  float w = (.5 / 1280.) / vdepth + (noisev.x * (1. - noisev.x)),
        h = (.5 / 800.)  / vdepth + (noisev.y * (1. - noisev.y)),
        dz = 1. / 16.,
        z = 1. - dz / 2.,
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

  //gl_FragColor = vec4(lambert * att * 2.5 * color, 1.);
}

