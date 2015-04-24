#extension GL_OES_standard_derivatives : enable
precision highp float;

varying vec3 fnorm, fvert, fextra, texCoord;
varying float dist;

uniform sampler2D tex;

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

struct TTextureInfo {
  vec3 color;
  vec3 normal;
};

#define textureBrickI(x, p, notp) ((floor(x)*(p))+max(fract(x)-(notp), 0.0))
TTextureInfo textureBrick(vec2 uv, vec3 brickColor, vec3 pos, vec3 normal) {

  const float bW  = .0625,
              bH  = .03125,
              mS  = 1. / 128.,
              mWf = mS * .5 / bW,
              mHf = mS * .5 / bH;
  const vec3 mortarColor = vec3(.8, .8, .8);

  float u = 4. * uv.s / bW,
        v = 4. * uv.t / bH,
        brU = floor(u),
        brV = floor(v);

  if(mod(v * .5, 1.) > .5)
    u += .5;
  brU = floor(u);

  float noisev = 1. + 
                 snoise(uv * 16.) * .0625 +
                 abs(snoise(uv * 512.)) * .0625;
  float brickDamp = 1. + .25 * sin(2. * (brU + 1.)) * sin(2. * (brV + 1.));

  vec2 uuv = vec2(u, v),
       fw = 2. * vec2(fwidth(uuv.x), fwidth(uuv.y)),
       mortarPct = vec2(mWf, mHf),
       brickPct = vec2(1., 1.) - mortarPct,
       ub = (textureBrickI(uuv + fw, brickPct, mortarPct) -
             textureBrickI(uuv, brickPct, mortarPct)) / fw;

  float bump = ub.x * ub.y;
  vec3 bU = dFdx(bump) * cross(normal, dFdy(pos)),
       bV = - dFdy(bump) * cross(normal, dFdx(pos)),
       bD = normal + (bU + bV) * .5;

  return TTextureInfo(
    mix(mortarColor, brickColor * brickDamp, ub.x * ub.y) * noisev,
    normalize(faceforward(bD, -bD, normal))
  );
}
vec3 textureWindow2(vec2 uuv, vec3 brickColor) {
  const vec2 patternPct   = vec2(.3, .5),
             patternStart = vec2(.35, .25), //(1. - patternPct) * .25,
             patternEnd   = patternStart + patternPct,
             framePct     = vec2(1. / 64., 1. / 64.),
             frameStart   = patternStart + framePct,
             frameEnd     = patternEnd   - framePct;
  const vec3 windowColor  = vec3(.8, .94, .99),
             frameColor   = vec3(.5, .5, .5);

  vec2 uv   = mod(8. * uuv, 1.),
       fk   = fwidth(uv),
       patQ = (smoothstep(patternStart, patternStart + fk, uv) -
              smoothstep(patternEnd, patternEnd + fk, uv)) *
              (smoothstep(vec2(0.), fk, uv) * (1. - smoothstep(1. - fk, vec2(1.), uv))), // Remove edges
       patF = (smoothstep(frameEnd, frameEnd + fk, uv) - smoothstep(frameStart, frameStart + fk, uv));
  float noisep = 1. + 
                snoise(-uv * 2.) * .25,
        noisev = 1. + 
                 snoise(uuv * 16.) * .0625 +
                 abs(snoise(uuv * 512.)) * .0625,
        noisem = 1. +
                 snoise(uuv * 4.) * .0625 +
                 abs(snoise(uuv * 128.)) * .125;

  return mix(brickColor * noisem, mix(frameColor * noisev, windowColor * noisep, patF.x * patF.y), patQ.x * patQ.y);
}

/******************************************************************************\
 * Window texture
\******************************************************************************/

