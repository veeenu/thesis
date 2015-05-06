#extension GL_OES_standard_derivatives : enable
precision highp float;

/* #pragma glslify: fxaa = require(glsl-fxaa) */

uniform sampler2D target0, target1, target2, depthBuffer, randMap;
uniform mat4 viewMatrix;
uniform vec3 lightPos;

varying vec2 coord;
varying vec3 lPos;

//uniform vec3 lightPos;

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


////////////////////////////////////////////////////////////////////////////////
// Main
////////////////////////////////////////////////////////////////////////////////


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

  vec4 t0 = texture2D(target0, coord),
       t1 = texture2D(target1, coord),
       /*t1 = mix( mix(texture2D(target1, c0), texture2D(target1, c1), .5), 
                 mix(texture2D(target1, c2), texture2D(target1, c3), .5), 
                 .5),*/
       t2 = texture2D(target2, coord);

  vec3  vertex = t0.xyz,
        normal = normalize(t1.xyz),
        color  = t2.xyz;
  float depth  = t1.w;



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
  vec2 kernel[4];
  kernel[0] = vec2(0., 1.);
  kernel[1] = vec2(1., 0.);
  kernel[2] = vec2(0., -1.);
  kernel[3] = vec2(-1., 0.);

  const float sin45 = .707107, sRad = 80.;

  float occlusion = 0., kRad = sRad * (1. - depth);

  for(int i = 0; i < 4; ++i) {
    vec2 k1 = reflect(kernel[i], .6 * vec2(rand(sin(coord)), rand(-coord)));
    vec2 k2 = vec2(k1.x * sin45 - k1.y * sin45,
                   k1.x * sin45 + k1.y * sin45);
    occlusion += sample(vertex, normal, coord + k1 * kRad);
    occlusion += sample(vertex, normal, coord + k1 * kRad * .75);
    occlusion += sample(vertex, normal, coord + k1 * kRad * .5);
    occlusion += sample(vertex, normal, coord + k1 * kRad * .25);
  }
  occlusion /= 16.;
  occlusion = clamp(occlusion, 0., 1.);

  color = clamp(color - occlusion, 0., 1.);
  gl_FragColor = vec4(lambert * att * 2. * color, 1.);
  //gl_FragColor = vec4(color, 1.);
}
