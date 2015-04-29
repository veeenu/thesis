#extension GL_OES_standard_derivatives : enable
precision highp float;

varying vec3 fnorm, fvert, fextra, texCoord;
varying float fdepth;

uniform sampler2D tex;

const float C1 = 0.429043;
const float C2 = 0.511664;
const float C3 = 0.743125;
const float C4 = 0.886227;
const float C5 = 0.247708;
// Constants for Old Town Square lighting
const vec3 L00  = vec3( 0.871297,  0.875222,  0.864470);
const vec3 L1m1 = vec3( 0.175058,  0.245335,  0.312891);
const vec3 L10  = vec3( 0.034675,  0.036107,  0.037362);
const vec3 L11  = vec3(-0.004629, -0.029448, -0.048028);
const vec3 L2m2 = vec3(-0.120535, -0.121160, -0.117507);
const vec3 L2m1 = vec3( 0.003242,  0.003624,  0.007511);
const vec3 L20  = vec3(-0.028667, -0.024926, -0.020998);
const vec3 L21  = vec3(-0.077539, -0.086325, -0.091591);
const vec3 L22  = vec3(-0.161784, -0.191783, -0.219152);

////////////////////////////////////////////////////////////////////////////////
// https://github.com/ashima/webgl-noise/blob/master/src/noise2D.glsl         //
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                     -0.577350269189626,  // -1.0 + 2.0 * C.x
                      0.024390243902439); // 1.0 / 41.0
  vec2 i  = floor(v + dot(v, C.yy) );
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1;
  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
		+ i.x + vec3(0.0, i1.x, 1.0 ));
  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
  m = m*m ;
  m = m*m ;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}
////////////////////////////////////////////////////////////////////////////////

vec3 bumpMap(float bump) {

  vec3 bU = dFdx(bump) * cross(fnorm, normalize(dFdy(fvert))),
       bV = dFdy(bump) * cross(normalize(dFdx(fvert)), fnorm),
       bD = fnorm + (bU + bV) * 3.;

  return normalize(bD);
}

struct TTextureInfo {
  vec3 color;
  vec3 normal;
};

#define textureBrickI(x, p, notp) ((floor(x)*(p))+max(fract(x)-(notp), 0.0))
TTextureInfo textureBrick(vec2 uv, vec3 brickColor) {

  const float bW  = .125,
              bH  = .0625,
              mS  = 1. / 128.,
              mWf = mS * .5 / bW,
              mHf = mS * .5 / bH;
  const vec3 mortarColor = vec3(.9, .9, .9);

  float u = uv.s / bW,
        v = uv.t / bH,
        brU = floor(u),
        brV = floor(v);

  if(mod(v * .5, 1.) > .5)
    u += .5;
  brU = floor(u);

  float noisev = 1. +
                 //snoise(uv * 16.) * .0625 +
                 snoise(uv * 64.) * .125;
  float brickDamp = 1. + .125 * sin(2. * (brU + 1.)) * sin(2. * (brV + 1.));

  vec2 uuv = vec2(u, v),
       fw = 2. * vec2(fwidth(uuv.x), fwidth(uuv.y)),
       mortarPct = vec2(mWf, mHf),
       brickPct = vec2(1., 1.) - mortarPct,
       ub = (textureBrickI(uuv + fw, brickPct, mortarPct) -
             textureBrickI(uuv, brickPct, mortarPct)) / fw;

  vec3 color = mix(mortarColor, brickColor * brickDamp, ub.x * ub.y);

  float bump = noisev / fdepth + (ub.x * ub.y) - dFdx(ub.x) * dFdy(ub.y);

  return TTextureInfo(
    color,
    bumpMap(bump)
  );
}

/******************************************************************************\
 * Window texture
\******************************************************************************/

TTextureInfo textureWindow(vec2 uv, vec3 windowColor) {

  const vec2 patternPct   = vec2(1., 1.),
             patternStart = vec2(0., 0.), //(1. - patternPct) * .25,
             patternEnd   = patternStart + patternPct,
             framePct     = vec2(1. / 32., 1. / 32.),
             frameStart   = patternStart + framePct,
             frameEnd     = patternEnd   - framePct;
  //const vec3 windowColor  = vec3(.8, .94, .99),
  const vec3 frameColor   = vec3(.5, .5, .5);

  vec2 fk   = fwidth(uv),
       uuv  = mod(uv, .5 - 1. / 64.),
       patF = (smoothstep(frameEnd, frameEnd + fk, uuv) - smoothstep(frameStart, frameStart + fk, uuv));
  float noisep = 1. + 
                snoise(-uv * .5) * .25;
  float noisev = 1. + 
                 snoise(uv * 16.) * .0625 +
                 abs(snoise(uv * 512.)) * .0625;

  return TTextureInfo(
    mix(frameColor, windowColor * noisep, patF.x * patF.y),
    bumpMap(patF.x * patF.y)
  );
}