TTextureInfo textureWindow(vec2 uuv, vec3 brickColor, vec3 pos, vec3 normal) {

  const vec2 patternPct   = vec2(.3, .5),
             patternStart = vec2(.35, .25), //(1. - patternPct) * .25,
             patternEnd   = patternStart + patternPct,
             framePct     = vec2(1. / 64., 1. / 64.),
             frameStart   = patternStart + framePct,
             frameEnd     = patternEnd   - framePct;
  const vec3 windowColor  = vec3(.8, .94, .99),
             frameColor   = vec3(.5, .5, .5);

  vec2 uv   = mod(8. * uuv, 1.),
       fk   = fwidth(uv),
       patQ = (smoothstep(patternStart, patternStart + fk, uv) -
              smoothstep(patternEnd, patternEnd + fk, uv)) *
              (smoothstep(vec2(0.), fk, uv) * (1. - smoothstep(1. - fk, vec2(1.), uv))), // Remove edges
       patF = (smoothstep(frameEnd, frameEnd + fk, uv) - smoothstep(frameStart, frameStart + fk, uv));
  float noisep = 1. + 
                snoise(-uv * 2.) * .25;
  float noisev = 1. + 
                 snoise(uuv * 16.) * .0625 +
                 abs(snoise(uuv * 512.)) * .0625;

  /*return TTextureInfo(
    mix(textureBrick(uuv, brickColor), mix(frameColor * noisev, windowColor * noisep, patF.x * patF.y), patQ.x * patQ.y),
    normalize(normal + bD)
  );*/
  TTextureInfo tbi = textureBrick(uuv, brickColor, pos, normal);
  return TTextureInfo(
    mix(tbi.color, mix(frameColor * noisev, windowColor * noisep, patF.x * patF.y), patQ.x * patQ.y),
    mix(tbi.normal, normal, patQ.x * patQ.y)
    //mix(tbi.normal, normalize(normal + bD), patB.x * patB.y)
  );

}
/*vec3 textureWindow(vec2 uuv, vec3 brickColor) {

  const vec2 patternPct   = vec2(.3, .5),
             patternStart = vec2(.35, .25), //(1. - patternPct) * .25,
             patternEnd   = patternStart + patternPct,
             framePct     = vec2(1. / 64., 1. / 64.),
             frameStart   = patternStart + framePct,
             frameEnd     = patternEnd   - framePct;
  const vec3 windowColor  = vec3(.8, .94, .99),
             frameColor   = vec3(.5, .5, .5);

  vec2 uv   = mod(8. * uuv, 1.),
       fk   = fwidth(uv),
       patQ = (smoothstep(patternStart, patternStart + fk, uv) -
              smoothstep(patternEnd, patternEnd + fk, uv)) *
              (smoothstep(vec2(0.), fk, uv) * (1. - smoothstep(1. - fk, vec2(1.), uv))), // Remove edges
       patF = (smoothstep(frameEnd, frameEnd + fk, uv) - smoothstep(frameStart, frameStart + fk, uv));
  float noisep = 1. + 
                snoise(-uv * 2.) * .25;
  float noisev = 1. + 
                 snoise(uuv * 16.) * .0625 +
                 abs(snoise(uuv * 512.)) * .0625;

  return mix(textureBrick(uuv, brickColor), mix(frameColor * noisev, windowColor * noisep, patF.x * patF.y), patQ.x * patQ.y);

}*/

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

  vec3 color, normal = normalize(cross(dFdx(fvert), dFdy(fvert)));
  vec2 uuv = mod(texCoord.yx, 1.);
  
  if(texCoord.z > 4.5)
    color = textureWindow2(uuv, fextra);
  else if(texCoord.z > 3.5) {
    TTextureInfo ti = textureWindow(uuv, fextra, gl_FragCoord.xyz, normal);
    color = ti.color;
    normal = ti.normal;
  }
  else if(texCoord.z > 2.5)
    color = textureAsphalt(uuv);
  else if(texCoord.z > 1.5)
    color = textureRoad(uuv.yx);
  else
    color = textureAsphalt(uuv); //textureWindow(uuv, fextra);

  vec3 lightDir = normalize(vec3(0.5, -1., 0.2));
  float lambert = clamp(dot( normal, -lightDir ), 0.0, 1.0);
  float att = min(1.0, 1.0 / (.2 + .6 * dist + .4 * dist * dist));

  gl_FragColor = vec4(color.xyz * (att * .1 + lambert * .6 + 0.3), 1.0);
}

