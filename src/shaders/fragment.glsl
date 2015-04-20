precision highp float;

varying vec3 fnorm, fvert, texCoord;
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

vec3 textureBrick(vec2 uv) {

  const float bW  = .0625,
              bH  = .03125,
              mS  = 1. / 512.,
              mWf = mS * .5 / bW,
              mHf = mS * .5 / bH;
  const vec3  brickColor  = vec3(.5, .0, .1),
              mortarColor = vec3(.5, .5, .5);

  float u = uv.s / bW,
        v = uv.t / bH,
        brU = floor(u),
        brV = floor(v);

  if(mod(v * .5, 1.) > .5)
    u += .5;
  brU = floor(u);
  u = fract(u);
  v = fract(v);

  float noisev = 1. + 
                 snoise(uv * 16.) * .0625 +
                 abs(snoise(uv * 256.)) * .25;
  float noisei = abs(snoise(64. * vec2(brU, brV)));
  float brickDamp = 1. + .125 * sin(2. * (brU + 1.)) * sin(2. * (brV + 1.));

  return mix(mortarColor, brickColor * brickDamp,
             (step(mWf, u) - step(1. - mWf, u)) *
             (step(mHf, v) - step(1. - mHf, v))
            ) * noisev;
}

vec3 textureRoad(vec2 uv) {
  const float padding = 1. / 32.,
              tapeW   = 1. / 32.,
              vertDiv = 4.;
  const vec3 asphaltColor = vec3(.2, .2, .2),
             stripColor = vec3(.8, .8, .8);

  float q = 
    step(padding, uv.s) - step(padding + tapeW, uv.s) +
    step(1. - padding - tapeW, uv.s) - step(1. - padding, uv.s) +
    (step(.5 - tapeW * .5, uv.s) - step(.5 + tapeW * .5, uv.s)) * 
    (step(.5, mod(.25 + uv.t * vertDiv, 1.)))
    ;

  float noiseA = 1. +
                 abs(snoise(uv * 16.))  * .0625 +
                 abs(snoise(uv * 32.))  * .0625 +
                 abs(snoise(uv * 128.)) * .125,
        noiseS = 1. + 
                 abs(snoise(uv * 128.)) * .125;

  return mix(asphaltColor * noiseA, stripColor * noiseS, q);
}

vec3 textureBrickF(vec2 uv) {
  const float freq = 1. / 1024.;
  const vec2 s1 = vec2(-freq, -freq),
             s2 = vec2(-freq,  freq),
             s3 = vec2( freq,  freq),
             s4 = vec2( freq, -freq);
  vec3 blur = (textureBrick(uv + s1) +
               textureBrick(uv + s2) +
               textureBrick(uv + s3) +
               textureBrick(uv + s4)) * .25;
  return textureBrick(uv) * .25 + blur * .75;
}

vec3 triplanarBlend(vec3 norm) {
  vec3 blend = normalize(max(abs(norm), 10e-5));
  float b = blend.x + blend.y + blend.z;
  blend /= vec3(b,b,b);
  return blend;
}

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
  //vec4 color = texture2D(tex, tp); //vec2(tp.x * 2., tp.y));
  //vec4 color = vec4(textureBrickF(tp), 1.);

  vec3 blend = triplanarBlend(fnorm),
       tX = texture2D(tex, fvert.zy * 4.).rgb,
       tY = texture2D(tex, fvert.xz * 4.).rgb,
       tZ = texture2D(tex, fvert.xy * 4.).rgb,
       color = blend.x * tX + blend.y * tY + blend.z * tZ;

  vec3 lightDir = normalize(vec3(0.5, 1., 0.5));
  float lambert = clamp(dot( fnorm, -lightDir ), 0.0, 1.0);
  float att = min(1.0, 1.0 / (.2 + .6 * dist + .4 * dist * dist));

  gl_FragColor = vec4(color.xyz * (att * .2 + lambert * .6 + 0.2), 1.0);
}

