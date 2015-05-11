#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform sampler2D target0, depthBuffer;
uniform mat4 inverseProjection, viewMatrix;
uniform vec3 lightPos;

varying vec2 sscoord, coord;
varying vec3 lPos;

float sample(vec3 p, vec3 n, vec2 uv) {
  vec3 dstP = texture2D(target0, uv).xyz,
       posV = dstP - p;

  float intens = max(dot(normalize(posV), n) - .05, 0.),
        dist = length(posV),
        att  = 1. / (2. + (5. * dist));
  return intens * att;
}

highp float rand(vec2 co)
{
    highp float a = 12.9898;
    highp float b = 78.233;
    highp float c = 43758.5453;
    highp float dt= dot(co.xy ,vec2(a,b));
    highp float sn= mod(dt,3.14);
    return fract(sin(sn) * c);
}

vec3 unpackColor(float d) {
  vec3 ret;

  ret.x = fract(d);
  float zi = floor(d / 255.);
  ret.z = fract(zi / 255.);
  ret.y = fract( floor( d - ( zi * 255. ) ) / 255.);

  return ret;
}

vec3 unpackNormal(in vec2 enc)
{
	const float SCALE = 1.7777;
	vec2 nn = enc * (2.0 * SCALE) - SCALE;
	float g = 2.0 / (dot(nn.xy, nn.xy) + 1.0);
	vec3 normal;
	normal.xy = g * nn.xy;
	normal.z = g - 1.0;
	return normal;
}

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

  vec4 t0 = texture2D(target0, coord);
  if(length(t0.xy) == 0.)
    discard;

  vec3  vertex,
        normal    = normalize(unpackNormal(t0.xy)),
        color     = unpackColor(t0.z);
  float depth     = t0.w;

  vec4 vertexFromDepth = inverseProjection * vec4(sscoord, depth, 1.);
  vertex = vertexFromDepth.xyz / vertexFromDepth.w;

  vec3 lightDir = lPos - vertex;
  float lambert = max(dot(faceforward(-normal, lightDir, normal), normalize(lightDir)), 0.),
        dist = length(lightDir),
        att = min(1., 1. / (1. + 2.5 * dist + 5. * dist * dist));

  gl_FragColor = vec4(lambert * att * 2.5 * color, 1.);
}
