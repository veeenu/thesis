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
  /*vec3 lights[4];
  lights[0] = vec3(6. - .025, .2, 6. - .025);
  lights[1] = vec3(6. - .025, .2, 6. + .025);
  lights[2] = vec3(6. + .025, .2, 6. + .025);
  lights[3] = vec3(6. + .025, .2, 6. - .025);*/
  /*vec4 t0 = fxaa(target0, coord, res),
       t1 = fxaa(target1, coord, res),
       t2 = fxaa(target2, coord, res);*/
  /*vec2 fw = .5 * fwidth(coord),
       nfw = vec2(fw.x, -fw.y),
       c0 = coord - fw,
       c1 = coord + fw,
       c2 = coord - nfw,
       c3 = coord + nfw;*/

  vec4 t0 = texture2D(target0, coord);
  if(length(t0.xy) == 0.)
    discard;

  vec3  vertex,
        //normal = normalize(t1.xyz),
        normal = normalize(unpackNormal(t0.xy)),
        color  = unpackColor(t0.z);
        //color  = t2.xyz;
  float depth  = t0.w;

  vec4 vertexFromDepth = inverseProjection * vec4(sscoord, depth, 1.);
  vertex = vertexFromDepth.xyz / vertexFromDepth.w;

  vec3 lightDir = lPos - vertex;
  float lambert = max(dot(faceforward(-normal, lightDir, normal), normalize(lightDir)), 0.),
        dist = length(lightDir),
        att = min(1., 1. / (1. + 2.5 * dist + 5. * dist * dist));

  /*float lambert = 0., att = 1.;
  for(int i = 0; i < 4; i++) {
    vec3 lightDir = (viewMatrix * vec4(lights[i], 1.)).xyz - vertex;
    float llambert = max(dot(faceforward(-normal, lightDir, normal), normalize(lightDir)), 0.),
          dist = length(lightDir),
          latt = min(1., 1. / (1. + .5 * dist + 5. * dist * dist));
    lambert += llambert * latt * .25;
  }*/

  //////////////////////////////////////////////////////////////////////////////
  // SSAO
  //////////////////////////////////////////////////////////////////////////////

  /*float occlusion = 0., vdepth = readDepth(coord);
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

  color = clamp(color - occlusion, 0., 1.);*/
  gl_FragColor = vec4(lambert * att * 2.5 * color, 1.);
  //gl_FragColor = vec4(0., 1. * (1. - occlusion), lambert, 1.);
  //gl_FragColor = vec4(vec3(1. - occlusion), 1.);
  //gl_FragColor = vec4(normal, 1.);
  //gl_FragColor = vec4(color, 1.);
}
