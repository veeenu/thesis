#extension GL_OES_standard_derivatives : require
//#extension GL_EXT_draw_buffers : require

precision highp float;

varying vec4 vPosition, clipPosition;
varying vec3 texUV, vNormal, vExtra;

////////////////////////////////////////////////////////////////////////////////
// https://github.com/ashima/webgl-noise/blob/master/src/noise2D.glsl         //
////////////////////////////////////////////////////////////////////////////////

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
// Procedural textures
////////////////////////////////////////////////////////////////////////////////

vec3 bumpMap(vec3 fvert, vec3 fnorm, float bump) {

  vec3 bU = dFdx(bump) * cross(fnorm, normalize(dFdy(fvert))),
       bV = dFdy(bump) * cross(normalize(dFdx(fvert)), fnorm),
       bD = fnorm + (bU + bV);

  return normalize(bD);
}

struct TTextureInfo {
  vec3 color;
  vec3 normal;
};

#define textureBrickI(x, p, notp) ((floor(x)*(p))+max(fract(x)-(notp), 0.0))
TTextureInfo textureBrick(vec3 fvert, vec3 fnorm, float fdepth, vec2 uv, vec3 brickColor) {

  const float bW  = .03125,
              bH  = .015625,
              mS  = 1. / 512.,
              mWf = mS * .5 / bW,
              mHf = mS * .5 / bH;
  //const vec3 mortarColor = vec3(.9, .9, .9);
  const vec3 mortarColor = vec3(.68, .68, .71);

  float u = uv.s / bW,
        v = uv.t / bH,
        brU = floor(u),
        brV = floor(v);

  if(mod(v * .5, 1.) > .5)
    u += .5;
  brU = floor(u);

  float noisev = 1. +
                 //snoise(uv * 16.) * .0625 +
                 snoise(uv * 256.) * .125;
  float brickDamp = 1. + .125 * sin(1.57 * (brU + 1.)) * sin(2. * (brV + 1.));

  vec2 uuv = vec2(u, v),
       fw = 2. * vec2(fwidth(uuv.x), fwidth(uuv.y)),
       mortarPct = vec2(mWf, mHf),
       brickPct = vec2(1., 1.) - mortarPct,
       ub = (textureBrickI(uuv + fw, brickPct, mortarPct) -
             textureBrickI(uuv, brickPct, mortarPct)) / fw;

  vec3 color = mix(mortarColor, brickColor * brickDamp, ub.x * ub.y);

  // Adaptive box blur filter. Not perfect but quick and somewhat acceptable
  vec2 ubSample, ubKernel = 4. * fwidth(ub), noiseKernel = fwidth(uv);
  float bump = 0., invd = 1. / 11.;

  for(int x = -1; x <= 1; x++) {
    for(int y = -1; y <= 1; y++) {
      ubSample = ub + vec2(float(x), float(y)) * ubKernel;
      bump += .1111111 * ubSample.x * ubSample.y;
    }
  }

  // Frequency clamping
  bump += 4. * (1. - smoothstep(0., .00125, max(noiseKernel.x, noiseKernel.y))) * noisev;

  return TTextureInfo(
    color,
    bumpMap(fvert, fnorm, bump)
  );
}

/******************************************************************************\
 * Window texture
\******************************************************************************/

TTextureInfo textureWindow(vec3 fvert, vec3 fnorm, float fdepth, vec2 uv, vec3 windowColor) {

  const vec2 patternPct   = vec2(1., 1.),
             patternStart = vec2(0., 0.), //(1. - patternPct) * .25,
             patternEnd   = patternStart + patternPct,
             framePct     = vec2(1. / 32., 1. / 32.),
             frameStart   = patternStart + framePct,
             frameEnd     = patternEnd   - framePct;
  //const vec3 windowColor  = vec3(.8, .94, .99),
  const vec3 frameColor   = vec3(.5, .5, .5);

  vec2 fk   = fwidth(uv) * 2.,
       uuv  = mod(uv, .5 - 1. / 64.),
       patF = (smoothstep(frameEnd, frameEnd + fk, uuv) - smoothstep(frameStart, frameStart + fk, uuv));
  float noisep = 1. + 
                snoise(-uv * .5) * .25;
  float noisev = 1. + 
                 snoise(uv * 16.) * .0625 +
                 abs(snoise(uv * 512.)) * .0625;

  /*vec2 patSample, patKernel = 3. * vec2(fwidth(patF.x), fwidth(patF.y));
  float bump = 0.;

  for(int x = -1; x <= 1; x++) {
    for(int y = -1; y <= 1; y++) {
      patSample = patF + vec2(float(x), float(y)) * patKernel;
      bump += patSample.x * patSample.y;
    }
  }
  bump *= 1./9.;*/

  float bump = patF.x * patF.y;

  return TTextureInfo(
    mix(frameColor, windowColor * noisep, patF.x * patF.y),
    bumpMap(fvert, fnorm, bump)
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
////////////////////////////////////////////////////////////////////////////////

float packColor(vec3 v) {
  const float u = 255. / 256.;

  return fract(v.x * u) + floor(v.y * u * 255.) + floor(v.z * u * 255.) * 255.;
}

vec2 packNormal(in vec3 normal)
{
    const float SCALE = 1.7777;
    float scalar1 = (normal.z + 1.0) * (SCALE * 2.0);
    return normal.xy / scalar1 + 0.5;
}

void main() {

  TTextureInfo ti; // = textureBrick(vPosition.xyz, vNormal.xyz, vNormal.w, texUV.st, vExtra.xyz);
  vec3 color, normal;

  float depth = clipPosition.z / clipPosition.w; //gl_FragCoord.z / gl_FragCoord.w;

  normal = normalize(faceforward(vNormal, gl_FragCoord.xyz, vNormal));

  if(texUV.z > 5.1) {
    ti = textureBrick(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.xy, 1.), vExtra);
    color = ti.color;
    normal = ti.normal;
  }
  else if(texUV.z > 4.1) {
    ti = textureWindow(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.yx, 1.), vec3(1., 1., .7));
    color = ti.color;
    normal = ti.normal;
  }
  else if(texUV.z > 3.1) {
    ti = textureWindow(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.yx, 1.), vec3(.3, .3, .3));
    color = ti.color;
    normal = ti.normal;
  }
  else if(texUV.z > 2.1)
    color = textureAsphalt(mod(texUV.yx, 1.));
  else if(texUV.z > 1.1)
    color = textureRoad(mod(texUV.xy, 1.));
  else
    color = textureAsphalt(mod(texUV.yx, 1.)); //textureWindow(uuv, fextra);

  gl_FragColor = vec4(packNormal(normalize(normal)), packColor(clamp(color, 0., 1.)), depth);
  //gl_FragData[0] = vec4(packNormal(normalize(normal)), packColor(clamp(color, 0., 1.)), depth);
  //gl_FragData[1] = vec4(normalize(normal), depth);
  //gl_FragData[2] = vec4(color, pack(clamp(color, 0., 1.)));
}