/******************************************************************************\
 * Road texture
\******************************************************************************/

vec3 textureRoad(vec2 uuv) {
  const float padding = 1. / 32.,
              tapeW   = 1. / 32.,
              tapeL0  = padding,
              tapeL1  = padding + tapeW,
              tapeR1  = 1. - tapeL0,
              tapeR0  = 1. - tapeL1,
              tapeC0  = .5 - tapeW * .5,
              tapeC1  = .5 + tapeW * .5,
              vertDiv = 4.;
  const vec3 asphaltColor = vec3(.2, .2, .2),
             stripColor = vec3(.8, .8, .8);

  vec2 uv = uuv + vec2(0, .5), fk = fwidth(uv);
  float csSpacing = mod(.25 + uv.t * vertDiv, 1.),
        q = 
    (
      smoothstep(tapeL0, tapeL0 + fk.x, uv.s) - 
      smoothstep(tapeL1, tapeL1 + fk.x, uv.s)
    ) +
    (
      smoothstep(tapeR0, tapeR0 + fk.x, uv.s) - 
      smoothstep(tapeR1, tapeR1 + fk.x, uv.s)
    ) +
    (
      smoothstep(tapeC0, tapeC0 + fk.x, uv.s) - 
      smoothstep(tapeC1, tapeC1 + fk.x, uv.s)
    ) * 
    (
      smoothstep(.5 - fk.y, .5 + fk.y, csSpacing) *
      (1. - smoothstep(1. - 2. * fk.y, 1., csSpacing))
    )
    ;

  float noiseA = 1. +
                 abs(snoise(uv * 16.))  * .0625 +
                 abs(snoise(uv * 32.))  * .0625 +
                 abs(snoise(uv * 128.)) * .125,
        noiseS = 1. + 
                 abs(snoise(uv * 128.)) * .125;

  return mix(asphaltColor * noiseA, stripColor * noiseS, q);
}

vec3 textureAsphalt(vec2 uuv) {
  const vec3 asphaltColor = vec3(.2, .2, .2);

  vec2 uv = uuv + vec2(0, .5);
  float noiseA = 1. +
                 abs(snoise(uv * 16.))  * .0625 +
                 abs(snoise(uv * 32.))  * .0625 +
                 abs(snoise(uv * 128.)) * .125;
  return asphaltColor * 1.5 * noiseA;
}

void main(void) {

  vec3 color, normal;
  vec2 uuv = mod(texCoord.yx, 1.);

  TTextureInfo ti;
  
  if(texCoord.z > 5.1) {
    ti = textureBrick(mod(texCoord.xy, 1.), fextra);
    color = ti.color;
    normal = ti.normal;
  }
  else if(texCoord.z > 4.1) {
    ti = textureWindow(uuv, vec3(1., 1., .8));
    color = ti.color;
    normal = ti.normal;
  }
  else if(texCoord.z > 3.1) {
    ti = textureWindow(uuv, vec3(.5, .5, .4));
    color = ti.color;
    normal = ti.normal;
  }
  else if(texCoord.z > 2.1)
    color = textureAsphalt(uuv);
  else if(texCoord.z > 1.1)
    color = textureRoad(uuv.yx);
  else
    color = textureAsphalt(uuv); //textureWindow(uuv, fextra);

  normal = faceforward(normal, gl_FragCoord.xyz, fnorm);

  vec3 lightDir = normalize(vec3(0.5, -1., 0.2));
  float lambert = clamp(dot( normal, -lightDir ), 0.0, 1.0);
  float att = min(1.0, 1.0 / (.2 + .6 * fdepth + .4 * fdepth * fdepth));

  vec3 diffuse =  C1 * L22 * (normal.x * normal.x - normal.y * normal.y) +
                  C3 * L20 *  normal.z * normal.z +
                  C4 * L00 -
                  C5 * L20 +
                  2.0 * C1 * L2m2 * normal.x * normal.y + 
                  2.0 * C1 * L21 * normal.x * normal.z + 
                  2.0 * C1 * L2m1 * normal.y * normal.z + 
                  2.0 * C2 * L11 * normal.x+
                  2.0 * C2 * L1m1 * normal.y +
                  2.0 * C2 * L10 * normal.z;

  gl_FragColor = vec4(color.xyz * diffuse, 1.);
  //gl_FragColor = vec4(color.xyz * (att * .1 + lambert * .6 + 0.3), 1.0);

}

