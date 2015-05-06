(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var canvas   = document.getElementById('thesis-canvas'),
    gl       = canvas.getContext('webgl'),
    bcr      = canvas.getBoundingClientRect(),
    w        = bcr.width,
    h        = bcr.height;

canvas.width  = w;
canvas.height = h;
canvas.style.background = 'black';

module.exports = {
  canvas: canvas,
  gl: gl,
  w: w,
  h: h,
  aspectRatio: w / h
}

},{}],2:[function(require,module,exports){

//var glslify     = require('glslify');
var Util        = require('./lib/util.js'),
    glMatrix    = require('./lib/glMatrixSubset'),
    vec3        = glMatrix.vec3,
    mat3        = glMatrix.mat3,
    mat4        = glMatrix.mat4,
    Context     = require('./Context'),
    gl          = Context.gl,
    BuildingSHG = require('./generators/BuildingSHG.js');

var programPass  = gl.createProgram(),
    programLight = gl.createProgram(),
    vshPass      = gl.createShader(gl.VERTEX_SHADER),
    fshPass      = gl.createShader(gl.FRAGMENT_SHADER),
    vshLight     = gl.createShader(gl.VERTEX_SHADER),
    fshLight     = gl.createShader(gl.FRAGMENT_SHADER),
    extDrawbuffers, extDepthTexture, extFloatLinear,
    vsrcPass, vsrcLight, fsrcPass, fsrcLight;

vsrcPass  = "uniform mat4 projection, viewmodel;\nuniform mat3 normalM;\n\nattribute vec3 vertex, normal, uv, extra;\n\nvarying vec4 vPosition, clipPosition;\nvarying vec3 texUV, vNormal, vExtra;\n\nvoid main() {\n  \n  vec4 viewPos = viewmodel * vec4(vertex, 1.);\n  clipPosition = gl_Position = projection * viewPos;\n\n  vPosition = viewPos;\n  vNormal = normalize(normalM * normal);\n  vExtra = extra;\n  texUV = uv;\n\n}\n\n";
fsrcPass  = "#extension GL_OES_standard_derivatives : require\n//#extension GL_EXT_draw_buffers : require\n\nprecision highp float;\n\nvarying vec4 vPosition, clipPosition;\nvarying vec3 texUV, vNormal, vExtra;\n\n////////////////////////////////////////////////////////////////////////////////\n// https://github.com/ashima/webgl-noise/blob/master/src/noise2D.glsl         //\n////////////////////////////////////////////////////////////////////////////////\n\nvec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }\nvec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }\nvec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }\nfloat snoise(vec2 v) {\n  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0\n                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)\n                     -0.577350269189626,  // -1.0 + 2.0 * C.x\n                      0.024390243902439); // 1.0 / 41.0\n  vec2 i  = floor(v + dot(v, C.yy) );\n  vec2 x0 = v -   i + dot(i, C.xx);\n  vec2 i1;\n  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);\n  vec4 x12 = x0.xyxy + C.xxzz;\n  x12.xy -= i1;\n  i = mod289(i);\n  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))\n\t\t+ i.x + vec3(0.0, i1.x, 1.0 ));\n  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);\n  m = m*m ;\n  m = m*m ;\n  vec3 x = 2.0 * fract(p * C.www) - 1.0;\n  vec3 h = abs(x) - 0.5;\n  vec3 ox = floor(x + 0.5);\n  vec3 a0 = x - ox;\n  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );\n  vec3 g;\n  g.x  = a0.x  * x0.x  + h.x  * x0.y;\n  g.yz = a0.yz * x12.xz + h.yz * x12.yw;\n  return 130.0 * dot(m, g);\n}\n\n////////////////////////////////////////////////////////////////////////////////\n// Procedural textures\n////////////////////////////////////////////////////////////////////////////////\n\nvec3 bumpMap(vec3 fvert, vec3 fnorm, float bump) {\n\n  vec3 bU = dFdx(bump) * cross(fnorm, normalize(dFdy(fvert))),\n       bV = dFdy(bump) * cross(normalize(dFdx(fvert)), fnorm),\n       bD = fnorm + (bU + bV) * .5;\n\n  return normalize(bD);\n}\n\nstruct TTextureInfo {\n  vec3 color;\n  vec3 normal;\n};\n\n#define textureBrickI(x, p, notp) ((floor(x)*(p))+max(fract(x)-(notp), 0.0))\nTTextureInfo textureBrick(vec3 fvert, vec3 fnorm, float fdepth, vec2 uv, vec3 brickColor) {\n\n  const float bW  = .125,\n              bH  = .0625,\n              mS  = 1. / 128.,\n              mWf = mS * .5 / bW,\n              mHf = mS * .5 / bH;\n  const vec3 mortarColor = vec3(.9, .9, .9);\n\n  float u = uv.s / bW,\n        v = uv.t / bH,\n        brU = floor(u),\n        brV = floor(v);\n\n  if(mod(v * .5, 1.) > .5)\n    u += .5;\n  brU = floor(u);\n\n  float noisev = 1. +\n                 //snoise(uv * 16.) * .0625 +\n                 snoise(uv * 64.) * .125;\n  float brickDamp = 1. + .125 * sin(1.57 * (brU + 1.)) * sin(2. * (brV + 1.));\n\n  vec2 uuv = vec2(u, v),\n       fw = 2. * vec2(fwidth(uuv.x), fwidth(uuv.y)),\n       mortarPct = vec2(mWf, mHf),\n       brickPct = vec2(1., 1.) - mortarPct,\n       ub = (textureBrickI(uuv + fw, brickPct, mortarPct) -\n             textureBrickI(uuv, brickPct, mortarPct)) / fw;\n\n  vec3 color = mix(mortarColor, brickColor * brickDamp, ub.x * ub.y);\n\n  float bump = noisev / fdepth + 4. * ((ub.x * ub.y) - dFdx(ub.x) * dFdy(ub.y));\n\n  return TTextureInfo(\n    color,\n    bumpMap(fvert, fnorm, bump)\n  );\n}\n\n/******************************************************************************\\\n * Window texture\n\\******************************************************************************/\n\nTTextureInfo textureWindow(vec3 fvert, vec3 fnorm, float fdepth, vec2 uv, vec3 windowColor) {\n\n  const vec2 patternPct   = vec2(1., 1.),\n             patternStart = vec2(0., 0.), //(1. - patternPct) * .25,\n             patternEnd   = patternStart + patternPct,\n             framePct     = vec2(1. / 32., 1. / 32.),\n             frameStart   = patternStart + framePct,\n             frameEnd     = patternEnd   - framePct;\n  //const vec3 windowColor  = vec3(.8, .94, .99),\n  const vec3 frameColor   = vec3(.5, .5, .5);\n\n  vec2 fk   = fwidth(uv) * 2.,\n       uuv  = mod(uv, .5 - 1. / 64.),\n       patF = (smoothstep(frameEnd, frameEnd + fk, uuv) - smoothstep(frameStart, frameStart + fk, uuv));\n  float noisep = 1. + \n                snoise(-uv * .5) * .25;\n  float noisev = 1. + \n                 snoise(uv * 16.) * .0625 +\n                 abs(snoise(uv * 512.)) * .0625;\n\n  return TTextureInfo(\n    mix(frameColor, windowColor * noisep, patF.x * patF.y),\n    bumpMap(fvert, fnorm, patF.x * patF.y)\n  );\n}\n\n/******************************************************************************\\\n * Road texture\n\\******************************************************************************/\n\nvec3 textureRoad(vec2 uuv) {\n  const float padding = 1. / 32.,\n              tapeW   = 1. / 32.,\n              tapeL0  = padding,\n              tapeL1  = padding + tapeW,\n              tapeR1  = 1. - tapeL0,\n              tapeR0  = 1. - tapeL1,\n              tapeC0  = .5 - tapeW * .5,\n              tapeC1  = .5 + tapeW * .5,\n              vertDiv = 4.;\n  const vec3 asphaltColor = vec3(.2, .2, .2),\n             stripColor = vec3(.8, .8, .8);\n\n  vec2 uv = uuv + vec2(0, .5), fk = fwidth(uv);\n  float csSpacing = mod(.25 + uv.t * vertDiv, 1.),\n        q = \n    (\n      smoothstep(tapeL0, tapeL0 + fk.x, uv.s) - \n      smoothstep(tapeL1, tapeL1 + fk.x, uv.s)\n    ) +\n    (\n      smoothstep(tapeR0, tapeR0 + fk.x, uv.s) - \n      smoothstep(tapeR1, tapeR1 + fk.x, uv.s)\n    ) +\n    (\n      smoothstep(tapeC0, tapeC0 + fk.x, uv.s) - \n      smoothstep(tapeC1, tapeC1 + fk.x, uv.s)\n    ) * \n    (\n      smoothstep(.5 - fk.y, .5 + fk.y, csSpacing) *\n      (1. - smoothstep(1. - 2. * fk.y, 1., csSpacing))\n    )\n    ;\n\n  float noiseA = 1. +\n                 abs(snoise(uv * 16.))  * .0625 +\n                 abs(snoise(uv * 32.))  * .0625 +\n                 abs(snoise(uv * 128.)) * .125,\n        noiseS = 1. + \n                 abs(snoise(uv * 128.)) * .125;\n\n  return mix(asphaltColor * noiseA, stripColor * noiseS, q);\n}\n\nvec3 textureAsphalt(vec2 uuv) {\n  const vec3 asphaltColor = vec3(.2, .2, .2);\n\n  vec2 uv = uuv + vec2(0, .5);\n  float noiseA = 1. +\n                 abs(snoise(uv * 16.))  * .0625 +\n                 abs(snoise(uv * 32.))  * .0625 +\n                 abs(snoise(uv * 128.)) * .125;\n  return asphaltColor * 1.5 * noiseA;\n}\n////////////////////////////////////////////////////////////////////////////////\n\nfloat packColor(vec3 v) {\n  const float u = 255. / 256.;\n\n  return fract(v.x * u) + floor(v.y * u * 255.) + floor(v.z * u * 255.) * 255.;\n}\n\nvec2 packNormal(in vec3 normal)\n{\n    const float SCALE = 1.7777;\n    float scalar1 = (normal.z + 1.0) * (SCALE * 2.0);\n    return normal.xy / scalar1 + 0.5;\n}\n\nvoid main() {\n\n  TTextureInfo ti; // = textureBrick(vPosition.xyz, vNormal.xyz, vNormal.w, texUV.st, vExtra.xyz);\n  vec3 color, normal;\n\n  float depth = clipPosition.z / clipPosition.w; //gl_FragCoord.z / gl_FragCoord.w;\n\n  normal = normalize(faceforward(vNormal, gl_FragCoord.xyz, vNormal));\n\n  if(texUV.z > 5.1) {\n    ti = textureBrick(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.xy, 1.), vExtra);\n    color = ti.color;\n    normal = ti.normal;\n  }\n  else if(texUV.z > 4.1) {\n    ti = textureWindow(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.yx, 1.), vec3(1., 1., .7));\n    color = ti.color;\n    normal = ti.normal;\n  }\n  else if(texUV.z > 3.1) {\n    ti = textureWindow(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.yx, 1.), vec3(.3, .3, .3));\n    color = ti.color;\n    normal = ti.normal;\n  }\n  else if(texUV.z > 2.1)\n    color = textureAsphalt(mod(texUV.yx, 1.));\n  else if(texUV.z > 1.1)\n    color = textureRoad(mod(texUV.xy, 1.));\n  else\n    color = textureAsphalt(mod(texUV.yx, 1.)); //textureWindow(uuv, fextra);\n\n  gl_FragColor = vec4(packNormal(normalize(normal)), packColor(clamp(color, 0., 1.)), depth);\n  //gl_FragData[0] = vec4(packNormal(normalize(normal)), packColor(clamp(color, 0., 1.)), depth);\n  //gl_FragData[1] = vec4(normalize(normal), depth);\n  //gl_FragData[2] = vec4(color, pack(clamp(color, 0., 1.)));\n}\n";
vsrcLight = "uniform mat4 viewMatrix;\nuniform vec3 lightPos;\n\nattribute vec2 position;\n//attribute vec3 lightPosition;\nvarying vec2 sscoord, coord;\n\nvarying vec3 lPos;\n\nvoid main() {\n  gl_Position = vec4(position, 0., 1.);\n  coord = .5 + .5 * position;\n  sscoord = position;\n  lPos = vec3(0., 0., 0.); \n  //lPos = (viewMatrix * vec4(lightPos, 1.)).xyz;\n}\n";
fsrcLight = "#extension GL_OES_standard_derivatives : enable\nprecision highp float;\n\n/* #pragma glslify: fxaa = require(glsl-fxaa) */\n\n//uniform sampler2D target0, target1, target2, depthBuffer, randMap;\nuniform sampler2D target0, depthBuffer;\nuniform mat4 inverseProjection, viewMatrix;\nuniform vec3 lightPos;\n\nvarying vec2 sscoord, coord;\nvarying vec3 lPos;\n\n//uniform vec3 lightPos;\n\nfloat sample(vec3 p, vec3 n, vec2 uv) {\n  vec3 dstP = texture2D(target0, uv).xyz,\n       posV = dstP - p;\n\n  float intens = max(dot(normalize(posV), n) - .05, 0.),\n        dist = length(posV),\n        att  = 1. / (2. + (5. * dist));\n  return intens * att;\n}\n\nhighp float rand(vec2 co)\n{\n    highp float a = 12.9898;\n    highp float b = 78.233;\n    highp float c = 43758.5453;\n    highp float dt= dot(co.xy ,vec2(a,b));\n    highp float sn= mod(dt,3.14);\n    return fract(sin(sn) * c);\n}\n\nvec3 unpackColor(float d) {\n  vec3 ret;\n\n  ret.x = fract(d);\n  float zi = floor(d / 255.);\n  ret.z = fract(zi / 255.);\n  ret.y = fract( floor( d - ( zi * 255. ) ) / 255.);\n\n  return ret;\n}\n\nvec3 unpackNormal(in vec2 enc)\n{\n\tconst float SCALE = 1.7777;\n\tvec2 nn = enc * (2.0 * SCALE) - SCALE;\n\tfloat g = 2.0 / (dot(nn.xy, nn.xy) + 1.0);\n\tvec3 normal;\n\tnormal.xy = g * nn.xy;\n\tnormal.z = g - 1.0;\n\treturn normal;\n}\n\n////////////////////////////////////////////////////////////////////////////////\n// Main\n////////////////////////////////////////////////////////////////////////////////\n\n\nvoid main() {\n  /*vec3 lights[4];\n  lights[0] = vec3(6. - .025, .2, 6. - .025);\n  lights[1] = vec3(6. - .025, .2, 6. + .025);\n  lights[2] = vec3(6. + .025, .2, 6. + .025);\n  lights[3] = vec3(6. + .025, .2, 6. - .025);*/\n  /*vec4 t0 = fxaa(target0, coord, res),\n       t1 = fxaa(target1, coord, res),\n       t2 = fxaa(target2, coord, res);*/\n  /*vec2 fw = .5 * fwidth(coord),\n       nfw = vec2(fw.x, -fw.y),\n       c0 = coord - fw,\n       c1 = coord + fw,\n       c2 = coord - nfw,\n       c3 = coord + nfw;*/\n\n  vec4 t0 = texture2D(target0, coord);\n  /*vec4 t0 = texture2D(target0, coord),\n       t1 = texture2D(target1, coord),\n       t2 = texture2D(target2, coord);*/\n\n  vec3  vertex,\n        //normal = normalize(t1.xyz),\n        normal = normalize(unpackNormal(t0.xy)),\n        color  = unpackColor(t0.z);\n        //color  = t2.xyz;\n  float depth  = t0.w;\n\n  vec4 vertexFromDepth = inverseProjection * vec4(sscoord, depth, 1.);\n  vertex = vertexFromDepth.xyz / vertexFromDepth.w;\n\n  vec3 lightDir = lPos - vertex;\n  float lambert = max(dot(faceforward(-normal, lightDir, normal), normalize(lightDir)), 0.),\n        dist = length(lightDir),\n        att = min(1., 1. / (1. + 2.5 * dist + 5. * dist * dist));\n\n  /*float lambert = 0., att = 1.;\n  for(int i = 0; i < 4; i++) {\n    vec3 lightDir = (viewMatrix * vec4(lights[i], 1.)).xyz - vertex;\n    float llambert = max(dot(faceforward(-normal, lightDir, normal), normalize(lightDir)), 0.),\n          dist = length(lightDir),\n          latt = min(1., 1. / (1. + .5 * dist + 5. * dist * dist));\n    lambert += llambert * latt * .25;\n  }*/\n\n  //////////////////////////////////////////////////////////////////////////////\n  // SSAO\n  //////////////////////////////////////////////////////////////////////////////\n  vec2 kernel[4];\n  kernel[0] = vec2(0., 1.);\n  kernel[1] = vec2(1., 0.);\n  kernel[2] = vec2(0., -1.);\n  kernel[3] = vec2(-1., 0.);\n\n  const float sin45 = .707107, sRad = 80.;\n\n  float occlusion = 0., kRad = sRad * (1. - depth);\n\n  for(int i = 0; i < 4; ++i) {\n    vec2 k1 = reflect(kernel[i], .6 * vec2(rand(sin(coord)), rand(-coord)));\n    vec2 k2 = vec2(k1.x * sin45 - k1.y * sin45,\n                   k1.x * sin45 + k1.y * sin45);\n    occlusion += sample(vertex, normal, coord + k1 * kRad);\n    occlusion += sample(vertex, normal, coord + k1 * kRad * .75);\n    occlusion += sample(vertex, normal, coord + k1 * kRad * .5);\n    occlusion += sample(vertex, normal, coord + k1 * kRad * .25);\n  }\n  occlusion /= 16.;\n  occlusion = clamp(occlusion, 0., 1.);\n\n  color = clamp(color - occlusion, 0., 1.);\n  gl_FragColor = vec4(lambert * att * 2. * color, 1.);\n  //gl_FragColor = vec4(normal, 1.);\n  //gl_FragColor = vec4(color, 1.);\n}\n";

gl.clearColor(0, 0, 0, 0);
gl.depthFunc(gl.LESS);
gl.getExtension('OES_standard_derivatives');
gl.getExtension('OES_texture_float');
extFloatLinear = gl.getExtension('OES_texture_float_linear');
extDepthTexture = gl.getExtension('WEBGL_depth_texture');

/*******************************************************************************
 * Geometry pass shader compilation & linking
 *******************************************************************************/
gl.shaderSource(vshPass, vsrcPass);
gl.shaderSource(fshPass, fsrcPass);
gl.compileShader(vshPass);
gl.compileShader(fshPass);
gl.attachShader(programPass, vshPass);
gl.attachShader(programPass, fshPass);
gl.linkProgram(programPass);

/*******************************************************************************
 * Light pass shader compilation & linking
 *******************************************************************************/
gl.shaderSource(vshLight, vsrcLight);
gl.shaderSource(fshLight, fsrcLight);
gl.compileShader(vshLight);
gl.compileShader(fshLight);
gl.attachShader(programLight, vshLight);
gl.attachShader(programLight, fshLight);
gl.linkProgram(programLight);

console.log('VP:', gl.getShaderInfoLog(vshPass),
            'FP:', gl.getShaderInfoLog(fshPass),
            'VL:', gl.getShaderInfoLog(vshLight),
            'FL:', gl.getShaderInfoLog(fshLight));

/*******************************************************************************
 * Texture MRTs setup.
 * Layout:    
 *           | float1 | float2 | float3 | float4 |
 * Target 0: | Encoded normal  | Depth  | Color  |
 *******************************************************************************/

var target0     = gl.createTexture(),
    depthTex    = gl.createTexture(),
    framebuffer = gl.createFramebuffer();

gl.bindTexture(gl.TEXTURE_2D, depthTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, Context.w, Context.h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    
gl.bindTexture(gl.TEXTURE_2D, target0);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, extFloatLinear !== null ? gl.LINEAR : gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, extFloatLinear !== null ? gl.LINEAR : gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Context.w, Context.h, 0, gl.RGBA, gl.FLOAT, null);

gl.bindTexture(gl.TEXTURE_2D, null);

gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target0, 0);

gl.bindFramebuffer(gl.FRAMEBUFFER, null);

/*******************************************************************************
 * Setup global matrices and VBOs
 *******************************************************************************/
var quadBuf       = gl.createBuffer(),
    lightBuf      = gl.createBuffer(),
    quadArr       = [],
    projection    = mat4.create(),
    invProjection = mat4.create();

for(var i = 0; i < 128; i++) {
  quadArr.push(1, -1, -1, -1, -1, 1,  1, -1, -1, 1, 1, 1);
}

// Quad data directly in screen space coordinates
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
//gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadArr), gl.STATIC_DRAW);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, -1, -1, -1, -1, 1,  1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, null);

mat4.perspective(projection, Math.PI / 2, Context.aspectRatio, .001, 1000.);
mat4.invert(invProjection, projection);

/*******************************************************************************
 * Uniforms and attributes setup
 *******************************************************************************/

['vertex', 'normal', 'uv', 'extra'].forEach(function(i) {
  programPass[i] = gl.getAttribLocation(programPass, i);
});

['projection', 'viewmodel', 'normalM'].forEach(function(i) {
  programPass[i] = gl.getUniformLocation(programPass, i);
});

['position', 'lightPosition'].forEach(function(i) {
  programLight[i] = gl.getAttribLocation(programLight, i);
});

['target0', 'target1', 'target2', 'depthBuffer', 
 'inverseProjection', 'viewMatrix', 'lightPos'].forEach(function(i) {
  programLight[i] = gl.getUniformLocation(programLight, i);
});

/*******************************************************************************
 * Procedures that setup/cleanup buffers and matrices for the shader
 *******************************************************************************/
programPass.activate = function(scene) {
  gl.useProgram(programPass);
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  //
  // Uniforms setup
  //
  var viewmodel = mat4.create(), normalM = mat3.create();
  mat4.mul(viewmodel, scene.view, scene.model);
  mat3.normalFromMat4(normalM, viewmodel);

  gl.uniformMatrix4fv(programPass.projection, false, projection);
  gl.uniformMatrix4fv(programPass.viewmodel, false, viewmodel);
  gl.uniformMatrix3fv(programPass.normalM, false, normalM);

  gl.enableVertexAttribArray(programPass.vertex);
  gl.enableVertexAttribArray(programPass.normal);
  gl.enableVertexAttribArray(programPass.uv);
  gl.enableVertexAttribArray(programPass.extra);

  scene.meshes.forEach(function(mesh) {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vBuf);
    gl.vertexAttribPointer(programPass.vertex, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.nBuf);
    gl.vertexAttribPointer(programPass.normal, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.uBuf);
    gl.vertexAttribPointer(programPass.uv,     3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.eBuf);
    gl.vertexAttribPointer(programPass.extra,  3, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  
  });

  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}
var sc = function(lights) {
  console.log(lights);
}

programPass.deactivate = function() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  
  gl.disableVertexAttribArray(programPass.vertex);
  gl.disableVertexAttribArray(programPass.normal);
  gl.disableVertexAttribArray(programPass.uv);
  gl.disableVertexAttribArray(programPass.extra);
  gl.disable(gl.DEPTH_TEST);
}

var __do = false, cnt = 0;

programLight.activate = function(scene) {
  gl.useProgram(programLight);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.clear(gl.COLOR_BUFFER_BIT);

  //
  // Uniform setup
  //
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, target0);

  gl.uniform1i(programLight.target0, 0);
  gl.uniform1i(programLight.depthBuffer, 3);

  gl.uniformMatrix4fv(programLight.viewMatrix, false, scene.view);
  gl.uniformMatrix4fv(programLight.inverseProjection, false, invProjection);

  //
  // VBO setup
  //
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.vertexAttribPointer(programLight.position, 2, gl.FLOAT, false, 0, 0);

  gl.enableVertexAttribArray(programLight.position);
  //gl.enableVertexAttribArray(programLight.lightPosition);

  gl.uniform3fv(programLight.lightPos, scene.lightPos); //[0,.025,-.05]);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
  /*var I = scene.lights.length;
  if(I > 0 && __do === false) {

    var lv = new Float32Array(I * 18);
    for(var i = 0; i < I; i++) {
      var ii = i * 3;
      for(var j = 0; j < 18; j++) {
        lv[ii + j] = scene.lights[i][j % 3];
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, lightBuf);
    gl.bufferData(gl.ARRAY_BUFFER, lv, gl.STATIC_DRAW);
    cnt = I;
    console.log(cnt)
    __do = true;
    
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, lightBuf);
  gl.vertexAttribPointer(programLight.lightPosition, 3, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, cnt * 6);*/
}

programLight.deactivate = function() {
  gl.disableVertexAttribArray(programLight.position);
  gl.disable(gl.BLEND);
}

module.exports = {
  render: function(scene) {
    programPass.activate(scene);
    programPass.deactivate();
    programLight.activate(scene);
    programLight.deactivate();
  }
}

},{"./Context":1,"./generators/BuildingSHG.js":4,"./lib/glMatrixSubset":14,"./lib/util.js":15}],3:[function(require,module,exports){
var PRNG = require('./PRNG'),
    Geom = require('./../lib/Geom'),
    ShapeGrammar = require('./../lib/ShapeGrammar');

var lerp = function(a, b, t) { return (1 - t) * a + t * b; }

// Inspired to https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf
var subdivideStrip = function(block, strip, rng) {
  var points = [], quads = [], angles = [], i1, i2, i3, 
      b1, b2, dx, dy, i, j, m, n, p, len,
      lots = [];

  for(i = 0, n = block.length; i < n; i++) {
    i1 = (i + 1) % n;
    i2 = (i + 2) % n;
    i3 = (i - 1 + n) % n;
    b1 = Geom.lineIntersection(block[i], block[i1],
                          strip[i3], strip[i]);
    b2 = Geom.lineIntersection(block[i], block[i1],
                          strip[i1], strip[i2]);
    dx = b1.x - b2.x;
    dy = b1.y - b2.y;
    len = Math.sqrt(dx * dx + dy * dy);
    ang = Math.atan2(dy, dx);
    m = ~~(rng.random() * 3 + 2);
    /*if(len < .35)
      m = 1;
    else if(len < .6)
      m = Math.min(m, 2);
    else if(len < .8)
      m = Math.min(m, 3);*/

    quads.push(m);
    angles.push(ang);

    for(j = 0; j < m; j++) {
      var jm = j / (m - 1);
      px1 = lerp(b1.x, b2.x, jm);
      py1 = lerp(b1.y, b2.y, jm);
      px2 = lerp(strip[i].x, strip[i1].x, jm);
      py2 = lerp(strip[i].y, strip[i1].y, jm);
      points.push(
        { x: lerp(b1.x, b2.x, jm), y: lerp(b1.y, b2.y, jm) },
        { x: lerp(strip[i].x, strip[i1].x, jm), y: lerp(strip[i].y, strip[i1].y, jm) }
      );
    }
  }
  points.push(points[0]);

  for(i = 0, n = block.length; i < n; i++) {
    p = [];
    for(j = 0; j < quads[i]; j++) {
      p.push(points.shift());
      p.push(points.shift());
    }
    p.push(block[(i + 1) % n]);
    p.push(points[0] || block[0]);
    for(var k = 0, m = p.length; k < m - 2; k+= 2) {
      lots.push(new Building(
        [p[k], p[(k + 1) % m], p[(k + 3) % m], p[(k + 2) % m]], 
        rng.random() + .5,
        angles[i]
      ));
    }
  }

  return lots;
}

var Building = function(poly, height, angle) {
  this.poly = poly;
  this.height = height;
  this.angle = angle;

}

var Block = function(poly, seed) {
  var rng = new PRNG(seed);
  this.poly = poly;
  this.block = Geom.insetPolygon(this.poly, 0.05);
  this.lots = subdivideStrip(Geom.insetPolygon(this.block, 0.1), Geom.insetPolygon(this.block, 0.4), rng);

  var cd = poly.reduce(function(o, i) {
  
    o.cx += i.x;
    o.cy += i.y;

    if(o.xm > i.x)
      o.xm = i.x;
    if(o.xM < i.x)
      o.xM = i.x;
    if(o.ym > i.y)
      o.ym = i.y;
    if(o.yM < i.y)
      o.yM = i.y;

    return o;

  }, { 
    xm: Number.POSITIVE_INFINITY, 
    ym: Number.POSITIVE_INFINITY, 
    xM: Number.NEGATIVE_INFINITY, 
    yM: Number.NEGATIVE_INFINITY, 
    cx: 0, cy: 0
  });

  this.x = cd.cx / poly.length;
  this.y = cd.cy / poly.length;
  this.w = Math.max(Math.abs(cd.xM - cd.xm), Math.abs(cd.yM - cd.ym));
}

module.exports = Block;

},{"./../lib/Geom":8,"./../lib/ShapeGrammar":13,"./PRNG":6}],4:[function(require,module,exports){
var ShapeGrammar = require('./../lib/ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('./../lib/Geom'),
    PRNG         = require('./PRNG');
    //BalconySHG   = require('./BalconySHG.js'),
    //StaircaseSHG = require('./StaircaseSHG.js');

var shg = new ShapeGrammar(),
    litWindowsRNG     = new PRNG(31337),
    buildingSidesRNG  = new PRNG(31338),
    buildingLayoutRNG = new PRNG(31339),
    rng = new PRNG(31337);

shg.define('Building', null, function() {

  var ret = [],
      curHeight = 0;
  
  for(var i = 0, I = this.floorsLayout.length; i < I; i++) {
    var fli = this.floorsLayout[i], floor = {
      sym: fli.type,
      height: fli.height,
      params: fli,
      points: this.points.map(function(i) {
        return { x: i.x, y: i.y + curHeight, z: i.z };
      })
    };

    if('frontFacade' in this)
      floor.frontFacade = this.frontFacade;

    curHeight += fli.height;
    
    ret.push(floor);
  }

  return ret;

});

shg.define('FL_GndFloor', null, (function() {

  var p2 = Math.PI * 2, p4 = 2 * p2,
      fixTH = function(th) { return (th + p4) % p2 };
  
  return function() {
  
    var facades = SHAPE.extrudeAll(this.points, this.height, 'Facade', [0, 1, 0]),
        th = this.params.frontSide;

    switch(this.params.tiles) {
      case 'OneDoor':
        var doorf = 0, minAD = Number.POSITIVE_INFINITY;

        for(var i = 0, I = facades.length; i < I; i++) {
          facades[i].type = 'Windows';
        }
        if(!('frontFacade' in this))
          for(var i = 0, I = facades.length; i < I; i++) {
            var fi = facades[i],
                x0 = fi.points[0].x,
                z0 = fi.points[0].z,
                x1 = fi.points[3].x,
                z1 = fi.points[3].z,
                ad = Math.abs(Math.atan2(z1 - z0, x1 - x0) - th);

            if(ad < minAD) {
              minAD = ad; doorf = i;
            }

          }
        else
          doorf = this.frontFacade;

        facades[doorf].type = 'OneDoor';
        break;
    }

    return facades;
  }

}()));

shg.define('FL_Floor', null, function() {
  
  var facades = SHAPE.extrudeAll(this.points, this.height, 'Facade', [0, 1, 0]);

  for(var i = 0, I = facades.length; i < I; i++) {
    facades[i].type = 'Windows';
    facades[i].windows = this.params.windows;
  }

  return facades;

});

shg.define('FL_Ledge', null, function() {

  var extrPoints = [], h = this.height;

  for(var i = 0, I = this.points.length; i < I; i++) {
    var p0 = this.points[i], p1 = this.points[(i + 1) % I],
        angle = Math.atan2(p1.z - p0.z, p1.x - p0.x),
        anglep = angle - Math.PI / 2,
        cos = Math.cos(angle) + Math.cos(anglep),
        sin = Math.sin(angle) + Math.sin(anglep);

    extrPoints.push({
      x: p0.x - this.params.width * cos,
      y: p0.y, 
      z: p0.z - this.params.width * sin
    })
  }

  var facades = SHAPE.extrudeAll(extrPoints, this.height, 'Quad', [0, 1, 0]);

  facades.forEach(function(i) {
    var dx = i.points[3].x - i.points[0].x,
        dy = i.points[1].y - i.points[0].y,
        dz = i.points[3].z - i.points[0].z;
    var t = h / shg.UVSCALE,
        s = t * Math.sqrt(dx * dx + dz * dz) / dy;

    i.uvs = [
      { s: 0, t: t },
      { s: 0, t: 0 },
      { s: s, t: 0 },
      { s: s, t: t }
    ];
    i.texID = 6;
  });

  facades.push({
    sym: 'Poly',
    texID: 6,
    points: extrPoints
  });

  facades.push({
    sym: 'Poly',
    texID: 6,
    points: extrPoints.map(function(i) {
      return { x: i.x, y: i.y + h, z: i.z }
    })
  });

  return facades;

});

shg.define('FL_Rooftop', null, function() {

  var extrPoints = [], h = this.height;

  for(var i = 0, I = this.points.length; i < I; i++) {
    var p0 = this.points[i], p1 = this.points[(i + 1) % I],
        angle = Math.atan2(p1.z - p0.z, p1.x - p0.x),
        anglep = angle - Math.PI / 2,
        cos = Math.cos(angle) + Math.cos(anglep),
        sin = Math.sin(angle) + Math.sin(anglep);

    extrPoints.push({
      x: p0.x + this.params.width * cos,
      y: p0.y, 
      z: p0.z + this.params.width * sin
    })
  }

  var facadesOut = SHAPE.extrudeAll(this.points, this.height, 'Quad', [0, 1, 0]),
      facadesIn  = SHAPE.extrudeAll(extrPoints,  this.height, 'Quad', [0, 1, 0]);

  while(facadesOut.length)
    facadesIn.push(facadesOut.shift());

  facadesIn.forEach(function(i) {
    var dx = i.points[3].x - i.points[0].x,
        dy = i.points[1].y - i.points[0].y,
        dz = i.points[3].z - i.points[0].z;
    var t = h / shg.UVSCALE,
        s = t * Math.sqrt(dx * dx + dz * dz) / dy;

    i.uvs = [
      { s: 0, t: t },
      { s: 0, t: 0 },
      { s: s, t: 0 },
      { s: s, t: t }
    ];
    i.texID = 6;
  });

  facadesIn.push({
    sym: 'Poly',
    points: extrPoints,
    texID: 3
  });

  for(var i = 0, I = extrPoints.length; i < I; i++) {
    var ii = (i + 1) % I,
        p0 = this.points[i], p1 = extrPoints[i],
        p2 = extrPoints[ii], p3 = this.points[ii];

    var poly = {
      sym: 'Poly',
      points: [ p0, p1, p2, p0, p2, p3 ].map(function(i) { return { x: i.x, y: i.y + h, z: i.z }; }),
      texID: 6
    };

    facadesIn.push(poly);
  }

  return facadesIn;
});

shg.define('Facade', function() { return this.type === 'OneDoor' }, function() {

  var dx = this.points[3].x - this.points[0].x,
      dy = this.points[1].y - this.points[0].y,
      dz = this.points[3].z - this.points[0].z,
      t  = dy / shg.UVSCALE,
      s  = t * Math.sqrt(dx * dx + dz * dz) / dy;

  this.uvs = [
    { s: 0, t: t },
    { s: 0, t: 0 },
    { s: s, t: 0 },
    { s: s, t: t }
  ];

  var quads = SHAPE.fit('x', this, 'Window', 1);

  quads[ ~~(quads.length / 2) ].sym = 'Door';
  //quads.splice(Math.floor(quads.length / 2), 1);
  
  for(var i = 0, I = quads.length; i < I; i++)
    quads[i].normal = this.normal;

  return quads;

});

shg.define('Facade', null, function() {

  var dx = this.points[3].x - this.points[0].x,
      dy = this.points[1].y - this.points[0].y,
      dz = this.points[3].z - this.points[0].z,
      t  = dy / shg.UVSCALE,
      s  = t * Math.sqrt(dx * dx + dz * dz) / dy;

  this.uvs = [
    { s: 0, t: t },
    { s: 0, t: 0 },
    { s: s, t: 0 },
    { s: s, t: t }
  ];

  var quads = SHAPE.fit('x', this, 'Window', 1);

  for(var i = 0, I = quads.length; i < I; i++)
    quads[i].normal = this.normal;

  return quads;

});

shg.define('Window', null, function() {
  
  var hsp = SHAPE.split(this, [ .3, .4, .3 ], [1], 'Quad'),
      vsp = SHAPE.split(hsp[1], [1], [.15, .7, .15], 'Quad'),
      windowPane = vsp[1];

  var wpuvs = windowPane.uvs;
  windowPane.uvs = null;
  windowPane.texID = (litWindowsRNG.random() > .3 ? 4 : 5);

  hsp[0].texID = hsp[2].texID = vsp[0].texID = vsp[2].texID = 6;

  var ret = [ hsp[0], hsp[2], vsp[0], vsp[2] ];

  var norm = Geom.triToNormal([
    windowPane.points[0].x, windowPane.points[0].y, windowPane.points[0].z, 
    windowPane.points[1].x, windowPane.points[1].y, windowPane.points[1].z, 
    windowPane.points[2].x, windowPane.points[2].y, windowPane.points[2].z
  ]);

  var borders = SHAPE.extrudeAll(windowPane.points, -.005, 'Quad', norm);
  var nX = norm[0],
      nY = norm[1],
      nZ = norm[2];
  
  nX *= .005;
  nY *= .005;
  nZ *= .005;

  for(var i = 0, I = windowPane.points.length; i < I; i++) {
    var p = windowPane.points[i];
    p.x -= nX;
    p.y -= nY;
    p.z -= nZ;
  }

  for(var i = 0, I = borders.length; i < I; i++) {
    borders[i].texID = 3;
    ret.push(borders[i]);
  }
  ret.push(windowPane);

  return ret;

});

shg.define('Door', null, function() {
  
  var hsp = SHAPE.split(this, [ .15, .7, .15 ], [1], 'Quad'),
      vsp = SHAPE.split(hsp[1], [1], [.7, .3 ], 'Quad'),
      windowPane = vsp[0];

  var wpuvs = windowPane.uvs;
  windowPane.uvs = null;
  windowPane.texID = (litWindowsRNG.random() > .3 ? 4 : 5);

  hsp[0].texID = hsp[2].texID = vsp[1].texID = 6;

  var ret = [ hsp[0], hsp[2], vsp[1] ];

  var norm = Geom.triToNormal([
    windowPane.points[0].x, windowPane.points[0].y, windowPane.points[0].z, 
    windowPane.points[1].x, windowPane.points[1].y, windowPane.points[1].z, 
    windowPane.points[2].x, windowPane.points[2].y, windowPane.points[2].z
  ]);

  var borders = SHAPE.extrudeAll(windowPane.points, -.005, 'Quad', norm);
  var nX = norm[0],
      nY = norm[1],
      nZ = norm[2];
  
  nX *= .005;
  nY *= .005;
  nZ *= .005;

  for(var i = 0, I = windowPane.points.length; i < I; i++) {
    var p = windowPane.points[i];
    p.x -= nX;
    p.y -= nY;
    p.z -= nZ;
  }

  for(var i = 0, I = borders.length; i < I; i++) {
    borders[i].texID = 3;
    ret.push(borders[i]);
  }
  ret.push(windowPane);

  return ret;

});

shg.define('Quad', null, (function() {

  var defaultUVS = [ 
    { s: 0, t: 1 }, 
    { s: 0, t: 0 }, 
    { s: 1, t: 0 }, 
    { s: 1, t: 1 } 
  ];

  return function() {
    
    var vertices, normals = [], uvs,
        normal, texID,
        u0, u1, u2, u3,
        p0, p1, p2, p3, ps = this.points;

    p0 = ps[0], p1 = ps[1], p2 = ps[2], p3 = ps[3];

    vertices = [
      p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
      p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z
    ];

    normal = this.normal || Geom.triToNormal(vertices);
    for(var i = 0; i < 6; i++)
      normals.push(normal[0], normal[1], normal[2]);

    uvs = this.uvs || defaultUVS;
    u0 = uvs[0], u1 = uvs[1], u2 = uvs[2], u3 = uvs[3];
    texID = this.texID || 0;

    uvs = [
      u0.s, u0.t, texID, u1.s, u1.t, texID, u2.s, u2.t, texID,
      u0.s, u0.t, texID, u2.s, u2.t, texID, u3.s, u3.t, texID
    ];

    return {
      sym: ShapeGrammar.TERMINAL,
      vertices: vertices,
      normals: normals,
      uvs: uvs
    }

  }

}()));

shg.define('Poly', null, function() {
  var rings = this.points.map(function(i) {
    return [i.x, i.z];
  }), y = this.points[0].y;

  var triverts = earcut([rings]),
      vertices = triverts.reduce(function(o, i) {
        o.push(i[0], y, i[1]);
        return o;
      }, []),
      normal = this.normal || Geom.triToNormal(vertices),
      normals = [], uvs = [];

  var minX, minZ, maxX, maxZ, dx, dz, p;

  minX = minZ = Number.POSITIVE_INFINITY;
  maxX = maxZ = Number.NEGATIVE_INFINITY;

  for(var i = 0, I = this.points.length; i < I; i++) {
    p = this.points[i];
    if(minX > p.x) minX = p.x;
    if(maxX < p.x) maxX = p.x;
    if(minZ > p.z) minZ = p.z;
    if(maxZ < p.z) maxZ = p.z;
  }

  dx = maxX - minX;
  dz = maxZ - minZ;

  for(var i = 0, I = vertices.length; i < I; i += 3) {
    var x = vertices[i], z = vertices[i + 2];
    uvs.push( (x - minX) / dx, (z - minZ) / dz, this.texID );
    normals.push(normal[0], normal[1], normal[2]);
  }

  return {
    sym: ShapeGrammar.TERMINAL,
    vertices: vertices,
    normals: normals,
    uvs: uvs
  }

});

/*
  var hex2rgbf = function(i) { 
    return i.replace(/#(..)(..)(..)/g, '$1,$2,$3')
            .split(',')
            .map(function(j) { 
              return (parseInt(j, 16) / 255).toFixed(2) 
            }); 
  }
*/
var availColors = [
  //[ .88, .88, .88 ],
  [ .66, .66, .66 ],
  //[ 1,   .97, .83 ],
  [ .90, .65, .48 ],
  //[ .68, .53, .46 ],
  [ .72, .43, .35 ]
];

shg.UVSCALE = .1;

module.exports = {
  shg: shg,
  create: function(lot) {
    //context.rng.seed(10);

    var dx = lot.width / 2, dy = lot.depth / 2,
        x0 = lot.x - dx, x1 = lot.x + dx,
        y0 = lot.y - dy, y1 = lot.y + dy,
        ratio = Math.max(dx / dy, dy / dx),
        frontFacade = null;

    var pts = [];

    if(ratio < 1.3 && buildingSidesRNG.random() < .3) {
      //
      // Octagon building base. Uncommon
      //
      for(var i = 0; i < 8; i++) {
        var ang = -lot.angle - i * Math.PI / 4;
        pts.push({ 
          x : lot.x + dx * Math.cos(ang), 
          y: 0, 
          z: lot.y + dy * Math.sin(ang) 
        }); 
        frontFacade = 0;
      }
    } else if(ratio > 1.5 && buildingSidesRNG.random() < .8) {
      //
      // Building with an inward-extruded part, facing the
      // front of the street
      //
      if(dx > dy) {
        //
        // Lot angle can either be 0 (front facing) or π (back facing)
        //
        if(lot.angle < 10e-2) {
          pts.push(
            { x: x0, y: 0, z: y0 },
            { x: x0, y: 0, z: y1 },
            { x: x0 + dx * 2 / 3, y: 0, z: y1 },
            { x: x0 + dx * 2 / 3, y: 0, z: y1 - dy * 2 / 3 },
            { x: x1 - dx * 2 / 3, y: 0, z: y1 - dy * 2 / 3 },
            { x: x1 - dx * 2 / 3, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 },
            { x: x1, y: 0, z: y0 }
          );
          frontFacade = 3;
        } else {
          pts.push(
            { x: x0, y: 0, z: y0 },
            { x: x0, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 },
            { x: x1, y: 0, z: y0 },
            { x: x1 - dx * 2 / 3, y: 0, z: y0 },
            { x: x1 - dx * 2 / 3, y: 0, z: y0 + dy * 2 / 3 },
            { x: x0 + dx * 2 / 3, y: 0, z: y0 + dy * 2 / 3 },
            { x: x0 + dx * 2 / 3, y: 0, z: y0 }
          );
          frontFacade = 5;
        } 
      } else {
        //
        // Lot angle can either be π/2 (right facing) or -π/2 (left facing)
        //
        if(lot.angle > 0) {
          pts.push(
            { x: x0, y: 0, z: y0 },
            { x: x0, y: 0, z: y0 + dy * 2 / 3 },
            { x: x0 + dx * 2 / 3, y: 0, z: y0 + dy * 2 / 3 },
            { x: x0 + dx * 2 / 3, y: 0, z: y1 - dy * 2 / 3 },
            { x: x0, y: 0, z: y1 - dy * 2 / 3 },
            { x: x0, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 },
            { x: x1, y: 0, z: y0 }
          );
          frontFacade = 2;
        } else {
          pts.push(
            { x: x0, y: 0, z: y0 },
            { x: x0, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 },
            { x: x1, y: 0, z: y1 - dy * 2 / 3 },
            { x: x1 - dx * 2 / 3, y: 0, z: y1 - dy * 2 / 3 },
            { x: x1 - dx * 2 / 3, y: 0, z: y0 + dy * 2 / 3 },
            { x: x1, y: 0, z: y0 + dy * 2 / 3 },
            { x: x1, y: 0, z: y0 }
          );
          frontFacade = 4;
        
        }
      }
    } else {
      pts.push(
        { x: x0, y: 0, z: y0 },
        { x: x0, y: 0, z: y1 },
        { x: x1, y: 0, z: y1 },
        { x: x1, y: 0, z: y0 }
      );
      if(dx > dy) {
        if(lot.angle < 10e-2) frontFacade = 1;
        else frontFacade = 3;
      } else {
        if(lot.angle < 0) frontFacade = 2;
        else frontFacade = 0;
      }
    }

    var floorLayout = [], flId = ~~(buildingLayoutRNG.random() * 2);

    switch(flId) {
      case 0: // With ledge
        floorLayout.push(
          { type: 'FL_GndFloor', height: .1, tiles: 'OneDoor', 
                                 frontSide: lot.angle },
          { type: 'FL_Ledge',    height: .025, width: .00625 }
        );
        for(var i = 0, I = 4 + ~~(rng.random() * 10); i < I; i++)
          floorLayout.push(
            { type: 'FL_Floor',  height: .1, windows: 'Double' }
          );
        floorLayout.push(
          { type: 'FL_Ledge',    height: .025, width: .00625 },
          { type: 'FL_Floor',    height: .15, windows: 'Single' },
          { type: 'FL_Rooftop',  height: .025, width: .00625 }
        );
        break;
      case 1: // Without ledge
        floorLayout.push(
          { type: 'FL_GndFloor', height: .1, tiles: 'OneDoor',
                                 frontSide: lot.angle }
        );
        for(var i = 0, I = 4 + ~~(rng.random() * 10); i < I; i++)
          floorLayout.push(
            { type: 'FL_Floor',  height: .1, windows: 'Double' }
          );
        floorLayout.push(
          { type: 'FL_Floor',    height: .15, windows: 'Single' },
          { type: 'FL_Rooftop',  height: .025, width: .00625 }
        );
        break;
    }

    var axiom = {
      sym: 'Building',
      floorsLayout: floorLayout,
      points: pts
    };

    if(frontFacade !== null)
      axiom.frontFacade = frontFacade;

    var color = availColors[ ~~(rng.random() * availColors.length) ];

    var ret = shg.run(axiom);
    return { geom: ret, color: color };
  },
  getGeom: function() {
    return context;
  }

}

},{"../lib/SHAPE.js":12,"./../lib/Geom":8,"./../lib/ShapeGrammar":13,"./PRNG":6,"earcut":17}],5:[function(require,module,exports){
var PRNG  = new (require('./PRNG')),
    Geom  = require('./../lib/Geom'),
    Roads = require('./Roads.js'),
    Block = require('./Block.js'),
    ShapeGrammar = require('../lib/ShapeGrammar.js');

var traverse = (function() {

  var pi2 = Math.PI * 2;

  return function(edgeA, edgeB, roads, face) {
    var edgeDir = Math.atan2(- edgeB.y + edgeA.y, edgeB.x - edgeA.x),
        nextDir, nextVtx, iol,
        rightmost = { th: Number.POSITIVE_INFINITY, vertex: null };
        
    if(!('traversed' in edgeA))
      edgeA.traversed = [];
    if(!('traversed' in edgeB))
      edgeB.traversed = [];

    edgeA.traversed.push(edgeB);

    for(var i = 0; i < edgeB.conns.length; i++) {
      nextVtx = edgeB.conns[i];

      if(nextVtx === edgeA || edgeB.traversed.indexOf(nextVtx) !== -1 || (face && nextVtx !== face[0] && face.indexOf(nextVtx) !== -1))
        continue;

      nextDir = Math.atan2(- nextVtx.y + edgeB.y, nextVtx.x - edgeB.x) - edgeDir;
      if(nextDir > Math.PI)
        nextDir -= pi2;
      else if(nextDir < - Math.PI)
        nextDir += pi2;
      if(nextDir < rightmost.th) {
        rightmost.th = nextDir;
        rightmost.vertex = edgeB.conns[i];
      }
    }

    if(rightmost.vertex === null)
      return null;

    if(face)
      face.push(edgeB);

    if(face && rightmost.vertex === face[0]) {
      iol = Geom.isOverlapping(face, roads);

      if(iol)
        return null;

      edgeB.traversed.push(face[0]);

      return face;
    }

    face = traverse(edgeB, rightmost.vertex, roads, face || [ edgeA, edgeB ]);
    if(face === null) {
      edgeB.traversed.splice(edgeB.traversed.indexOf(rightmost.vertex), 1);
    }

    return face || null;
  }

}());

var City = function(seed) {
  PRNG.seed(seed);

  var polys = [];

  this.roads = Roads();
  //console.log(this.roads)
  this.blocks = [];

  for(var i = 0; i < this.roads.length; i++) {
    for(var j = 0; j < this.roads[i].conns.length; j++) {
      if(!('traversed' in this.roads[i]))
        this.roads[i].traversed = [];
      //this.roads[i].traversed[j] = true;
      var poly = traverse(this.roads[i], this.roads[i].conns[j], this.roads);
      if(poly === null || Geom.isPolyIn(poly, polys))
        continue;
      
      polys.push(poly);
      this.blocks.push(new Block(poly, PRNG.random() * 65536));
    }
  }

  this.roads.forEach(function(r) {
    r.traversed = [];
  });

  var roadQuads = [];

  this.roads.forEach(function(r) {
    r.conns.forEach(function(r1) {
      if(r1.traversed.indexOf(r) !== -1)
        return;
      roadQuads.push([r, r1]);
      r.traversed.push(r1);
      r1.traversed.push(r);
    });
  });

  this.roadQuads = roadQuads;
}

module.exports = City;

},{"../lib/ShapeGrammar.js":13,"./../lib/Geom":8,"./Block.js":3,"./PRNG":6,"./Roads.js":7}],6:[function(require,module,exports){
/**
 * PRNG.js
 *
 * TODO implement Mersenne twister.
 */

var MersenneTwister = require('mersennetwister');

var PRNG = function(seed) {
  if(seed !== undefined)
    this.seed(seed);
  else
    this.mt = new MersenneTwister();
}

PRNG.prototype.seed = function(seed) {
  this.mt = new MersenneTwister(seed);
}

PRNG.prototype.random = function() {
  return this.mt.random();
}

module.exports = PRNG;

},{"mersennetwister":18}],7:[function(require,module,exports){
/**
 * Roads.js
 * 
 * Stub - generates city roads as an undirected graph, represented
 * via an array of nodes with outgoing and incoming links to other
 * roads.
 *
 * TODO 
 * - Generative/search based/l-system approaches. Right now only a
 *   randomly displaced square grid is generated.
 * - Random seeding
 */

var PRNG = require('./PRNG');

var side = 8, q = 0, amp = 2;
    
module.exports = function(seed) {

  var g = [], rng = new PRNG(seed);

  for(var y = 0; y < side; y++) for(var x = 0; x < side; x++) {
    var p = g[y * side + x] = { 
      x: amp * x + q * rng.random(), 
      y: amp * y + q * rng.random(), 
      conns: [] 
    };
    if(x > 0) {
      p.conns.push(g[y * side + x - 1]);
      g[y * side + x - 1].conns.push(p);
    }
    if(y > 0) {
      p.conns.push(g[(y - 1) * side + x]);
      g[(y - 1) * side + x].conns.push(p);
    }
  }

  return g;

}

},{"./PRNG":6}],8:[function(require,module,exports){
var glMatrix = require('./glMatrixSubset'),
    vec3 = glMatrix.vec3;

var Geom = {
  // http://www.ecse.rpi.edu/Homepages/wrf/Research/Short_Notes/pnpoly.html
  pnpoly: function(poly, x, y) {
    var n = poly.length, i, j, c = false, a, b;

    for(i = 0, j = n - 1; i < n; j = i++) {
      a = poly[i];
      b = poly[j];
      if( (a.y > y) !== (b.y > y) &&
          (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) )
        c = !c;
    }
    return c;
  },
  isOverlapping: function(poly, vertices) {
    for(var i = vertices.length - 1; i--;) {
      if(Geom.pnpoly(poly, vertices[i].x, vertices[i].y) && poly.indexOf(vertices[i]) === -1)
        return true;
    }
    return false;
  },
  isPolyIn: function(poly, polys) {
    for(var i = polys.length - 1; i > 0; i--)
      if(Geom.isEqualPoly(poly, polys[i]))
        return true;
    return false;
  },
  isEqualPoly: function(a, b) {
    if(a.length !== b.length) return false;

    for(var i = a.length - 1; i--;)
      if(b.indexOf(a[i]) === -1)
        return false;
    return true;
  },
  insetPolygon: function(poly, dist) {
    var a, b, c, out = [];

    b = poly[ poly.length - 1 ];

    for(var i = 0; i < poly.length - 1; i++) {
      a = b;
      b = poly[ i ];
      c = poly[ i + 1 ];
      out.push(Geom.insetCorner(a, b, c, dist));
    }
    out.push(Geom.insetCorner(b, c, poly[ 0 ], dist));

    return out;
  },
  // a      previous point
  // b      current point
  // c      next point
  // dist   distance
  insetCorner: function(a, b, c, dist) {
    var dx1 = b.x - a.x, dy1 = a.y - b.y,
        dx2 = c.x - b.x, dy2 = b.y - c.y,
        dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1),
        dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2),
        insX1, insX2, insY1, insY2, insp,
        b1 = { x: b.x, y: b.y },
        b2 = { x: b.x, y: b.y };

    if(dist1 == 0 || dist2 == 0)
      return null;

    insX1 = dy1 / dist1 * dist;
    insY1 = dx1 / dist1 * dist;
    insX2 = dy2 / dist2 * dist;
    insY2 = dx2 / dist2 * dist;

    b1.x += insX1; b1.y += insY1;
    b2.x += insX2; b2.y += insY2;

    if(b1.x === b2.x && b1.y === b2.y)
      return b1;

    return Geom.lineIntersection(
             { x: a.x + insX1, y: a.y + insY1 }, b1,
             b2, { x: c.x + insX2, y: c.y + insY2 }
           );
  },
  // http://alienryderflex.com/intersect/
  lineIntersection: function(A1, A2, B1, B2) {

    var dist, cos_, sin_, nx, p,
        a1 = { x: A1.x, y: A1.y },
        a2 = { x: A2.x, y: A2.y },
        b1 = { x: B1.x, y: B1.y },
        b2 = { x: B2.x, y: B2.y };

    // Translate by -a1
    a2.x -= a1.x; b1.x -= a1.x; b2.x -= a1.x;
    a2.y -= a1.y; b1.y -= a1.y; b2.y -= a1.y;
    
    dist = Math.sqrt(a2.x * a2.x + a2.y * a2.y);

    // Rotate so a2 lies on the positive x axis
    cos_ = a2.x / dist;
    sin_ = a2.y / dist;

    nx   =   b1.x * cos_ + b1.y * sin_;
    b1.y = - b1.x * sin_ + b1.y * cos_; b1.x = nx; 
    nx   =   b2.x * cos_ + b2.y * sin_;
    b2.y = - b2.x * sin_ + b2.y * cos_; b2.x = nx; 

    // Parallel lines
    if(b1.y == b2.y)
      return null;

    p = b2.x + (b1.x - b2.x) * b2.y / (b2.y - b1.y);

    return { x: a1.x + p * cos_, y: a1.y + p * sin_ };
  },
  triToNormal: function(points) {
    /*var vA = vec3.fromValues(vec3, points[3], points[4], points[5]),
        vB = vec3.fromValues(vec3, points[0], points[1], points[2]),
        vC = vec3.fromValues(vec3, points[6], points[7], points[8]),
        norm = vec3.create();
    vec3.sub(vB, vB, vA);
    vec3.sub(vC, vC, vA);
    vec3.cross(norm, vB, vC);
    vec3.normalize(norm, norm);
    return norm;*/

    /*var vA = vec3.create(), vB = vec3.create();
    vec3.set(vA, points[0] - points[3], points[1] - points[4], points[2] - points[5]);
    vec3.set(vB, points[6] - points[3], points[7] - points[4], points[8] - points[5]);
    vec3.cross(vA, vA, vB);
    vec3.normalize(vA, vA);
    return vA;*/
    var a1 = points[0] - points[3], a2 = points[1] - points[4], a3 = points[2] - points[5],
        b1 = points[6] - points[3], b2 = points[7] - points[4], b3 = points[8] - points[5];

    var nX = a2 * b3 - a3 * b2,
        nY = a1 * b3 - a3 * b1,
        nZ = a1 * b2 - a2 * b1,
        rlen = 1 / Math.sqrt(nX * nX + nY * nY + nZ * nZ);
    
    nX *= rlen;
    nY *= rlen;
    nZ *= rlen;

    return [ nX, nY, nZ ];

  }

}

module.exports = Geom;

},{"./glMatrixSubset":14}],9:[function(require,module,exports){
var Context = require('./../Context');

var dict = {
};

var log = document.createElement('ul');
log.style.position = 'absolute';
log.style.top = '7rem';
log.style.left = '1rem';
log.style.color = '#444';
log.style.font = '10px "Ubuntu Mono", monospace';
log.style.lineHeight = '1.5em';
log.style.listStyleType = 'none';

Context.canvas.parentNode.appendChild(log);

module.exports = {
  progress: function(id, percent) {
    if(!(id in dict)) {
      var li = document.createElement('li');
      log.appendChild(li);
      dict[id] = { fns: [], li: li, value: 0 };
    }

    dict[id].value = percent;

    if(percent >= 1) {
      dict[id].fns.forEach(function(i) {
        i();
      });
    }
  },
  subscribe: function(id, fn) {
    if(!(id in dict)) {
      var li = document.createElement('li');
      log.appendChild(li);
      dict[id] = { fns: [], li: li, value: 0 };
    }

    dict[id].fns.push(fn);
  
  },
  render: function() {
    var str = '', li;
    for(i in dict) {
      var pct = parseInt(dict[i].value * 100), sp = '' + pct;
      while(sp.length < 4) sp = '_' + sp;
      sp = sp.replace(/_/g, '&nbsp;');
      dict[i].li.innerHTML = '&nbsp;' + i + ': ' + sp + "%&nbsp;\n";
      var a = 'linear-gradient(90deg, #0f0, #0f0 ' + pct + '%, #0b0 ' + pct + '%)';
      dict[i].li.style.backgroundImage = a;

    }
  }
}

},{"./../Context":1}],10:[function(require,module,exports){
var glMatrix = require('./glMatrixSubset'),
    Context  = require('./../Context'),
    gl       = Context.gl;

var Mesh = function(vertices, normals, uvs, extra) {
  this.vBuf = gl.createBuffer();
  this.nBuf = gl.createBuffer();
  this.uBuf = gl.createBuffer();
  this.eBuf = gl.createBuffer();

  this.count = vertices.length / 3;

  gl.bindBuffer(gl.ARRAY_BUFFER, this.vBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.nBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.uBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, this.eBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(extra), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
}

module.exports = Mesh;

},{"./../Context":1,"./glMatrixSubset":14}],11:[function(require,module,exports){
var QuadTree = function(x, y, w, limit) {

  this.nw = this.sw = this.ne = this.se = null;

  this.x = x;
  this.y = y;
  this.w = w;
  this.limit = limit;

  this.points = [];
};

QuadTree.prototype.contains = function(el) {
  return (Math.abs(el.x - this.x) < this.w && Math.abs(el.y - this.y) < this.w);
}

QuadTree.prototype.insert = function(el) {
  if(!this.contains(el))
    return false;

  if(this.points.length < this.limit) {
    this.points.push(el);
    return true;
  }

  if(this.nw === null)
    this.subdivide();

  return this.nw.insert(el) ||
         this.ne.insert(el) ||
         this.sw.insert(el) ||
         this.se.insert(el);
}

QuadTree.prototype.subdivide = function() {
  var x = this.x, y = this.y, w = this.w / 2;
  this.nw = new QuadTree(x - w, y - w, w, this.limit);
  this.sw = new QuadTree(x - w, y + w, w, this.limit);
  this.ne = new QuadTree(x + w, y - w, w, this.limit);
  this.se = new QuadTree(x + w, y + w, w, this.limit);
}

QuadTree.prototype.intersect = function(x, y, w) {
  return Math.abs(this.x - x) < this.w + w &&
         Math.abs(this.y - y) < this.w + w;
}

QuadTree.prototype.query = function(x, y, w) {
  var pts = [], cpts = [], tp = this.points;

  if(!this.intersect(x, y, w)) {
    return pts;
  }

  for(var i = 0, I = tp.length; i < I; i++) {
    if(pointInRange(tp[i], x, y, w))
      pts.push(tp[i]);
  }

  if(this.nw === null)
    return pts;

  cpts = this.nw.query(x, y, w);
  for(var i = 0, I = cpts.length; i < I; i++)
    pts.push(cpts[i]);

  cpts = this.ne.query(x, y, w);
  for(var i = 0, I = cpts.length; i < I; i++)
    pts.push(cpts[i]);

  cpts = this.sw.query(x, y, w);
  for(var i = 0, I = cpts.length; i < I; i++)
    pts.push(cpts[i]);

  cpts = this.se.query(x, y, w);
  for(var i = 0, I = cpts.length; i < I; i++)
    pts.push(cpts[i]);

  return pts;
}

var pointInRange = function(el, x, y, w) {
  return Math.abs(el.x - x) < w && Math.abs(el.y - y) < w;
};

module.exports = QuadTree;

},{}],12:[function(require,module,exports){
/*
 * General rule: only rectangles allowed.
 * p1 p2
 * p0 p3
 */
var SHAPE = {
  // Input:  segment ends, extrusion height, normal
  // Output: quad
  extrude: function(symbol, a, b, len, norm) {

    var nX = 0, nY = len, nZ = 0;

    if(norm !== undefined) {
      nX = norm[0] * len; 
      nY = norm[1] * len;
      nZ = norm[2] * len;
    }

    return {
      sym: symbol,
      points: [
        { x: a.x,      y: a.y,      z: a.z },
        { x: a.x + nX, y: a.y + nY, z: a.z + nZ },
        { x: b.x + nX, y: b.y + nY, z: b.z + nZ },
        { x: b.x,      y: b.y,      z: b.z }
      ]
    };
  },
  
  // Input:  list of points, symbols
  // Output: [quad]
  extrudeAll: function(path, len, symbols, norm) {
    var out = [];
    for(var i = 0, n = path.length; i < n; ++i) {
      var cur = path[i], next = path[(i + 1) % n];
      out.push(SHAPE.extrude(symbols instanceof Array ? symbols[i] : symbols, cur, next, len, norm));
    }
    return out;
  },

  // Input:  quad, list of splits (must sum to 1 in each direction)
  // Output: [quad]
  // Split from top to bottom
  split: function(quad, xSplits, ySplits, symbols) {
    var out = [], symI = 0, sioa = symbols instanceof Array,
        qp = quad.points, qu = quad.uvs,
        p0 = qp[0], p1 = qp[1], p2 = qp[2], p3 = qp[3],
        x0 = p0.x, x1 = p1.x, x2 = p2.x, x3 = p3.x,
        y0 = p0.y, y1 = p1.y, y2 = p2.y, y3 = p3.y,
        z0 = p0.z, z1 = p1.z, z2 = p2.z, z3 = p3.z,
        ds = 1, dt = 1, ms = 0, mt = 0;

    if(qu instanceof Array)
      ds = qu[3].s - qu[0].s, dt = qu[1].t - qu[0].t,
      ms = qu[0].s, mt = qu[1].t;

    var accY = 0;
    for(var y = 0, Y = ySplits.length; y < Y; ++y) {
      var accX = 0, accYY = accY + ySplits[y];
      for(var x = 0, X = xSplits.length; x < X; ++x) {
        var accXX = accX + xSplits[x], 
            xa = SHAPE.lerp(x0, x3, accX),
            xb = SHAPE.lerp(x0, x3, accXX),
            ya = SHAPE.lerp(y0, y1, accY),
            yb = SHAPE.lerp(y0, y1, accYY),
            za = SHAPE.lerp(z0, z3, accX),
            zb = SHAPE.lerp(z0, z3, accXX);

        out.push({
          sym: sioa ? symbols[symI++] : symbols,
          points: [
            { x: xa, y: ya, z: za },
            { x: xa, y: yb, z: za },
            { x: xb, y: yb, z: zb },
            { x: xb, y: ya, z: zb }
          ],
          uvs: [
            { s: ms + ds * accX,  t: mt + dt * accY },
            { s: ms + ds * accX,  t: mt + dt * accYY },
            { s: ms + ds * accXX, t: mt + dt * accYY },
            { s: ms + ds * accXX, t: mt + dt * accY },
          ]
        })
        accX = accXX;
      }
      accY = accYY;
    }

    return out;
  },

  splitXZ: function(quad, xSplits, zSplits, symbols) {
    var out = [], symI = 0,
        qp = quad.points,
        p0 = qp[0], p1 = qp[1], p2 = qp[2], p3 = qp[3],
        x0 = p0.x, x1 = p1.x, x2 = p2.x, x3 = p3.x,
        y0 = p0.y, y1 = p1.y, y2 = p2.y, y3 = p3.y,
        z0 = p0.z, z1 = p1.z, z2 = p2.z, z3 = p3.z;

    var accZ = 0;
    for(var z = 0, Z = zSplits.length; z < Z; ++z) {
      var accX = 0;
      for(var x = 0, X = xSplits.length; x < X; ++x) {
        var xa = SHAPE.lerp(x0, x3, accX),
            xb = SHAPE.lerp(x0, x3, accX + xSplits[x]),
            ya = SHAPE.lerp(y0, y1, accX),
            yb = SHAPE.lerp(y0, y1, accX + xSplits[x]),
            za = SHAPE.lerp(z0, z1, accZ),
            zb = SHAPE.lerp(z0, z1, accZ + zSplits[z]);

        out.push({
          sym: symbols instanceof Array? symbols[symI++] : symbols,
          points: [
            { x: xa, y: ya, z: za },
            { x: xa, y: ya, z: zb },
            { x: xb, y: yb, z: zb },
            { x: xb, y: yb, z: za }
          ]
        })
        accX += xSplits[x];
      }
      accZ += zSplits[z];
    }

    return out;
  },

  splitZX: function(quad, xSplits, zSplits, symbols) {
    var out = [], symI = 0,
        qp = quad.points,
        p0 = qp[0], p1 = qp[1], p2 = qp[2], p3 = qp[3],
        x0 = p0.x, x1 = p1.x, x2 = p2.x, x3 = p3.x,
        y0 = p0.y, y1 = p1.y, y2 = p2.y, y3 = p3.y,
        z0 = p0.z, z1 = p1.z, z2 = p2.z, z3 = p3.z;

    var accZ = 0;
    for(var z = 0, Z = zSplits.length; z < Z; ++z) {
      var accX = 0;
      for(var x = 0, X = xSplits.length; x < X; ++x) {
        var xa = SHAPE.lerp(x0, x1, accX),
            xb = SHAPE.lerp(x0, x1, accX + xSplits[x]),
            ya = SHAPE.lerp(y0, y1, accX),
            yb = SHAPE.lerp(y0, y1, accX + xSplits[x]),
            za = SHAPE.lerp(z0, z3, accZ),
            zb = SHAPE.lerp(z0, z3, accZ + zSplits[z]);

        out.push({
          sym: symbols instanceof Array? symbols[symI++] : symbols,
          points: [
            { x: xa, y: ya, z: za },
            { x: xa, y: ya, z: zb },
            { x: xb, y: yb, z: zb },
            { x: xb, y: yb, z: za }
          ]
        })
        accX += xSplits[x];
      }
      accZ += zSplits[z];
    }

    return out;
  },

  // Input: axis, quad, symbol
  // Output: [quad]
  fit: function(axis, quad, symbol, ratio) {

    ratio = ratio || 1;

    var qp = quad.points,
        p0 = qp[0], p1 = qp[1], p2 = qp[2], p3 = qp[3],
        x0 = p0.x, x1 = p1.x, x2 = p2.x, x3 = p3.x,
        y0 = p0.y, y1 = p1.y, y2 = p2.y, y3 = p3.y,
        z0 = p0.z, z1 = p1.z, z2 = p2.z, z3 = p3.z,
        dx = x3 - x0, dy = y1 - y0, dz = z3 - z0, dzdy = z1 - z0;

    if(axis === 'x') {
      var h = dy,
          w = ratio * h,
          wAvail = Math.sqrt( dx * dx + dz * dz ),
          count = Math.round(wAvail / w),
          splits = [];

      w = wAvail / count; // Correct width

      count = Math.max(1, Math.abs(count));
      for(var i = 0; i < count; i++)
        splits.push(1 / count);

      return SHAPE.split(quad, splits, [1], symbol);
    } else if(axis === 'y') {
      var w = x3 - x0,
          h = w / ratio,
          hAvail = Math.sqrt( dy * dy + dzdy * dzdy ),
          count = Math.round(hAvail / h),
          splits = [];

      h = hAvail / count; // Correct width

      for(var i = 0; i < count; i++)
        splits.push(1 / count);

      return SHAPE.split(quad, splits, [1], symbol);
    }
  },

  lerp: function(a, b, t) {
    return a * (1 - t) + b * t;
  }
};

module.exports = SHAPE;

},{}],13:[function(require,module,exports){
var Geom = require('./Geom'),
    SHAPE = require('./SHAPE.js'),
    glMatrix = require('./glMatrixSubset'),
    earcut = require('earcut'),
    vec3 = glMatrix.vec3,
    mat4 = glMatrix.mat4;

var _ = function() {
  this.rules = [];
};

_.prototype.define = function(lhs, cond, rhs) {
  this.rules.push({
    lhs: lhs,
    cond: cond,
    rhs: rhs
  });
};

_.prototype.run = function(state) {
  
  var output = [], rules = this.rules, nonterminals = 0;

  state = (state instanceof Array? state : [state]);

  while(state.length) {

    var lhs = state.shift();

    if(lhs.sym === _.TERMINAL) {
      output.push(lhs);
    } else for(var i = 0, I = rules.length; i < I; i++) {
      
      var rule = rules[i];
      if(lhs.sym === rule.lhs && 
        (rule.cond === null || rule.cond.call(lhs))) {
        
        var ret = rule.rhs.call(lhs);
        ret = (ret instanceof Array? ret : [ret]);

        for(var j = 0, J = ret.length; j < J; j++) {
          output.push(ret[j]);
          ++nonterminals;
        }

        break;
      }
    }
  }

  return (nonterminals > 0 ? this.run(output) : output);
}

_.TERMINAL = 'TERMINAL';

module.exports = _;

},{"./Geom":8,"./SHAPE.js":12,"./glMatrixSubset":14,"earcut":17}],14:[function(require,module,exports){
var GLMAT_ARRAY_TYPE = Float32Array;
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 4x4 Matrix
 * @name mat4
 */
var mat4 = {};

/**
 * Creates a new identity mat4
 *
 * @returns {mat4} a new 4x4 matrix
 */
mat4.create = function() {
    var out = new GLMAT_ARRAY_TYPE(16);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};

/**
 * Creates a new mat4 initialized with values from an existing matrix
 *
 * @param {mat4} a matrix to clone
 * @returns {mat4} a new 4x4 matrix
 */
mat4.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(16);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};

/**
 * Copy the values from one mat4 to another
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
mat4.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    out[9] = a[9];
    out[10] = a[10];
    out[11] = a[11];
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};

/**
 * Set a mat4 to the identity matrix
 *
 * @param {mat4} out the receiving matrix
 * @returns {mat4} out
 */
mat4.identity = function(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = 1;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 1;
    out[11] = 0;
    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;
    return out;
};

/**
 * Transpose the values of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
mat4.transpose = function(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a01 = a[1], a02 = a[2], a03 = a[3],
            a12 = a[6], a13 = a[7],
            a23 = a[11];

        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a01;
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a02;
        out[9] = a12;
        out[11] = a[14];
        out[12] = a03;
        out[13] = a13;
        out[14] = a23;
    } else {
        out[0] = a[0];
        out[1] = a[4];
        out[2] = a[8];
        out[3] = a[12];
        out[4] = a[1];
        out[5] = a[5];
        out[6] = a[9];
        out[7] = a[13];
        out[8] = a[2];
        out[9] = a[6];
        out[10] = a[10];
        out[11] = a[14];
        out[12] = a[3];
        out[13] = a[7];
        out[14] = a[11];
        out[15] = a[15];
    }
    
    return out;
};

/**
 * Inverts a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
mat4.invert = function(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
};

/**
 * Calculates the adjugate of a mat4
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the source matrix
 * @returns {mat4} out
 */
mat4.adjoint = function(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    out[0]  =  (a11 * (a22 * a33 - a23 * a32) - a21 * (a12 * a33 - a13 * a32) + a31 * (a12 * a23 - a13 * a22));
    out[1]  = -(a01 * (a22 * a33 - a23 * a32) - a21 * (a02 * a33 - a03 * a32) + a31 * (a02 * a23 - a03 * a22));
    out[2]  =  (a01 * (a12 * a33 - a13 * a32) - a11 * (a02 * a33 - a03 * a32) + a31 * (a02 * a13 - a03 * a12));
    out[3]  = -(a01 * (a12 * a23 - a13 * a22) - a11 * (a02 * a23 - a03 * a22) + a21 * (a02 * a13 - a03 * a12));
    out[4]  = -(a10 * (a22 * a33 - a23 * a32) - a20 * (a12 * a33 - a13 * a32) + a30 * (a12 * a23 - a13 * a22));
    out[5]  =  (a00 * (a22 * a33 - a23 * a32) - a20 * (a02 * a33 - a03 * a32) + a30 * (a02 * a23 - a03 * a22));
    out[6]  = -(a00 * (a12 * a33 - a13 * a32) - a10 * (a02 * a33 - a03 * a32) + a30 * (a02 * a13 - a03 * a12));
    out[7]  =  (a00 * (a12 * a23 - a13 * a22) - a10 * (a02 * a23 - a03 * a22) + a20 * (a02 * a13 - a03 * a12));
    out[8]  =  (a10 * (a21 * a33 - a23 * a31) - a20 * (a11 * a33 - a13 * a31) + a30 * (a11 * a23 - a13 * a21));
    out[9]  = -(a00 * (a21 * a33 - a23 * a31) - a20 * (a01 * a33 - a03 * a31) + a30 * (a01 * a23 - a03 * a21));
    out[10] =  (a00 * (a11 * a33 - a13 * a31) - a10 * (a01 * a33 - a03 * a31) + a30 * (a01 * a13 - a03 * a11));
    out[11] = -(a00 * (a11 * a23 - a13 * a21) - a10 * (a01 * a23 - a03 * a21) + a20 * (a01 * a13 - a03 * a11));
    out[12] = -(a10 * (a21 * a32 - a22 * a31) - a20 * (a11 * a32 - a12 * a31) + a30 * (a11 * a22 - a12 * a21));
    out[13] =  (a00 * (a21 * a32 - a22 * a31) - a20 * (a01 * a32 - a02 * a31) + a30 * (a01 * a22 - a02 * a21));
    out[14] = -(a00 * (a11 * a32 - a12 * a31) - a10 * (a01 * a32 - a02 * a31) + a30 * (a01 * a12 - a02 * a11));
    out[15] =  (a00 * (a11 * a22 - a12 * a21) - a10 * (a01 * a22 - a02 * a21) + a20 * (a01 * a12 - a02 * a11));
    return out;
};

/**
 * Calculates the determinant of a mat4
 *
 * @param {mat4} a the source matrix
 * @returns {Number} determinant of a
 */
mat4.determinant = function (a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32;

    // Calculate the determinant
    return b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
};

/**
 * Multiplies two mat4's
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the first operand
 * @param {mat4} b the second operand
 * @returns {mat4} out
 */
mat4.multiply = function (out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    // Cache only the current line of the second matrix
    var b0  = b[0], b1 = b[1], b2 = b[2], b3 = b[3];  
    out[0] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[1] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[2] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[3] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[5] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[6] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[7] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[9] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[10] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[11] = b0*a03 + b1*a13 + b2*a23 + b3*a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0*a00 + b1*a10 + b2*a20 + b3*a30;
    out[13] = b0*a01 + b1*a11 + b2*a21 + b3*a31;
    out[14] = b0*a02 + b1*a12 + b2*a22 + b3*a32;
    out[15] = b0*a03 + b1*a13 + b2*a23 + b3*a33;
    return out;
};

/**
 * Alias for {@link mat4.multiply}
 * @function
 */
mat4.mul = mat4.multiply;

/**
 * Translate a mat4 by the given vector
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to translate
 * @param {vec3} v vector to translate by
 * @returns {mat4} out
 */
mat4.translate = function (out, a, v) {
    var x = v[0], y = v[1], z = v[2],
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23;

    if (a === out) {
        out[12] = a[0] * x + a[4] * y + a[8] * z + a[12];
        out[13] = a[1] * x + a[5] * y + a[9] * z + a[13];
        out[14] = a[2] * x + a[6] * y + a[10] * z + a[14];
        out[15] = a[3] * x + a[7] * y + a[11] * z + a[15];
    } else {
        a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
        a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
        a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

        out[0] = a00; out[1] = a01; out[2] = a02; out[3] = a03;
        out[4] = a10; out[5] = a11; out[6] = a12; out[7] = a13;
        out[8] = a20; out[9] = a21; out[10] = a22; out[11] = a23;

        out[12] = a00 * x + a10 * y + a20 * z + a[12];
        out[13] = a01 * x + a11 * y + a21 * z + a[13];
        out[14] = a02 * x + a12 * y + a22 * z + a[14];
        out[15] = a03 * x + a13 * y + a23 * z + a[15];
    }

    return out;
};

/**
 * Scales the mat4 by the dimensions in the given vec3
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to scale
 * @param {vec3} v the vec3 to scale the matrix by
 * @returns {mat4} out
 **/
mat4.scale = function(out, a, v) {
    var x = v[0], y = v[1], z = v[2];

    out[0] = a[0] * x;
    out[1] = a[1] * x;
    out[2] = a[2] * x;
    out[3] = a[3] * x;
    out[4] = a[4] * y;
    out[5] = a[5] * y;
    out[6] = a[6] * y;
    out[7] = a[7] * y;
    out[8] = a[8] * z;
    out[9] = a[9] * z;
    out[10] = a[10] * z;
    out[11] = a[11] * z;
    out[12] = a[12];
    out[13] = a[13];
    out[14] = a[14];
    out[15] = a[15];
    return out;
};

/**
 * Rotates a mat4 by the given angle
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @param {vec3} axis the axis to rotate around
 * @returns {mat4} out
 */
mat4.rotate = function (out, a, rad, axis) {
    var x = axis[0], y = axis[1], z = axis[2],
        len = Math.sqrt(x * x + y * y + z * z),
        s, c, t,
        a00, a01, a02, a03,
        a10, a11, a12, a13,
        a20, a21, a22, a23,
        b00, b01, b02,
        b10, b11, b12,
        b20, b21, b22;

    if (Math.abs(len) < GLMAT_EPSILON) { return null; }
    
    len = 1 / len;
    x *= len;
    y *= len;
    z *= len;

    s = Math.sin(rad);
    c = Math.cos(rad);
    t = 1 - c;

    a00 = a[0]; a01 = a[1]; a02 = a[2]; a03 = a[3];
    a10 = a[4]; a11 = a[5]; a12 = a[6]; a13 = a[7];
    a20 = a[8]; a21 = a[9]; a22 = a[10]; a23 = a[11];

    // Construct the elements of the rotation matrix
    b00 = x * x * t + c; b01 = y * x * t + z * s; b02 = z * x * t - y * s;
    b10 = x * y * t - z * s; b11 = y * y * t + c; b12 = z * y * t + x * s;
    b20 = x * z * t + y * s; b21 = y * z * t - x * s; b22 = z * z * t + c;

    // Perform rotation-specific matrix multiplication
    out[0] = a00 * b00 + a10 * b01 + a20 * b02;
    out[1] = a01 * b00 + a11 * b01 + a21 * b02;
    out[2] = a02 * b00 + a12 * b01 + a22 * b02;
    out[3] = a03 * b00 + a13 * b01 + a23 * b02;
    out[4] = a00 * b10 + a10 * b11 + a20 * b12;
    out[5] = a01 * b10 + a11 * b11 + a21 * b12;
    out[6] = a02 * b10 + a12 * b11 + a22 * b12;
    out[7] = a03 * b10 + a13 * b11 + a23 * b12;
    out[8] = a00 * b20 + a10 * b21 + a20 * b22;
    out[9] = a01 * b20 + a11 * b21 + a21 * b22;
    out[10] = a02 * b20 + a12 * b21 + a22 * b22;
    out[11] = a03 * b20 + a13 * b21 + a23 * b22;

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }
    return out;
};

/**
 * Rotates a matrix by the given angle around the X axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
mat4.rotateX = function (out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[0]  = a[0];
        out[1]  = a[1];
        out[2]  = a[2];
        out[3]  = a[3];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[4] = a10 * c + a20 * s;
    out[5] = a11 * c + a21 * s;
    out[6] = a12 * c + a22 * s;
    out[7] = a13 * c + a23 * s;
    out[8] = a20 * c - a10 * s;
    out[9] = a21 * c - a11 * s;
    out[10] = a22 * c - a12 * s;
    out[11] = a23 * c - a13 * s;
    return out;
};

/**
 * Rotates a matrix by the given angle around the Y axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
mat4.rotateY = function (out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a20 = a[8],
        a21 = a[9],
        a22 = a[10],
        a23 = a[11];

    if (a !== out) { // If the source and destination differ, copy the unchanged rows
        out[4]  = a[4];
        out[5]  = a[5];
        out[6]  = a[6];
        out[7]  = a[7];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c - a20 * s;
    out[1] = a01 * c - a21 * s;
    out[2] = a02 * c - a22 * s;
    out[3] = a03 * c - a23 * s;
    out[8] = a00 * s + a20 * c;
    out[9] = a01 * s + a21 * c;
    out[10] = a02 * s + a22 * c;
    out[11] = a03 * s + a23 * c;
    return out;
};

/**
 * Rotates a matrix by the given angle around the Z axis
 *
 * @param {mat4} out the receiving matrix
 * @param {mat4} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat4} out
 */
mat4.rotateZ = function (out, a, rad) {
    var s = Math.sin(rad),
        c = Math.cos(rad),
        a00 = a[0],
        a01 = a[1],
        a02 = a[2],
        a03 = a[3],
        a10 = a[4],
        a11 = a[5],
        a12 = a[6],
        a13 = a[7];

    if (a !== out) { // If the source and destination differ, copy the unchanged last row
        out[8]  = a[8];
        out[9]  = a[9];
        out[10] = a[10];
        out[11] = a[11];
        out[12] = a[12];
        out[13] = a[13];
        out[14] = a[14];
        out[15] = a[15];
    }

    // Perform axis-specific matrix multiplication
    out[0] = a00 * c + a10 * s;
    out[1] = a01 * c + a11 * s;
    out[2] = a02 * c + a12 * s;
    out[3] = a03 * c + a13 * s;
    out[4] = a10 * c - a00 * s;
    out[5] = a11 * c - a01 * s;
    out[6] = a12 * c - a02 * s;
    out[7] = a13 * c - a03 * s;
    return out;
};

/**
 * Creates a matrix from a quaternion rotation and vector translation
 * This is equivalent to (but much faster than):
 *
 *     mat4.identity(dest);
 *     mat4.translate(dest, vec);
 *     var quatMat = mat4.create();
 *     quat4.toMat4(quat, quatMat);
 *     mat4.multiply(dest, quatMat);
 *
 * @param {mat4} out mat4 receiving operation result
 * @param {quat4} q Rotation quaternion
 * @param {vec3} v Translation vector
 * @returns {mat4} out
 */
mat4.fromRotationTranslation = function (out, q, v) {
    // Quaternion math
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        xy = x * y2,
        xz = x * z2,
        yy = y * y2,
        yz = y * z2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - (yy + zz);
    out[1] = xy + wz;
    out[2] = xz - wy;
    out[3] = 0;
    out[4] = xy - wz;
    out[5] = 1 - (xx + zz);
    out[6] = yz + wx;
    out[7] = 0;
    out[8] = xz + wy;
    out[9] = yz - wx;
    out[10] = 1 - (xx + yy);
    out[11] = 0;
    out[12] = v[0];
    out[13] = v[1];
    out[14] = v[2];
    out[15] = 1;
    
    return out;
};

mat4.fromQuat = function (out, q) {
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        yx = y * x2,
        yy = y * y2,
        zx = z * x2,
        zy = z * y2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - yy - zz;
    out[1] = yx + wz;
    out[2] = zx - wy;
    out[3] = 0;

    out[4] = yx - wz;
    out[5] = 1 - xx - zz;
    out[6] = zy + wx;
    out[7] = 0;

    out[8] = zx + wy;
    out[9] = zy - wx;
    out[10] = 1 - xx - yy;
    out[11] = 0;

    out[12] = 0;
    out[13] = 0;
    out[14] = 0;
    out[15] = 1;

    return out;
};

/**
 * Generates a frustum matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {Number} left Left bound of the frustum
 * @param {Number} right Right bound of the frustum
 * @param {Number} bottom Bottom bound of the frustum
 * @param {Number} top Top bound of the frustum
 * @param {Number} near Near bound of the frustum
 * @param {Number} far Far bound of the frustum
 * @returns {mat4} out
 */
mat4.frustum = function (out, left, right, bottom, top, near, far) {
    var rl = 1 / (right - left),
        tb = 1 / (top - bottom),
        nf = 1 / (near - far);
    out[0] = (near * 2) * rl;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = (near * 2) * tb;
    out[6] = 0;
    out[7] = 0;
    out[8] = (right + left) * rl;
    out[9] = (top + bottom) * tb;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (far * near * 2) * nf;
    out[15] = 0;
    return out;
};

/**
 * Generates a perspective projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} fovy Vertical field of view in radians
 * @param {number} aspect Aspect ratio. typically viewport width/height
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
mat4.perspective = function (out, fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2),
        nf = 1 / (near - far);
    out[0] = f / aspect;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = f;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = (far + near) * nf;
    out[11] = -1;
    out[12] = 0;
    out[13] = 0;
    out[14] = (2 * far * near) * nf;
    out[15] = 0;
    return out;
};

/**
 * Generates a orthogonal projection matrix with the given bounds
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {number} left Left bound of the frustum
 * @param {number} right Right bound of the frustum
 * @param {number} bottom Bottom bound of the frustum
 * @param {number} top Top bound of the frustum
 * @param {number} near Near bound of the frustum
 * @param {number} far Far bound of the frustum
 * @returns {mat4} out
 */
mat4.ortho = function (out, left, right, bottom, top, near, far) {
    var lr = 1 / (left - right),
        bt = 1 / (bottom - top),
        nf = 1 / (near - far);
    out[0] = -2 * lr;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 0;
    out[5] = -2 * bt;
    out[6] = 0;
    out[7] = 0;
    out[8] = 0;
    out[9] = 0;
    out[10] = 2 * nf;
    out[11] = 0;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
};

/**
 * Generates a look-at matrix with the given eye position, focal point, and up axis
 *
 * @param {mat4} out mat4 frustum matrix will be written into
 * @param {vec3} eye Position of the viewer
 * @param {vec3} center Point the viewer is looking at
 * @param {vec3} up vec3 pointing up
 * @returns {mat4} out
 */
mat4.lookAt = function (out, eye, center, up) {
    var x0, x1, x2, y0, y1, y2, z0, z1, z2, len,
        eyex = eye[0],
        eyey = eye[1],
        eyez = eye[2],
        upx = up[0],
        upy = up[1],
        upz = up[2],
        centerx = center[0],
        centery = center[1],
        centerz = center[2];

    if (Math.abs(eyex - centerx) < GLMAT_EPSILON &&
        Math.abs(eyey - centery) < GLMAT_EPSILON &&
        Math.abs(eyez - centerz) < GLMAT_EPSILON) {
        return mat4.identity(out);
    }

    z0 = eyex - centerx;
    z1 = eyey - centery;
    z2 = eyez - centerz;

    len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
    z0 *= len;
    z1 *= len;
    z2 *= len;

    x0 = upy * z2 - upz * z1;
    x1 = upz * z0 - upx * z2;
    x2 = upx * z1 - upy * z0;
    len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
    if (!len) {
        x0 = 0;
        x1 = 0;
        x2 = 0;
    } else {
        len = 1 / len;
        x0 *= len;
        x1 *= len;
        x2 *= len;
    }

    y0 = z1 * x2 - z2 * x1;
    y1 = z2 * x0 - z0 * x2;
    y2 = z0 * x1 - z1 * x0;

    len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
    if (!len) {
        y0 = 0;
        y1 = 0;
        y2 = 0;
    } else {
        len = 1 / len;
        y0 *= len;
        y1 *= len;
        y2 *= len;
    }

    out[0] = x0;
    out[1] = y0;
    out[2] = z0;
    out[3] = 0;
    out[4] = x1;
    out[5] = y1;
    out[6] = z1;
    out[7] = 0;
    out[8] = x2;
    out[9] = y2;
    out[10] = z2;
    out[11] = 0;
    out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
    out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
    out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
    out[15] = 1;

    return out;
};

/**
 * Returns a string representation of a mat4
 *
 * @param {mat4} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
mat4.str = function (a) {
    return 'mat4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ', ' +
                    a[4] + ', ' + a[5] + ', ' + a[6] + ', ' + a[7] + ', ' +
                    a[8] + ', ' + a[9] + ', ' + a[10] + ', ' + a[11] + ', ' + 
                    a[12] + ', ' + a[13] + ', ' + a[14] + ', ' + a[15] + ')';
};

/**
 * Returns Frobenius norm of a mat4
 *
 * @param {mat4} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */
mat4.frob = function (a) {
    return(Math.sqrt(Math.pow(a[0], 2) + Math.pow(a[1], 2) + Math.pow(a[2], 2) + Math.pow(a[3], 2) + Math.pow(a[4], 2) + Math.pow(a[5], 2) + Math.pow(a[6], 2) + Math.pow(a[6], 2) + Math.pow(a[7], 2) + Math.pow(a[8], 2) + Math.pow(a[9], 2) + Math.pow(a[10], 2) + Math.pow(a[11], 2) + Math.pow(a[12], 2) + Math.pow(a[13], 2) + Math.pow(a[14], 2) + Math.pow(a[15], 2) ))
};


if(typeof(exports) !== 'undefined') {
    exports.mat4 = mat4;
}

/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 3 Dimensional Vector
 * @name vec3
 */
var vec3 = {};

/**
 * Creates a new, empty vec3
 *
 * @returns {vec3} a new 3D vector
 */
vec3.create = function() {
    var out = new GLMAT_ARRAY_TYPE(3);
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return out;
};

/**
 * Creates a new vec3 initialized with values from an existing vector
 *
 * @param {vec3} a vector to clone
 * @returns {vec3} a new 3D vector
 */
vec3.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(3);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
};

/**
 * Creates a new vec3 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} a new 3D vector
 */
vec3.fromValues = function(x, y, z) {
    var out = new GLMAT_ARRAY_TYPE(3);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
};

/**
 * Copy the values from one vec3 to another
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the source vector
 * @returns {vec3} out
 */
vec3.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    return out;
};

/**
 * Set the components of a vec3 to the given values
 *
 * @param {vec3} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @returns {vec3} out
 */
vec3.set = function(out, x, y, z) {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    return out;
};

/**
 * Adds two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.add = function(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    return out;
};

/**
 * Subtracts vector b from vector a
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.subtract = function(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    return out;
};

/**
 * Alias for {@link vec3.subtract}
 * @function
 */
vec3.sub = vec3.subtract;

/**
 * Multiplies two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.multiply = function(out, a, b) {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    out[2] = a[2] * b[2];
    return out;
};

/**
 * Alias for {@link vec3.multiply}
 * @function
 */
vec3.mul = vec3.multiply;

/**
 * Divides two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.divide = function(out, a, b) {
    out[0] = a[0] / b[0];
    out[1] = a[1] / b[1];
    out[2] = a[2] / b[2];
    return out;
};

/**
 * Alias for {@link vec3.divide}
 * @function
 */
vec3.div = vec3.divide;

/**
 * Returns the minimum of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.min = function(out, a, b) {
    out[0] = Math.min(a[0], b[0]);
    out[1] = Math.min(a[1], b[1]);
    out[2] = Math.min(a[2], b[2]);
    return out;
};

/**
 * Returns the maximum of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.max = function(out, a, b) {
    out[0] = Math.max(a[0], b[0]);
    out[1] = Math.max(a[1], b[1]);
    out[2] = Math.max(a[2], b[2]);
    return out;
};

/**
 * Scales a vec3 by a scalar number
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec3} out
 */
vec3.scale = function(out, a, b) {
    out[0] = a[0] * b;
    out[1] = a[1] * b;
    out[2] = a[2] * b;
    return out;
};

/**
 * Adds two vec3's after scaling the second operand by a scalar value
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec3} out
 */
vec3.scaleAndAdd = function(out, a, b, scale) {
    out[0] = a[0] + (b[0] * scale);
    out[1] = a[1] + (b[1] * scale);
    out[2] = a[2] + (b[2] * scale);
    return out;
};

/**
 * Calculates the euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} distance between a and b
 */
vec3.distance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2];
    return Math.sqrt(x*x + y*y + z*z);
};

/**
 * Alias for {@link vec3.distance}
 * @function
 */
vec3.dist = vec3.distance;

/**
 * Calculates the squared euclidian distance between two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} squared distance between a and b
 */
vec3.squaredDistance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2];
    return x*x + y*y + z*z;
};

/**
 * Alias for {@link vec3.squaredDistance}
 * @function
 */
vec3.sqrDist = vec3.squaredDistance;

/**
 * Calculates the length of a vec3
 *
 * @param {vec3} a vector to calculate length of
 * @returns {Number} length of a
 */
vec3.length = function (a) {
    var x = a[0],
        y = a[1],
        z = a[2];
    return Math.sqrt(x*x + y*y + z*z);
};

/**
 * Alias for {@link vec3.length}
 * @function
 */
vec3.len = vec3.length;

/**
 * Calculates the squared length of a vec3
 *
 * @param {vec3} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
vec3.squaredLength = function (a) {
    var x = a[0],
        y = a[1],
        z = a[2];
    return x*x + y*y + z*z;
};

/**
 * Alias for {@link vec3.squaredLength}
 * @function
 */
vec3.sqrLen = vec3.squaredLength;

/**
 * Negates the components of a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to negate
 * @returns {vec3} out
 */
vec3.negate = function(out, a) {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    return out;
};

/**
 * Normalize a vec3
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a vector to normalize
 * @returns {vec3} out
 */
vec3.normalize = function(out, a) {
    var x = a[0],
        y = a[1],
        z = a[2];
    var len = x*x + y*y + z*z;
    if (len > 0) {
        //TODO: evaluate use of glm_invsqrt here?
        len = 1 / Math.sqrt(len);
        out[0] = a[0] * len;
        out[1] = a[1] * len;
        out[2] = a[2] * len;
    }
    return out;
};

/**
 * Calculates the dot product of two vec3's
 *
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {Number} dot product of a and b
 */
vec3.dot = function (a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
};

/**
 * Computes the cross product of two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @returns {vec3} out
 */
vec3.cross = function(out, a, b) {
    var ax = a[0], ay = a[1], az = a[2],
        bx = b[0], by = b[1], bz = b[2];

    out[0] = ay * bz - az * by;
    out[1] = az * bx - ax * bz;
    out[2] = ax * by - ay * bx;
    return out;
};

/**
 * Performs a linear interpolation between two vec3's
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the first operand
 * @param {vec3} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec3} out
 */
vec3.lerp = function (out, a, b, t) {
    var ax = a[0],
        ay = a[1],
        az = a[2];
    out[0] = ax + t * (b[0] - ax);
    out[1] = ay + t * (b[1] - ay);
    out[2] = az + t * (b[2] - az);
    return out;
};

/**
 * Generates a random vector with the given scale
 *
 * @param {vec3} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec3} out
 */
vec3.random = function (out, scale) {
    scale = scale || 1.0;

    var r = GLMAT_RANDOM() * 2.0 * Math.PI;
    var z = (GLMAT_RANDOM() * 2.0) - 1.0;
    var zScale = Math.sqrt(1.0-z*z) * scale;

    out[0] = Math.cos(r) * zScale;
    out[1] = Math.sin(r) * zScale;
    out[2] = z * scale;
    return out;
};

/**
 * Transforms the vec3 with a mat4.
 * 4th vector component is implicitly '1'
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec3} out
 */
vec3.transformMat4 = function(out, a, m) {
    var x = a[0], y = a[1], z = a[2];
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14];
    return out;
};

/**
 * Transforms the vec3 with a mat3.
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {mat4} m the 3x3 matrix to transform with
 * @returns {vec3} out
 */
vec3.transformMat3 = function(out, a, m) {
    var x = a[0], y = a[1], z = a[2];
    out[0] = x * m[0] + y * m[3] + z * m[6];
    out[1] = x * m[1] + y * m[4] + z * m[7];
    out[2] = x * m[2] + y * m[5] + z * m[8];
    return out;
};

/**
 * Transforms the vec3 with a quat
 *
 * @param {vec3} out the receiving vector
 * @param {vec3} a the vector to transform
 * @param {quat} q quaternion to transform with
 * @returns {vec3} out
 */
vec3.transformQuat = function(out, a, q) {
    // benchmarks: http://jsperf.com/quaternion-transform-vec3-implementations

    var x = a[0], y = a[1], z = a[2],
        qx = q[0], qy = q[1], qz = q[2], qw = q[3],

        // calculate quat * vec
        ix = qw * x + qy * z - qz * y,
        iy = qw * y + qz * x - qx * z,
        iz = qw * z + qx * y - qy * x,
        iw = -qx * x - qy * y - qz * z;

    // calculate result * inverse quat
    out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
    out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
    out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
    return out;
};

/*
* Rotate a 3D vector around the x-axis
* @param {vec3} out The receiving vec3
* @param {vec3} a The vec3 point to rotate
* @param {vec3} b The origin of the rotation
* @param {Number} c The angle of rotation
* @returns {vec3} out
*/
vec3.rotateX = function(out, a, b, c){
   var p = [], r=[];
	  //Translate point to the origin
	  p[0] = a[0] - b[0];
	  p[1] = a[1] - b[1];
  	p[2] = a[2] - b[2];

	  //perform rotation
	  r[0] = p[0];
	  r[1] = p[1]*Math.cos(c) - p[2]*Math.sin(c);
	  r[2] = p[1]*Math.sin(c) + p[2]*Math.cos(c);

	  //translate to correct position
	  out[0] = r[0] + b[0];
	  out[1] = r[1] + b[1];
	  out[2] = r[2] + b[2];

  	return out;
};

/*
* Rotate a 3D vector around the y-axis
* @param {vec3} out The receiving vec3
* @param {vec3} a The vec3 point to rotate
* @param {vec3} b The origin of the rotation
* @param {Number} c The angle of rotation
* @returns {vec3} out
*/
vec3.rotateY = function(out, a, b, c){
  	var p = [], r=[];
  	//Translate point to the origin
  	p[0] = a[0] - b[0];
  	p[1] = a[1] - b[1];
  	p[2] = a[2] - b[2];
  
  	//perform rotation
  	r[0] = p[2]*Math.sin(c) + p[0]*Math.cos(c);
  	r[1] = p[1];
  	r[2] = p[2]*Math.cos(c) - p[0]*Math.sin(c);
  
  	//translate to correct position
  	out[0] = r[0] + b[0];
  	out[1] = r[1] + b[1];
  	out[2] = r[2] + b[2];
  
  	return out;
};

/*
* Rotate a 3D vector around the z-axis
* @param {vec3} out The receiving vec3
* @param {vec3} a The vec3 point to rotate
* @param {vec3} b The origin of the rotation
* @param {Number} c The angle of rotation
* @returns {vec3} out
*/
vec3.rotateZ = function(out, a, b, c){
  	var p = [], r=[];
  	//Translate point to the origin
  	p[0] = a[0] - b[0];
  	p[1] = a[1] - b[1];
  	p[2] = a[2] - b[2];
  
  	//perform rotation
  	r[0] = p[0]*Math.cos(c) - p[1]*Math.sin(c);
  	r[1] = p[0]*Math.sin(c) + p[1]*Math.cos(c);
  	r[2] = p[2];
  
  	//translate to correct position
  	out[0] = r[0] + b[0];
  	out[1] = r[1] + b[1];
  	out[2] = r[2] + b[2];
  
  	return out;
};

/**
 * Perform some operation over an array of vec3s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec3. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec3s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
vec3.forEach = (function() {
    var vec = vec3.create();

    return function(a, stride, offset, count, fn, arg) {
        var i, l;
        if(!stride) {
            stride = 3;
        }

        if(!offset) {
            offset = 0;
        }
        
        if(count) {
            l = Math.min((count * stride) + offset, a.length);
        } else {
            l = a.length;
        }

        for(i = offset; i < l; i += stride) {
            vec[0] = a[i]; vec[1] = a[i+1]; vec[2] = a[i+2];
            fn(vec, vec, arg);
            a[i] = vec[0]; a[i+1] = vec[1]; a[i+2] = vec[2];
        }
        
        return a;
    };
})();

/**
 * Returns a string representation of a vector
 *
 * @param {vec3} vec vector to represent as a string
 * @returns {String} string representation of the vector
 */
vec3.str = function (a) {
    return 'vec3(' + a[0] + ', ' + a[1] + ', ' + a[2] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.vec3 = vec3;
}
/* Copyright (c) 2013, Brandon Jones, Colin MacKenzie IV. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

  * Redistributions of source code must retain the above copyright notice, this
    list of conditions and the following disclaimer.
  * Redistributions in binary form must reproduce the above copyright notice,
    this list of conditions and the following disclaimer in the documentation 
    and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE 
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE. */

/**
 * @class 3x3 Matrix
 * @name mat3
 */
var mat3 = {};

/**
 * Creates a new identity mat3
 *
 * @returns {mat3} a new 3x3 matrix
 */
mat3.create = function() {
    var out = new GLMAT_ARRAY_TYPE(9);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return out;
};

/**
 * Copies the upper-left 3x3 values into the given mat3.
 *
 * @param {mat3} out the receiving 3x3 matrix
 * @param {mat4} a   the source 4x4 matrix
 * @returns {mat3} out
 */
mat3.fromMat4 = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[4];
    out[4] = a[5];
    out[5] = a[6];
    out[6] = a[8];
    out[7] = a[9];
    out[8] = a[10];
    return out;
};

/**
 * Creates a new mat3 initialized with values from an existing matrix
 *
 * @param {mat3} a matrix to clone
 * @returns {mat3} a new 3x3 matrix
 */
mat3.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(9);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    return out;
};

/**
 * Copy the values from one mat3 to another
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
mat3.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    return out;
};

/**
 * Set a mat3 to the identity matrix
 *
 * @param {mat3} out the receiving matrix
 * @returns {mat3} out
 */
mat3.identity = function(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    out[4] = 1;
    out[5] = 0;
    out[6] = 0;
    out[7] = 0;
    out[8] = 1;
    return out;
};

/**
 * Transpose the values of a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
mat3.transpose = function(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a01 = a[1], a02 = a[2], a12 = a[5];
        out[1] = a[3];
        out[2] = a[6];
        out[3] = a01;
        out[5] = a[7];
        out[6] = a02;
        out[7] = a12;
    } else {
        out[0] = a[0];
        out[1] = a[3];
        out[2] = a[6];
        out[3] = a[1];
        out[4] = a[4];
        out[5] = a[7];
        out[6] = a[2];
        out[7] = a[5];
        out[8] = a[8];
    }
    
    return out;
};

/**
 * Inverts a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
mat3.invert = function(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],

        b01 = a22 * a11 - a12 * a21,
        b11 = -a22 * a10 + a12 * a20,
        b21 = a21 * a10 - a11 * a20,

        // Calculate the determinant
        det = a00 * b01 + a01 * b11 + a02 * b21;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = b01 * det;
    out[1] = (-a22 * a01 + a02 * a21) * det;
    out[2] = (a12 * a01 - a02 * a11) * det;
    out[3] = b11 * det;
    out[4] = (a22 * a00 - a02 * a20) * det;
    out[5] = (-a12 * a00 + a02 * a10) * det;
    out[6] = b21 * det;
    out[7] = (-a21 * a00 + a01 * a20) * det;
    out[8] = (a11 * a00 - a01 * a10) * det;
    return out;
};

/**
 * Calculates the adjugate of a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the source matrix
 * @returns {mat3} out
 */
mat3.adjoint = function(out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8];

    out[0] = (a11 * a22 - a12 * a21);
    out[1] = (a02 * a21 - a01 * a22);
    out[2] = (a01 * a12 - a02 * a11);
    out[3] = (a12 * a20 - a10 * a22);
    out[4] = (a00 * a22 - a02 * a20);
    out[5] = (a02 * a10 - a00 * a12);
    out[6] = (a10 * a21 - a11 * a20);
    out[7] = (a01 * a20 - a00 * a21);
    out[8] = (a00 * a11 - a01 * a10);
    return out;
};

/**
 * Calculates the determinant of a mat3
 *
 * @param {mat3} a the source matrix
 * @returns {Number} determinant of a
 */
mat3.determinant = function (a) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8];

    return a00 * (a22 * a11 - a12 * a21) + a01 * (-a22 * a10 + a12 * a20) + a02 * (a21 * a10 - a11 * a20);
};

/**
 * Multiplies two mat3's
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the first operand
 * @param {mat3} b the second operand
 * @returns {mat3} out
 */
mat3.multiply = function (out, a, b) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],

        b00 = b[0], b01 = b[1], b02 = b[2],
        b10 = b[3], b11 = b[4], b12 = b[5],
        b20 = b[6], b21 = b[7], b22 = b[8];

    out[0] = b00 * a00 + b01 * a10 + b02 * a20;
    out[1] = b00 * a01 + b01 * a11 + b02 * a21;
    out[2] = b00 * a02 + b01 * a12 + b02 * a22;

    out[3] = b10 * a00 + b11 * a10 + b12 * a20;
    out[4] = b10 * a01 + b11 * a11 + b12 * a21;
    out[5] = b10 * a02 + b11 * a12 + b12 * a22;

    out[6] = b20 * a00 + b21 * a10 + b22 * a20;
    out[7] = b20 * a01 + b21 * a11 + b22 * a21;
    out[8] = b20 * a02 + b21 * a12 + b22 * a22;
    return out;
};

/**
 * Alias for {@link mat3.multiply}
 * @function
 */
mat3.mul = mat3.multiply;

/**
 * Translate a mat3 by the given vector
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to translate
 * @param {vec2} v vector to translate by
 * @returns {mat3} out
 */
mat3.translate = function(out, a, v) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],
        x = v[0], y = v[1];

    out[0] = a00;
    out[1] = a01;
    out[2] = a02;

    out[3] = a10;
    out[4] = a11;
    out[5] = a12;

    out[6] = x * a00 + y * a10 + a20;
    out[7] = x * a01 + y * a11 + a21;
    out[8] = x * a02 + y * a12 + a22;
    return out;
};

/**
 * Rotates a mat3 by the given angle
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat3} out
 */
mat3.rotate = function (out, a, rad) {
    var a00 = a[0], a01 = a[1], a02 = a[2],
        a10 = a[3], a11 = a[4], a12 = a[5],
        a20 = a[6], a21 = a[7], a22 = a[8],

        s = Math.sin(rad),
        c = Math.cos(rad);

    out[0] = c * a00 + s * a10;
    out[1] = c * a01 + s * a11;
    out[2] = c * a02 + s * a12;

    out[3] = c * a10 - s * a00;
    out[4] = c * a11 - s * a01;
    out[5] = c * a12 - s * a02;

    out[6] = a20;
    out[7] = a21;
    out[8] = a22;
    return out;
};

/**
 * Scales the mat3 by the dimensions in the given vec2
 *
 * @param {mat3} out the receiving matrix
 * @param {mat3} a the matrix to rotate
 * @param {vec2} v the vec2 to scale the matrix by
 * @returns {mat3} out
 **/
mat3.scale = function(out, a, v) {
    var x = v[0], y = v[1];

    out[0] = x * a[0];
    out[1] = x * a[1];
    out[2] = x * a[2];

    out[3] = y * a[3];
    out[4] = y * a[4];
    out[5] = y * a[5];

    out[6] = a[6];
    out[7] = a[7];
    out[8] = a[8];
    return out;
};

/**
 * Copies the values from a mat2d into a mat3
 *
 * @param {mat3} out the receiving matrix
 * @param {mat2d} a the matrix to copy
 * @returns {mat3} out
 **/
mat3.fromMat2d = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = 0;

    out[3] = a[2];
    out[4] = a[3];
    out[5] = 0;

    out[6] = a[4];
    out[7] = a[5];
    out[8] = 1;
    return out;
};

/**
* Calculates a 3x3 matrix from the given quaternion
*
* @param {mat3} out mat3 receiving operation result
* @param {quat} q Quaternion to create matrix from
*
* @returns {mat3} out
*/
mat3.fromQuat = function (out, q) {
    var x = q[0], y = q[1], z = q[2], w = q[3],
        x2 = x + x,
        y2 = y + y,
        z2 = z + z,

        xx = x * x2,
        yx = y * x2,
        yy = y * y2,
        zx = z * x2,
        zy = z * y2,
        zz = z * z2,
        wx = w * x2,
        wy = w * y2,
        wz = w * z2;

    out[0] = 1 - yy - zz;
    out[3] = yx - wz;
    out[6] = zx + wy;

    out[1] = yx + wz;
    out[4] = 1 - xx - zz;
    out[7] = zy - wx;

    out[2] = zx - wy;
    out[5] = zy + wx;
    out[8] = 1 - xx - yy;

    return out;
};

/**
* Calculates a 3x3 normal matrix (transpose inverse) from the 4x4 matrix
*
* @param {mat3} out mat3 receiving operation result
* @param {mat4} a Mat4 to derive the normal matrix from
*
* @returns {mat3} out
*/
mat3.normalFromMat4 = function (out, a) {
    var a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3],
        a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
        a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11],
        a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15],

        b00 = a00 * a11 - a01 * a10,
        b01 = a00 * a12 - a02 * a10,
        b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11,
        b04 = a01 * a13 - a03 * a11,
        b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30,
        b07 = a20 * a32 - a22 * a30,
        b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31,
        b10 = a21 * a33 - a23 * a31,
        b11 = a22 * a33 - a23 * a32,

        // Calculate the determinant
        det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) { 
        return null; 
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[2] = (a10 * b10 - a11 * b08 + a13 * b06) * det;

    out[3] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[4] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[5] = (a01 * b08 - a00 * b10 - a03 * b06) * det;

    out[6] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[7] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[8] = (a30 * b04 - a31 * b02 + a33 * b00) * det;

    return out;
};

/**
 * Returns a string representation of a mat3
 *
 * @param {mat3} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
mat3.str = function (a) {
    return 'mat3(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + 
                    a[3] + ', ' + a[4] + ', ' + a[5] + ', ' + 
                    a[6] + ', ' + a[7] + ', ' + a[8] + ')';
};

/**
 * Returns Frobenius norm of a mat3
 *
 * @param {mat3} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */
mat3.frob = function (a) {
    return(Math.sqrt(Math.pow(a[0], 2) + Math.pow(a[1], 2) + Math.pow(a[2], 2) + Math.pow(a[3], 2) + Math.pow(a[4], 2) + Math.pow(a[5], 2) + Math.pow(a[6], 2) + Math.pow(a[7], 2) + Math.pow(a[8], 2)))
};


if(typeof(exports) !== 'undefined') {
    exports.mat3 = mat3;
}

module.exports = {
  mat4: mat4,
  mat3: mat3,
  vec3: vec3
}

},{}],15:[function(require,module,exports){
module.exports = {
  hsl2rgb: function(h, s, l) {

    var r, g, b, m, c, x

    if (!isFinite(h)) h = 0
    if (!isFinite(s)) s = 0
    if (!isFinite(l)) l = 0

    h /= 60
    if (h < 0) h = 6 - (-h % 6)
    h %= 6

    s = Math.max(0, Math.min(1, s / 100))
    l = Math.max(0, Math.min(1, l / 100))

    c = (1 - Math.abs((2 * l) - 1)) * s
    x = c * (1 - Math.abs((h % 2) - 1))

    if (h < 1) {
        r = c
        g = x
        b = 0
    } else if (h < 2) {
        r = x
        g = c
        b = 0
    } else if (h < 3) {
        r = 0
        g = c
        b = x
    } else if (h < 4) {
        r = 0
        g = x
        b = c
    } else if (h < 5) {
        r = x
        g = 0
        b = c
    } else {
        r = c
        g = 0
        b = x
    }

    m = l - c / 2
    r = Math.round((r + m) * 255)
    g = Math.round((g + m) * 255)
    b = Math.round((b + m) * 255)

    return { r: r, g: g, b: b }

  }
}

},{}],16:[function(require,module,exports){
var glMatrix = require('./lib/glMatrixSubset'),
    Context  = require('./Context'),
    canvas   = Context.canvas,
    gl       = Context.gl,
    Renderer = require('./Renderer.js'),
    Loader   = require('./lib/Loader'),
    City     = require('./generators/City.js'),
    Stats    = require('stats-js'),
    mainScene = require('./scenes/MainScene.js');

var stats = new Stats();
stats.setMode(0);

stats.domElement.style.position = 'absolute';
stats.domElement.style.right = '1rem';
stats.domElement.style.top = '1rem';

canvas.parentNode.appendChild(stats.domElement);

var loadingStatus = 0;
var t0 = NaN;

Loader.subscribe('Blocks', function() {
  console.log('Loading complete');
  loadingStatus = 1;
  t0 = NaN;
  sceneLoop();
});

function loadingLoop() {
  if(loadingStatus === 0)
    requestAnimationFrame(loadingLoop);
  Loader.render();
}


function sceneLoop(ts) {

  if(isNaN(sceneLoop.t0))
    sceneLoop.t0 = ts;

  stats.begin();
  Renderer.render(mainScene);
  mainScene.update(ts - sceneLoop.t0);
  stats.end();

  requestAnimationFrame(sceneLoop);
}
gl.viewport(0, 0, Context.w, Context.h);

loadingLoop();


},{"./Context":1,"./Renderer.js":2,"./generators/City.js":5,"./lib/Loader":9,"./lib/glMatrixSubset":14,"./scenes/MainScene.js":20,"stats-js":19}],17:[function(require,module,exports){
'use strict';

module.exports = earcut;

function earcut(points, returnIndices) {

    var outerNode = filterPoints(linkedList(points[0], true)),
        triangles = returnIndices ? {vertices: [], indices: []} : [];

    if (!outerNode) return triangles;

    var node, minX, minY, maxX, maxY, x, y, size, i,
        threshold = 80;

    for (i = 0; threshold >= 0 && i < points.length; i++) threshold -= points[i].length;

    // if the shape is not too simple, we'll use z-order curve hash later; calculate polygon bbox
    if (threshold < 0) {
        node = outerNode.next;
        minX = maxX = node.p[0];
        minY = maxY = node.p[1];
        do {
            x = node.p[0];
            y = node.p[1];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            node = node.next;
        } while (node !== outerNode);

        // minX, minY and size are later used to transform coords into integers for z-order calculation
        size = Math.max(maxX - minX, maxY - minY);
    }

    if (points.length > 1) outerNode = eliminateHoles(points, outerNode);

    earcutLinked(outerNode, triangles, minX, minY, size);

    return triangles;
}

// create a circular doubly linked list from polygon points in the specified winding order
function linkedList(points, clockwise) {
    var sum = 0,
        len = points.length,
        i, j, p1, p2, last;

    // calculate original winding order of a polygon ring
    for (i = 0, j = len - 1; i < len; j = i++) {
        p1 = points[i];
        p2 = points[j];
        sum += (p2[0] - p1[0]) * (p1[1] + p2[1]);
    }

    // link points into circular doubly-linked list in the specified winding order
    if (clockwise === (sum > 0)) {
        for (i = 0; i < len; i++) last = insertNode(points[i], last);
    } else {
        for (i = len - 1; i >= 0; i--) last = insertNode(points[i], last);
    }

    return last;
}

// eliminate colinear or duplicate points
function filterPoints(start, end) {
    if (!end) end = start;

    var node = start,
        again;
    do {
        again = false;

        if (equals(node.p, node.next.p) || orient(node.prev.p, node.p, node.next.p) === 0) {

            // remove node
            node.prev.next = node.next;
            node.next.prev = node.prev;

            if (node.prevZ) node.prevZ.nextZ = node.nextZ;
            if (node.nextZ) node.nextZ.prevZ = node.prevZ;

            node = end = node.prev;

            if (node === node.next) return null;
            again = true;

        } else {
            node = node.next;
        }
    } while (again || node !== end);

    return end;
}

// main ear slicing loop which triangulates a polygon (given as a linked list)
function earcutLinked(ear, triangles, minX, minY, size, pass) {
    if (!ear) return;

    var indexed = triangles.vertices !== undefined;

    // interlink polygon nodes in z-order
    if (!pass && minX !== undefined) indexCurve(ear, minX, minY, size);

    var stop = ear,
        prev, next;

    // iterate through ears, slicing them one by one
    while (ear.prev !== ear.next) {
        prev = ear.prev;
        next = ear.next;

        if (isEar(ear, minX, minY, size)) {
            // cut off the triangle
            if (indexed) {
                addIndexedVertex(triangles, prev);
                addIndexedVertex(triangles, ear);
                addIndexedVertex(triangles, next);
            } else {
                triangles.push(prev.p);
                triangles.push(ear.p);
                triangles.push(next.p);
            }

            // remove ear node
            next.prev = prev;
            prev.next = next;

            if (ear.prevZ) ear.prevZ.nextZ = ear.nextZ;
            if (ear.nextZ) ear.nextZ.prevZ = ear.prevZ;

            // skipping the next vertice leads to less sliver triangles
            ear = next.next;
            stop = next.next;

            continue;
        }

        ear = next;

        // if we looped through the whole remaining polygon and can't find any more ears
        if (ear === stop) {
            // try filtering points and slicing again
            if (!pass) {
                earcutLinked(filterPoints(ear), triangles, minX, minY, size, 1);

            // if this didn't work, try curing all small self-intersections locally
            } else if (pass === 1) {
                ear = cureLocalIntersections(ear, triangles);
                earcutLinked(ear, triangles, minX, minY, size, 2);

            // as a last resort, try splitting the remaining polygon into two
            } else if (pass === 2) {
                splitEarcut(ear, triangles, minX, minY, size);
            }

            break;
        }
    }
}

function addIndexedVertex(triangles, node) {
    if (node.source) node = node.source;

    var i = node.index;
    if (i === null) {
        var dim = node.p.length;
        var vertices = triangles.vertices;
        node.index = i = vertices.length / dim;

        for (var d = 0; d < dim; d++) vertices.push(node.p[d]);
    }
    triangles.indices.push(i);
}

// check whether a polygon node forms a valid ear with adjacent nodes
function isEar(ear, minX, minY, size) {

    var a = ear.prev.p,
        b = ear.p,
        c = ear.next.p,

        ax = a[0], bx = b[0], cx = c[0],
        ay = a[1], by = b[1], cy = c[1],

        abd = ax * by - ay * bx,
        acd = ax * cy - ay * cx,
        cbd = cx * by - cy * bx,
        A = abd - acd - cbd;

    if (A <= 0) return false; // reflex, can't be an ear

    // now make sure we don't have other points inside the potential ear;
    // the code below is a bit verbose and repetitive but this is done for performance

    var cay = cy - ay,
        acx = ax - cx,
        aby = ay - by,
        bax = bx - ax,
        p, px, py, s, t, k, node;

    // if we use z-order curve hashing, iterate through the curve
    if (minX !== undefined) {

        // triangle bbox; min & max are calculated like this for speed
        var minTX = ax < bx ? (ax < cx ? ax : cx) : (bx < cx ? bx : cx),
            minTY = ay < by ? (ay < cy ? ay : cy) : (by < cy ? by : cy),
            maxTX = ax > bx ? (ax > cx ? ax : cx) : (bx > cx ? bx : cx),
            maxTY = ay > by ? (ay > cy ? ay : cy) : (by > cy ? by : cy),

            // z-order range for the current triangle bbox;
            minZ = zOrder(minTX, minTY, minX, minY, size),
            maxZ = zOrder(maxTX, maxTY, minX, minY, size);

        // first look for points inside the triangle in increasing z-order
        node = ear.nextZ;

        while (node && node.z <= maxZ) {
            p = node.p;
            node = node.nextZ;
            if (p === a || p === c) continue;

            px = p[0];
            py = p[1];

            s = cay * px + acx * py - acd;
            if (s >= 0) {
                t = aby * px + bax * py + abd;
                if (t >= 0) {
                    k = A - s - t;
                    if ((k >= 0) && ((s && t) || (s && k) || (t && k))) return false;
                }
            }
        }

        // then look for points in decreasing z-order
        node = ear.prevZ;

        while (node && node.z >= minZ) {
            p = node.p;
            node = node.prevZ;
            if (p === a || p === c) continue;

            px = p[0];
            py = p[1];

            s = cay * px + acx * py - acd;
            if (s >= 0) {
                t = aby * px + bax * py + abd;
                if (t >= 0) {
                    k = A - s - t;
                    if ((k >= 0) && ((s && t) || (s && k) || (t && k))) return false;
                }
            }
        }

    // if we don't use z-order curve hash, simply iterate through all other points
    } else {
        node = ear.next.next;

        while (node !== ear.prev) {
            p = node.p;
            node = node.next;

            px = p[0];
            py = p[1];

            s = cay * px + acx * py - acd;
            if (s >= 0) {
                t = aby * px + bax * py + abd;
                if (t >= 0) {
                    k = A - s - t;
                    if ((k >= 0) && ((s && t) || (s && k) || (t && k))) return false;
                }
            }
        }
    }

    return true;
}

// go through all polygon nodes and cure small local self-intersections
function cureLocalIntersections(start, triangles) {
    var indexed = !!triangles.vertices;

    var node = start;
    do {
        var a = node.prev,
            b = node.next.next;

        // a self-intersection where edge (v[i-1],v[i]) intersects (v[i+1],v[i+2])
        if (a.p !== b.p && intersects(a.p, node.p, node.next.p, b.p) && locallyInside(a, b) && locallyInside(b, a)) {

            if (indexed) {
                addIndexedVertex(triangles, a);
                addIndexedVertex(triangles, node);
                addIndexedVertex(triangles, b);
            } else {
                triangles.push(a.p);
                triangles.push(node.p);
                triangles.push(b.p);
            }

            // remove two nodes involved
            a.next = b;
            b.prev = a;

            var az = node.prevZ,
                bz = node.nextZ && node.nextZ.nextZ;

            if (az) az.nextZ = bz;
            if (bz) bz.prevZ = az;

            node = start = b;
        }
        node = node.next;
    } while (node !== start);

    return node;
}

// try splitting polygon into two and triangulate them independently
function splitEarcut(start, triangles, minX, minY, size) {
    // look for a valid diagonal that divides the polygon into two
    var a = start;
    do {
        var b = a.next.next;
        while (b !== a.prev) {
            if (a.p !== b.p && isValidDiagonal(a, b)) {
                // split the polygon in two by the diagonal
                var c = splitPolygon(a, b);

                // filter colinear points around the cuts
                a = filterPoints(a, a.next);
                c = filterPoints(c, c.next);

                // run earcut on each half
                earcutLinked(a, triangles, minX, minY, size);
                earcutLinked(c, triangles, minX, minY, size);
                return;
            }
            b = b.next;
        }
        a = a.next;
    } while (a !== start);
}

// link every hole into the outer loop, producing a single-ring polygon without holes
function eliminateHoles(points, outerNode) {
    var len = points.length;

    var queue = [];
    for (var i = 1; i < len; i++) {
        var list = filterPoints(linkedList(points[i], false));
        if (list) queue.push(getLeftmost(list));
    }
    queue.sort(compareX);

    // process holes from left to right
    for (i = 0; i < queue.length; i++) {
        eliminateHole(queue[i], outerNode);
        outerNode = filterPoints(outerNode, outerNode.next);
    }

    return outerNode;
}

// find a bridge between vertices that connects hole with an outer ring and and link it
function eliminateHole(holeNode, outerNode) {
    outerNode = findHoleBridge(holeNode, outerNode);
    if (outerNode) {
        var b = splitPolygon(outerNode, holeNode);
        filterPoints(b, b.next);
    }
}

// David Eberly's algorithm for finding a bridge between hole and outer polygon
function findHoleBridge(holeNode, outerNode) {
    var node = outerNode,
        p = holeNode.p,
        px = p[0],
        py = p[1],
        qMax = -Infinity,
        mNode, a, b;

    // find a segment intersected by a ray from the hole's leftmost point to the left;
    // segment's endpoint with lesser x will be potential connection point
    do {
        a = node.p;
        b = node.next.p;

        if (py <= a[1] && py >= b[1]) {
            var qx = a[0] + (py - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
            if (qx <= px && qx > qMax) {
                qMax = qx;
                mNode = a[0] < b[0] ? node : node.next;
            }
        }
        node = node.next;
    } while (node !== outerNode);

    if (!mNode) return null;

    // look for points strictly inside the triangle of hole point, segment intersection and endpoint;
    // if there are no points found, we have a valid connection;
    // otherwise choose the point of the minimum angle with the ray as connection point

    var bx = mNode.p[0],
        by = mNode.p[1],
        pbd = px * by - py * bx,
        pcd = px * py - py * qMax,
        cpy = py - py,
        pcx = px - qMax,
        pby = py - by,
        bpx = bx - px,
        A = pbd - pcd - (qMax * by - py * bx),
        sign = A <= 0 ? -1 : 1,
        stop = mNode,
        tanMin = Infinity,
        mx, my, amx, s, t, tan;

    node = mNode.next;

    while (node !== stop) {

        mx = node.p[0];
        my = node.p[1];
        amx = px - mx;

        if (amx >= 0 && mx >= bx) {
            s = (cpy * mx + pcx * my - pcd) * sign;
            if (s >= 0) {
                t = (pby * mx + bpx * my + pbd) * sign;

                if (t >= 0 && A * sign - s - t >= 0) {
                    tan = Math.abs(py - my) / amx; // tangential
                    if (tan < tanMin && locallyInside(node, holeNode)) {
                        mNode = node;
                        tanMin = tan;
                    }
                }
            }
        }

        node = node.next;
    }

    return mNode;
}

// interlink polygon nodes in z-order
function indexCurve(start, minX, minY, size) {
    var node = start;

    do {
        if (node.z === null) node.z = zOrder(node.p[0], node.p[1], minX, minY, size);
        node.prevZ = node.prev;
        node.nextZ = node.next;
        node = node.next;
    } while (node !== start);

    node.prevZ.nextZ = null;
    node.prevZ = null;

    sortLinked(node);
}

// Simon Tatham's linked list merge sort algorithm
// http://www.chiark.greenend.org.uk/~sgtatham/algorithms/listsort.html
function sortLinked(list) {
    var i, p, q, e, tail, numMerges, pSize, qSize,
        inSize = 1;

    while (true) {
        p = list;
        list = null;
        tail = null;
        numMerges = 0;

        while (p) {
            numMerges++;
            q = p;
            pSize = 0;
            for (i = 0; i < inSize; i++) {
                pSize++;
                q = q.nextZ;
                if (!q) break;
            }

            qSize = inSize;

            while (pSize > 0 || (qSize > 0 && q)) {

                if (pSize === 0) {
                    e = q;
                    q = q.nextZ;
                    qSize--;
                } else if (qSize === 0 || !q) {
                    e = p;
                    p = p.nextZ;
                    pSize--;
                } else if (p.z <= q.z) {
                    e = p;
                    p = p.nextZ;
                    pSize--;
                } else {
                    e = q;
                    q = q.nextZ;
                    qSize--;
                }

                if (tail) tail.nextZ = e;
                else list = e;

                e.prevZ = tail;
                tail = e;
            }

            p = q;
        }

        tail.nextZ = null;

        if (numMerges <= 1) return list;

        inSize *= 2;
    }
}

// z-order of a point given coords and size of the data bounding box
function zOrder(x, y, minX, minY, size) {
    // coords are transformed into (0..1000) integer range
    x = 1000 * (x - minX) / size;
    x = (x | (x << 8)) & 0x00FF00FF;
    x = (x | (x << 4)) & 0x0F0F0F0F;
    x = (x | (x << 2)) & 0x33333333;
    x = (x | (x << 1)) & 0x55555555;

    y = 1000 * (y - minY) / size;
    y = (y | (y << 8)) & 0x00FF00FF;
    y = (y | (y << 4)) & 0x0F0F0F0F;
    y = (y | (y << 2)) & 0x33333333;
    y = (y | (y << 1)) & 0x55555555;

    return x | (y << 1);
}

// find the leftmost node of a polygon ring
function getLeftmost(start) {
    var node = start,
        leftmost = start;
    do {
        if (node.p[0] < leftmost.p[0]) leftmost = node;
        node = node.next;
    } while (node !== start);

    return leftmost;
}

// check if a diagonal between two polygon nodes is valid (lies in polygon interior)
function isValidDiagonal(a, b) {
    return !intersectsPolygon(a, a.p, b.p) &&
           locallyInside(a, b) && locallyInside(b, a) &&
           middleInside(a, a.p, b.p);
}

// winding order of triangle formed by 3 given points
function orient(p, q, r) {
    var o = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
    return o > 0 ? 1 :
           o < 0 ? -1 : 0;
}

// check if two points are equal
function equals(p1, p2) {
    return p1[0] === p2[0] && p1[1] === p2[1];
}

// check if two segments intersect
function intersects(p1, q1, p2, q2) {
    return orient(p1, q1, p2) !== orient(p1, q1, q2) &&
           orient(p2, q2, p1) !== orient(p2, q2, q1);
}

// check if a polygon diagonal intersects any polygon segments
function intersectsPolygon(start, a, b) {
    var node = start;
    do {
        var p1 = node.p,
            p2 = node.next.p;

        if (p1 !== a && p2 !== a && p1 !== b && p2 !== b && intersects(p1, p2, a, b)) return true;

        node = node.next;
    } while (node !== start);

    return false;
}

// check if a polygon diagonal is locally inside the polygon
function locallyInside(a, b) {
    return orient(a.prev.p, a.p, a.next.p) === -1 ?
        orient(a.p, b.p, a.next.p) !== -1 && orient(a.p, a.prev.p, b.p) !== -1 :
        orient(a.p, b.p, a.prev.p) === -1 || orient(a.p, a.next.p, b.p) === -1;
}

// check if the middle point of a polygon diagonal is inside the polygon
function middleInside(start, a, b) {
    var node = start,
        inside = false,
        px = (a[0] + b[0]) / 2,
        py = (a[1] + b[1]) / 2;
    do {
        var p1 = node.p,
            p2 = node.next.p;

        if (((p1[1] > py) !== (p2[1] > py)) &&
            (px < (p2[0] - p1[0]) * (py - p1[1]) / (p2[1] - p1[1]) + p1[0])) inside = !inside;

        node = node.next;
    } while (node !== start);

    return inside;
}

function compareX(a, b) {
    return a.p[0] - b.p[0];
}

// link two polygon vertices with a bridge; if the vertices belong to the same ring, it splits polygon into two;
// if one belongs to the outer ring and another to a hole, it merges it into a single ring
function splitPolygon(a, b) {
    var a2 = new Node(a.p),
        b2 = new Node(b.p),
        an = a.next,
        bp = b.prev;

    a2.source = a;
    b2.source = b;

    a.next = b;
    b.prev = a;

    a2.next = an;
    an.prev = a2;

    b2.next = a2;
    a2.prev = b2;

    bp.next = b2;
    b2.prev = bp;

    return b2;
}

// create a node and optionally link it with previous one (in a circular doubly linked list)
function insertNode(point, last) {
    var node = new Node(point);

    if (!last) {
        node.prev = node;
        node.next = node;

    } else {
        node.next = last.next;
        node.prev = last;
        last.next.prev = node;
        last.next = node;
    }
    return node;
}

function Node(p) {
    // vertex coordinates
    this.p = p;

    // previous and next vertice nodes in a polygon ring
    this.prev = null;
    this.next = null;

    // z-order curve value
    this.z = null;

    // previous and next nodes in z-order
    this.prevZ = null;
    this.nextZ = null;

    // used for indexed output
    this.source = null;
    this.index = null;
}

},{}],18:[function(require,module,exports){
(function (root, factory) {
    'use strict';

    if (typeof exports === 'object') {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root.MersenneTwister = factory();
    }
}(this, function () {
    /**
     * A standalone, pure JavaScript implementation of the Mersenne Twister pseudo random number generator. Compatible
     * with Node.js, requirejs and browser environments. Packages are available for npm, Jam and Bower.
     *
     * @module MersenneTwister
     * @author Raphael Pigulla <pigulla@four66.com>
     * @license See the attached LICENSE file.
     * @version 0.2.1
     */

    /*
     * Most comments were stripped from the source. If needed you can still find them in the original C code:
     * http://www.math.sci.hiroshima-u.ac.jp/~m-mat/MT/MT2002/CODES/mt19937ar.c
     *
     * The original port to JavaScript, on which this file is based, was done by Sean McCullough. It can be found at:
     * https://gist.github.com/banksean/300494
     */
    'use strict';

    var MAX_INT = 4294967296.0,
        N = 624,
        M = 397,
        UPPER_MASK = 0x80000000,
        LOWER_MASK = 0x7fffffff,
        MATRIX_A = 0x9908b0df;

    /**
     * Instantiates a new Mersenne Twister.
     *
     * @constructor
     * @alias module:MersenneTwister
     * @since 0.1.0
     * @param {number=} seed The initial seed value.
     */
    var MersenneTwister = function (seed) {
        if (typeof seed === 'undefined') {
            seed = new Date().getTime();
        }

        this.mt = new Array(N);
        this.mti = N + 1;

        this.seed(seed);
    };

    /**
     * Initializes the state vector by using one unsigned 32-bit integer "seed", which may be zero.
     *
     * @since 0.1.0
     * @param {number} seed The seed value.
     */
    MersenneTwister.prototype.seed = function (seed) {
        var s;

        this.mt[0] = seed >>> 0;

        for (this.mti = 1; this.mti < N; this.mti++) {
            s = this.mt[this.mti - 1] ^ (this.mt[this.mti - 1] >>> 30);
            this.mt[this.mti] =
                (((((s & 0xffff0000) >>> 16) * 1812433253) << 16) + (s & 0x0000ffff) * 1812433253) + this.mti;
            this.mt[this.mti] >>>= 0;
        }
    };

    /**
     * Initializes the state vector by using an array key[] of unsigned 32-bit integers of the specified length. If
     * length is smaller than 624, then each array of 32-bit integers gives distinct initial state vector. This is
     * useful if you want a larger seed space than 32-bit word.
     *
     * @since 0.1.0
     * @param {array} vector The seed vector.
     */
    MersenneTwister.prototype.seedArray = function (vector) {
        var i = 1,
            j = 0,
            k = N > vector.length ? N : vector.length,
            s;

        this.seed(19650218);

        for (; k > 0; k--) {
            s = this.mt[i-1] ^ (this.mt[i-1] >>> 30);

            this.mt[i] = (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1664525) << 16) + ((s & 0x0000ffff) * 1664525))) +
                vector[j] + j;
            this.mt[i] >>>= 0;
            i++;
            j++;
            if (i >= N) {
                this.mt[0] = this.mt[N - 1];
                i = 1;
            }
            if (j >= vector.length) {
                j = 0;
            }
        }

        for (k = N - 1; k; k--) {
            s = this.mt[i - 1] ^ (this.mt[i - 1] >>> 30);
            this.mt[i] =
                (this.mt[i] ^ (((((s & 0xffff0000) >>> 16) * 1566083941) << 16) + (s & 0x0000ffff) * 1566083941)) - i;
            this.mt[i] >>>= 0;
            i++;
            if (i >= N) {
                this.mt[0] = this.mt[N - 1];
                i = 1;
            }
        }

        this.mt[0] = 0x80000000;
    };

    /**
     * Generates a random unsigned 32-bit integer.
     *
     * @since 0.1.0
     * @returns {number}
     */
    MersenneTwister.prototype.int = function () {
        var y,
            kk,
            mag01 = new Array(0, MATRIX_A);

        if (this.mti >= N) {
            if (this.mti === N + 1) {
                this.seed(5489);
            }

            for (kk = 0; kk < N - M; kk++) {
                y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
                this.mt[kk] = this.mt[kk + M] ^ (y >>> 1) ^ mag01[y & 1];
            }

            for (; kk < N - 1; kk++) {
                y = (this.mt[kk] & UPPER_MASK) | (this.mt[kk + 1] & LOWER_MASK);
                this.mt[kk] = this.mt[kk + (M - N)] ^ (y >>> 1) ^ mag01[y & 1];
            }

            y = (this.mt[N - 1] & UPPER_MASK) | (this.mt[0] & LOWER_MASK);
            this.mt[N - 1] = this.mt[M - 1] ^ (y >>> 1) ^ mag01[y & 1];
            this.mti = 0;
        }

        y = this.mt[this.mti++];

        y ^= (y >>> 11);
        y ^= (y << 7) & 0x9d2c5680;
        y ^= (y << 15) & 0xefc60000;
        y ^= (y >>> 18);

        return y >>> 0;
    };

    /**
     * Generates a random unsigned 31-bit integer.
     *
     * @since 0.1.0
     * @returns {number}
     */
    MersenneTwister.prototype.int31 = function () {
        return this.int() >>> 1;
    };

    /**
     * Generates a random real in the interval [0;1] with 32-bit resolution.
     *
     * @since 0.1.0
     * @returns {number}
     */
    MersenneTwister.prototype.real = function () {
        return this.int() * (1.0 / (MAX_INT - 1));
    };

    /**
     * Generates a random real in the interval ]0;1[ with 32-bit resolution.
     *
     * @since 0.1.0
     * @returns {number}
     */
    MersenneTwister.prototype.realx = function () {
        return (this.int() + 0.5) * (1.0 / MAX_INT);
    };

    /**
     * Generates a random real in the interval [0;1[ with 32-bit resolution.
     *
     * @since 0.1.0
     * @returns {number}
     */
    MersenneTwister.prototype.rnd = function () {
        return this.int() * (1.0 / MAX_INT);
    };

    /**
     * Generates a random real in the interval [0;1[ with 32-bit resolution.
     *
     * Same as .rnd() method - for consistency with Math.random() interface.
     *
     * @since 0.2.0
     * @returns {number}
     */
    MersenneTwister.prototype.random = MersenneTwister.prototype.rnd;

    /**
     * Generates a random real in the interval [0;1[ with 53-bit resolution.
     *
     * @since 0.1.0
     * @returns {number}
     */
    MersenneTwister.prototype.rndHiRes = function () {
        var a = this.int() >>> 5,
            b = this.int() >>> 6;

        return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
    };

    var instance = new MersenneTwister();

    /**
     * A static version of [rnd]{@link module:MersenneTwister#rnd} on a randomly seeded instance.
     *
     * @static
     * @function random
     * @memberof module:MersenneTwister
     * @returns {number}
     */
    MersenneTwister.random = function () {
        return instance.rnd();
    };

    return MersenneTwister;
}));

},{}],19:[function(require,module,exports){
// stats.js - http://github.com/mrdoob/stats.js
var Stats=function(){var l=Date.now(),m=l,g=0,n=Infinity,o=0,h=0,p=Infinity,q=0,r=0,s=0,f=document.createElement("div");f.id="stats";f.addEventListener("mousedown",function(b){b.preventDefault();t(++s%2)},!1);f.style.cssText="width:80px;opacity:0.9;cursor:pointer";var a=document.createElement("div");a.id="fps";a.style.cssText="padding:0 0 3px 3px;text-align:left;background-color:#002";f.appendChild(a);var i=document.createElement("div");i.id="fpsText";i.style.cssText="color:#0ff;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px";
i.innerHTML="FPS";a.appendChild(i);var c=document.createElement("div");c.id="fpsGraph";c.style.cssText="position:relative;width:74px;height:30px;background-color:#0ff";for(a.appendChild(c);74>c.children.length;){var j=document.createElement("span");j.style.cssText="width:1px;height:30px;float:left;background-color:#113";c.appendChild(j)}var d=document.createElement("div");d.id="ms";d.style.cssText="padding:0 0 3px 3px;text-align:left;background-color:#020;display:none";f.appendChild(d);var k=document.createElement("div");
k.id="msText";k.style.cssText="color:#0f0;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px";k.innerHTML="MS";d.appendChild(k);var e=document.createElement("div");e.id="msGraph";e.style.cssText="position:relative;width:74px;height:30px;background-color:#0f0";for(d.appendChild(e);74>e.children.length;)j=document.createElement("span"),j.style.cssText="width:1px;height:30px;float:left;background-color:#131",e.appendChild(j);var t=function(b){s=b;switch(s){case 0:a.style.display=
"block";d.style.display="none";break;case 1:a.style.display="none",d.style.display="block"}};return{REVISION:12,domElement:f,setMode:t,begin:function(){l=Date.now()},end:function(){var b=Date.now();g=b-l;n=Math.min(n,g);o=Math.max(o,g);k.textContent=g+" MS ("+n+"-"+o+")";var a=Math.min(30,30-30*(g/200));e.appendChild(e.firstChild).style.height=a+"px";r++;b>m+1E3&&(h=Math.round(1E3*r/(b-m)),p=Math.min(p,h),q=Math.max(q,h),i.textContent=h+" FPS ("+p+"-"+q+")",a=Math.min(30,30-30*(h/100)),c.appendChild(c.firstChild).style.height=
a+"px",m=b,r=0);return b},update:function(){l=this.end()}}};"object"===typeof module&&(module.exports=Stats);

},{}],20:[function(require,module,exports){
var glMatrix = require('./../lib/glMatrixSubset'),
    Context  = require('./../Context'),
    Mesh     = require('./../lib/Mesh'),
    Geom     = require('./../lib/Geom'),
    QuadTree = require('./../lib/QuadTree'),
    Loader   = require('./../lib/Loader'),
    vec3     = glMatrix.vec3,
    mat4     = glMatrix.mat4,
    gl       = Context.gl,
    BuildingSHG = require('../generators/BuildingSHG.js'),
    City = require('../generators/City.js');

var computeBlockMesh = function(block, availColors) {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      lights   = [],
      count    = 0;

  for(var j = 0, n = block.lots.length; j < n; j++) {
    var lot, h, angle, cx, cy, xm, xM, ym, yM;
    lot = block.lots[j];
    h = lot.height, angle = lot.angle, lot = lot.poly;

    cx = cy = 0;
    xm = ym = Number.POSITIVE_INFINITY;
    xM = yM = Number.NEGATIVE_INFINITY;

    for(var k = 0, K = lot.length; k < K; k++) {
      var cur = lot[k];
      cx += cur.x;
      cy += cur.y;

      xm = Math.min(xm, cur.x);
      xM = Math.max(xM, cur.x);
      ym = Math.min(ym, cur.y);
      yM = Math.max(yM, cur.y);

    }
    
    cx /= lot.length;
    cy /= lot.length;

    var bldg = BuildingSHG.create({
      x: cx, y: cy,
      width: Math.abs(xM - xm) * .9,
      depth: Math.abs(yM - ym) * .9,
      angle: angle
    }), 
    bldgGeom = bldg.geom, 
    color = bldg.color;

    for(var l = 0, L = bldgGeom.length; l < L; l++) {

      var bg = bldgGeom[l]; //.shift();

      if(bg.sym === 'LIGHT')
        lights.push(bg.lightPos);
      else
        for(var k = 0, K = bg.vertices.length; k < K; k++) {
          vertices.push(bg.vertices[k]);
          normals.push(bg.normals[k]);
          uvs.push(bg.uvs[k]);
          extra.push(color[k % 3]);
        }

      bldgGeom[l] = null;
    }

  }

  return {
    mesh: new Mesh(vertices, normals, uvs, extra),
    lights: lights,
    x: block.x,
    y: block.y,
    w: block.w
  };
}

var city = new City(0),
    geom = {
      quadtree: null,
      quadtreeLights: null,
      fixedMeshes: []
    };

var log = document.createElement('pre');
log.style.background = 'white';
log.style.color = 'black';
log.style.position = 'absolute';
log.style.right = '1rem';
log.style.top = '7rem';

Context.canvas.parentElement.appendChild(log);

(function() {
  var vertices = [],
      normals  = [],
      uvs      = [],
      extra    = [],
      count = 0,
      block, blockq, lot, h, col,
      mI = 0,
      meshes = [],
      blocks = [],
      lights = [],
      qtree, qtreeL;

  var blocksProgress = 0, blocksCount = city.blocks.length;

  while(city.blocks.length) {
    block = city.blocks.shift();
    setTimeout(function() {
      var m = computeBlockMesh(this);
      blocks.push(m);
      blocksProgress++;
      Loader.progress('Blocks', blocksProgress / blocksCount);
    }.bind(block), 0);
  }

  Loader.subscribe('Blocks', (function(geom, blocks) { return function() {
    var xm, ym, xM, yM;
    xm = ym = Number.POSITIVE_INFINITY;
    xM = yM = Number.NEGATIVE_INFINITY;

    blocks.forEach(function(i) {
      xm = Math.min(xm, i.x - i.w);
      xM = Math.max(xM, i.x + i.w);
      ym = Math.min(ym, i.y - i.w);
      yM = Math.max(yM, i.y + i.w);
    });

    var qx = Math.abs(xM - xm) / 2,
        qy = Math.abs(yM - ym) / 2;

    qtree = new QuadTree(qx, qy, Math.max(qx, qy), 4);
    qtreeL = new QuadTree(qx, qy, Math.max(qx, qy), 8);

    blocks.forEach(function(i) {
      qtree.insert(i);
      /*i.lights.forEach(function(i) {
        qtreeL.insert({ x: i.x, y: i.z, l: i });
      });*/
    });

    geom.quadtree = qtree;
    geom.quadtreeLights = qtreeL;

    console.log(geom.quadtreeLights.query(6, 6, .25).length);

  }}(geom, blocks)));

  vertices.push.apply(vertices, [
    -20, -10e-4, -20,  -20, -10e-4, 20,  20, -10e-4, 20,
    -20, -10e-4, -20,   20, -10e-4, 20,  20, -10e-4, -20
  ]);

  normals.push.apply(normals, [
    0, 1, 0,  0, 1, 0,  0, 1, 0,
    0, 1, 0,  0, 1, 0,  0, 1, 0
  ]);
  uvs.push.apply(uvs, [
    0, 0, 3,  0, 40, 3,  40, 40, 3,  
    0, 0, 3,  40, 40, 3,  40, 0, 3
  ]);
  extra.push.apply(extra, [
    0, 0, 0,  0, 0, 0,  0, 0, 0,
    0, 0, 0,  0, 0, 0,  0, 0, 0
  ]);

  var roadQuads = city.roadQuads.reduce((function() { 
    var N, U;
    N = [
      0, -1, 0, 0, -1, 0, 0, -1, 0,
      0, -1, 0, 0, -1, 0, 0, -1, 0
    ];
    U = [
      0, 0, 2,  0, 1, 2,  1, 1, 2,  
      0, 0, 2,  1, 1, 2,  1, 0, 2
    ];
    return function(out, i) {
  
      var aa = i[0], bb = i[1],
          slope = Math.atan2(bb.y - aa.y, bb.x - aa.x) + Math.PI / 2,
          dx = Math.abs(.09 * Math.cos(slope)), 
          dy = Math.abs(.09 * Math.sin(slope)),
          //b = bb, a = aa,
          a = { x: aa.x + dy, y: aa.y + dx },
          b = { x: bb.x - dy, y: bb.y - dx },
          len = Math.sqrt( Math.pow(b.y - a.y, 2) + Math.pow(b.x - a.x, 2) );

      var vertices = [
        a.x - dx, 0, a.y - dy,  b.x - dx, 0, b.y - dy,  b.x + dx, 0, b.y + dy,
        a.x - dx, 0, a.y - dy,  b.x + dx, 0, b.y + dy,  a.x + dx, 0, a.y + dy
      ], uvs = U.map(function(i, idx) {
        switch(idx % 3) {
          case 0: return i; break;
          case 1: return i * len; break;
          default: return i;
        }
       return i;
      });

      for(var k = 0, K = vertices.length; k < K; k++) {
        out.vertices.push(vertices[k]);
        out.normals.push(N[k]);
        out.uvs.push(uvs[k]);
        out.extra.push(0);
      }

      return out;
    }
  }()), { vertices: [], normals: [], uvs: [], extra: [] });

  for(var k = 0, K = roadQuads.vertices.length; k < K; k++) {
    vertices.push(roadQuads.vertices[k]);
    normals.push(roadQuads.normals[k]);
    uvs.push(roadQuads.uvs[k]);
    extra.push(roadQuads.extra[k]);
  }

  geom.fixedMeshes = [new Mesh(vertices, normals, uvs, extra)];

}());

var scene = {
  meshes: [],
  lights: [],
  lightPos: vec3.create(),
  view:  mat4.create(),
  model: mat4.create(),
  count: 0
};

console.log(geom)

var t = 0., pushFn = function(o, i) { o.push(i); return o; },
    x = 6, y = .05, z = 6, alpha = 0, beta = 0,
    dx = 0, dz = 0;

var tlerp = function(start, end, ts) {
  return (ts - start) / (end - start);
}

var lerp = function(a, b, t) {
  return a * (1 - t) + b * t;
}

var polyEasing = function(x) { return x * x * x * (x * (6 * x - 15) + 10) };

var calcPositions = function(ts) {

  log.textContent = parseInt(ts);
  if(ts < 5000) {
    var t = polyEasing(tlerp(0, 5000, ts));
    y = lerp(20, .05, t);
  }

  if(ts >= 4000 && ts < 5000) {
    var t = polyEasing(tlerp(4000, 5000, ts));
    alpha = lerp(Math.PI / 2, 0, t);
    beta = lerp(0, Math.PI, t);
  }

  if(ts >= 4000 && ts < 20000) {
    var t = polyEasing(tlerp(4000, 20000, ts));
    x = lerp(6, 10, t);
  }

  if(ts >= 5000 && ts < 19500) {
    var t = polyEasing(tlerp(5000, 20000, ts));
    beta = lerp(Math.PI, Math.PI * 3/2, t);
  }

  if(ts >= 19500 && ts < 20500) {
    var t = polyEasing(tlerp(19500, 20500, ts));
    alpha = lerp(0, - Math.PI / 2, t);
  }

  if(ts >= 20000 && ts < 22500) {
    var t = polyEasing(tlerp(20000, 22500, ts));
    beta = lerp(Math.PI * 3 / 2, Math.PI, t);
    y = lerp(.05, 1.05, t);
    z = lerp(6, 0, t);
  }

  if(ts >= 20500 && ts < 22500) {
    var t = polyEasing(tlerp(20500, 22500, ts));
    alpha = lerp(- Math.PI / 2, 0, t);
  }

  if(ts >= 22500 && ts < 30000) {
    var t = polyEasing(tlerp(22500, 30000, ts));
    z = lerp(0, 14, t);
  }

  if(ts >= 30000) {
    var t = tlerp(30000, 40000, ts);
    z = 0;
    alpha = Math.PI / 8;
    x = lerp(12, 0, t);
  }

}

scene.update = function(timestamp) {

  //calcPositions(timestamp);
  //////////////////////////////////////////////////////////////////////////////
  x += (Math.cos(beta) * dx - Math.sin(beta) * dz) * Math.cos(alpha);
  y += Math.sin(alpha) * dz;
  z += (Math.sin(beta) * dx + Math.cos(beta) * dz) * Math.cos(alpha);

  log.textContent = [x,y,z].map(function(i) { return i.toFixed(2) }).join(', ') + ' ' +
    (Math.PI / alpha).toFixed(2) + ' ' + 
    (Math.PI / beta).toFixed(2);
  //////////////////////////////////////////////////////////////////////////////

  vec3.set(scene.lightPos, 6,.05, 6);
  mat4.identity(scene.view);

  mat4.rotateX(scene.view, scene.view, alpha);
  mat4.rotateY(scene.view, scene.view, beta);
  mat4.translate(scene.view, scene.view, [ -x, -y, -z ]);

  scene.meshes = geom.fixedMeshes.reduce(pushFn, []);

  scene.meshes = geom.quadtree
    .query(x, z, 4)
    .map(function(i) { return i.mesh })
    .reduce(pushFn, scene.meshes);

  log.textContent = scene.meshes.length;

  scene.lights = geom.quadtreeLights
    .query(x, z, .5)
    .map(function(i) { 
      return [ i.l.x, i.l.y, i.l.z ];
    });

  t += .001;

  //console.log(scene.meshes.reduce(function(o, i) { o += i.count; return o; }, 0));

}
// 87 65 83 68;

document.body.addEventListener('keydown', function(evt) {

  switch(evt.which) {
    case 87: dz = -.008; break;
    case 83: dz = .008; break;
    case 65: dx = -.008; break;
    case 68: dx = .008; break;
  }

});

document.body.addEventListener('keyup', function(evt) {

  switch(evt.which) {
    case 87: dz = 0; break;
    case 83: dz = 0; break;
    case 65: dx = 0; break;
    case 68: dx = 0; break;
  }

});

Context.canvas.addEventListener('mousedown', function(evt) {

  var onMove, onUp, x0 = evt.clientX, y0 = evt.clientY;

  onMove = function(evt) {
    var dx = evt.clientX - x0,
        dy = evt.clientY - y0;

    alpha += dy * .005;
    beta += dx * .005;

    x0 = evt.clientX;
    y0 = evt.clientY;

    log.textContent = [x,y,z].map(function(i) { return i.toFixed(2) }).join(', ') + ' ' +
      (Math.PI / alpha).toFixed(2) + ' ' + 
      (Math.PI / beta).toFixed(2);
    }

  onUp = function(evt) {
    Context.canvas.removeEventListener('mousemove', onMove);
    Context.canvas.removeEventListener('mouseup', onUp);
  }

  Context.canvas.addEventListener('mousemove', onMove);
  Context.canvas.addEventListener('mouseup', onUp);

});

module.exports = scene;

},{"../generators/BuildingSHG.js":4,"../generators/City.js":5,"./../Context":1,"./../lib/Geom":8,"./../lib/Loader":9,"./../lib/Mesh":10,"./../lib/QuadTree":11,"./../lib/glMatrixSubset":14}]},{},[16])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiQ29udGV4dC5qcyIsIlJlbmRlcmVyLmpzIiwiZ2VuZXJhdG9ycy9CbG9jay5qcyIsImdlbmVyYXRvcnMvQnVpbGRpbmdTSEcuanMiLCJnZW5lcmF0b3JzL0NpdHkuanMiLCJnZW5lcmF0b3JzL1BSTkcuanMiLCJnZW5lcmF0b3JzL1JvYWRzLmpzIiwibGliL0dlb20uanMiLCJsaWIvTG9hZGVyLmpzIiwibGliL01lc2guanMiLCJsaWIvUXVhZFRyZWUuanMiLCJsaWIvU0hBUEUuanMiLCJsaWIvU2hhcGVHcmFtbWFyLmpzIiwibGliL2dsTWF0cml4U3Vic2V0LmpzIiwibGliL3V0aWwuanMiLCJtYWluLmpzIiwibm9kZV9tb2R1bGVzL2VhcmN1dC9zcmMvZWFyY3V0LmpzIiwibm9kZV9tb2R1bGVzL21lcnNlbm5ldHdpc3Rlci9zcmMvTWVyc2VubmVUd2lzdGVyLmpzIiwibm9kZV9tb2R1bGVzL3N0YXRzLWpzL2J1aWxkL3N0YXRzLm1pbi5qcyIsInNjZW5lcy9NYWluU2NlbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDblFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNybkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzK0RBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcHJCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3ZhciBmPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIik7dGhyb3cgZi5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGZ9dmFyIGw9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGwuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sbCxsLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsInZhciBjYW52YXMgICA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCd0aGVzaXMtY2FudmFzJyksXG4gICAgZ2wgICAgICAgPSBjYW52YXMuZ2V0Q29udGV4dCgnd2ViZ2wnKSxcbiAgICBiY3IgICAgICA9IGNhbnZhcy5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKSxcbiAgICB3ICAgICAgICA9IGJjci53aWR0aCxcbiAgICBoICAgICAgICA9IGJjci5oZWlnaHQ7XG5cbmNhbnZhcy53aWR0aCAgPSB3O1xuY2FudmFzLmhlaWdodCA9IGg7XG5jYW52YXMuc3R5bGUuYmFja2dyb3VuZCA9ICdibGFjayc7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBjYW52YXM6IGNhbnZhcyxcbiAgZ2w6IGdsLFxuICB3OiB3LFxuICBoOiBoLFxuICBhc3BlY3RSYXRpbzogdyAvIGhcbn1cbiIsIlxuLy92YXIgZ2xzbGlmeSAgICAgPSByZXF1aXJlKCdnbHNsaWZ5Jyk7XG52YXIgVXRpbCAgICAgICAgPSByZXF1aXJlKCcuL2xpYi91dGlsLmpzJyksXG4gICAgZ2xNYXRyaXggICAgPSByZXF1aXJlKCcuL2xpYi9nbE1hdHJpeFN1YnNldCcpLFxuICAgIHZlYzMgICAgICAgID0gZ2xNYXRyaXgudmVjMyxcbiAgICBtYXQzICAgICAgICA9IGdsTWF0cml4Lm1hdDMsXG4gICAgbWF0NCAgICAgICAgPSBnbE1hdHJpeC5tYXQ0LFxuICAgIENvbnRleHQgICAgID0gcmVxdWlyZSgnLi9Db250ZXh0JyksXG4gICAgZ2wgICAgICAgICAgPSBDb250ZXh0LmdsLFxuICAgIEJ1aWxkaW5nU0hHID0gcmVxdWlyZSgnLi9nZW5lcmF0b3JzL0J1aWxkaW5nU0hHLmpzJyk7XG5cbnZhciBwcm9ncmFtUGFzcyAgPSBnbC5jcmVhdGVQcm9ncmFtKCksXG4gICAgcHJvZ3JhbUxpZ2h0ID0gZ2wuY3JlYXRlUHJvZ3JhbSgpLFxuICAgIHZzaFBhc3MgICAgICA9IGdsLmNyZWF0ZVNoYWRlcihnbC5WRVJURVhfU0hBREVSKSxcbiAgICBmc2hQYXNzICAgICAgPSBnbC5jcmVhdGVTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSKSxcbiAgICB2c2hMaWdodCAgICAgPSBnbC5jcmVhdGVTaGFkZXIoZ2wuVkVSVEVYX1NIQURFUiksXG4gICAgZnNoTGlnaHQgICAgID0gZ2wuY3JlYXRlU2hhZGVyKGdsLkZSQUdNRU5UX1NIQURFUiksXG4gICAgZXh0RHJhd2J1ZmZlcnMsIGV4dERlcHRoVGV4dHVyZSwgZXh0RmxvYXRMaW5lYXIsXG4gICAgdnNyY1Bhc3MsIHZzcmNMaWdodCwgZnNyY1Bhc3MsIGZzcmNMaWdodDtcblxudnNyY1Bhc3MgID0gXCJ1bmlmb3JtIG1hdDQgcHJvamVjdGlvbiwgdmlld21vZGVsO1xcbnVuaWZvcm0gbWF0MyBub3JtYWxNO1xcblxcbmF0dHJpYnV0ZSB2ZWMzIHZlcnRleCwgbm9ybWFsLCB1diwgZXh0cmE7XFxuXFxudmFyeWluZyB2ZWM0IHZQb3NpdGlvbiwgY2xpcFBvc2l0aW9uO1xcbnZhcnlpbmcgdmVjMyB0ZXhVViwgdk5vcm1hbCwgdkV4dHJhO1xcblxcbnZvaWQgbWFpbigpIHtcXG4gIFxcbiAgdmVjNCB2aWV3UG9zID0gdmlld21vZGVsICogdmVjNCh2ZXJ0ZXgsIDEuKTtcXG4gIGNsaXBQb3NpdGlvbiA9IGdsX1Bvc2l0aW9uID0gcHJvamVjdGlvbiAqIHZpZXdQb3M7XFxuXFxuICB2UG9zaXRpb24gPSB2aWV3UG9zO1xcbiAgdk5vcm1hbCA9IG5vcm1hbGl6ZShub3JtYWxNICogbm9ybWFsKTtcXG4gIHZFeHRyYSA9IGV4dHJhO1xcbiAgdGV4VVYgPSB1djtcXG5cXG59XFxuXFxuXCI7XG5mc3JjUGFzcyAgPSBcIiNleHRlbnNpb24gR0xfT0VTX3N0YW5kYXJkX2Rlcml2YXRpdmVzIDogcmVxdWlyZVxcbi8vI2V4dGVuc2lvbiBHTF9FWFRfZHJhd19idWZmZXJzIDogcmVxdWlyZVxcblxcbnByZWNpc2lvbiBoaWdocCBmbG9hdDtcXG5cXG52YXJ5aW5nIHZlYzQgdlBvc2l0aW9uLCBjbGlwUG9zaXRpb247XFxudmFyeWluZyB2ZWMzIHRleFVWLCB2Tm9ybWFsLCB2RXh0cmE7XFxuXFxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cXG4vLyBodHRwczovL2dpdGh1Yi5jb20vYXNoaW1hL3dlYmdsLW5vaXNlL2Jsb2IvbWFzdGVyL3NyYy9ub2lzZTJELmdsc2wgICAgICAgICAvL1xcbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXFxuXFxudmVjMyBtb2QyODkodmVjMyB4KSB7IHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7IH1cXG52ZWMyIG1vZDI4OSh2ZWMyIHgpIHsgcmV0dXJuIHggLSBmbG9vcih4ICogKDEuMCAvIDI4OS4wKSkgKiAyODkuMDsgfVxcbnZlYzMgcGVybXV0ZSh2ZWMzIHgpIHsgcmV0dXJuIG1vZDI4OSgoKHgqMzQuMCkrMS4wKSp4KTsgfVxcbmZsb2F0IHNub2lzZSh2ZWMyIHYpIHtcXG4gIGNvbnN0IHZlYzQgQyA9IHZlYzQoMC4yMTEzMjQ4NjU0MDUxODcsICAvLyAoMy4wLXNxcnQoMy4wKSkvNi4wXFxuICAgICAgICAgICAgICAgICAgICAgIDAuMzY2MDI1NDAzNzg0NDM5LCAgLy8gMC41KihzcXJ0KDMuMCktMS4wKVxcbiAgICAgICAgICAgICAgICAgICAgIC0wLjU3NzM1MDI2OTE4OTYyNiwgIC8vIC0xLjAgKyAyLjAgKiBDLnhcXG4gICAgICAgICAgICAgICAgICAgICAgMC4wMjQzOTAyNDM5MDI0MzkpOyAvLyAxLjAgLyA0MS4wXFxuICB2ZWMyIGkgID0gZmxvb3IodiArIGRvdCh2LCBDLnl5KSApO1xcbiAgdmVjMiB4MCA9IHYgLSAgIGkgKyBkb3QoaSwgQy54eCk7XFxuICB2ZWMyIGkxO1xcbiAgaTEgPSAoeDAueCA+IHgwLnkpID8gdmVjMigxLjAsIDAuMCkgOiB2ZWMyKDAuMCwgMS4wKTtcXG4gIHZlYzQgeDEyID0geDAueHl4eSArIEMueHh6ejtcXG4gIHgxMi54eSAtPSBpMTtcXG4gIGkgPSBtb2QyODkoaSk7XFxuICB2ZWMzIHAgPSBwZXJtdXRlKCBwZXJtdXRlKCBpLnkgKyB2ZWMzKDAuMCwgaTEueSwgMS4wICkpXFxuXFx0XFx0KyBpLnggKyB2ZWMzKDAuMCwgaTEueCwgMS4wICkpO1xcbiAgdmVjMyBtID0gbWF4KDAuNSAtIHZlYzMoZG90KHgwLHgwKSwgZG90KHgxMi54eSx4MTIueHkpLCBkb3QoeDEyLnp3LHgxMi56dykpLCAwLjApO1xcbiAgbSA9IG0qbSA7XFxuICBtID0gbSptIDtcXG4gIHZlYzMgeCA9IDIuMCAqIGZyYWN0KHAgKiBDLnd3dykgLSAxLjA7XFxuICB2ZWMzIGggPSBhYnMoeCkgLSAwLjU7XFxuICB2ZWMzIG94ID0gZmxvb3IoeCArIDAuNSk7XFxuICB2ZWMzIGEwID0geCAtIG94O1xcbiAgbSAqPSAxLjc5Mjg0MjkxNDAwMTU5IC0gMC44NTM3MzQ3MjA5NTMxNCAqICggYTAqYTAgKyBoKmggKTtcXG4gIHZlYzMgZztcXG4gIGcueCAgPSBhMC54ICAqIHgwLnggICsgaC54ICAqIHgwLnk7XFxuICBnLnl6ID0gYTAueXogKiB4MTIueHogKyBoLnl6ICogeDEyLnl3O1xcbiAgcmV0dXJuIDEzMC4wICogZG90KG0sIGcpO1xcbn1cXG5cXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xcbi8vIFByb2NlZHVyYWwgdGV4dHVyZXNcXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xcblxcbnZlYzMgYnVtcE1hcCh2ZWMzIGZ2ZXJ0LCB2ZWMzIGZub3JtLCBmbG9hdCBidW1wKSB7XFxuXFxuICB2ZWMzIGJVID0gZEZkeChidW1wKSAqIGNyb3NzKGZub3JtLCBub3JtYWxpemUoZEZkeShmdmVydCkpKSxcXG4gICAgICAgYlYgPSBkRmR5KGJ1bXApICogY3Jvc3Mobm9ybWFsaXplKGRGZHgoZnZlcnQpKSwgZm5vcm0pLFxcbiAgICAgICBiRCA9IGZub3JtICsgKGJVICsgYlYpICogLjU7XFxuXFxuICByZXR1cm4gbm9ybWFsaXplKGJEKTtcXG59XFxuXFxuc3RydWN0IFRUZXh0dXJlSW5mbyB7XFxuICB2ZWMzIGNvbG9yO1xcbiAgdmVjMyBub3JtYWw7XFxufTtcXG5cXG4jZGVmaW5lIHRleHR1cmVCcmlja0koeCwgcCwgbm90cCkgKChmbG9vcih4KSoocCkpK21heChmcmFjdCh4KS0obm90cCksIDAuMCkpXFxuVFRleHR1cmVJbmZvIHRleHR1cmVCcmljayh2ZWMzIGZ2ZXJ0LCB2ZWMzIGZub3JtLCBmbG9hdCBmZGVwdGgsIHZlYzIgdXYsIHZlYzMgYnJpY2tDb2xvcikge1xcblxcbiAgY29uc3QgZmxvYXQgYlcgID0gLjEyNSxcXG4gICAgICAgICAgICAgIGJIICA9IC4wNjI1LFxcbiAgICAgICAgICAgICAgbVMgID0gMS4gLyAxMjguLFxcbiAgICAgICAgICAgICAgbVdmID0gbVMgKiAuNSAvIGJXLFxcbiAgICAgICAgICAgICAgbUhmID0gbVMgKiAuNSAvIGJIO1xcbiAgY29uc3QgdmVjMyBtb3J0YXJDb2xvciA9IHZlYzMoLjksIC45LCAuOSk7XFxuXFxuICBmbG9hdCB1ID0gdXYucyAvIGJXLFxcbiAgICAgICAgdiA9IHV2LnQgLyBiSCxcXG4gICAgICAgIGJyVSA9IGZsb29yKHUpLFxcbiAgICAgICAgYnJWID0gZmxvb3Iodik7XFxuXFxuICBpZihtb2QodiAqIC41LCAxLikgPiAuNSlcXG4gICAgdSArPSAuNTtcXG4gIGJyVSA9IGZsb29yKHUpO1xcblxcbiAgZmxvYXQgbm9pc2V2ID0gMS4gK1xcbiAgICAgICAgICAgICAgICAgLy9zbm9pc2UodXYgKiAxNi4pICogLjA2MjUgK1xcbiAgICAgICAgICAgICAgICAgc25vaXNlKHV2ICogNjQuKSAqIC4xMjU7XFxuICBmbG9hdCBicmlja0RhbXAgPSAxLiArIC4xMjUgKiBzaW4oMS41NyAqIChiclUgKyAxLikpICogc2luKDIuICogKGJyViArIDEuKSk7XFxuXFxuICB2ZWMyIHV1diA9IHZlYzIodSwgdiksXFxuICAgICAgIGZ3ID0gMi4gKiB2ZWMyKGZ3aWR0aCh1dXYueCksIGZ3aWR0aCh1dXYueSkpLFxcbiAgICAgICBtb3J0YXJQY3QgPSB2ZWMyKG1XZiwgbUhmKSxcXG4gICAgICAgYnJpY2tQY3QgPSB2ZWMyKDEuLCAxLikgLSBtb3J0YXJQY3QsXFxuICAgICAgIHViID0gKHRleHR1cmVCcmlja0kodXV2ICsgZncsIGJyaWNrUGN0LCBtb3J0YXJQY3QpIC1cXG4gICAgICAgICAgICAgdGV4dHVyZUJyaWNrSSh1dXYsIGJyaWNrUGN0LCBtb3J0YXJQY3QpKSAvIGZ3O1xcblxcbiAgdmVjMyBjb2xvciA9IG1peChtb3J0YXJDb2xvciwgYnJpY2tDb2xvciAqIGJyaWNrRGFtcCwgdWIueCAqIHViLnkpO1xcblxcbiAgZmxvYXQgYnVtcCA9IG5vaXNldiAvIGZkZXB0aCArIDQuICogKCh1Yi54ICogdWIueSkgLSBkRmR4KHViLngpICogZEZkeSh1Yi55KSk7XFxuXFxuICByZXR1cm4gVFRleHR1cmVJbmZvKFxcbiAgICBjb2xvcixcXG4gICAgYnVtcE1hcChmdmVydCwgZm5vcm0sIGJ1bXApXFxuICApO1xcbn1cXG5cXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXFxcXFxcbiAqIFdpbmRvdyB0ZXh0dXJlXFxuXFxcXCoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cXG5cXG5UVGV4dHVyZUluZm8gdGV4dHVyZVdpbmRvdyh2ZWMzIGZ2ZXJ0LCB2ZWMzIGZub3JtLCBmbG9hdCBmZGVwdGgsIHZlYzIgdXYsIHZlYzMgd2luZG93Q29sb3IpIHtcXG5cXG4gIGNvbnN0IHZlYzIgcGF0dGVyblBjdCAgID0gdmVjMigxLiwgMS4pLFxcbiAgICAgICAgICAgICBwYXR0ZXJuU3RhcnQgPSB2ZWMyKDAuLCAwLiksIC8vKDEuIC0gcGF0dGVyblBjdCkgKiAuMjUsXFxuICAgICAgICAgICAgIHBhdHRlcm5FbmQgICA9IHBhdHRlcm5TdGFydCArIHBhdHRlcm5QY3QsXFxuICAgICAgICAgICAgIGZyYW1lUGN0ICAgICA9IHZlYzIoMS4gLyAzMi4sIDEuIC8gMzIuKSxcXG4gICAgICAgICAgICAgZnJhbWVTdGFydCAgID0gcGF0dGVyblN0YXJ0ICsgZnJhbWVQY3QsXFxuICAgICAgICAgICAgIGZyYW1lRW5kICAgICA9IHBhdHRlcm5FbmQgICAtIGZyYW1lUGN0O1xcbiAgLy9jb25zdCB2ZWMzIHdpbmRvd0NvbG9yICA9IHZlYzMoLjgsIC45NCwgLjk5KSxcXG4gIGNvbnN0IHZlYzMgZnJhbWVDb2xvciAgID0gdmVjMyguNSwgLjUsIC41KTtcXG5cXG4gIHZlYzIgZmsgICA9IGZ3aWR0aCh1dikgKiAyLixcXG4gICAgICAgdXV2ICA9IG1vZCh1diwgLjUgLSAxLiAvIDY0LiksXFxuICAgICAgIHBhdEYgPSAoc21vb3Roc3RlcChmcmFtZUVuZCwgZnJhbWVFbmQgKyBmaywgdXV2KSAtIHNtb290aHN0ZXAoZnJhbWVTdGFydCwgZnJhbWVTdGFydCArIGZrLCB1dXYpKTtcXG4gIGZsb2F0IG5vaXNlcCA9IDEuICsgXFxuICAgICAgICAgICAgICAgIHNub2lzZSgtdXYgKiAuNSkgKiAuMjU7XFxuICBmbG9hdCBub2lzZXYgPSAxLiArIFxcbiAgICAgICAgICAgICAgICAgc25vaXNlKHV2ICogMTYuKSAqIC4wNjI1ICtcXG4gICAgICAgICAgICAgICAgIGFicyhzbm9pc2UodXYgKiA1MTIuKSkgKiAuMDYyNTtcXG5cXG4gIHJldHVybiBUVGV4dHVyZUluZm8oXFxuICAgIG1peChmcmFtZUNvbG9yLCB3aW5kb3dDb2xvciAqIG5vaXNlcCwgcGF0Ri54ICogcGF0Ri55KSxcXG4gICAgYnVtcE1hcChmdmVydCwgZm5vcm0sIHBhdEYueCAqIHBhdEYueSlcXG4gICk7XFxufVxcblxcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcXFxcXFxuICogUm9hZCB0ZXh0dXJlXFxuXFxcXCoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cXG5cXG52ZWMzIHRleHR1cmVSb2FkKHZlYzIgdXV2KSB7XFxuICBjb25zdCBmbG9hdCBwYWRkaW5nID0gMS4gLyAzMi4sXFxuICAgICAgICAgICAgICB0YXBlVyAgID0gMS4gLyAzMi4sXFxuICAgICAgICAgICAgICB0YXBlTDAgID0gcGFkZGluZyxcXG4gICAgICAgICAgICAgIHRhcGVMMSAgPSBwYWRkaW5nICsgdGFwZVcsXFxuICAgICAgICAgICAgICB0YXBlUjEgID0gMS4gLSB0YXBlTDAsXFxuICAgICAgICAgICAgICB0YXBlUjAgID0gMS4gLSB0YXBlTDEsXFxuICAgICAgICAgICAgICB0YXBlQzAgID0gLjUgLSB0YXBlVyAqIC41LFxcbiAgICAgICAgICAgICAgdGFwZUMxICA9IC41ICsgdGFwZVcgKiAuNSxcXG4gICAgICAgICAgICAgIHZlcnREaXYgPSA0LjtcXG4gIGNvbnN0IHZlYzMgYXNwaGFsdENvbG9yID0gdmVjMyguMiwgLjIsIC4yKSxcXG4gICAgICAgICAgICAgc3RyaXBDb2xvciA9IHZlYzMoLjgsIC44LCAuOCk7XFxuXFxuICB2ZWMyIHV2ID0gdXV2ICsgdmVjMigwLCAuNSksIGZrID0gZndpZHRoKHV2KTtcXG4gIGZsb2F0IGNzU3BhY2luZyA9IG1vZCguMjUgKyB1di50ICogdmVydERpdiwgMS4pLFxcbiAgICAgICAgcSA9IFxcbiAgICAoXFxuICAgICAgc21vb3Roc3RlcCh0YXBlTDAsIHRhcGVMMCArIGZrLngsIHV2LnMpIC0gXFxuICAgICAgc21vb3Roc3RlcCh0YXBlTDEsIHRhcGVMMSArIGZrLngsIHV2LnMpXFxuICAgICkgK1xcbiAgICAoXFxuICAgICAgc21vb3Roc3RlcCh0YXBlUjAsIHRhcGVSMCArIGZrLngsIHV2LnMpIC0gXFxuICAgICAgc21vb3Roc3RlcCh0YXBlUjEsIHRhcGVSMSArIGZrLngsIHV2LnMpXFxuICAgICkgK1xcbiAgICAoXFxuICAgICAgc21vb3Roc3RlcCh0YXBlQzAsIHRhcGVDMCArIGZrLngsIHV2LnMpIC0gXFxuICAgICAgc21vb3Roc3RlcCh0YXBlQzEsIHRhcGVDMSArIGZrLngsIHV2LnMpXFxuICAgICkgKiBcXG4gICAgKFxcbiAgICAgIHNtb290aHN0ZXAoLjUgLSBmay55LCAuNSArIGZrLnksIGNzU3BhY2luZykgKlxcbiAgICAgICgxLiAtIHNtb290aHN0ZXAoMS4gLSAyLiAqIGZrLnksIDEuLCBjc1NwYWNpbmcpKVxcbiAgICApXFxuICAgIDtcXG5cXG4gIGZsb2F0IG5vaXNlQSA9IDEuICtcXG4gICAgICAgICAgICAgICAgIGFicyhzbm9pc2UodXYgKiAxNi4pKSAgKiAuMDYyNSArXFxuICAgICAgICAgICAgICAgICBhYnMoc25vaXNlKHV2ICogMzIuKSkgICogLjA2MjUgK1xcbiAgICAgICAgICAgICAgICAgYWJzKHNub2lzZSh1diAqIDEyOC4pKSAqIC4xMjUsXFxuICAgICAgICBub2lzZVMgPSAxLiArIFxcbiAgICAgICAgICAgICAgICAgYWJzKHNub2lzZSh1diAqIDEyOC4pKSAqIC4xMjU7XFxuXFxuICByZXR1cm4gbWl4KGFzcGhhbHRDb2xvciAqIG5vaXNlQSwgc3RyaXBDb2xvciAqIG5vaXNlUywgcSk7XFxufVxcblxcbnZlYzMgdGV4dHVyZUFzcGhhbHQodmVjMiB1dXYpIHtcXG4gIGNvbnN0IHZlYzMgYXNwaGFsdENvbG9yID0gdmVjMyguMiwgLjIsIC4yKTtcXG5cXG4gIHZlYzIgdXYgPSB1dXYgKyB2ZWMyKDAsIC41KTtcXG4gIGZsb2F0IG5vaXNlQSA9IDEuICtcXG4gICAgICAgICAgICAgICAgIGFicyhzbm9pc2UodXYgKiAxNi4pKSAgKiAuMDYyNSArXFxuICAgICAgICAgICAgICAgICBhYnMoc25vaXNlKHV2ICogMzIuKSkgICogLjA2MjUgK1xcbiAgICAgICAgICAgICAgICAgYWJzKHNub2lzZSh1diAqIDEyOC4pKSAqIC4xMjU7XFxuICByZXR1cm4gYXNwaGFsdENvbG9yICogMS41ICogbm9pc2VBO1xcbn1cXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xcblxcbmZsb2F0IHBhY2tDb2xvcih2ZWMzIHYpIHtcXG4gIGNvbnN0IGZsb2F0IHUgPSAyNTUuIC8gMjU2LjtcXG5cXG4gIHJldHVybiBmcmFjdCh2LnggKiB1KSArIGZsb29yKHYueSAqIHUgKiAyNTUuKSArIGZsb29yKHYueiAqIHUgKiAyNTUuKSAqIDI1NS47XFxufVxcblxcbnZlYzIgcGFja05vcm1hbChpbiB2ZWMzIG5vcm1hbClcXG57XFxuICAgIGNvbnN0IGZsb2F0IFNDQUxFID0gMS43Nzc3O1xcbiAgICBmbG9hdCBzY2FsYXIxID0gKG5vcm1hbC56ICsgMS4wKSAqIChTQ0FMRSAqIDIuMCk7XFxuICAgIHJldHVybiBub3JtYWwueHkgLyBzY2FsYXIxICsgMC41O1xcbn1cXG5cXG52b2lkIG1haW4oKSB7XFxuXFxuICBUVGV4dHVyZUluZm8gdGk7IC8vID0gdGV4dHVyZUJyaWNrKHZQb3NpdGlvbi54eXosIHZOb3JtYWwueHl6LCB2Tm9ybWFsLncsIHRleFVWLnN0LCB2RXh0cmEueHl6KTtcXG4gIHZlYzMgY29sb3IsIG5vcm1hbDtcXG5cXG4gIGZsb2F0IGRlcHRoID0gY2xpcFBvc2l0aW9uLnogLyBjbGlwUG9zaXRpb24udzsgLy9nbF9GcmFnQ29vcmQueiAvIGdsX0ZyYWdDb29yZC53O1xcblxcbiAgbm9ybWFsID0gbm9ybWFsaXplKGZhY2Vmb3J3YXJkKHZOb3JtYWwsIGdsX0ZyYWdDb29yZC54eXosIHZOb3JtYWwpKTtcXG5cXG4gIGlmKHRleFVWLnogPiA1LjEpIHtcXG4gICAgdGkgPSB0ZXh0dXJlQnJpY2sodlBvc2l0aW9uLnh5eiwgdk5vcm1hbCwgZ2xfRnJhZ0Nvb3JkLnosIG1vZCh0ZXhVVi54eSwgMS4pLCB2RXh0cmEpO1xcbiAgICBjb2xvciA9IHRpLmNvbG9yO1xcbiAgICBub3JtYWwgPSB0aS5ub3JtYWw7XFxuICB9XFxuICBlbHNlIGlmKHRleFVWLnogPiA0LjEpIHtcXG4gICAgdGkgPSB0ZXh0dXJlV2luZG93KHZQb3NpdGlvbi54eXosIHZOb3JtYWwsIGdsX0ZyYWdDb29yZC56LCBtb2QodGV4VVYueXgsIDEuKSwgdmVjMygxLiwgMS4sIC43KSk7XFxuICAgIGNvbG9yID0gdGkuY29sb3I7XFxuICAgIG5vcm1hbCA9IHRpLm5vcm1hbDtcXG4gIH1cXG4gIGVsc2UgaWYodGV4VVYueiA+IDMuMSkge1xcbiAgICB0aSA9IHRleHR1cmVXaW5kb3codlBvc2l0aW9uLnh5eiwgdk5vcm1hbCwgZ2xfRnJhZ0Nvb3JkLnosIG1vZCh0ZXhVVi55eCwgMS4pLCB2ZWMzKC4zLCAuMywgLjMpKTtcXG4gICAgY29sb3IgPSB0aS5jb2xvcjtcXG4gICAgbm9ybWFsID0gdGkubm9ybWFsO1xcbiAgfVxcbiAgZWxzZSBpZih0ZXhVVi56ID4gMi4xKVxcbiAgICBjb2xvciA9IHRleHR1cmVBc3BoYWx0KG1vZCh0ZXhVVi55eCwgMS4pKTtcXG4gIGVsc2UgaWYodGV4VVYueiA+IDEuMSlcXG4gICAgY29sb3IgPSB0ZXh0dXJlUm9hZChtb2QodGV4VVYueHksIDEuKSk7XFxuICBlbHNlXFxuICAgIGNvbG9yID0gdGV4dHVyZUFzcGhhbHQobW9kKHRleFVWLnl4LCAxLikpOyAvL3RleHR1cmVXaW5kb3codXV2LCBmZXh0cmEpO1xcblxcbiAgZ2xfRnJhZ0NvbG9yID0gdmVjNChwYWNrTm9ybWFsKG5vcm1hbGl6ZShub3JtYWwpKSwgcGFja0NvbG9yKGNsYW1wKGNvbG9yLCAwLiwgMS4pKSwgZGVwdGgpO1xcbiAgLy9nbF9GcmFnRGF0YVswXSA9IHZlYzQocGFja05vcm1hbChub3JtYWxpemUobm9ybWFsKSksIHBhY2tDb2xvcihjbGFtcChjb2xvciwgMC4sIDEuKSksIGRlcHRoKTtcXG4gIC8vZ2xfRnJhZ0RhdGFbMV0gPSB2ZWM0KG5vcm1hbGl6ZShub3JtYWwpLCBkZXB0aCk7XFxuICAvL2dsX0ZyYWdEYXRhWzJdID0gdmVjNChjb2xvciwgcGFjayhjbGFtcChjb2xvciwgMC4sIDEuKSkpO1xcbn1cXG5cIjtcbnZzcmNMaWdodCA9IFwidW5pZm9ybSBtYXQ0IHZpZXdNYXRyaXg7XFxudW5pZm9ybSB2ZWMzIGxpZ2h0UG9zO1xcblxcbmF0dHJpYnV0ZSB2ZWMyIHBvc2l0aW9uO1xcbi8vYXR0cmlidXRlIHZlYzMgbGlnaHRQb3NpdGlvbjtcXG52YXJ5aW5nIHZlYzIgc3Njb29yZCwgY29vcmQ7XFxuXFxudmFyeWluZyB2ZWMzIGxQb3M7XFxuXFxudm9pZCBtYWluKCkge1xcbiAgZ2xfUG9zaXRpb24gPSB2ZWM0KHBvc2l0aW9uLCAwLiwgMS4pO1xcbiAgY29vcmQgPSAuNSArIC41ICogcG9zaXRpb247XFxuICBzc2Nvb3JkID0gcG9zaXRpb247XFxuICBsUG9zID0gdmVjMygwLiwgMC4sIDAuKTsgXFxuICAvL2xQb3MgPSAodmlld01hdHJpeCAqIHZlYzQobGlnaHRQb3MsIDEuKSkueHl6O1xcbn1cXG5cIjtcbmZzcmNMaWdodCA9IFwiI2V4dGVuc2lvbiBHTF9PRVNfc3RhbmRhcmRfZGVyaXZhdGl2ZXMgOiBlbmFibGVcXG5wcmVjaXNpb24gaGlnaHAgZmxvYXQ7XFxuXFxuLyogI3ByYWdtYSBnbHNsaWZ5OiBmeGFhID0gcmVxdWlyZShnbHNsLWZ4YWEpICovXFxuXFxuLy91bmlmb3JtIHNhbXBsZXIyRCB0YXJnZXQwLCB0YXJnZXQxLCB0YXJnZXQyLCBkZXB0aEJ1ZmZlciwgcmFuZE1hcDtcXG51bmlmb3JtIHNhbXBsZXIyRCB0YXJnZXQwLCBkZXB0aEJ1ZmZlcjtcXG51bmlmb3JtIG1hdDQgaW52ZXJzZVByb2plY3Rpb24sIHZpZXdNYXRyaXg7XFxudW5pZm9ybSB2ZWMzIGxpZ2h0UG9zO1xcblxcbnZhcnlpbmcgdmVjMiBzc2Nvb3JkLCBjb29yZDtcXG52YXJ5aW5nIHZlYzMgbFBvcztcXG5cXG4vL3VuaWZvcm0gdmVjMyBsaWdodFBvcztcXG5cXG5mbG9hdCBzYW1wbGUodmVjMyBwLCB2ZWMzIG4sIHZlYzIgdXYpIHtcXG4gIHZlYzMgZHN0UCA9IHRleHR1cmUyRCh0YXJnZXQwLCB1dikueHl6LFxcbiAgICAgICBwb3NWID0gZHN0UCAtIHA7XFxuXFxuICBmbG9hdCBpbnRlbnMgPSBtYXgoZG90KG5vcm1hbGl6ZShwb3NWKSwgbikgLSAuMDUsIDAuKSxcXG4gICAgICAgIGRpc3QgPSBsZW5ndGgocG9zViksXFxuICAgICAgICBhdHQgID0gMS4gLyAoMi4gKyAoNS4gKiBkaXN0KSk7XFxuICByZXR1cm4gaW50ZW5zICogYXR0O1xcbn1cXG5cXG5oaWdocCBmbG9hdCByYW5kKHZlYzIgY28pXFxue1xcbiAgICBoaWdocCBmbG9hdCBhID0gMTIuOTg5ODtcXG4gICAgaGlnaHAgZmxvYXQgYiA9IDc4LjIzMztcXG4gICAgaGlnaHAgZmxvYXQgYyA9IDQzNzU4LjU0NTM7XFxuICAgIGhpZ2hwIGZsb2F0IGR0PSBkb3QoY28ueHkgLHZlYzIoYSxiKSk7XFxuICAgIGhpZ2hwIGZsb2F0IHNuPSBtb2QoZHQsMy4xNCk7XFxuICAgIHJldHVybiBmcmFjdChzaW4oc24pICogYyk7XFxufVxcblxcbnZlYzMgdW5wYWNrQ29sb3IoZmxvYXQgZCkge1xcbiAgdmVjMyByZXQ7XFxuXFxuICByZXQueCA9IGZyYWN0KGQpO1xcbiAgZmxvYXQgemkgPSBmbG9vcihkIC8gMjU1Lik7XFxuICByZXQueiA9IGZyYWN0KHppIC8gMjU1Lik7XFxuICByZXQueSA9IGZyYWN0KCBmbG9vciggZCAtICggemkgKiAyNTUuICkgKSAvIDI1NS4pO1xcblxcbiAgcmV0dXJuIHJldDtcXG59XFxuXFxudmVjMyB1bnBhY2tOb3JtYWwoaW4gdmVjMiBlbmMpXFxue1xcblxcdGNvbnN0IGZsb2F0IFNDQUxFID0gMS43Nzc3O1xcblxcdHZlYzIgbm4gPSBlbmMgKiAoMi4wICogU0NBTEUpIC0gU0NBTEU7XFxuXFx0ZmxvYXQgZyA9IDIuMCAvIChkb3Qobm4ueHksIG5uLnh5KSArIDEuMCk7XFxuXFx0dmVjMyBub3JtYWw7XFxuXFx0bm9ybWFsLnh5ID0gZyAqIG5uLnh5O1xcblxcdG5vcm1hbC56ID0gZyAtIDEuMDtcXG5cXHRyZXR1cm4gbm9ybWFsO1xcbn1cXG5cXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xcbi8vIE1haW5cXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xcblxcblxcbnZvaWQgbWFpbigpIHtcXG4gIC8qdmVjMyBsaWdodHNbNF07XFxuICBsaWdodHNbMF0gPSB2ZWMzKDYuIC0gLjAyNSwgLjIsIDYuIC0gLjAyNSk7XFxuICBsaWdodHNbMV0gPSB2ZWMzKDYuIC0gLjAyNSwgLjIsIDYuICsgLjAyNSk7XFxuICBsaWdodHNbMl0gPSB2ZWMzKDYuICsgLjAyNSwgLjIsIDYuICsgLjAyNSk7XFxuICBsaWdodHNbM10gPSB2ZWMzKDYuICsgLjAyNSwgLjIsIDYuIC0gLjAyNSk7Ki9cXG4gIC8qdmVjNCB0MCA9IGZ4YWEodGFyZ2V0MCwgY29vcmQsIHJlcyksXFxuICAgICAgIHQxID0gZnhhYSh0YXJnZXQxLCBjb29yZCwgcmVzKSxcXG4gICAgICAgdDIgPSBmeGFhKHRhcmdldDIsIGNvb3JkLCByZXMpOyovXFxuICAvKnZlYzIgZncgPSAuNSAqIGZ3aWR0aChjb29yZCksXFxuICAgICAgIG5mdyA9IHZlYzIoZncueCwgLWZ3LnkpLFxcbiAgICAgICBjMCA9IGNvb3JkIC0gZncsXFxuICAgICAgIGMxID0gY29vcmQgKyBmdyxcXG4gICAgICAgYzIgPSBjb29yZCAtIG5mdyxcXG4gICAgICAgYzMgPSBjb29yZCArIG5mdzsqL1xcblxcbiAgdmVjNCB0MCA9IHRleHR1cmUyRCh0YXJnZXQwLCBjb29yZCk7XFxuICAvKnZlYzQgdDAgPSB0ZXh0dXJlMkQodGFyZ2V0MCwgY29vcmQpLFxcbiAgICAgICB0MSA9IHRleHR1cmUyRCh0YXJnZXQxLCBjb29yZCksXFxuICAgICAgIHQyID0gdGV4dHVyZTJEKHRhcmdldDIsIGNvb3JkKTsqL1xcblxcbiAgdmVjMyAgdmVydGV4LFxcbiAgICAgICAgLy9ub3JtYWwgPSBub3JtYWxpemUodDEueHl6KSxcXG4gICAgICAgIG5vcm1hbCA9IG5vcm1hbGl6ZSh1bnBhY2tOb3JtYWwodDAueHkpKSxcXG4gICAgICAgIGNvbG9yICA9IHVucGFja0NvbG9yKHQwLnopO1xcbiAgICAgICAgLy9jb2xvciAgPSB0Mi54eXo7XFxuICBmbG9hdCBkZXB0aCAgPSB0MC53O1xcblxcbiAgdmVjNCB2ZXJ0ZXhGcm9tRGVwdGggPSBpbnZlcnNlUHJvamVjdGlvbiAqIHZlYzQoc3Njb29yZCwgZGVwdGgsIDEuKTtcXG4gIHZlcnRleCA9IHZlcnRleEZyb21EZXB0aC54eXogLyB2ZXJ0ZXhGcm9tRGVwdGgudztcXG5cXG4gIHZlYzMgbGlnaHREaXIgPSBsUG9zIC0gdmVydGV4O1xcbiAgZmxvYXQgbGFtYmVydCA9IG1heChkb3QoZmFjZWZvcndhcmQoLW5vcm1hbCwgbGlnaHREaXIsIG5vcm1hbCksIG5vcm1hbGl6ZShsaWdodERpcikpLCAwLiksXFxuICAgICAgICBkaXN0ID0gbGVuZ3RoKGxpZ2h0RGlyKSxcXG4gICAgICAgIGF0dCA9IG1pbigxLiwgMS4gLyAoMS4gKyAyLjUgKiBkaXN0ICsgNS4gKiBkaXN0ICogZGlzdCkpO1xcblxcbiAgLypmbG9hdCBsYW1iZXJ0ID0gMC4sIGF0dCA9IDEuO1xcbiAgZm9yKGludCBpID0gMDsgaSA8IDQ7IGkrKykge1xcbiAgICB2ZWMzIGxpZ2h0RGlyID0gKHZpZXdNYXRyaXggKiB2ZWM0KGxpZ2h0c1tpXSwgMS4pKS54eXogLSB2ZXJ0ZXg7XFxuICAgIGZsb2F0IGxsYW1iZXJ0ID0gbWF4KGRvdChmYWNlZm9yd2FyZCgtbm9ybWFsLCBsaWdodERpciwgbm9ybWFsKSwgbm9ybWFsaXplKGxpZ2h0RGlyKSksIDAuKSxcXG4gICAgICAgICAgZGlzdCA9IGxlbmd0aChsaWdodERpciksXFxuICAgICAgICAgIGxhdHQgPSBtaW4oMS4sIDEuIC8gKDEuICsgLjUgKiBkaXN0ICsgNS4gKiBkaXN0ICogZGlzdCkpO1xcbiAgICBsYW1iZXJ0ICs9IGxsYW1iZXJ0ICogbGF0dCAqIC4yNTtcXG4gIH0qL1xcblxcbiAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXFxuICAvLyBTU0FPXFxuICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cXG4gIHZlYzIga2VybmVsWzRdO1xcbiAga2VybmVsWzBdID0gdmVjMigwLiwgMS4pO1xcbiAga2VybmVsWzFdID0gdmVjMigxLiwgMC4pO1xcbiAga2VybmVsWzJdID0gdmVjMigwLiwgLTEuKTtcXG4gIGtlcm5lbFszXSA9IHZlYzIoLTEuLCAwLik7XFxuXFxuICBjb25zdCBmbG9hdCBzaW40NSA9IC43MDcxMDcsIHNSYWQgPSA4MC47XFxuXFxuICBmbG9hdCBvY2NsdXNpb24gPSAwLiwga1JhZCA9IHNSYWQgKiAoMS4gLSBkZXB0aCk7XFxuXFxuICBmb3IoaW50IGkgPSAwOyBpIDwgNDsgKytpKSB7XFxuICAgIHZlYzIgazEgPSByZWZsZWN0KGtlcm5lbFtpXSwgLjYgKiB2ZWMyKHJhbmQoc2luKGNvb3JkKSksIHJhbmQoLWNvb3JkKSkpO1xcbiAgICB2ZWMyIGsyID0gdmVjMihrMS54ICogc2luNDUgLSBrMS55ICogc2luNDUsXFxuICAgICAgICAgICAgICAgICAgIGsxLnggKiBzaW40NSArIGsxLnkgKiBzaW40NSk7XFxuICAgIG9jY2x1c2lvbiArPSBzYW1wbGUodmVydGV4LCBub3JtYWwsIGNvb3JkICsgazEgKiBrUmFkKTtcXG4gICAgb2NjbHVzaW9uICs9IHNhbXBsZSh2ZXJ0ZXgsIG5vcm1hbCwgY29vcmQgKyBrMSAqIGtSYWQgKiAuNzUpO1xcbiAgICBvY2NsdXNpb24gKz0gc2FtcGxlKHZlcnRleCwgbm9ybWFsLCBjb29yZCArIGsxICoga1JhZCAqIC41KTtcXG4gICAgb2NjbHVzaW9uICs9IHNhbXBsZSh2ZXJ0ZXgsIG5vcm1hbCwgY29vcmQgKyBrMSAqIGtSYWQgKiAuMjUpO1xcbiAgfVxcbiAgb2NjbHVzaW9uIC89IDE2LjtcXG4gIG9jY2x1c2lvbiA9IGNsYW1wKG9jY2x1c2lvbiwgMC4sIDEuKTtcXG5cXG4gIGNvbG9yID0gY2xhbXAoY29sb3IgLSBvY2NsdXNpb24sIDAuLCAxLik7XFxuICBnbF9GcmFnQ29sb3IgPSB2ZWM0KGxhbWJlcnQgKiBhdHQgKiAyLiAqIGNvbG9yLCAxLik7XFxuICAvL2dsX0ZyYWdDb2xvciA9IHZlYzQobm9ybWFsLCAxLik7XFxuICAvL2dsX0ZyYWdDb2xvciA9IHZlYzQoY29sb3IsIDEuKTtcXG59XFxuXCI7XG5cbmdsLmNsZWFyQ29sb3IoMCwgMCwgMCwgMCk7XG5nbC5kZXB0aEZ1bmMoZ2wuTEVTUyk7XG5nbC5nZXRFeHRlbnNpb24oJ09FU19zdGFuZGFyZF9kZXJpdmF0aXZlcycpO1xuZ2wuZ2V0RXh0ZW5zaW9uKCdPRVNfdGV4dHVyZV9mbG9hdCcpO1xuZXh0RmxvYXRMaW5lYXIgPSBnbC5nZXRFeHRlbnNpb24oJ09FU190ZXh0dXJlX2Zsb2F0X2xpbmVhcicpO1xuZXh0RGVwdGhUZXh0dXJlID0gZ2wuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9kZXB0aF90ZXh0dXJlJyk7XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gKiBHZW9tZXRyeSBwYXNzIHNoYWRlciBjb21waWxhdGlvbiAmIGxpbmtpbmdcbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuZ2wuc2hhZGVyU291cmNlKHZzaFBhc3MsIHZzcmNQYXNzKTtcbmdsLnNoYWRlclNvdXJjZShmc2hQYXNzLCBmc3JjUGFzcyk7XG5nbC5jb21waWxlU2hhZGVyKHZzaFBhc3MpO1xuZ2wuY29tcGlsZVNoYWRlcihmc2hQYXNzKTtcbmdsLmF0dGFjaFNoYWRlcihwcm9ncmFtUGFzcywgdnNoUGFzcyk7XG5nbC5hdHRhY2hTaGFkZXIocHJvZ3JhbVBhc3MsIGZzaFBhc3MpO1xuZ2wubGlua1Byb2dyYW0ocHJvZ3JhbVBhc3MpO1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICogTGlnaHQgcGFzcyBzaGFkZXIgY29tcGlsYXRpb24gJiBsaW5raW5nXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmdsLnNoYWRlclNvdXJjZSh2c2hMaWdodCwgdnNyY0xpZ2h0KTtcbmdsLnNoYWRlclNvdXJjZShmc2hMaWdodCwgZnNyY0xpZ2h0KTtcbmdsLmNvbXBpbGVTaGFkZXIodnNoTGlnaHQpO1xuZ2wuY29tcGlsZVNoYWRlcihmc2hMaWdodCk7XG5nbC5hdHRhY2hTaGFkZXIocHJvZ3JhbUxpZ2h0LCB2c2hMaWdodCk7XG5nbC5hdHRhY2hTaGFkZXIocHJvZ3JhbUxpZ2h0LCBmc2hMaWdodCk7XG5nbC5saW5rUHJvZ3JhbShwcm9ncmFtTGlnaHQpO1xuXG5jb25zb2xlLmxvZygnVlA6JywgZ2wuZ2V0U2hhZGVySW5mb0xvZyh2c2hQYXNzKSxcbiAgICAgICAgICAgICdGUDonLCBnbC5nZXRTaGFkZXJJbmZvTG9nKGZzaFBhc3MpLFxuICAgICAgICAgICAgJ1ZMOicsIGdsLmdldFNoYWRlckluZm9Mb2codnNoTGlnaHQpLFxuICAgICAgICAgICAgJ0ZMOicsIGdsLmdldFNoYWRlckluZm9Mb2coZnNoTGlnaHQpKTtcblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAqIFRleHR1cmUgTVJUcyBzZXR1cC5cbiAqIExheW91dDogICAgXG4gKiAgICAgICAgICAgfCBmbG9hdDEgfCBmbG9hdDIgfCBmbG9hdDMgfCBmbG9hdDQgfFxuICogVGFyZ2V0IDA6IHwgRW5jb2RlZCBub3JtYWwgIHwgRGVwdGggIHwgQ29sb3IgIHxcbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG52YXIgdGFyZ2V0MCAgICAgPSBnbC5jcmVhdGVUZXh0dXJlKCksXG4gICAgZGVwdGhUZXggICAgPSBnbC5jcmVhdGVUZXh0dXJlKCksXG4gICAgZnJhbWVidWZmZXIgPSBnbC5jcmVhdGVGcmFtZWJ1ZmZlcigpO1xuXG5nbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCBkZXB0aFRleCk7XG5nbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUFHX0ZJTFRFUiwgZ2wuTkVBUkVTVCk7XG5nbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUlOX0ZJTFRFUiwgZ2wuTkVBUkVTVCk7XG5nbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfV1JBUF9TLCBnbC5DTEFNUF9UT19FREdFKTtcbmdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1QsIGdsLkNMQU1QX1RPX0VER0UpO1xuZ2wudGV4SW1hZ2UyRChnbC5URVhUVVJFXzJELCAwLCBnbC5ERVBUSF9DT01QT05FTlQsIENvbnRleHQudywgQ29udGV4dC5oLCAwLCBnbC5ERVBUSF9DT01QT05FTlQsIGdsLlVOU0lHTkVEX1NIT1JULCBudWxsKTtcbiAgICBcbmdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRhcmdldDApO1xuZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX01BR19GSUxURVIsIGV4dEZsb2F0TGluZWFyICE9PSBudWxsID8gZ2wuTElORUFSIDogZ2wuTkVBUkVTVCk7XG5nbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUlOX0ZJTFRFUiwgZXh0RmxvYXRMaW5lYXIgIT09IG51bGwgPyBnbC5MSU5FQVIgOiBnbC5ORUFSRVNUKTtcbmdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1MsIGdsLkNMQU1QX1RPX0VER0UpO1xuZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSk7XG5nbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGdsLlJHQkEsIENvbnRleHQudywgQ29udGV4dC5oLCAwLCBnbC5SR0JBLCBnbC5GTE9BVCwgbnVsbCk7XG5cbmdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIG51bGwpO1xuXG5nbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIGZyYW1lYnVmZmVyKTtcblxuZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGdsLkRFUFRIX0FUVEFDSE1FTlQsIGdsLlRFWFRVUkVfMkQsIGRlcHRoVGV4LCAwKTtcbmdsLmZyYW1lYnVmZmVyVGV4dHVyZTJEKGdsLkZSQU1FQlVGRkVSLCBnbC5DT0xPUl9BVFRBQ0hNRU5UMCwgZ2wuVEVYVFVSRV8yRCwgdGFyZ2V0MCwgMCk7XG5cbmdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgbnVsbCk7XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gKiBTZXR1cCBnbG9iYWwgbWF0cmljZXMgYW5kIFZCT3NcbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xudmFyIHF1YWRCdWYgICAgICAgPSBnbC5jcmVhdGVCdWZmZXIoKSxcbiAgICBsaWdodEJ1ZiAgICAgID0gZ2wuY3JlYXRlQnVmZmVyKCksXG4gICAgcXVhZEFyciAgICAgICA9IFtdLFxuICAgIHByb2plY3Rpb24gICAgPSBtYXQ0LmNyZWF0ZSgpLFxuICAgIGludlByb2plY3Rpb24gPSBtYXQ0LmNyZWF0ZSgpO1xuXG5mb3IodmFyIGkgPSAwOyBpIDwgMTI4OyBpKyspIHtcbiAgcXVhZEFyci5wdXNoKDEsIC0xLCAtMSwgLTEsIC0xLCAxLCAgMSwgLTEsIC0xLCAxLCAxLCAxKTtcbn1cblxuLy8gUXVhZCBkYXRhIGRpcmVjdGx5IGluIHNjcmVlbiBzcGFjZSBjb29yZGluYXRlc1xuZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHF1YWRCdWYpO1xuLy9nbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgbmV3IEZsb2F0MzJBcnJheShxdWFkQXJyKSwgZ2wuU1RBVElDX0RSQVcpO1xuZ2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIG5ldyBGbG9hdDMyQXJyYXkoWzEsIC0xLCAtMSwgLTEsIC0xLCAxLCAgMSwgLTEsIC0xLCAxLCAxLCAxXSksIGdsLlNUQVRJQ19EUkFXKTtcbmdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBudWxsKTtcblxubWF0NC5wZXJzcGVjdGl2ZShwcm9qZWN0aW9uLCBNYXRoLlBJIC8gMiwgQ29udGV4dC5hc3BlY3RSYXRpbywgLjAwMSwgMTAwMC4pO1xubWF0NC5pbnZlcnQoaW52UHJvamVjdGlvbiwgcHJvamVjdGlvbik7XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gKiBVbmlmb3JtcyBhbmQgYXR0cmlidXRlcyBzZXR1cFxuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cblsndmVydGV4JywgJ25vcm1hbCcsICd1dicsICdleHRyYSddLmZvckVhY2goZnVuY3Rpb24oaSkge1xuICBwcm9ncmFtUGFzc1tpXSA9IGdsLmdldEF0dHJpYkxvY2F0aW9uKHByb2dyYW1QYXNzLCBpKTtcbn0pO1xuXG5bJ3Byb2plY3Rpb24nLCAndmlld21vZGVsJywgJ25vcm1hbE0nXS5mb3JFYWNoKGZ1bmN0aW9uKGkpIHtcbiAgcHJvZ3JhbVBhc3NbaV0gPSBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbVBhc3MsIGkpO1xufSk7XG5cblsncG9zaXRpb24nLCAnbGlnaHRQb3NpdGlvbiddLmZvckVhY2goZnVuY3Rpb24oaSkge1xuICBwcm9ncmFtTGlnaHRbaV0gPSBnbC5nZXRBdHRyaWJMb2NhdGlvbihwcm9ncmFtTGlnaHQsIGkpO1xufSk7XG5cblsndGFyZ2V0MCcsICd0YXJnZXQxJywgJ3RhcmdldDInLCAnZGVwdGhCdWZmZXInLCBcbiAnaW52ZXJzZVByb2plY3Rpb24nLCAndmlld01hdHJpeCcsICdsaWdodFBvcyddLmZvckVhY2goZnVuY3Rpb24oaSkge1xuICBwcm9ncmFtTGlnaHRbaV0gPSBnbC5nZXRVbmlmb3JtTG9jYXRpb24ocHJvZ3JhbUxpZ2h0LCBpKTtcbn0pO1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICogUHJvY2VkdXJlcyB0aGF0IHNldHVwL2NsZWFudXAgYnVmZmVycyBhbmQgbWF0cmljZXMgZm9yIHRoZSBzaGFkZXJcbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xucHJvZ3JhbVBhc3MuYWN0aXZhdGUgPSBmdW5jdGlvbihzY2VuZSkge1xuICBnbC51c2VQcm9ncmFtKHByb2dyYW1QYXNzKTtcbiAgZ2wuYmluZEZyYW1lYnVmZmVyKGdsLkZSQU1FQlVGRkVSLCBmcmFtZWJ1ZmZlcik7XG5cbiAgZ2wuZW5hYmxlKGdsLkRFUFRIX1RFU1QpO1xuICBnbC5jbGVhcihnbC5DT0xPUl9CVUZGRVJfQklUIHwgZ2wuREVQVEhfQlVGRkVSX0JJVCk7XG5cbiAgLy9cbiAgLy8gVW5pZm9ybXMgc2V0dXBcbiAgLy9cbiAgdmFyIHZpZXdtb2RlbCA9IG1hdDQuY3JlYXRlKCksIG5vcm1hbE0gPSBtYXQzLmNyZWF0ZSgpO1xuICBtYXQ0Lm11bCh2aWV3bW9kZWwsIHNjZW5lLnZpZXcsIHNjZW5lLm1vZGVsKTtcbiAgbWF0My5ub3JtYWxGcm9tTWF0NChub3JtYWxNLCB2aWV3bW9kZWwpO1xuXG4gIGdsLnVuaWZvcm1NYXRyaXg0ZnYocHJvZ3JhbVBhc3MucHJvamVjdGlvbiwgZmFsc2UsIHByb2plY3Rpb24pO1xuICBnbC51bmlmb3JtTWF0cml4NGZ2KHByb2dyYW1QYXNzLnZpZXdtb2RlbCwgZmFsc2UsIHZpZXdtb2RlbCk7XG4gIGdsLnVuaWZvcm1NYXRyaXgzZnYocHJvZ3JhbVBhc3Mubm9ybWFsTSwgZmFsc2UsIG5vcm1hbE0pO1xuXG4gIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1QYXNzLnZlcnRleCk7XG4gIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1QYXNzLm5vcm1hbCk7XG4gIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1QYXNzLnV2KTtcbiAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbVBhc3MuZXh0cmEpO1xuXG4gIHNjZW5lLm1lc2hlcy5mb3JFYWNoKGZ1bmN0aW9uKG1lc2gpIHtcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbWVzaC52QnVmKTtcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1QYXNzLnZlcnRleCwgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbWVzaC5uQnVmKTtcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1QYXNzLm5vcm1hbCwgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbWVzaC51QnVmKTtcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1QYXNzLnV2LCAgICAgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbWVzaC5lQnVmKTtcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1QYXNzLmV4dHJhLCAgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgICBnbC5kcmF3QXJyYXlzKGdsLlRSSUFOR0xFUywgMCwgbWVzaC5jb3VudCk7XG4gIFxuICB9KTtcblxuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbnVsbCk7XG59XG52YXIgc2MgPSBmdW5jdGlvbihsaWdodHMpIHtcbiAgY29uc29sZS5sb2cobGlnaHRzKTtcbn1cblxucHJvZ3JhbVBhc3MuZGVhY3RpdmF0ZSA9IGZ1bmN0aW9uKCkge1xuICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xuICBcbiAgZ2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1QYXNzLnZlcnRleCk7XG4gIGdsLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheShwcm9ncmFtUGFzcy5ub3JtYWwpO1xuICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbVBhc3MudXYpO1xuICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbVBhc3MuZXh0cmEpO1xuICBnbC5kaXNhYmxlKGdsLkRFUFRIX1RFU1QpO1xufVxuXG52YXIgX19kbyA9IGZhbHNlLCBjbnQgPSAwO1xuXG5wcm9ncmFtTGlnaHQuYWN0aXZhdGUgPSBmdW5jdGlvbihzY2VuZSkge1xuICBnbC51c2VQcm9ncmFtKHByb2dyYW1MaWdodCk7XG5cbiAgZ2wuZW5hYmxlKGdsLkJMRU5EKTtcbiAgZ2wuYmxlbmRGdW5jKGdsLk9ORSwgZ2wuT05FKTtcbiAgZ2wuY2xlYXIoZ2wuQ09MT1JfQlVGRkVSX0JJVCk7XG5cbiAgLy9cbiAgLy8gVW5pZm9ybSBzZXR1cFxuICAvL1xuICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKTtcbiAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgdGFyZ2V0MCk7XG5cbiAgZ2wudW5pZm9ybTFpKHByb2dyYW1MaWdodC50YXJnZXQwLCAwKTtcbiAgZ2wudW5pZm9ybTFpKHByb2dyYW1MaWdodC5kZXB0aEJ1ZmZlciwgMyk7XG5cbiAgZ2wudW5pZm9ybU1hdHJpeDRmdihwcm9ncmFtTGlnaHQudmlld01hdHJpeCwgZmFsc2UsIHNjZW5lLnZpZXcpO1xuICBnbC51bmlmb3JtTWF0cml4NGZ2KHByb2dyYW1MaWdodC5pbnZlcnNlUHJvamVjdGlvbiwgZmFsc2UsIGludlByb2plY3Rpb24pO1xuXG4gIC8vXG4gIC8vIFZCTyBzZXR1cFxuICAvL1xuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgcXVhZEJ1Zik7XG4gIGdsLnZlcnRleEF0dHJpYlBvaW50ZXIocHJvZ3JhbUxpZ2h0LnBvc2l0aW9uLCAyLCBnbC5GTE9BVCwgZmFsc2UsIDAsIDApO1xuXG4gIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1MaWdodC5wb3NpdGlvbik7XG4gIC8vZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbUxpZ2h0LmxpZ2h0UG9zaXRpb24pO1xuXG4gIGdsLnVuaWZvcm0zZnYocHJvZ3JhbUxpZ2h0LmxpZ2h0UG9zLCBzY2VuZS5saWdodFBvcyk7IC8vWzAsLjAyNSwtLjA1XSk7XG4gIGdsLmRyYXdBcnJheXMoZ2wuVFJJQU5HTEVTLCAwLCA2KTtcbiAgLyp2YXIgSSA9IHNjZW5lLmxpZ2h0cy5sZW5ndGg7XG4gIGlmKEkgPiAwICYmIF9fZG8gPT09IGZhbHNlKSB7XG5cbiAgICB2YXIgbHYgPSBuZXcgRmxvYXQzMkFycmF5KEkgKiAxOCk7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IEk7IGkrKykge1xuICAgICAgdmFyIGlpID0gaSAqIDM7XG4gICAgICBmb3IodmFyIGogPSAwOyBqIDwgMTg7IGorKykge1xuICAgICAgICBsdltpaSArIGpdID0gc2NlbmUubGlnaHRzW2ldW2ogJSAzXTtcbiAgICAgIH1cbiAgICB9XG4gICAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIGxpZ2h0QnVmKTtcbiAgICBnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgbHYsIGdsLlNUQVRJQ19EUkFXKTtcbiAgICBjbnQgPSBJO1xuICAgIGNvbnNvbGUubG9nKGNudClcbiAgICBfX2RvID0gdHJ1ZTtcbiAgICBcbiAgfVxuXG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBsaWdodEJ1Zik7XG4gIGdsLnZlcnRleEF0dHJpYlBvaW50ZXIocHJvZ3JhbUxpZ2h0LmxpZ2h0UG9zaXRpb24sIDMsIGdsLkZMT0FULCBmYWxzZSwgMCwgMCk7XG4gIGdsLmRyYXdBcnJheXMoZ2wuVFJJQU5HTEVTLCAwLCBjbnQgKiA2KTsqL1xufVxuXG5wcm9ncmFtTGlnaHQuZGVhY3RpdmF0ZSA9IGZ1bmN0aW9uKCkge1xuICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbUxpZ2h0LnBvc2l0aW9uKTtcbiAgZ2wuZGlzYWJsZShnbC5CTEVORCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICByZW5kZXI6IGZ1bmN0aW9uKHNjZW5lKSB7XG4gICAgcHJvZ3JhbVBhc3MuYWN0aXZhdGUoc2NlbmUpO1xuICAgIHByb2dyYW1QYXNzLmRlYWN0aXZhdGUoKTtcbiAgICBwcm9ncmFtTGlnaHQuYWN0aXZhdGUoc2NlbmUpO1xuICAgIHByb2dyYW1MaWdodC5kZWFjdGl2YXRlKCk7XG4gIH1cbn1cbiIsInZhciBQUk5HID0gcmVxdWlyZSgnLi9QUk5HJyksXG4gICAgR2VvbSA9IHJlcXVpcmUoJy4vLi4vbGliL0dlb20nKSxcbiAgICBTaGFwZUdyYW1tYXIgPSByZXF1aXJlKCcuLy4uL2xpYi9TaGFwZUdyYW1tYXInKTtcblxudmFyIGxlcnAgPSBmdW5jdGlvbihhLCBiLCB0KSB7IHJldHVybiAoMSAtIHQpICogYSArIHQgKiBiOyB9XG5cbi8vIEluc3BpcmVkIHRvIGh0dHBzOi8vd3d3LmNzLnB1cmR1ZS5lZHUvY2d2bGFiL3BhcGVycy9hbGlhZ2EvZWcyMDEyLnBkZlxudmFyIHN1YmRpdmlkZVN0cmlwID0gZnVuY3Rpb24oYmxvY2ssIHN0cmlwLCBybmcpIHtcbiAgdmFyIHBvaW50cyA9IFtdLCBxdWFkcyA9IFtdLCBhbmdsZXMgPSBbXSwgaTEsIGkyLCBpMywgXG4gICAgICBiMSwgYjIsIGR4LCBkeSwgaSwgaiwgbSwgbiwgcCwgbGVuLFxuICAgICAgbG90cyA9IFtdO1xuXG4gIGZvcihpID0gMCwgbiA9IGJsb2NrLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgIGkxID0gKGkgKyAxKSAlIG47XG4gICAgaTIgPSAoaSArIDIpICUgbjtcbiAgICBpMyA9IChpIC0gMSArIG4pICUgbjtcbiAgICBiMSA9IEdlb20ubGluZUludGVyc2VjdGlvbihibG9ja1tpXSwgYmxvY2tbaTFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBzdHJpcFtpM10sIHN0cmlwW2ldKTtcbiAgICBiMiA9IEdlb20ubGluZUludGVyc2VjdGlvbihibG9ja1tpXSwgYmxvY2tbaTFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBzdHJpcFtpMV0sIHN0cmlwW2kyXSk7XG4gICAgZHggPSBiMS54IC0gYjIueDtcbiAgICBkeSA9IGIxLnkgLSBiMi55O1xuICAgIGxlbiA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgYW5nID0gTWF0aC5hdGFuMihkeSwgZHgpO1xuICAgIG0gPSB+fihybmcucmFuZG9tKCkgKiAzICsgMik7XG4gICAgLyppZihsZW4gPCAuMzUpXG4gICAgICBtID0gMTtcbiAgICBlbHNlIGlmKGxlbiA8IC42KVxuICAgICAgbSA9IE1hdGgubWluKG0sIDIpO1xuICAgIGVsc2UgaWYobGVuIDwgLjgpXG4gICAgICBtID0gTWF0aC5taW4obSwgMyk7Ki9cblxuICAgIHF1YWRzLnB1c2gobSk7XG4gICAgYW5nbGVzLnB1c2goYW5nKTtcblxuICAgIGZvcihqID0gMDsgaiA8IG07IGorKykge1xuICAgICAgdmFyIGptID0gaiAvIChtIC0gMSk7XG4gICAgICBweDEgPSBsZXJwKGIxLngsIGIyLngsIGptKTtcbiAgICAgIHB5MSA9IGxlcnAoYjEueSwgYjIueSwgam0pO1xuICAgICAgcHgyID0gbGVycChzdHJpcFtpXS54LCBzdHJpcFtpMV0ueCwgam0pO1xuICAgICAgcHkyID0gbGVycChzdHJpcFtpXS55LCBzdHJpcFtpMV0ueSwgam0pO1xuICAgICAgcG9pbnRzLnB1c2goXG4gICAgICAgIHsgeDogbGVycChiMS54LCBiMi54LCBqbSksIHk6IGxlcnAoYjEueSwgYjIueSwgam0pIH0sXG4gICAgICAgIHsgeDogbGVycChzdHJpcFtpXS54LCBzdHJpcFtpMV0ueCwgam0pLCB5OiBsZXJwKHN0cmlwW2ldLnksIHN0cmlwW2kxXS55LCBqbSkgfVxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgcG9pbnRzLnB1c2gocG9pbnRzWzBdKTtcblxuICBmb3IoaSA9IDAsIG4gPSBibG9jay5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICBwID0gW107XG4gICAgZm9yKGogPSAwOyBqIDwgcXVhZHNbaV07IGorKykge1xuICAgICAgcC5wdXNoKHBvaW50cy5zaGlmdCgpKTtcbiAgICAgIHAucHVzaChwb2ludHMuc2hpZnQoKSk7XG4gICAgfVxuICAgIHAucHVzaChibG9ja1soaSArIDEpICUgbl0pO1xuICAgIHAucHVzaChwb2ludHNbMF0gfHwgYmxvY2tbMF0pO1xuICAgIGZvcih2YXIgayA9IDAsIG0gPSBwLmxlbmd0aDsgayA8IG0gLSAyOyBrKz0gMikge1xuICAgICAgbG90cy5wdXNoKG5ldyBCdWlsZGluZyhcbiAgICAgICAgW3Bba10sIHBbKGsgKyAxKSAlIG1dLCBwWyhrICsgMykgJSBtXSwgcFsoayArIDIpICUgbV1dLCBcbiAgICAgICAgcm5nLnJhbmRvbSgpICsgLjUsXG4gICAgICAgIGFuZ2xlc1tpXVxuICAgICAgKSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGxvdHM7XG59XG5cbnZhciBCdWlsZGluZyA9IGZ1bmN0aW9uKHBvbHksIGhlaWdodCwgYW5nbGUpIHtcbiAgdGhpcy5wb2x5ID0gcG9seTtcbiAgdGhpcy5oZWlnaHQgPSBoZWlnaHQ7XG4gIHRoaXMuYW5nbGUgPSBhbmdsZTtcblxufVxuXG52YXIgQmxvY2sgPSBmdW5jdGlvbihwb2x5LCBzZWVkKSB7XG4gIHZhciBybmcgPSBuZXcgUFJORyhzZWVkKTtcbiAgdGhpcy5wb2x5ID0gcG9seTtcbiAgdGhpcy5ibG9jayA9IEdlb20uaW5zZXRQb2x5Z29uKHRoaXMucG9seSwgMC4wNSk7XG4gIHRoaXMubG90cyA9IHN1YmRpdmlkZVN0cmlwKEdlb20uaW5zZXRQb2x5Z29uKHRoaXMuYmxvY2ssIDAuMSksIEdlb20uaW5zZXRQb2x5Z29uKHRoaXMuYmxvY2ssIDAuNCksIHJuZyk7XG5cbiAgdmFyIGNkID0gcG9seS5yZWR1Y2UoZnVuY3Rpb24obywgaSkge1xuICBcbiAgICBvLmN4ICs9IGkueDtcbiAgICBvLmN5ICs9IGkueTtcblxuICAgIGlmKG8ueG0gPiBpLngpXG4gICAgICBvLnhtID0gaS54O1xuICAgIGlmKG8ueE0gPCBpLngpXG4gICAgICBvLnhNID0gaS54O1xuICAgIGlmKG8ueW0gPiBpLnkpXG4gICAgICBvLnltID0gaS55O1xuICAgIGlmKG8ueU0gPCBpLnkpXG4gICAgICBvLnlNID0gaS55O1xuXG4gICAgcmV0dXJuIG87XG5cbiAgfSwgeyBcbiAgICB4bTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBcbiAgICB5bTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLCBcbiAgICB4TTogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBcbiAgICB5TTogTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZLCBcbiAgICBjeDogMCwgY3k6IDBcbiAgfSk7XG5cbiAgdGhpcy54ID0gY2QuY3ggLyBwb2x5Lmxlbmd0aDtcbiAgdGhpcy55ID0gY2QuY3kgLyBwb2x5Lmxlbmd0aDtcbiAgdGhpcy53ID0gTWF0aC5tYXgoTWF0aC5hYnMoY2QueE0gLSBjZC54bSksIE1hdGguYWJzKGNkLnlNIC0gY2QueW0pKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCbG9jaztcbiIsInZhciBTaGFwZUdyYW1tYXIgPSByZXF1aXJlKCcuLy4uL2xpYi9TaGFwZUdyYW1tYXInKSxcbiAgICBTSEFQRSAgICAgICAgPSByZXF1aXJlKCcuLi9saWIvU0hBUEUuanMnKSxcbiAgICBlYXJjdXQgICAgICAgPSByZXF1aXJlKCdlYXJjdXQnKSxcbiAgICBHZW9tICAgICAgICAgPSByZXF1aXJlKCcuLy4uL2xpYi9HZW9tJyksXG4gICAgUFJORyAgICAgICAgID0gcmVxdWlyZSgnLi9QUk5HJyk7XG4gICAgLy9CYWxjb255U0hHICAgPSByZXF1aXJlKCcuL0JhbGNvbnlTSEcuanMnKSxcbiAgICAvL1N0YWlyY2FzZVNIRyA9IHJlcXVpcmUoJy4vU3RhaXJjYXNlU0hHLmpzJyk7XG5cbnZhciBzaGcgPSBuZXcgU2hhcGVHcmFtbWFyKCksXG4gICAgbGl0V2luZG93c1JORyAgICAgPSBuZXcgUFJORygzMTMzNyksXG4gICAgYnVpbGRpbmdTaWRlc1JORyAgPSBuZXcgUFJORygzMTMzOCksXG4gICAgYnVpbGRpbmdMYXlvdXRSTkcgPSBuZXcgUFJORygzMTMzOSksXG4gICAgcm5nID0gbmV3IFBSTkcoMzEzMzcpO1xuXG5zaGcuZGVmaW5lKCdCdWlsZGluZycsIG51bGwsIGZ1bmN0aW9uKCkge1xuXG4gIHZhciByZXQgPSBbXSxcbiAgICAgIGN1ckhlaWdodCA9IDA7XG4gIFxuICBmb3IodmFyIGkgPSAwLCBJID0gdGhpcy5mbG9vcnNMYXlvdXQubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgdmFyIGZsaSA9IHRoaXMuZmxvb3JzTGF5b3V0W2ldLCBmbG9vciA9IHtcbiAgICAgIHN5bTogZmxpLnR5cGUsXG4gICAgICBoZWlnaHQ6IGZsaS5oZWlnaHQsXG4gICAgICBwYXJhbXM6IGZsaSxcbiAgICAgIHBvaW50czogdGhpcy5wb2ludHMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgcmV0dXJuIHsgeDogaS54LCB5OiBpLnkgKyBjdXJIZWlnaHQsIHo6IGkueiB9O1xuICAgICAgfSlcbiAgICB9O1xuXG4gICAgaWYoJ2Zyb250RmFjYWRlJyBpbiB0aGlzKVxuICAgICAgZmxvb3IuZnJvbnRGYWNhZGUgPSB0aGlzLmZyb250RmFjYWRlO1xuXG4gICAgY3VySGVpZ2h0ICs9IGZsaS5oZWlnaHQ7XG4gICAgXG4gICAgcmV0LnB1c2goZmxvb3IpO1xuICB9XG5cbiAgcmV0dXJuIHJldDtcblxufSk7XG5cbnNoZy5kZWZpbmUoJ0ZMX0duZEZsb29yJywgbnVsbCwgKGZ1bmN0aW9uKCkge1xuXG4gIHZhciBwMiA9IE1hdGguUEkgKiAyLCBwNCA9IDIgKiBwMixcbiAgICAgIGZpeFRIID0gZnVuY3Rpb24odGgpIHsgcmV0dXJuICh0aCArIHA0KSAlIHAyIH07XG4gIFxuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gIFxuICAgIHZhciBmYWNhZGVzID0gU0hBUEUuZXh0cnVkZUFsbCh0aGlzLnBvaW50cywgdGhpcy5oZWlnaHQsICdGYWNhZGUnLCBbMCwgMSwgMF0pLFxuICAgICAgICB0aCA9IHRoaXMucGFyYW1zLmZyb250U2lkZTtcblxuICAgIHN3aXRjaCh0aGlzLnBhcmFtcy50aWxlcykge1xuICAgICAgY2FzZSAnT25lRG9vcic6XG4gICAgICAgIHZhciBkb29yZiA9IDAsIG1pbkFEID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXG4gICAgICAgIGZvcih2YXIgaSA9IDAsIEkgPSBmYWNhZGVzLmxlbmd0aDsgaSA8IEk7IGkrKykge1xuICAgICAgICAgIGZhY2FkZXNbaV0udHlwZSA9ICdXaW5kb3dzJztcbiAgICAgICAgfVxuICAgICAgICBpZighKCdmcm9udEZhY2FkZScgaW4gdGhpcykpXG4gICAgICAgICAgZm9yKHZhciBpID0gMCwgSSA9IGZhY2FkZXMubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZmkgPSBmYWNhZGVzW2ldLFxuICAgICAgICAgICAgICAgIHgwID0gZmkucG9pbnRzWzBdLngsXG4gICAgICAgICAgICAgICAgejAgPSBmaS5wb2ludHNbMF0ueixcbiAgICAgICAgICAgICAgICB4MSA9IGZpLnBvaW50c1szXS54LFxuICAgICAgICAgICAgICAgIHoxID0gZmkucG9pbnRzWzNdLnosXG4gICAgICAgICAgICAgICAgYWQgPSBNYXRoLmFicyhNYXRoLmF0YW4yKHoxIC0gejAsIHgxIC0geDApIC0gdGgpO1xuXG4gICAgICAgICAgICBpZihhZCA8IG1pbkFEKSB7XG4gICAgICAgICAgICAgIG1pbkFEID0gYWQ7IGRvb3JmID0gaTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgIH1cbiAgICAgICAgZWxzZVxuICAgICAgICAgIGRvb3JmID0gdGhpcy5mcm9udEZhY2FkZTtcblxuICAgICAgICBmYWNhZGVzW2Rvb3JmXS50eXBlID0gJ09uZURvb3InO1xuICAgICAgICBicmVhaztcbiAgICB9XG5cbiAgICByZXR1cm4gZmFjYWRlcztcbiAgfVxuXG59KCkpKTtcblxuc2hnLmRlZmluZSgnRkxfRmxvb3InLCBudWxsLCBmdW5jdGlvbigpIHtcbiAgXG4gIHZhciBmYWNhZGVzID0gU0hBUEUuZXh0cnVkZUFsbCh0aGlzLnBvaW50cywgdGhpcy5oZWlnaHQsICdGYWNhZGUnLCBbMCwgMSwgMF0pO1xuXG4gIGZvcih2YXIgaSA9IDAsIEkgPSBmYWNhZGVzLmxlbmd0aDsgaSA8IEk7IGkrKykge1xuICAgIGZhY2FkZXNbaV0udHlwZSA9ICdXaW5kb3dzJztcbiAgICBmYWNhZGVzW2ldLndpbmRvd3MgPSB0aGlzLnBhcmFtcy53aW5kb3dzO1xuICB9XG5cbiAgcmV0dXJuIGZhY2FkZXM7XG5cbn0pO1xuXG5zaGcuZGVmaW5lKCdGTF9MZWRnZScsIG51bGwsIGZ1bmN0aW9uKCkge1xuXG4gIHZhciBleHRyUG9pbnRzID0gW10sIGggPSB0aGlzLmhlaWdodDtcblxuICBmb3IodmFyIGkgPSAwLCBJID0gdGhpcy5wb2ludHMubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgdmFyIHAwID0gdGhpcy5wb2ludHNbaV0sIHAxID0gdGhpcy5wb2ludHNbKGkgKyAxKSAlIEldLFxuICAgICAgICBhbmdsZSA9IE1hdGguYXRhbjIocDEueiAtIHAwLnosIHAxLnggLSBwMC54KSxcbiAgICAgICAgYW5nbGVwID0gYW5nbGUgLSBNYXRoLlBJIC8gMixcbiAgICAgICAgY29zID0gTWF0aC5jb3MoYW5nbGUpICsgTWF0aC5jb3MoYW5nbGVwKSxcbiAgICAgICAgc2luID0gTWF0aC5zaW4oYW5nbGUpICsgTWF0aC5zaW4oYW5nbGVwKTtcblxuICAgIGV4dHJQb2ludHMucHVzaCh7XG4gICAgICB4OiBwMC54IC0gdGhpcy5wYXJhbXMud2lkdGggKiBjb3MsXG4gICAgICB5OiBwMC55LCBcbiAgICAgIHo6IHAwLnogLSB0aGlzLnBhcmFtcy53aWR0aCAqIHNpblxuICAgIH0pXG4gIH1cblxuICB2YXIgZmFjYWRlcyA9IFNIQVBFLmV4dHJ1ZGVBbGwoZXh0clBvaW50cywgdGhpcy5oZWlnaHQsICdRdWFkJywgWzAsIDEsIDBdKTtcblxuICBmYWNhZGVzLmZvckVhY2goZnVuY3Rpb24oaSkge1xuICAgIHZhciBkeCA9IGkucG9pbnRzWzNdLnggLSBpLnBvaW50c1swXS54LFxuICAgICAgICBkeSA9IGkucG9pbnRzWzFdLnkgLSBpLnBvaW50c1swXS55LFxuICAgICAgICBkeiA9IGkucG9pbnRzWzNdLnogLSBpLnBvaW50c1swXS56O1xuICAgIHZhciB0ID0gaCAvIHNoZy5VVlNDQUxFLFxuICAgICAgICBzID0gdCAqIE1hdGguc3FydChkeCAqIGR4ICsgZHogKiBkeikgLyBkeTtcblxuICAgIGkudXZzID0gW1xuICAgICAgeyBzOiAwLCB0OiB0IH0sXG4gICAgICB7IHM6IDAsIHQ6IDAgfSxcbiAgICAgIHsgczogcywgdDogMCB9LFxuICAgICAgeyBzOiBzLCB0OiB0IH1cbiAgICBdO1xuICAgIGkudGV4SUQgPSA2O1xuICB9KTtcblxuICBmYWNhZGVzLnB1c2goe1xuICAgIHN5bTogJ1BvbHknLFxuICAgIHRleElEOiA2LFxuICAgIHBvaW50czogZXh0clBvaW50c1xuICB9KTtcblxuICBmYWNhZGVzLnB1c2goe1xuICAgIHN5bTogJ1BvbHknLFxuICAgIHRleElEOiA2LFxuICAgIHBvaW50czogZXh0clBvaW50cy5tYXAoZnVuY3Rpb24oaSkge1xuICAgICAgcmV0dXJuIHsgeDogaS54LCB5OiBpLnkgKyBoLCB6OiBpLnogfVxuICAgIH0pXG4gIH0pO1xuXG4gIHJldHVybiBmYWNhZGVzO1xuXG59KTtcblxuc2hnLmRlZmluZSgnRkxfUm9vZnRvcCcsIG51bGwsIGZ1bmN0aW9uKCkge1xuXG4gIHZhciBleHRyUG9pbnRzID0gW10sIGggPSB0aGlzLmhlaWdodDtcblxuICBmb3IodmFyIGkgPSAwLCBJID0gdGhpcy5wb2ludHMubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgdmFyIHAwID0gdGhpcy5wb2ludHNbaV0sIHAxID0gdGhpcy5wb2ludHNbKGkgKyAxKSAlIEldLFxuICAgICAgICBhbmdsZSA9IE1hdGguYXRhbjIocDEueiAtIHAwLnosIHAxLnggLSBwMC54KSxcbiAgICAgICAgYW5nbGVwID0gYW5nbGUgLSBNYXRoLlBJIC8gMixcbiAgICAgICAgY29zID0gTWF0aC5jb3MoYW5nbGUpICsgTWF0aC5jb3MoYW5nbGVwKSxcbiAgICAgICAgc2luID0gTWF0aC5zaW4oYW5nbGUpICsgTWF0aC5zaW4oYW5nbGVwKTtcblxuICAgIGV4dHJQb2ludHMucHVzaCh7XG4gICAgICB4OiBwMC54ICsgdGhpcy5wYXJhbXMud2lkdGggKiBjb3MsXG4gICAgICB5OiBwMC55LCBcbiAgICAgIHo6IHAwLnogKyB0aGlzLnBhcmFtcy53aWR0aCAqIHNpblxuICAgIH0pXG4gIH1cblxuICB2YXIgZmFjYWRlc091dCA9IFNIQVBFLmV4dHJ1ZGVBbGwodGhpcy5wb2ludHMsIHRoaXMuaGVpZ2h0LCAnUXVhZCcsIFswLCAxLCAwXSksXG4gICAgICBmYWNhZGVzSW4gID0gU0hBUEUuZXh0cnVkZUFsbChleHRyUG9pbnRzLCAgdGhpcy5oZWlnaHQsICdRdWFkJywgWzAsIDEsIDBdKTtcblxuICB3aGlsZShmYWNhZGVzT3V0Lmxlbmd0aClcbiAgICBmYWNhZGVzSW4ucHVzaChmYWNhZGVzT3V0LnNoaWZ0KCkpO1xuXG4gIGZhY2FkZXNJbi5mb3JFYWNoKGZ1bmN0aW9uKGkpIHtcbiAgICB2YXIgZHggPSBpLnBvaW50c1szXS54IC0gaS5wb2ludHNbMF0ueCxcbiAgICAgICAgZHkgPSBpLnBvaW50c1sxXS55IC0gaS5wb2ludHNbMF0ueSxcbiAgICAgICAgZHogPSBpLnBvaW50c1szXS56IC0gaS5wb2ludHNbMF0uejtcbiAgICB2YXIgdCA9IGggLyBzaGcuVVZTQ0FMRSxcbiAgICAgICAgcyA9IHQgKiBNYXRoLnNxcnQoZHggKiBkeCArIGR6ICogZHopIC8gZHk7XG5cbiAgICBpLnV2cyA9IFtcbiAgICAgIHsgczogMCwgdDogdCB9LFxuICAgICAgeyBzOiAwLCB0OiAwIH0sXG4gICAgICB7IHM6IHMsIHQ6IDAgfSxcbiAgICAgIHsgczogcywgdDogdCB9XG4gICAgXTtcbiAgICBpLnRleElEID0gNjtcbiAgfSk7XG5cbiAgZmFjYWRlc0luLnB1c2goe1xuICAgIHN5bTogJ1BvbHknLFxuICAgIHBvaW50czogZXh0clBvaW50cyxcbiAgICB0ZXhJRDogM1xuICB9KTtcblxuICBmb3IodmFyIGkgPSAwLCBJID0gZXh0clBvaW50cy5sZW5ndGg7IGkgPCBJOyBpKyspIHtcbiAgICB2YXIgaWkgPSAoaSArIDEpICUgSSxcbiAgICAgICAgcDAgPSB0aGlzLnBvaW50c1tpXSwgcDEgPSBleHRyUG9pbnRzW2ldLFxuICAgICAgICBwMiA9IGV4dHJQb2ludHNbaWldLCBwMyA9IHRoaXMucG9pbnRzW2lpXTtcblxuICAgIHZhciBwb2x5ID0ge1xuICAgICAgc3ltOiAnUG9seScsXG4gICAgICBwb2ludHM6IFsgcDAsIHAxLCBwMiwgcDAsIHAyLCBwMyBdLm1hcChmdW5jdGlvbihpKSB7IHJldHVybiB7IHg6IGkueCwgeTogaS55ICsgaCwgejogaS56IH07IH0pLFxuICAgICAgdGV4SUQ6IDZcbiAgICB9O1xuXG4gICAgZmFjYWRlc0luLnB1c2gocG9seSk7XG4gIH1cblxuICByZXR1cm4gZmFjYWRlc0luO1xufSk7XG5cbnNoZy5kZWZpbmUoJ0ZhY2FkZScsIGZ1bmN0aW9uKCkgeyByZXR1cm4gdGhpcy50eXBlID09PSAnT25lRG9vcicgfSwgZnVuY3Rpb24oKSB7XG5cbiAgdmFyIGR4ID0gdGhpcy5wb2ludHNbM10ueCAtIHRoaXMucG9pbnRzWzBdLngsXG4gICAgICBkeSA9IHRoaXMucG9pbnRzWzFdLnkgLSB0aGlzLnBvaW50c1swXS55LFxuICAgICAgZHogPSB0aGlzLnBvaW50c1szXS56IC0gdGhpcy5wb2ludHNbMF0ueixcbiAgICAgIHQgID0gZHkgLyBzaGcuVVZTQ0FMRSxcbiAgICAgIHMgID0gdCAqIE1hdGguc3FydChkeCAqIGR4ICsgZHogKiBkeikgLyBkeTtcblxuICB0aGlzLnV2cyA9IFtcbiAgICB7IHM6IDAsIHQ6IHQgfSxcbiAgICB7IHM6IDAsIHQ6IDAgfSxcbiAgICB7IHM6IHMsIHQ6IDAgfSxcbiAgICB7IHM6IHMsIHQ6IHQgfVxuICBdO1xuXG4gIHZhciBxdWFkcyA9IFNIQVBFLmZpdCgneCcsIHRoaXMsICdXaW5kb3cnLCAxKTtcblxuICBxdWFkc1sgfn4ocXVhZHMubGVuZ3RoIC8gMikgXS5zeW0gPSAnRG9vcic7XG4gIC8vcXVhZHMuc3BsaWNlKE1hdGguZmxvb3IocXVhZHMubGVuZ3RoIC8gMiksIDEpO1xuICBcbiAgZm9yKHZhciBpID0gMCwgSSA9IHF1YWRzLmxlbmd0aDsgaSA8IEk7IGkrKylcbiAgICBxdWFkc1tpXS5ub3JtYWwgPSB0aGlzLm5vcm1hbDtcblxuICByZXR1cm4gcXVhZHM7XG5cbn0pO1xuXG5zaGcuZGVmaW5lKCdGYWNhZGUnLCBudWxsLCBmdW5jdGlvbigpIHtcblxuICB2YXIgZHggPSB0aGlzLnBvaW50c1szXS54IC0gdGhpcy5wb2ludHNbMF0ueCxcbiAgICAgIGR5ID0gdGhpcy5wb2ludHNbMV0ueSAtIHRoaXMucG9pbnRzWzBdLnksXG4gICAgICBkeiA9IHRoaXMucG9pbnRzWzNdLnogLSB0aGlzLnBvaW50c1swXS56LFxuICAgICAgdCAgPSBkeSAvIHNoZy5VVlNDQUxFLFxuICAgICAgcyAgPSB0ICogTWF0aC5zcXJ0KGR4ICogZHggKyBkeiAqIGR6KSAvIGR5O1xuXG4gIHRoaXMudXZzID0gW1xuICAgIHsgczogMCwgdDogdCB9LFxuICAgIHsgczogMCwgdDogMCB9LFxuICAgIHsgczogcywgdDogMCB9LFxuICAgIHsgczogcywgdDogdCB9XG4gIF07XG5cbiAgdmFyIHF1YWRzID0gU0hBUEUuZml0KCd4JywgdGhpcywgJ1dpbmRvdycsIDEpO1xuXG4gIGZvcih2YXIgaSA9IDAsIEkgPSBxdWFkcy5sZW5ndGg7IGkgPCBJOyBpKyspXG4gICAgcXVhZHNbaV0ubm9ybWFsID0gdGhpcy5ub3JtYWw7XG5cbiAgcmV0dXJuIHF1YWRzO1xuXG59KTtcblxuc2hnLmRlZmluZSgnV2luZG93JywgbnVsbCwgZnVuY3Rpb24oKSB7XG4gIFxuICB2YXIgaHNwID0gU0hBUEUuc3BsaXQodGhpcywgWyAuMywgLjQsIC4zIF0sIFsxXSwgJ1F1YWQnKSxcbiAgICAgIHZzcCA9IFNIQVBFLnNwbGl0KGhzcFsxXSwgWzFdLCBbLjE1LCAuNywgLjE1XSwgJ1F1YWQnKSxcbiAgICAgIHdpbmRvd1BhbmUgPSB2c3BbMV07XG5cbiAgdmFyIHdwdXZzID0gd2luZG93UGFuZS51dnM7XG4gIHdpbmRvd1BhbmUudXZzID0gbnVsbDtcbiAgd2luZG93UGFuZS50ZXhJRCA9IChsaXRXaW5kb3dzUk5HLnJhbmRvbSgpID4gLjMgPyA0IDogNSk7XG5cbiAgaHNwWzBdLnRleElEID0gaHNwWzJdLnRleElEID0gdnNwWzBdLnRleElEID0gdnNwWzJdLnRleElEID0gNjtcblxuICB2YXIgcmV0ID0gWyBoc3BbMF0sIGhzcFsyXSwgdnNwWzBdLCB2c3BbMl0gXTtcblxuICB2YXIgbm9ybSA9IEdlb20udHJpVG9Ob3JtYWwoW1xuICAgIHdpbmRvd1BhbmUucG9pbnRzWzBdLngsIHdpbmRvd1BhbmUucG9pbnRzWzBdLnksIHdpbmRvd1BhbmUucG9pbnRzWzBdLnosIFxuICAgIHdpbmRvd1BhbmUucG9pbnRzWzFdLngsIHdpbmRvd1BhbmUucG9pbnRzWzFdLnksIHdpbmRvd1BhbmUucG9pbnRzWzFdLnosIFxuICAgIHdpbmRvd1BhbmUucG9pbnRzWzJdLngsIHdpbmRvd1BhbmUucG9pbnRzWzJdLnksIHdpbmRvd1BhbmUucG9pbnRzWzJdLnpcbiAgXSk7XG5cbiAgdmFyIGJvcmRlcnMgPSBTSEFQRS5leHRydWRlQWxsKHdpbmRvd1BhbmUucG9pbnRzLCAtLjAwNSwgJ1F1YWQnLCBub3JtKTtcbiAgdmFyIG5YID0gbm9ybVswXSxcbiAgICAgIG5ZID0gbm9ybVsxXSxcbiAgICAgIG5aID0gbm9ybVsyXTtcbiAgXG4gIG5YICo9IC4wMDU7XG4gIG5ZICo9IC4wMDU7XG4gIG5aICo9IC4wMDU7XG5cbiAgZm9yKHZhciBpID0gMCwgSSA9IHdpbmRvd1BhbmUucG9pbnRzLmxlbmd0aDsgaSA8IEk7IGkrKykge1xuICAgIHZhciBwID0gd2luZG93UGFuZS5wb2ludHNbaV07XG4gICAgcC54IC09IG5YO1xuICAgIHAueSAtPSBuWTtcbiAgICBwLnogLT0gblo7XG4gIH1cblxuICBmb3IodmFyIGkgPSAwLCBJID0gYm9yZGVycy5sZW5ndGg7IGkgPCBJOyBpKyspIHtcbiAgICBib3JkZXJzW2ldLnRleElEID0gMztcbiAgICByZXQucHVzaChib3JkZXJzW2ldKTtcbiAgfVxuICByZXQucHVzaCh3aW5kb3dQYW5lKTtcblxuICByZXR1cm4gcmV0O1xuXG59KTtcblxuc2hnLmRlZmluZSgnRG9vcicsIG51bGwsIGZ1bmN0aW9uKCkge1xuICBcbiAgdmFyIGhzcCA9IFNIQVBFLnNwbGl0KHRoaXMsIFsgLjE1LCAuNywgLjE1IF0sIFsxXSwgJ1F1YWQnKSxcbiAgICAgIHZzcCA9IFNIQVBFLnNwbGl0KGhzcFsxXSwgWzFdLCBbLjcsIC4zIF0sICdRdWFkJyksXG4gICAgICB3aW5kb3dQYW5lID0gdnNwWzBdO1xuXG4gIHZhciB3cHV2cyA9IHdpbmRvd1BhbmUudXZzO1xuICB3aW5kb3dQYW5lLnV2cyA9IG51bGw7XG4gIHdpbmRvd1BhbmUudGV4SUQgPSAobGl0V2luZG93c1JORy5yYW5kb20oKSA+IC4zID8gNCA6IDUpO1xuXG4gIGhzcFswXS50ZXhJRCA9IGhzcFsyXS50ZXhJRCA9IHZzcFsxXS50ZXhJRCA9IDY7XG5cbiAgdmFyIHJldCA9IFsgaHNwWzBdLCBoc3BbMl0sIHZzcFsxXSBdO1xuXG4gIHZhciBub3JtID0gR2VvbS50cmlUb05vcm1hbChbXG4gICAgd2luZG93UGFuZS5wb2ludHNbMF0ueCwgd2luZG93UGFuZS5wb2ludHNbMF0ueSwgd2luZG93UGFuZS5wb2ludHNbMF0ueiwgXG4gICAgd2luZG93UGFuZS5wb2ludHNbMV0ueCwgd2luZG93UGFuZS5wb2ludHNbMV0ueSwgd2luZG93UGFuZS5wb2ludHNbMV0ueiwgXG4gICAgd2luZG93UGFuZS5wb2ludHNbMl0ueCwgd2luZG93UGFuZS5wb2ludHNbMl0ueSwgd2luZG93UGFuZS5wb2ludHNbMl0uelxuICBdKTtcblxuICB2YXIgYm9yZGVycyA9IFNIQVBFLmV4dHJ1ZGVBbGwod2luZG93UGFuZS5wb2ludHMsIC0uMDA1LCAnUXVhZCcsIG5vcm0pO1xuICB2YXIgblggPSBub3JtWzBdLFxuICAgICAgblkgPSBub3JtWzFdLFxuICAgICAgblogPSBub3JtWzJdO1xuICBcbiAgblggKj0gLjAwNTtcbiAgblkgKj0gLjAwNTtcbiAgblogKj0gLjAwNTtcblxuICBmb3IodmFyIGkgPSAwLCBJID0gd2luZG93UGFuZS5wb2ludHMubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgdmFyIHAgPSB3aW5kb3dQYW5lLnBvaW50c1tpXTtcbiAgICBwLnggLT0gblg7XG4gICAgcC55IC09IG5ZO1xuICAgIHAueiAtPSBuWjtcbiAgfVxuXG4gIGZvcih2YXIgaSA9IDAsIEkgPSBib3JkZXJzLmxlbmd0aDsgaSA8IEk7IGkrKykge1xuICAgIGJvcmRlcnNbaV0udGV4SUQgPSAzO1xuICAgIHJldC5wdXNoKGJvcmRlcnNbaV0pO1xuICB9XG4gIHJldC5wdXNoKHdpbmRvd1BhbmUpO1xuXG4gIHJldHVybiByZXQ7XG5cbn0pO1xuXG5zaGcuZGVmaW5lKCdRdWFkJywgbnVsbCwgKGZ1bmN0aW9uKCkge1xuXG4gIHZhciBkZWZhdWx0VVZTID0gWyBcbiAgICB7IHM6IDAsIHQ6IDEgfSwgXG4gICAgeyBzOiAwLCB0OiAwIH0sIFxuICAgIHsgczogMSwgdDogMCB9LCBcbiAgICB7IHM6IDEsIHQ6IDEgfSBcbiAgXTtcblxuICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgXG4gICAgdmFyIHZlcnRpY2VzLCBub3JtYWxzID0gW10sIHV2cyxcbiAgICAgICAgbm9ybWFsLCB0ZXhJRCxcbiAgICAgICAgdTAsIHUxLCB1MiwgdTMsXG4gICAgICAgIHAwLCBwMSwgcDIsIHAzLCBwcyA9IHRoaXMucG9pbnRzO1xuXG4gICAgcDAgPSBwc1swXSwgcDEgPSBwc1sxXSwgcDIgPSBwc1syXSwgcDMgPSBwc1szXTtcblxuICAgIHZlcnRpY2VzID0gW1xuICAgICAgcDAueCwgcDAueSwgcDAueiwgcDEueCwgcDEueSwgcDEueiwgcDIueCwgcDIueSwgcDIueixcbiAgICAgIHAwLngsIHAwLnksIHAwLnosIHAyLngsIHAyLnksIHAyLnosIHAzLngsIHAzLnksIHAzLnpcbiAgICBdO1xuXG4gICAgbm9ybWFsID0gdGhpcy5ub3JtYWwgfHwgR2VvbS50cmlUb05vcm1hbCh2ZXJ0aWNlcyk7XG4gICAgZm9yKHZhciBpID0gMDsgaSA8IDY7IGkrKylcbiAgICAgIG5vcm1hbHMucHVzaChub3JtYWxbMF0sIG5vcm1hbFsxXSwgbm9ybWFsWzJdKTtcblxuICAgIHV2cyA9IHRoaXMudXZzIHx8IGRlZmF1bHRVVlM7XG4gICAgdTAgPSB1dnNbMF0sIHUxID0gdXZzWzFdLCB1MiA9IHV2c1syXSwgdTMgPSB1dnNbM107XG4gICAgdGV4SUQgPSB0aGlzLnRleElEIHx8IDA7XG5cbiAgICB1dnMgPSBbXG4gICAgICB1MC5zLCB1MC50LCB0ZXhJRCwgdTEucywgdTEudCwgdGV4SUQsIHUyLnMsIHUyLnQsIHRleElELFxuICAgICAgdTAucywgdTAudCwgdGV4SUQsIHUyLnMsIHUyLnQsIHRleElELCB1My5zLCB1My50LCB0ZXhJRFxuICAgIF07XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3ltOiBTaGFwZUdyYW1tYXIuVEVSTUlOQUwsXG4gICAgICB2ZXJ0aWNlczogdmVydGljZXMsXG4gICAgICBub3JtYWxzOiBub3JtYWxzLFxuICAgICAgdXZzOiB1dnNcbiAgICB9XG5cbiAgfVxuXG59KCkpKTtcblxuc2hnLmRlZmluZSgnUG9seScsIG51bGwsIGZ1bmN0aW9uKCkge1xuICB2YXIgcmluZ3MgPSB0aGlzLnBvaW50cy5tYXAoZnVuY3Rpb24oaSkge1xuICAgIHJldHVybiBbaS54LCBpLnpdO1xuICB9KSwgeSA9IHRoaXMucG9pbnRzWzBdLnk7XG5cbiAgdmFyIHRyaXZlcnRzID0gZWFyY3V0KFtyaW5nc10pLFxuICAgICAgdmVydGljZXMgPSB0cml2ZXJ0cy5yZWR1Y2UoZnVuY3Rpb24obywgaSkge1xuICAgICAgICBvLnB1c2goaVswXSwgeSwgaVsxXSk7XG4gICAgICAgIHJldHVybiBvO1xuICAgICAgfSwgW10pLFxuICAgICAgbm9ybWFsID0gdGhpcy5ub3JtYWwgfHwgR2VvbS50cmlUb05vcm1hbCh2ZXJ0aWNlcyksXG4gICAgICBub3JtYWxzID0gW10sIHV2cyA9IFtdO1xuXG4gIHZhciBtaW5YLCBtaW5aLCBtYXhYLCBtYXhaLCBkeCwgZHosIHA7XG5cbiAgbWluWCA9IG1pblogPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gIG1heFggPSBtYXhaID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuXG4gIGZvcih2YXIgaSA9IDAsIEkgPSB0aGlzLnBvaW50cy5sZW5ndGg7IGkgPCBJOyBpKyspIHtcbiAgICBwID0gdGhpcy5wb2ludHNbaV07XG4gICAgaWYobWluWCA+IHAueCkgbWluWCA9IHAueDtcbiAgICBpZihtYXhYIDwgcC54KSBtYXhYID0gcC54O1xuICAgIGlmKG1pblogPiBwLnopIG1pblogPSBwLno7XG4gICAgaWYobWF4WiA8IHAueikgbWF4WiA9IHAuejtcbiAgfVxuXG4gIGR4ID0gbWF4WCAtIG1pblg7XG4gIGR6ID0gbWF4WiAtIG1pblo7XG5cbiAgZm9yKHZhciBpID0gMCwgSSA9IHZlcnRpY2VzLmxlbmd0aDsgaSA8IEk7IGkgKz0gMykge1xuICAgIHZhciB4ID0gdmVydGljZXNbaV0sIHogPSB2ZXJ0aWNlc1tpICsgMl07XG4gICAgdXZzLnB1c2goICh4IC0gbWluWCkgLyBkeCwgKHogLSBtaW5aKSAvIGR6LCB0aGlzLnRleElEICk7XG4gICAgbm9ybWFscy5wdXNoKG5vcm1hbFswXSwgbm9ybWFsWzFdLCBub3JtYWxbMl0pO1xuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBzeW06IFNoYXBlR3JhbW1hci5URVJNSU5BTCxcbiAgICB2ZXJ0aWNlczogdmVydGljZXMsXG4gICAgbm9ybWFsczogbm9ybWFscyxcbiAgICB1dnM6IHV2c1xuICB9XG5cbn0pO1xuXG4vKlxuICB2YXIgaGV4MnJnYmYgPSBmdW5jdGlvbihpKSB7IFxuICAgIHJldHVybiBpLnJlcGxhY2UoLyMoLi4pKC4uKSguLikvZywgJyQxLCQyLCQzJylcbiAgICAgICAgICAgIC5zcGxpdCgnLCcpXG4gICAgICAgICAgICAubWFwKGZ1bmN0aW9uKGopIHsgXG4gICAgICAgICAgICAgIHJldHVybiAocGFyc2VJbnQoaiwgMTYpIC8gMjU1KS50b0ZpeGVkKDIpIFxuICAgICAgICAgICAgfSk7IFxuICB9XG4qL1xudmFyIGF2YWlsQ29sb3JzID0gW1xuICAvL1sgLjg4LCAuODgsIC44OCBdLFxuICBbIC42NiwgLjY2LCAuNjYgXSxcbiAgLy9bIDEsICAgLjk3LCAuODMgXSxcbiAgWyAuOTAsIC42NSwgLjQ4IF0sXG4gIC8vWyAuNjgsIC41MywgLjQ2IF0sXG4gIFsgLjcyLCAuNDMsIC4zNSBdXG5dO1xuXG5zaGcuVVZTQ0FMRSA9IC4xO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgc2hnOiBzaGcsXG4gIGNyZWF0ZTogZnVuY3Rpb24obG90KSB7XG4gICAgLy9jb250ZXh0LnJuZy5zZWVkKDEwKTtcblxuICAgIHZhciBkeCA9IGxvdC53aWR0aCAvIDIsIGR5ID0gbG90LmRlcHRoIC8gMixcbiAgICAgICAgeDAgPSBsb3QueCAtIGR4LCB4MSA9IGxvdC54ICsgZHgsXG4gICAgICAgIHkwID0gbG90LnkgLSBkeSwgeTEgPSBsb3QueSArIGR5LFxuICAgICAgICByYXRpbyA9IE1hdGgubWF4KGR4IC8gZHksIGR5IC8gZHgpLFxuICAgICAgICBmcm9udEZhY2FkZSA9IG51bGw7XG5cbiAgICB2YXIgcHRzID0gW107XG5cbiAgICBpZihyYXRpbyA8IDEuMyAmJiBidWlsZGluZ1NpZGVzUk5HLnJhbmRvbSgpIDwgLjMpIHtcbiAgICAgIC8vXG4gICAgICAvLyBPY3RhZ29uIGJ1aWxkaW5nIGJhc2UuIFVuY29tbW9uXG4gICAgICAvL1xuICAgICAgZm9yKHZhciBpID0gMDsgaSA8IDg7IGkrKykge1xuICAgICAgICB2YXIgYW5nID0gLWxvdC5hbmdsZSAtIGkgKiBNYXRoLlBJIC8gNDtcbiAgICAgICAgcHRzLnB1c2goeyBcbiAgICAgICAgICB4IDogbG90LnggKyBkeCAqIE1hdGguY29zKGFuZyksIFxuICAgICAgICAgIHk6IDAsIFxuICAgICAgICAgIHo6IGxvdC55ICsgZHkgKiBNYXRoLnNpbihhbmcpIFxuICAgICAgICB9KTsgXG4gICAgICAgIGZyb250RmFjYWRlID0gMDtcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYocmF0aW8gPiAxLjUgJiYgYnVpbGRpbmdTaWRlc1JORy5yYW5kb20oKSA8IC44KSB7XG4gICAgICAvL1xuICAgICAgLy8gQnVpbGRpbmcgd2l0aCBhbiBpbndhcmQtZXh0cnVkZWQgcGFydCwgZmFjaW5nIHRoZVxuICAgICAgLy8gZnJvbnQgb2YgdGhlIHN0cmVldFxuICAgICAgLy9cbiAgICAgIGlmKGR4ID4gZHkpIHtcbiAgICAgICAgLy9cbiAgICAgICAgLy8gTG90IGFuZ2xlIGNhbiBlaXRoZXIgYmUgMCAoZnJvbnQgZmFjaW5nKSBvciDPgCAoYmFjayBmYWNpbmcpXG4gICAgICAgIC8vXG4gICAgICAgIGlmKGxvdC5hbmdsZSA8IDEwZS0yKSB7XG4gICAgICAgICAgcHRzLnB1c2goXG4gICAgICAgICAgICB7IHg6IHgwLCB5OiAwLCB6OiB5MCB9LFxuICAgICAgICAgICAgeyB4OiB4MCwgeTogMCwgejogeTEgfSxcbiAgICAgICAgICAgIHsgeDogeDAgKyBkeCAqIDIgLyAzLCB5OiAwLCB6OiB5MSB9LFxuICAgICAgICAgICAgeyB4OiB4MCArIGR4ICogMiAvIDMsIHk6IDAsIHo6IHkxIC0gZHkgKiAyIC8gMyB9LFxuICAgICAgICAgICAgeyB4OiB4MSAtIGR4ICogMiAvIDMsIHk6IDAsIHo6IHkxIC0gZHkgKiAyIC8gMyB9LFxuICAgICAgICAgICAgeyB4OiB4MSAtIGR4ICogMiAvIDMsIHk6IDAsIHo6IHkxIH0sXG4gICAgICAgICAgICB7IHg6IHgxLCB5OiAwLCB6OiB5MSB9LFxuICAgICAgICAgICAgeyB4OiB4MSwgeTogMCwgejogeTAgfVxuICAgICAgICAgICk7XG4gICAgICAgICAgZnJvbnRGYWNhZGUgPSAzO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHB0cy5wdXNoKFxuICAgICAgICAgICAgeyB4OiB4MCwgeTogMCwgejogeTAgfSxcbiAgICAgICAgICAgIHsgeDogeDAsIHk6IDAsIHo6IHkxIH0sXG4gICAgICAgICAgICB7IHg6IHgxLCB5OiAwLCB6OiB5MSB9LFxuICAgICAgICAgICAgeyB4OiB4MSwgeTogMCwgejogeTAgfSxcbiAgICAgICAgICAgIHsgeDogeDEgLSBkeCAqIDIgLyAzLCB5OiAwLCB6OiB5MCB9LFxuICAgICAgICAgICAgeyB4OiB4MSAtIGR4ICogMiAvIDMsIHk6IDAsIHo6IHkwICsgZHkgKiAyIC8gMyB9LFxuICAgICAgICAgICAgeyB4OiB4MCArIGR4ICogMiAvIDMsIHk6IDAsIHo6IHkwICsgZHkgKiAyIC8gMyB9LFxuICAgICAgICAgICAgeyB4OiB4MCArIGR4ICogMiAvIDMsIHk6IDAsIHo6IHkwIH1cbiAgICAgICAgICApO1xuICAgICAgICAgIGZyb250RmFjYWRlID0gNTtcbiAgICAgICAgfSBcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vXG4gICAgICAgIC8vIExvdCBhbmdsZSBjYW4gZWl0aGVyIGJlIM+ALzIgKHJpZ2h0IGZhY2luZykgb3IgLc+ALzIgKGxlZnQgZmFjaW5nKVxuICAgICAgICAvL1xuICAgICAgICBpZihsb3QuYW5nbGUgPiAwKSB7XG4gICAgICAgICAgcHRzLnB1c2goXG4gICAgICAgICAgICB7IHg6IHgwLCB5OiAwLCB6OiB5MCB9LFxuICAgICAgICAgICAgeyB4OiB4MCwgeTogMCwgejogeTAgKyBkeSAqIDIgLyAzIH0sXG4gICAgICAgICAgICB7IHg6IHgwICsgZHggKiAyIC8gMywgeTogMCwgejogeTAgKyBkeSAqIDIgLyAzIH0sXG4gICAgICAgICAgICB7IHg6IHgwICsgZHggKiAyIC8gMywgeTogMCwgejogeTEgLSBkeSAqIDIgLyAzIH0sXG4gICAgICAgICAgICB7IHg6IHgwLCB5OiAwLCB6OiB5MSAtIGR5ICogMiAvIDMgfSxcbiAgICAgICAgICAgIHsgeDogeDAsIHk6IDAsIHo6IHkxIH0sXG4gICAgICAgICAgICB7IHg6IHgxLCB5OiAwLCB6OiB5MSB9LFxuICAgICAgICAgICAgeyB4OiB4MSwgeTogMCwgejogeTAgfVxuICAgICAgICAgICk7XG4gICAgICAgICAgZnJvbnRGYWNhZGUgPSAyO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHB0cy5wdXNoKFxuICAgICAgICAgICAgeyB4OiB4MCwgeTogMCwgejogeTAgfSxcbiAgICAgICAgICAgIHsgeDogeDAsIHk6IDAsIHo6IHkxIH0sXG4gICAgICAgICAgICB7IHg6IHgxLCB5OiAwLCB6OiB5MSB9LFxuICAgICAgICAgICAgeyB4OiB4MSwgeTogMCwgejogeTEgLSBkeSAqIDIgLyAzIH0sXG4gICAgICAgICAgICB7IHg6IHgxIC0gZHggKiAyIC8gMywgeTogMCwgejogeTEgLSBkeSAqIDIgLyAzIH0sXG4gICAgICAgICAgICB7IHg6IHgxIC0gZHggKiAyIC8gMywgeTogMCwgejogeTAgKyBkeSAqIDIgLyAzIH0sXG4gICAgICAgICAgICB7IHg6IHgxLCB5OiAwLCB6OiB5MCArIGR5ICogMiAvIDMgfSxcbiAgICAgICAgICAgIHsgeDogeDEsIHk6IDAsIHo6IHkwIH1cbiAgICAgICAgICApO1xuICAgICAgICAgIGZyb250RmFjYWRlID0gNDtcbiAgICAgICAgXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcHRzLnB1c2goXG4gICAgICAgIHsgeDogeDAsIHk6IDAsIHo6IHkwIH0sXG4gICAgICAgIHsgeDogeDAsIHk6IDAsIHo6IHkxIH0sXG4gICAgICAgIHsgeDogeDEsIHk6IDAsIHo6IHkxIH0sXG4gICAgICAgIHsgeDogeDEsIHk6IDAsIHo6IHkwIH1cbiAgICAgICk7XG4gICAgICBpZihkeCA+IGR5KSB7XG4gICAgICAgIGlmKGxvdC5hbmdsZSA8IDEwZS0yKSBmcm9udEZhY2FkZSA9IDE7XG4gICAgICAgIGVsc2UgZnJvbnRGYWNhZGUgPSAzO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYobG90LmFuZ2xlIDwgMCkgZnJvbnRGYWNhZGUgPSAyO1xuICAgICAgICBlbHNlIGZyb250RmFjYWRlID0gMDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB2YXIgZmxvb3JMYXlvdXQgPSBbXSwgZmxJZCA9IH5+KGJ1aWxkaW5nTGF5b3V0Uk5HLnJhbmRvbSgpICogMik7XG5cbiAgICBzd2l0Y2goZmxJZCkge1xuICAgICAgY2FzZSAwOiAvLyBXaXRoIGxlZGdlXG4gICAgICAgIGZsb29yTGF5b3V0LnB1c2goXG4gICAgICAgICAgeyB0eXBlOiAnRkxfR25kRmxvb3InLCBoZWlnaHQ6IC4xLCB0aWxlczogJ09uZURvb3InLCBcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb250U2lkZTogbG90LmFuZ2xlIH0sXG4gICAgICAgICAgeyB0eXBlOiAnRkxfTGVkZ2UnLCAgICBoZWlnaHQ6IC4wMjUsIHdpZHRoOiAuMDA2MjUgfVxuICAgICAgICApO1xuICAgICAgICBmb3IodmFyIGkgPSAwLCBJID0gNCArIH5+KHJuZy5yYW5kb20oKSAqIDEwKTsgaSA8IEk7IGkrKylcbiAgICAgICAgICBmbG9vckxheW91dC5wdXNoKFxuICAgICAgICAgICAgeyB0eXBlOiAnRkxfRmxvb3InLCAgaGVpZ2h0OiAuMSwgd2luZG93czogJ0RvdWJsZScgfVxuICAgICAgICAgICk7XG4gICAgICAgIGZsb29yTGF5b3V0LnB1c2goXG4gICAgICAgICAgeyB0eXBlOiAnRkxfTGVkZ2UnLCAgICBoZWlnaHQ6IC4wMjUsIHdpZHRoOiAuMDA2MjUgfSxcbiAgICAgICAgICB7IHR5cGU6ICdGTF9GbG9vcicsICAgIGhlaWdodDogLjE1LCB3aW5kb3dzOiAnU2luZ2xlJyB9LFxuICAgICAgICAgIHsgdHlwZTogJ0ZMX1Jvb2Z0b3AnLCAgaGVpZ2h0OiAuMDI1LCB3aWR0aDogLjAwNjI1IH1cbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDE6IC8vIFdpdGhvdXQgbGVkZ2VcbiAgICAgICAgZmxvb3JMYXlvdXQucHVzaChcbiAgICAgICAgICB7IHR5cGU6ICdGTF9HbmRGbG9vcicsIGhlaWdodDogLjEsIHRpbGVzOiAnT25lRG9vcicsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBmcm9udFNpZGU6IGxvdC5hbmdsZSB9XG4gICAgICAgICk7XG4gICAgICAgIGZvcih2YXIgaSA9IDAsIEkgPSA0ICsgfn4ocm5nLnJhbmRvbSgpICogMTApOyBpIDwgSTsgaSsrKVxuICAgICAgICAgIGZsb29yTGF5b3V0LnB1c2goXG4gICAgICAgICAgICB7IHR5cGU6ICdGTF9GbG9vcicsICBoZWlnaHQ6IC4xLCB3aW5kb3dzOiAnRG91YmxlJyB9XG4gICAgICAgICAgKTtcbiAgICAgICAgZmxvb3JMYXlvdXQucHVzaChcbiAgICAgICAgICB7IHR5cGU6ICdGTF9GbG9vcicsICAgIGhlaWdodDogLjE1LCB3aW5kb3dzOiAnU2luZ2xlJyB9LFxuICAgICAgICAgIHsgdHlwZTogJ0ZMX1Jvb2Z0b3AnLCAgaGVpZ2h0OiAuMDI1LCB3aWR0aDogLjAwNjI1IH1cbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgdmFyIGF4aW9tID0ge1xuICAgICAgc3ltOiAnQnVpbGRpbmcnLFxuICAgICAgZmxvb3JzTGF5b3V0OiBmbG9vckxheW91dCxcbiAgICAgIHBvaW50czogcHRzXG4gICAgfTtcblxuICAgIGlmKGZyb250RmFjYWRlICE9PSBudWxsKVxuICAgICAgYXhpb20uZnJvbnRGYWNhZGUgPSBmcm9udEZhY2FkZTtcblxuICAgIHZhciBjb2xvciA9IGF2YWlsQ29sb3JzWyB+fihybmcucmFuZG9tKCkgKiBhdmFpbENvbG9ycy5sZW5ndGgpIF07XG5cbiAgICB2YXIgcmV0ID0gc2hnLnJ1bihheGlvbSk7XG4gICAgcmV0dXJuIHsgZ2VvbTogcmV0LCBjb2xvcjogY29sb3IgfTtcbiAgfSxcbiAgZ2V0R2VvbTogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGNvbnRleHQ7XG4gIH1cblxufVxuIiwidmFyIFBSTkcgID0gbmV3IChyZXF1aXJlKCcuL1BSTkcnKSksXG4gICAgR2VvbSAgPSByZXF1aXJlKCcuLy4uL2xpYi9HZW9tJyksXG4gICAgUm9hZHMgPSByZXF1aXJlKCcuL1JvYWRzLmpzJyksXG4gICAgQmxvY2sgPSByZXF1aXJlKCcuL0Jsb2NrLmpzJyksXG4gICAgU2hhcGVHcmFtbWFyID0gcmVxdWlyZSgnLi4vbGliL1NoYXBlR3JhbW1hci5qcycpO1xuXG52YXIgdHJhdmVyc2UgPSAoZnVuY3Rpb24oKSB7XG5cbiAgdmFyIHBpMiA9IE1hdGguUEkgKiAyO1xuXG4gIHJldHVybiBmdW5jdGlvbihlZGdlQSwgZWRnZUIsIHJvYWRzLCBmYWNlKSB7XG4gICAgdmFyIGVkZ2VEaXIgPSBNYXRoLmF0YW4yKC0gZWRnZUIueSArIGVkZ2VBLnksIGVkZ2VCLnggLSBlZGdlQS54KSxcbiAgICAgICAgbmV4dERpciwgbmV4dFZ0eCwgaW9sLFxuICAgICAgICByaWdodG1vc3QgPSB7IHRoOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIHZlcnRleDogbnVsbCB9O1xuICAgICAgICBcbiAgICBpZighKCd0cmF2ZXJzZWQnIGluIGVkZ2VBKSlcbiAgICAgIGVkZ2VBLnRyYXZlcnNlZCA9IFtdO1xuICAgIGlmKCEoJ3RyYXZlcnNlZCcgaW4gZWRnZUIpKVxuICAgICAgZWRnZUIudHJhdmVyc2VkID0gW107XG5cbiAgICBlZGdlQS50cmF2ZXJzZWQucHVzaChlZGdlQik7XG5cbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgZWRnZUIuY29ubnMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG5leHRWdHggPSBlZGdlQi5jb25uc1tpXTtcblxuICAgICAgaWYobmV4dFZ0eCA9PT0gZWRnZUEgfHwgZWRnZUIudHJhdmVyc2VkLmluZGV4T2YobmV4dFZ0eCkgIT09IC0xIHx8IChmYWNlICYmIG5leHRWdHggIT09IGZhY2VbMF0gJiYgZmFjZS5pbmRleE9mKG5leHRWdHgpICE9PSAtMSkpXG4gICAgICAgIGNvbnRpbnVlO1xuXG4gICAgICBuZXh0RGlyID0gTWF0aC5hdGFuMigtIG5leHRWdHgueSArIGVkZ2VCLnksIG5leHRWdHgueCAtIGVkZ2VCLngpIC0gZWRnZURpcjtcbiAgICAgIGlmKG5leHREaXIgPiBNYXRoLlBJKVxuICAgICAgICBuZXh0RGlyIC09IHBpMjtcbiAgICAgIGVsc2UgaWYobmV4dERpciA8IC0gTWF0aC5QSSlcbiAgICAgICAgbmV4dERpciArPSBwaTI7XG4gICAgICBpZihuZXh0RGlyIDwgcmlnaHRtb3N0LnRoKSB7XG4gICAgICAgIHJpZ2h0bW9zdC50aCA9IG5leHREaXI7XG4gICAgICAgIHJpZ2h0bW9zdC52ZXJ0ZXggPSBlZGdlQi5jb25uc1tpXTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZihyaWdodG1vc3QudmVydGV4ID09PSBudWxsKVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBpZihmYWNlKVxuICAgICAgZmFjZS5wdXNoKGVkZ2VCKTtcblxuICAgIGlmKGZhY2UgJiYgcmlnaHRtb3N0LnZlcnRleCA9PT0gZmFjZVswXSkge1xuICAgICAgaW9sID0gR2VvbS5pc092ZXJsYXBwaW5nKGZhY2UsIHJvYWRzKTtcblxuICAgICAgaWYoaW9sKVxuICAgICAgICByZXR1cm4gbnVsbDtcblxuICAgICAgZWRnZUIudHJhdmVyc2VkLnB1c2goZmFjZVswXSk7XG5cbiAgICAgIHJldHVybiBmYWNlO1xuICAgIH1cblxuICAgIGZhY2UgPSB0cmF2ZXJzZShlZGdlQiwgcmlnaHRtb3N0LnZlcnRleCwgcm9hZHMsIGZhY2UgfHwgWyBlZGdlQSwgZWRnZUIgXSk7XG4gICAgaWYoZmFjZSA9PT0gbnVsbCkge1xuICAgICAgZWRnZUIudHJhdmVyc2VkLnNwbGljZShlZGdlQi50cmF2ZXJzZWQuaW5kZXhPZihyaWdodG1vc3QudmVydGV4KSwgMSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGZhY2UgfHwgbnVsbDtcbiAgfVxuXG59KCkpO1xuXG52YXIgQ2l0eSA9IGZ1bmN0aW9uKHNlZWQpIHtcbiAgUFJORy5zZWVkKHNlZWQpO1xuXG4gIHZhciBwb2x5cyA9IFtdO1xuXG4gIHRoaXMucm9hZHMgPSBSb2FkcygpO1xuICAvL2NvbnNvbGUubG9nKHRoaXMucm9hZHMpXG4gIHRoaXMuYmxvY2tzID0gW107XG5cbiAgZm9yKHZhciBpID0gMDsgaSA8IHRoaXMucm9hZHMubGVuZ3RoOyBpKyspIHtcbiAgICBmb3IodmFyIGogPSAwOyBqIDwgdGhpcy5yb2Fkc1tpXS5jb25ucy5sZW5ndGg7IGorKykge1xuICAgICAgaWYoISgndHJhdmVyc2VkJyBpbiB0aGlzLnJvYWRzW2ldKSlcbiAgICAgICAgdGhpcy5yb2Fkc1tpXS50cmF2ZXJzZWQgPSBbXTtcbiAgICAgIC8vdGhpcy5yb2Fkc1tpXS50cmF2ZXJzZWRbal0gPSB0cnVlO1xuICAgICAgdmFyIHBvbHkgPSB0cmF2ZXJzZSh0aGlzLnJvYWRzW2ldLCB0aGlzLnJvYWRzW2ldLmNvbm5zW2pdLCB0aGlzLnJvYWRzKTtcbiAgICAgIGlmKHBvbHkgPT09IG51bGwgfHwgR2VvbS5pc1BvbHlJbihwb2x5LCBwb2x5cykpXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgXG4gICAgICBwb2x5cy5wdXNoKHBvbHkpO1xuICAgICAgdGhpcy5ibG9ja3MucHVzaChuZXcgQmxvY2socG9seSwgUFJORy5yYW5kb20oKSAqIDY1NTM2KSk7XG4gICAgfVxuICB9XG5cbiAgdGhpcy5yb2Fkcy5mb3JFYWNoKGZ1bmN0aW9uKHIpIHtcbiAgICByLnRyYXZlcnNlZCA9IFtdO1xuICB9KTtcblxuICB2YXIgcm9hZFF1YWRzID0gW107XG5cbiAgdGhpcy5yb2Fkcy5mb3JFYWNoKGZ1bmN0aW9uKHIpIHtcbiAgICByLmNvbm5zLmZvckVhY2goZnVuY3Rpb24ocjEpIHtcbiAgICAgIGlmKHIxLnRyYXZlcnNlZC5pbmRleE9mKHIpICE9PSAtMSlcbiAgICAgICAgcmV0dXJuO1xuICAgICAgcm9hZFF1YWRzLnB1c2goW3IsIHIxXSk7XG4gICAgICByLnRyYXZlcnNlZC5wdXNoKHIxKTtcbiAgICAgIHIxLnRyYXZlcnNlZC5wdXNoKHIpO1xuICAgIH0pO1xuICB9KTtcblxuICB0aGlzLnJvYWRRdWFkcyA9IHJvYWRRdWFkcztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDaXR5O1xuIiwiLyoqXG4gKiBQUk5HLmpzXG4gKlxuICogVE9ETyBpbXBsZW1lbnQgTWVyc2VubmUgdHdpc3Rlci5cbiAqL1xuXG52YXIgTWVyc2VubmVUd2lzdGVyID0gcmVxdWlyZSgnbWVyc2VubmV0d2lzdGVyJyk7XG5cbnZhciBQUk5HID0gZnVuY3Rpb24oc2VlZCkge1xuICBpZihzZWVkICE9PSB1bmRlZmluZWQpXG4gICAgdGhpcy5zZWVkKHNlZWQpO1xuICBlbHNlXG4gICAgdGhpcy5tdCA9IG5ldyBNZXJzZW5uZVR3aXN0ZXIoKTtcbn1cblxuUFJORy5wcm90b3R5cGUuc2VlZCA9IGZ1bmN0aW9uKHNlZWQpIHtcbiAgdGhpcy5tdCA9IG5ldyBNZXJzZW5uZVR3aXN0ZXIoc2VlZCk7XG59XG5cblBSTkcucHJvdG90eXBlLnJhbmRvbSA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdGhpcy5tdC5yYW5kb20oKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBQUk5HO1xuIiwiLyoqXG4gKiBSb2Fkcy5qc1xuICogXG4gKiBTdHViIC0gZ2VuZXJhdGVzIGNpdHkgcm9hZHMgYXMgYW4gdW5kaXJlY3RlZCBncmFwaCwgcmVwcmVzZW50ZWRcbiAqIHZpYSBhbiBhcnJheSBvZiBub2RlcyB3aXRoIG91dGdvaW5nIGFuZCBpbmNvbWluZyBsaW5rcyB0byBvdGhlclxuICogcm9hZHMuXG4gKlxuICogVE9ETyBcbiAqIC0gR2VuZXJhdGl2ZS9zZWFyY2ggYmFzZWQvbC1zeXN0ZW0gYXBwcm9hY2hlcy4gUmlnaHQgbm93IG9ubHkgYVxuICogICByYW5kb21seSBkaXNwbGFjZWQgc3F1YXJlIGdyaWQgaXMgZ2VuZXJhdGVkLlxuICogLSBSYW5kb20gc2VlZGluZ1xuICovXG5cbnZhciBQUk5HID0gcmVxdWlyZSgnLi9QUk5HJyk7XG5cbnZhciBzaWRlID0gOCwgcSA9IDAsIGFtcCA9IDI7XG4gICAgXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHNlZWQpIHtcblxuICB2YXIgZyA9IFtdLCBybmcgPSBuZXcgUFJORyhzZWVkKTtcblxuICBmb3IodmFyIHkgPSAwOyB5IDwgc2lkZTsgeSsrKSBmb3IodmFyIHggPSAwOyB4IDwgc2lkZTsgeCsrKSB7XG4gICAgdmFyIHAgPSBnW3kgKiBzaWRlICsgeF0gPSB7IFxuICAgICAgeDogYW1wICogeCArIHEgKiBybmcucmFuZG9tKCksIFxuICAgICAgeTogYW1wICogeSArIHEgKiBybmcucmFuZG9tKCksIFxuICAgICAgY29ubnM6IFtdIFxuICAgIH07XG4gICAgaWYoeCA+IDApIHtcbiAgICAgIHAuY29ubnMucHVzaChnW3kgKiBzaWRlICsgeCAtIDFdKTtcbiAgICAgIGdbeSAqIHNpZGUgKyB4IC0gMV0uY29ubnMucHVzaChwKTtcbiAgICB9XG4gICAgaWYoeSA+IDApIHtcbiAgICAgIHAuY29ubnMucHVzaChnWyh5IC0gMSkgKiBzaWRlICsgeF0pO1xuICAgICAgZ1soeSAtIDEpICogc2lkZSArIHhdLmNvbm5zLnB1c2gocCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGc7XG5cbn1cbiIsInZhciBnbE1hdHJpeCA9IHJlcXVpcmUoJy4vZ2xNYXRyaXhTdWJzZXQnKSxcbiAgICB2ZWMzID0gZ2xNYXRyaXgudmVjMztcblxudmFyIEdlb20gPSB7XG4gIC8vIGh0dHA6Ly93d3cuZWNzZS5ycGkuZWR1L0hvbWVwYWdlcy93cmYvUmVzZWFyY2gvU2hvcnRfTm90ZXMvcG5wb2x5Lmh0bWxcbiAgcG5wb2x5OiBmdW5jdGlvbihwb2x5LCB4LCB5KSB7XG4gICAgdmFyIG4gPSBwb2x5Lmxlbmd0aCwgaSwgaiwgYyA9IGZhbHNlLCBhLCBiO1xuXG4gICAgZm9yKGkgPSAwLCBqID0gbiAtIDE7IGkgPCBuOyBqID0gaSsrKSB7XG4gICAgICBhID0gcG9seVtpXTtcbiAgICAgIGIgPSBwb2x5W2pdO1xuICAgICAgaWYoIChhLnkgPiB5KSAhPT0gKGIueSA+IHkpICYmXG4gICAgICAgICAgKHggPCAoYi54IC0gYS54KSAqICh5IC0gYS55KSAvIChiLnkgLSBhLnkpICsgYS54KSApXG4gICAgICAgIGMgPSAhYztcbiAgICB9XG4gICAgcmV0dXJuIGM7XG4gIH0sXG4gIGlzT3ZlcmxhcHBpbmc6IGZ1bmN0aW9uKHBvbHksIHZlcnRpY2VzKSB7XG4gICAgZm9yKHZhciBpID0gdmVydGljZXMubGVuZ3RoIC0gMTsgaS0tOykge1xuICAgICAgaWYoR2VvbS5wbnBvbHkocG9seSwgdmVydGljZXNbaV0ueCwgdmVydGljZXNbaV0ueSkgJiYgcG9seS5pbmRleE9mKHZlcnRpY2VzW2ldKSA9PT0gLTEpXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH0sXG4gIGlzUG9seUluOiBmdW5jdGlvbihwb2x5LCBwb2x5cykge1xuICAgIGZvcih2YXIgaSA9IHBvbHlzLmxlbmd0aCAtIDE7IGkgPiAwOyBpLS0pXG4gICAgICBpZihHZW9tLmlzRXF1YWxQb2x5KHBvbHksIHBvbHlzW2ldKSlcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9LFxuICBpc0VxdWFsUG9seTogZnVuY3Rpb24oYSwgYikge1xuICAgIGlmKGEubGVuZ3RoICE9PSBiLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgZm9yKHZhciBpID0gYS5sZW5ndGggLSAxOyBpLS07KVxuICAgICAgaWYoYi5pbmRleE9mKGFbaV0pID09PSAtMSlcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiB0cnVlO1xuICB9LFxuICBpbnNldFBvbHlnb246IGZ1bmN0aW9uKHBvbHksIGRpc3QpIHtcbiAgICB2YXIgYSwgYiwgYywgb3V0ID0gW107XG5cbiAgICBiID0gcG9seVsgcG9seS5sZW5ndGggLSAxIF07XG5cbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgcG9seS5sZW5ndGggLSAxOyBpKyspIHtcbiAgICAgIGEgPSBiO1xuICAgICAgYiA9IHBvbHlbIGkgXTtcbiAgICAgIGMgPSBwb2x5WyBpICsgMSBdO1xuICAgICAgb3V0LnB1c2goR2VvbS5pbnNldENvcm5lcihhLCBiLCBjLCBkaXN0KSk7XG4gICAgfVxuICAgIG91dC5wdXNoKEdlb20uaW5zZXRDb3JuZXIoYiwgYywgcG9seVsgMCBdLCBkaXN0KSk7XG5cbiAgICByZXR1cm4gb3V0O1xuICB9LFxuICAvLyBhICAgICAgcHJldmlvdXMgcG9pbnRcbiAgLy8gYiAgICAgIGN1cnJlbnQgcG9pbnRcbiAgLy8gYyAgICAgIG5leHQgcG9pbnRcbiAgLy8gZGlzdCAgIGRpc3RhbmNlXG4gIGluc2V0Q29ybmVyOiBmdW5jdGlvbihhLCBiLCBjLCBkaXN0KSB7XG4gICAgdmFyIGR4MSA9IGIueCAtIGEueCwgZHkxID0gYS55IC0gYi55LFxuICAgICAgICBkeDIgPSBjLnggLSBiLngsIGR5MiA9IGIueSAtIGMueSxcbiAgICAgICAgZGlzdDEgPSBNYXRoLnNxcnQoZHgxICogZHgxICsgZHkxICogZHkxKSxcbiAgICAgICAgZGlzdDIgPSBNYXRoLnNxcnQoZHgyICogZHgyICsgZHkyICogZHkyKSxcbiAgICAgICAgaW5zWDEsIGluc1gyLCBpbnNZMSwgaW5zWTIsIGluc3AsXG4gICAgICAgIGIxID0geyB4OiBiLngsIHk6IGIueSB9LFxuICAgICAgICBiMiA9IHsgeDogYi54LCB5OiBiLnkgfTtcblxuICAgIGlmKGRpc3QxID09IDAgfHwgZGlzdDIgPT0gMClcbiAgICAgIHJldHVybiBudWxsO1xuXG4gICAgaW5zWDEgPSBkeTEgLyBkaXN0MSAqIGRpc3Q7XG4gICAgaW5zWTEgPSBkeDEgLyBkaXN0MSAqIGRpc3Q7XG4gICAgaW5zWDIgPSBkeTIgLyBkaXN0MiAqIGRpc3Q7XG4gICAgaW5zWTIgPSBkeDIgLyBkaXN0MiAqIGRpc3Q7XG5cbiAgICBiMS54ICs9IGluc1gxOyBiMS55ICs9IGluc1kxO1xuICAgIGIyLnggKz0gaW5zWDI7IGIyLnkgKz0gaW5zWTI7XG5cbiAgICBpZihiMS54ID09PSBiMi54ICYmIGIxLnkgPT09IGIyLnkpXG4gICAgICByZXR1cm4gYjE7XG5cbiAgICByZXR1cm4gR2VvbS5saW5lSW50ZXJzZWN0aW9uKFxuICAgICAgICAgICAgIHsgeDogYS54ICsgaW5zWDEsIHk6IGEueSArIGluc1kxIH0sIGIxLFxuICAgICAgICAgICAgIGIyLCB7IHg6IGMueCArIGluc1gyLCB5OiBjLnkgKyBpbnNZMiB9XG4gICAgICAgICAgICk7XG4gIH0sXG4gIC8vIGh0dHA6Ly9hbGllbnJ5ZGVyZmxleC5jb20vaW50ZXJzZWN0L1xuICBsaW5lSW50ZXJzZWN0aW9uOiBmdW5jdGlvbihBMSwgQTIsIEIxLCBCMikge1xuXG4gICAgdmFyIGRpc3QsIGNvc18sIHNpbl8sIG54LCBwLFxuICAgICAgICBhMSA9IHsgeDogQTEueCwgeTogQTEueSB9LFxuICAgICAgICBhMiA9IHsgeDogQTIueCwgeTogQTIueSB9LFxuICAgICAgICBiMSA9IHsgeDogQjEueCwgeTogQjEueSB9LFxuICAgICAgICBiMiA9IHsgeDogQjIueCwgeTogQjIueSB9O1xuXG4gICAgLy8gVHJhbnNsYXRlIGJ5IC1hMVxuICAgIGEyLnggLT0gYTEueDsgYjEueCAtPSBhMS54OyBiMi54IC09IGExLng7XG4gICAgYTIueSAtPSBhMS55OyBiMS55IC09IGExLnk7IGIyLnkgLT0gYTEueTtcbiAgICBcbiAgICBkaXN0ID0gTWF0aC5zcXJ0KGEyLnggKiBhMi54ICsgYTIueSAqIGEyLnkpO1xuXG4gICAgLy8gUm90YXRlIHNvIGEyIGxpZXMgb24gdGhlIHBvc2l0aXZlIHggYXhpc1xuICAgIGNvc18gPSBhMi54IC8gZGlzdDtcbiAgICBzaW5fID0gYTIueSAvIGRpc3Q7XG5cbiAgICBueCAgID0gICBiMS54ICogY29zXyArIGIxLnkgKiBzaW5fO1xuICAgIGIxLnkgPSAtIGIxLnggKiBzaW5fICsgYjEueSAqIGNvc187IGIxLnggPSBueDsgXG4gICAgbnggICA9ICAgYjIueCAqIGNvc18gKyBiMi55ICogc2luXztcbiAgICBiMi55ID0gLSBiMi54ICogc2luXyArIGIyLnkgKiBjb3NfOyBiMi54ID0gbng7IFxuXG4gICAgLy8gUGFyYWxsZWwgbGluZXNcbiAgICBpZihiMS55ID09IGIyLnkpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIHAgPSBiMi54ICsgKGIxLnggLSBiMi54KSAqIGIyLnkgLyAoYjIueSAtIGIxLnkpO1xuXG4gICAgcmV0dXJuIHsgeDogYTEueCArIHAgKiBjb3NfLCB5OiBhMS55ICsgcCAqIHNpbl8gfTtcbiAgfSxcbiAgdHJpVG9Ob3JtYWw6IGZ1bmN0aW9uKHBvaW50cykge1xuICAgIC8qdmFyIHZBID0gdmVjMy5mcm9tVmFsdWVzKHZlYzMsIHBvaW50c1szXSwgcG9pbnRzWzRdLCBwb2ludHNbNV0pLFxuICAgICAgICB2QiA9IHZlYzMuZnJvbVZhbHVlcyh2ZWMzLCBwb2ludHNbMF0sIHBvaW50c1sxXSwgcG9pbnRzWzJdKSxcbiAgICAgICAgdkMgPSB2ZWMzLmZyb21WYWx1ZXModmVjMywgcG9pbnRzWzZdLCBwb2ludHNbN10sIHBvaW50c1s4XSksXG4gICAgICAgIG5vcm0gPSB2ZWMzLmNyZWF0ZSgpO1xuICAgIHZlYzMuc3ViKHZCLCB2QiwgdkEpO1xuICAgIHZlYzMuc3ViKHZDLCB2QywgdkEpO1xuICAgIHZlYzMuY3Jvc3Mobm9ybSwgdkIsIHZDKTtcbiAgICB2ZWMzLm5vcm1hbGl6ZShub3JtLCBub3JtKTtcbiAgICByZXR1cm4gbm9ybTsqL1xuXG4gICAgLyp2YXIgdkEgPSB2ZWMzLmNyZWF0ZSgpLCB2QiA9IHZlYzMuY3JlYXRlKCk7XG4gICAgdmVjMy5zZXQodkEsIHBvaW50c1swXSAtIHBvaW50c1szXSwgcG9pbnRzWzFdIC0gcG9pbnRzWzRdLCBwb2ludHNbMl0gLSBwb2ludHNbNV0pO1xuICAgIHZlYzMuc2V0KHZCLCBwb2ludHNbNl0gLSBwb2ludHNbM10sIHBvaW50c1s3XSAtIHBvaW50c1s0XSwgcG9pbnRzWzhdIC0gcG9pbnRzWzVdKTtcbiAgICB2ZWMzLmNyb3NzKHZBLCB2QSwgdkIpO1xuICAgIHZlYzMubm9ybWFsaXplKHZBLCB2QSk7XG4gICAgcmV0dXJuIHZBOyovXG4gICAgdmFyIGExID0gcG9pbnRzWzBdIC0gcG9pbnRzWzNdLCBhMiA9IHBvaW50c1sxXSAtIHBvaW50c1s0XSwgYTMgPSBwb2ludHNbMl0gLSBwb2ludHNbNV0sXG4gICAgICAgIGIxID0gcG9pbnRzWzZdIC0gcG9pbnRzWzNdLCBiMiA9IHBvaW50c1s3XSAtIHBvaW50c1s0XSwgYjMgPSBwb2ludHNbOF0gLSBwb2ludHNbNV07XG5cbiAgICB2YXIgblggPSBhMiAqIGIzIC0gYTMgKiBiMixcbiAgICAgICAgblkgPSBhMSAqIGIzIC0gYTMgKiBiMSxcbiAgICAgICAgblogPSBhMSAqIGIyIC0gYTIgKiBiMSxcbiAgICAgICAgcmxlbiA9IDEgLyBNYXRoLnNxcnQoblggKiBuWCArIG5ZICogblkgKyBuWiAqIG5aKTtcbiAgICBcbiAgICBuWCAqPSBybGVuO1xuICAgIG5ZICo9IHJsZW47XG4gICAgblogKj0gcmxlbjtcblxuICAgIHJldHVybiBbIG5YLCBuWSwgblogXTtcblxuICB9XG5cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBHZW9tO1xuIiwidmFyIENvbnRleHQgPSByZXF1aXJlKCcuLy4uL0NvbnRleHQnKTtcblxudmFyIGRpY3QgPSB7XG59O1xuXG52YXIgbG9nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgndWwnKTtcbmxvZy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5sb2cuc3R5bGUudG9wID0gJzdyZW0nO1xubG9nLnN0eWxlLmxlZnQgPSAnMXJlbSc7XG5sb2cuc3R5bGUuY29sb3IgPSAnIzQ0NCc7XG5sb2cuc3R5bGUuZm9udCA9ICcxMHB4IFwiVWJ1bnR1IE1vbm9cIiwgbW9ub3NwYWNlJztcbmxvZy5zdHlsZS5saW5lSGVpZ2h0ID0gJzEuNWVtJztcbmxvZy5zdHlsZS5saXN0U3R5bGVUeXBlID0gJ25vbmUnO1xuXG5Db250ZXh0LmNhbnZhcy5wYXJlbnROb2RlLmFwcGVuZENoaWxkKGxvZyk7XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBwcm9ncmVzczogZnVuY3Rpb24oaWQsIHBlcmNlbnQpIHtcbiAgICBpZighKGlkIGluIGRpY3QpKSB7XG4gICAgICB2YXIgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgbG9nLmFwcGVuZENoaWxkKGxpKTtcbiAgICAgIGRpY3RbaWRdID0geyBmbnM6IFtdLCBsaTogbGksIHZhbHVlOiAwIH07XG4gICAgfVxuXG4gICAgZGljdFtpZF0udmFsdWUgPSBwZXJjZW50O1xuXG4gICAgaWYocGVyY2VudCA+PSAxKSB7XG4gICAgICBkaWN0W2lkXS5mbnMuZm9yRWFjaChmdW5jdGlvbihpKSB7XG4gICAgICAgIGkoKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfSxcbiAgc3Vic2NyaWJlOiBmdW5jdGlvbihpZCwgZm4pIHtcbiAgICBpZighKGlkIGluIGRpY3QpKSB7XG4gICAgICB2YXIgbGkgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdsaScpO1xuICAgICAgbG9nLmFwcGVuZENoaWxkKGxpKTtcbiAgICAgIGRpY3RbaWRdID0geyBmbnM6IFtdLCBsaTogbGksIHZhbHVlOiAwIH07XG4gICAgfVxuXG4gICAgZGljdFtpZF0uZm5zLnB1c2goZm4pO1xuICBcbiAgfSxcbiAgcmVuZGVyOiBmdW5jdGlvbigpIHtcbiAgICB2YXIgc3RyID0gJycsIGxpO1xuICAgIGZvcihpIGluIGRpY3QpIHtcbiAgICAgIHZhciBwY3QgPSBwYXJzZUludChkaWN0W2ldLnZhbHVlICogMTAwKSwgc3AgPSAnJyArIHBjdDtcbiAgICAgIHdoaWxlKHNwLmxlbmd0aCA8IDQpIHNwID0gJ18nICsgc3A7XG4gICAgICBzcCA9IHNwLnJlcGxhY2UoL18vZywgJyZuYnNwOycpO1xuICAgICAgZGljdFtpXS5saS5pbm5lckhUTUwgPSAnJm5ic3A7JyArIGkgKyAnOiAnICsgc3AgKyBcIiUmbmJzcDtcXG5cIjtcbiAgICAgIHZhciBhID0gJ2xpbmVhci1ncmFkaWVudCg5MGRlZywgIzBmMCwgIzBmMCAnICsgcGN0ICsgJyUsICMwYjAgJyArIHBjdCArICclKSc7XG4gICAgICBkaWN0W2ldLmxpLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9IGE7XG5cbiAgICB9XG4gIH1cbn1cbiIsInZhciBnbE1hdHJpeCA9IHJlcXVpcmUoJy4vZ2xNYXRyaXhTdWJzZXQnKSxcbiAgICBDb250ZXh0ICA9IHJlcXVpcmUoJy4vLi4vQ29udGV4dCcpLFxuICAgIGdsICAgICAgID0gQ29udGV4dC5nbDtcblxudmFyIE1lc2ggPSBmdW5jdGlvbih2ZXJ0aWNlcywgbm9ybWFscywgdXZzLCBleHRyYSkge1xuICB0aGlzLnZCdWYgPSBnbC5jcmVhdGVCdWZmZXIoKTtcbiAgdGhpcy5uQnVmID0gZ2wuY3JlYXRlQnVmZmVyKCk7XG4gIHRoaXMudUJ1ZiA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xuICB0aGlzLmVCdWYgPSBnbC5jcmVhdGVCdWZmZXIoKTtcblxuICB0aGlzLmNvdW50ID0gdmVydGljZXMubGVuZ3RoIC8gMztcblxuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy52QnVmKTtcbiAgZ2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIG5ldyBGbG9hdDMyQXJyYXkodmVydGljZXMpLCBnbC5TVEFUSUNfRFJBVyk7XG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCB0aGlzLm5CdWYpO1xuICBnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgbmV3IEZsb2F0MzJBcnJheShub3JtYWxzKSwgZ2wuU1RBVElDX0RSQVcpO1xuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy51QnVmKTtcbiAgZ2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIG5ldyBGbG9hdDMyQXJyYXkodXZzKSwgZ2wuU1RBVElDX0RSQVcpO1xuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy5lQnVmKTtcbiAgZ2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIG5ldyBGbG9hdDMyQXJyYXkoZXh0cmEpLCBnbC5TVEFUSUNfRFJBVyk7XG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBudWxsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBNZXNoO1xuIiwidmFyIFF1YWRUcmVlID0gZnVuY3Rpb24oeCwgeSwgdywgbGltaXQpIHtcblxuICB0aGlzLm53ID0gdGhpcy5zdyA9IHRoaXMubmUgPSB0aGlzLnNlID0gbnVsbDtcblxuICB0aGlzLnggPSB4O1xuICB0aGlzLnkgPSB5O1xuICB0aGlzLncgPSB3O1xuICB0aGlzLmxpbWl0ID0gbGltaXQ7XG5cbiAgdGhpcy5wb2ludHMgPSBbXTtcbn07XG5cblF1YWRUcmVlLnByb3RvdHlwZS5jb250YWlucyA9IGZ1bmN0aW9uKGVsKSB7XG4gIHJldHVybiAoTWF0aC5hYnMoZWwueCAtIHRoaXMueCkgPCB0aGlzLncgJiYgTWF0aC5hYnMoZWwueSAtIHRoaXMueSkgPCB0aGlzLncpO1xufVxuXG5RdWFkVHJlZS5wcm90b3R5cGUuaW5zZXJ0ID0gZnVuY3Rpb24oZWwpIHtcbiAgaWYoIXRoaXMuY29udGFpbnMoZWwpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZih0aGlzLnBvaW50cy5sZW5ndGggPCB0aGlzLmxpbWl0KSB7XG4gICAgdGhpcy5wb2ludHMucHVzaChlbCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZih0aGlzLm53ID09PSBudWxsKVxuICAgIHRoaXMuc3ViZGl2aWRlKCk7XG5cbiAgcmV0dXJuIHRoaXMubncuaW5zZXJ0KGVsKSB8fFxuICAgICAgICAgdGhpcy5uZS5pbnNlcnQoZWwpIHx8XG4gICAgICAgICB0aGlzLnN3Lmluc2VydChlbCkgfHxcbiAgICAgICAgIHRoaXMuc2UuaW5zZXJ0KGVsKTtcbn1cblxuUXVhZFRyZWUucHJvdG90eXBlLnN1YmRpdmlkZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgeCA9IHRoaXMueCwgeSA9IHRoaXMueSwgdyA9IHRoaXMudyAvIDI7XG4gIHRoaXMubncgPSBuZXcgUXVhZFRyZWUoeCAtIHcsIHkgLSB3LCB3LCB0aGlzLmxpbWl0KTtcbiAgdGhpcy5zdyA9IG5ldyBRdWFkVHJlZSh4IC0gdywgeSArIHcsIHcsIHRoaXMubGltaXQpO1xuICB0aGlzLm5lID0gbmV3IFF1YWRUcmVlKHggKyB3LCB5IC0gdywgdywgdGhpcy5saW1pdCk7XG4gIHRoaXMuc2UgPSBuZXcgUXVhZFRyZWUoeCArIHcsIHkgKyB3LCB3LCB0aGlzLmxpbWl0KTtcbn1cblxuUXVhZFRyZWUucHJvdG90eXBlLmludGVyc2VjdCA9IGZ1bmN0aW9uKHgsIHksIHcpIHtcbiAgcmV0dXJuIE1hdGguYWJzKHRoaXMueCAtIHgpIDwgdGhpcy53ICsgdyAmJlxuICAgICAgICAgTWF0aC5hYnModGhpcy55IC0geSkgPCB0aGlzLncgKyB3O1xufVxuXG5RdWFkVHJlZS5wcm90b3R5cGUucXVlcnkgPSBmdW5jdGlvbih4LCB5LCB3KSB7XG4gIHZhciBwdHMgPSBbXSwgY3B0cyA9IFtdLCB0cCA9IHRoaXMucG9pbnRzO1xuXG4gIGlmKCF0aGlzLmludGVyc2VjdCh4LCB5LCB3KSkge1xuICAgIHJldHVybiBwdHM7XG4gIH1cblxuICBmb3IodmFyIGkgPSAwLCBJID0gdHAubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgaWYocG9pbnRJblJhbmdlKHRwW2ldLCB4LCB5LCB3KSlcbiAgICAgIHB0cy5wdXNoKHRwW2ldKTtcbiAgfVxuXG4gIGlmKHRoaXMubncgPT09IG51bGwpXG4gICAgcmV0dXJuIHB0cztcblxuICBjcHRzID0gdGhpcy5udy5xdWVyeSh4LCB5LCB3KTtcbiAgZm9yKHZhciBpID0gMCwgSSA9IGNwdHMubGVuZ3RoOyBpIDwgSTsgaSsrKVxuICAgIHB0cy5wdXNoKGNwdHNbaV0pO1xuXG4gIGNwdHMgPSB0aGlzLm5lLnF1ZXJ5KHgsIHksIHcpO1xuICBmb3IodmFyIGkgPSAwLCBJID0gY3B0cy5sZW5ndGg7IGkgPCBJOyBpKyspXG4gICAgcHRzLnB1c2goY3B0c1tpXSk7XG5cbiAgY3B0cyA9IHRoaXMuc3cucXVlcnkoeCwgeSwgdyk7XG4gIGZvcih2YXIgaSA9IDAsIEkgPSBjcHRzLmxlbmd0aDsgaSA8IEk7IGkrKylcbiAgICBwdHMucHVzaChjcHRzW2ldKTtcblxuICBjcHRzID0gdGhpcy5zZS5xdWVyeSh4LCB5LCB3KTtcbiAgZm9yKHZhciBpID0gMCwgSSA9IGNwdHMubGVuZ3RoOyBpIDwgSTsgaSsrKVxuICAgIHB0cy5wdXNoKGNwdHNbaV0pO1xuXG4gIHJldHVybiBwdHM7XG59XG5cbnZhciBwb2ludEluUmFuZ2UgPSBmdW5jdGlvbihlbCwgeCwgeSwgdykge1xuICByZXR1cm4gTWF0aC5hYnMoZWwueCAtIHgpIDwgdyAmJiBNYXRoLmFicyhlbC55IC0geSkgPCB3O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBRdWFkVHJlZTtcbiIsIi8qXG4gKiBHZW5lcmFsIHJ1bGU6IG9ubHkgcmVjdGFuZ2xlcyBhbGxvd2VkLlxuICogcDEgcDJcbiAqIHAwIHAzXG4gKi9cbnZhciBTSEFQRSA9IHtcbiAgLy8gSW5wdXQ6ICBzZWdtZW50IGVuZHMsIGV4dHJ1c2lvbiBoZWlnaHQsIG5vcm1hbFxuICAvLyBPdXRwdXQ6IHF1YWRcbiAgZXh0cnVkZTogZnVuY3Rpb24oc3ltYm9sLCBhLCBiLCBsZW4sIG5vcm0pIHtcblxuICAgIHZhciBuWCA9IDAsIG5ZID0gbGVuLCBuWiA9IDA7XG5cbiAgICBpZihub3JtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIG5YID0gbm9ybVswXSAqIGxlbjsgXG4gICAgICBuWSA9IG5vcm1bMV0gKiBsZW47XG4gICAgICBuWiA9IG5vcm1bMl0gKiBsZW47XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN5bTogc3ltYm9sLFxuICAgICAgcG9pbnRzOiBbXG4gICAgICAgIHsgeDogYS54LCAgICAgIHk6IGEueSwgICAgICB6OiBhLnogfSxcbiAgICAgICAgeyB4OiBhLnggKyBuWCwgeTogYS55ICsgblksIHo6IGEueiArIG5aIH0sXG4gICAgICAgIHsgeDogYi54ICsgblgsIHk6IGIueSArIG5ZLCB6OiBiLnogKyBuWiB9LFxuICAgICAgICB7IHg6IGIueCwgICAgICB5OiBiLnksICAgICAgejogYi56IH1cbiAgICAgIF1cbiAgICB9O1xuICB9LFxuICBcbiAgLy8gSW5wdXQ6ICBsaXN0IG9mIHBvaW50cywgc3ltYm9sc1xuICAvLyBPdXRwdXQ6IFtxdWFkXVxuICBleHRydWRlQWxsOiBmdW5jdGlvbihwYXRoLCBsZW4sIHN5bWJvbHMsIG5vcm0pIHtcbiAgICB2YXIgb3V0ID0gW107XG4gICAgZm9yKHZhciBpID0gMCwgbiA9IHBhdGgubGVuZ3RoOyBpIDwgbjsgKytpKSB7XG4gICAgICB2YXIgY3VyID0gcGF0aFtpXSwgbmV4dCA9IHBhdGhbKGkgKyAxKSAlIG5dO1xuICAgICAgb3V0LnB1c2goU0hBUEUuZXh0cnVkZShzeW1ib2xzIGluc3RhbmNlb2YgQXJyYXkgPyBzeW1ib2xzW2ldIDogc3ltYm9scywgY3VyLCBuZXh0LCBsZW4sIG5vcm0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbiAgfSxcblxuICAvLyBJbnB1dDogIHF1YWQsIGxpc3Qgb2Ygc3BsaXRzIChtdXN0IHN1bSB0byAxIGluIGVhY2ggZGlyZWN0aW9uKVxuICAvLyBPdXRwdXQ6IFtxdWFkXVxuICAvLyBTcGxpdCBmcm9tIHRvcCB0byBib3R0b21cbiAgc3BsaXQ6IGZ1bmN0aW9uKHF1YWQsIHhTcGxpdHMsIHlTcGxpdHMsIHN5bWJvbHMpIHtcbiAgICB2YXIgb3V0ID0gW10sIHN5bUkgPSAwLCBzaW9hID0gc3ltYm9scyBpbnN0YW5jZW9mIEFycmF5LFxuICAgICAgICBxcCA9IHF1YWQucG9pbnRzLCBxdSA9IHF1YWQudXZzLFxuICAgICAgICBwMCA9IHFwWzBdLCBwMSA9IHFwWzFdLCBwMiA9IHFwWzJdLCBwMyA9IHFwWzNdLFxuICAgICAgICB4MCA9IHAwLngsIHgxID0gcDEueCwgeDIgPSBwMi54LCB4MyA9IHAzLngsXG4gICAgICAgIHkwID0gcDAueSwgeTEgPSBwMS55LCB5MiA9IHAyLnksIHkzID0gcDMueSxcbiAgICAgICAgejAgPSBwMC56LCB6MSA9IHAxLnosIHoyID0gcDIueiwgejMgPSBwMy56LFxuICAgICAgICBkcyA9IDEsIGR0ID0gMSwgbXMgPSAwLCBtdCA9IDA7XG5cbiAgICBpZihxdSBpbnN0YW5jZW9mIEFycmF5KVxuICAgICAgZHMgPSBxdVszXS5zIC0gcXVbMF0ucywgZHQgPSBxdVsxXS50IC0gcXVbMF0udCxcbiAgICAgIG1zID0gcXVbMF0ucywgbXQgPSBxdVsxXS50O1xuXG4gICAgdmFyIGFjY1kgPSAwO1xuICAgIGZvcih2YXIgeSA9IDAsIFkgPSB5U3BsaXRzLmxlbmd0aDsgeSA8IFk7ICsreSkge1xuICAgICAgdmFyIGFjY1ggPSAwLCBhY2NZWSA9IGFjY1kgKyB5U3BsaXRzW3ldO1xuICAgICAgZm9yKHZhciB4ID0gMCwgWCA9IHhTcGxpdHMubGVuZ3RoOyB4IDwgWDsgKyt4KSB7XG4gICAgICAgIHZhciBhY2NYWCA9IGFjY1ggKyB4U3BsaXRzW3hdLCBcbiAgICAgICAgICAgIHhhID0gU0hBUEUubGVycCh4MCwgeDMsIGFjY1gpLFxuICAgICAgICAgICAgeGIgPSBTSEFQRS5sZXJwKHgwLCB4MywgYWNjWFgpLFxuICAgICAgICAgICAgeWEgPSBTSEFQRS5sZXJwKHkwLCB5MSwgYWNjWSksXG4gICAgICAgICAgICB5YiA9IFNIQVBFLmxlcnAoeTAsIHkxLCBhY2NZWSksXG4gICAgICAgICAgICB6YSA9IFNIQVBFLmxlcnAoejAsIHozLCBhY2NYKSxcbiAgICAgICAgICAgIHpiID0gU0hBUEUubGVycCh6MCwgejMsIGFjY1hYKTtcblxuICAgICAgICBvdXQucHVzaCh7XG4gICAgICAgICAgc3ltOiBzaW9hID8gc3ltYm9sc1tzeW1JKytdIDogc3ltYm9scyxcbiAgICAgICAgICBwb2ludHM6IFtcbiAgICAgICAgICAgIHsgeDogeGEsIHk6IHlhLCB6OiB6YSB9LFxuICAgICAgICAgICAgeyB4OiB4YSwgeTogeWIsIHo6IHphIH0sXG4gICAgICAgICAgICB7IHg6IHhiLCB5OiB5YiwgejogemIgfSxcbiAgICAgICAgICAgIHsgeDogeGIsIHk6IHlhLCB6OiB6YiB9XG4gICAgICAgICAgXSxcbiAgICAgICAgICB1dnM6IFtcbiAgICAgICAgICAgIHsgczogbXMgKyBkcyAqIGFjY1gsICB0OiBtdCArIGR0ICogYWNjWSB9LFxuICAgICAgICAgICAgeyBzOiBtcyArIGRzICogYWNjWCwgIHQ6IG10ICsgZHQgKiBhY2NZWSB9LFxuICAgICAgICAgICAgeyBzOiBtcyArIGRzICogYWNjWFgsIHQ6IG10ICsgZHQgKiBhY2NZWSB9LFxuICAgICAgICAgICAgeyBzOiBtcyArIGRzICogYWNjWFgsIHQ6IG10ICsgZHQgKiBhY2NZIH0sXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgICBhY2NYID0gYWNjWFg7XG4gICAgICB9XG4gICAgICBhY2NZID0gYWNjWVk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbiAgfSxcblxuICBzcGxpdFhaOiBmdW5jdGlvbihxdWFkLCB4U3BsaXRzLCB6U3BsaXRzLCBzeW1ib2xzKSB7XG4gICAgdmFyIG91dCA9IFtdLCBzeW1JID0gMCxcbiAgICAgICAgcXAgPSBxdWFkLnBvaW50cyxcbiAgICAgICAgcDAgPSBxcFswXSwgcDEgPSBxcFsxXSwgcDIgPSBxcFsyXSwgcDMgPSBxcFszXSxcbiAgICAgICAgeDAgPSBwMC54LCB4MSA9IHAxLngsIHgyID0gcDIueCwgeDMgPSBwMy54LFxuICAgICAgICB5MCA9IHAwLnksIHkxID0gcDEueSwgeTIgPSBwMi55LCB5MyA9IHAzLnksXG4gICAgICAgIHowID0gcDAueiwgejEgPSBwMS56LCB6MiA9IHAyLnosIHozID0gcDMuejtcblxuICAgIHZhciBhY2NaID0gMDtcbiAgICBmb3IodmFyIHogPSAwLCBaID0gelNwbGl0cy5sZW5ndGg7IHogPCBaOyArK3opIHtcbiAgICAgIHZhciBhY2NYID0gMDtcbiAgICAgIGZvcih2YXIgeCA9IDAsIFggPSB4U3BsaXRzLmxlbmd0aDsgeCA8IFg7ICsreCkge1xuICAgICAgICB2YXIgeGEgPSBTSEFQRS5sZXJwKHgwLCB4MywgYWNjWCksXG4gICAgICAgICAgICB4YiA9IFNIQVBFLmxlcnAoeDAsIHgzLCBhY2NYICsgeFNwbGl0c1t4XSksXG4gICAgICAgICAgICB5YSA9IFNIQVBFLmxlcnAoeTAsIHkxLCBhY2NYKSxcbiAgICAgICAgICAgIHliID0gU0hBUEUubGVycCh5MCwgeTEsIGFjY1ggKyB4U3BsaXRzW3hdKSxcbiAgICAgICAgICAgIHphID0gU0hBUEUubGVycCh6MCwgejEsIGFjY1opLFxuICAgICAgICAgICAgemIgPSBTSEFQRS5sZXJwKHowLCB6MSwgYWNjWiArIHpTcGxpdHNbel0pO1xuXG4gICAgICAgIG91dC5wdXNoKHtcbiAgICAgICAgICBzeW06IHN5bWJvbHMgaW5zdGFuY2VvZiBBcnJheT8gc3ltYm9sc1tzeW1JKytdIDogc3ltYm9scyxcbiAgICAgICAgICBwb2ludHM6IFtcbiAgICAgICAgICAgIHsgeDogeGEsIHk6IHlhLCB6OiB6YSB9LFxuICAgICAgICAgICAgeyB4OiB4YSwgeTogeWEsIHo6IHpiIH0sXG4gICAgICAgICAgICB7IHg6IHhiLCB5OiB5YiwgejogemIgfSxcbiAgICAgICAgICAgIHsgeDogeGIsIHk6IHliLCB6OiB6YSB9XG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgICBhY2NYICs9IHhTcGxpdHNbeF07XG4gICAgICB9XG4gICAgICBhY2NaICs9IHpTcGxpdHNbel07XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbiAgfSxcblxuICBzcGxpdFpYOiBmdW5jdGlvbihxdWFkLCB4U3BsaXRzLCB6U3BsaXRzLCBzeW1ib2xzKSB7XG4gICAgdmFyIG91dCA9IFtdLCBzeW1JID0gMCxcbiAgICAgICAgcXAgPSBxdWFkLnBvaW50cyxcbiAgICAgICAgcDAgPSBxcFswXSwgcDEgPSBxcFsxXSwgcDIgPSBxcFsyXSwgcDMgPSBxcFszXSxcbiAgICAgICAgeDAgPSBwMC54LCB4MSA9IHAxLngsIHgyID0gcDIueCwgeDMgPSBwMy54LFxuICAgICAgICB5MCA9IHAwLnksIHkxID0gcDEueSwgeTIgPSBwMi55LCB5MyA9IHAzLnksXG4gICAgICAgIHowID0gcDAueiwgejEgPSBwMS56LCB6MiA9IHAyLnosIHozID0gcDMuejtcblxuICAgIHZhciBhY2NaID0gMDtcbiAgICBmb3IodmFyIHogPSAwLCBaID0gelNwbGl0cy5sZW5ndGg7IHogPCBaOyArK3opIHtcbiAgICAgIHZhciBhY2NYID0gMDtcbiAgICAgIGZvcih2YXIgeCA9IDAsIFggPSB4U3BsaXRzLmxlbmd0aDsgeCA8IFg7ICsreCkge1xuICAgICAgICB2YXIgeGEgPSBTSEFQRS5sZXJwKHgwLCB4MSwgYWNjWCksXG4gICAgICAgICAgICB4YiA9IFNIQVBFLmxlcnAoeDAsIHgxLCBhY2NYICsgeFNwbGl0c1t4XSksXG4gICAgICAgICAgICB5YSA9IFNIQVBFLmxlcnAoeTAsIHkxLCBhY2NYKSxcbiAgICAgICAgICAgIHliID0gU0hBUEUubGVycCh5MCwgeTEsIGFjY1ggKyB4U3BsaXRzW3hdKSxcbiAgICAgICAgICAgIHphID0gU0hBUEUubGVycCh6MCwgejMsIGFjY1opLFxuICAgICAgICAgICAgemIgPSBTSEFQRS5sZXJwKHowLCB6MywgYWNjWiArIHpTcGxpdHNbel0pO1xuXG4gICAgICAgIG91dC5wdXNoKHtcbiAgICAgICAgICBzeW06IHN5bWJvbHMgaW5zdGFuY2VvZiBBcnJheT8gc3ltYm9sc1tzeW1JKytdIDogc3ltYm9scyxcbiAgICAgICAgICBwb2ludHM6IFtcbiAgICAgICAgICAgIHsgeDogeGEsIHk6IHlhLCB6OiB6YSB9LFxuICAgICAgICAgICAgeyB4OiB4YSwgeTogeWEsIHo6IHpiIH0sXG4gICAgICAgICAgICB7IHg6IHhiLCB5OiB5YiwgejogemIgfSxcbiAgICAgICAgICAgIHsgeDogeGIsIHk6IHliLCB6OiB6YSB9XG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgICBhY2NYICs9IHhTcGxpdHNbeF07XG4gICAgICB9XG4gICAgICBhY2NaICs9IHpTcGxpdHNbel07XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbiAgfSxcblxuICAvLyBJbnB1dDogYXhpcywgcXVhZCwgc3ltYm9sXG4gIC8vIE91dHB1dDogW3F1YWRdXG4gIGZpdDogZnVuY3Rpb24oYXhpcywgcXVhZCwgc3ltYm9sLCByYXRpbykge1xuXG4gICAgcmF0aW8gPSByYXRpbyB8fCAxO1xuXG4gICAgdmFyIHFwID0gcXVhZC5wb2ludHMsXG4gICAgICAgIHAwID0gcXBbMF0sIHAxID0gcXBbMV0sIHAyID0gcXBbMl0sIHAzID0gcXBbM10sXG4gICAgICAgIHgwID0gcDAueCwgeDEgPSBwMS54LCB4MiA9IHAyLngsIHgzID0gcDMueCxcbiAgICAgICAgeTAgPSBwMC55LCB5MSA9IHAxLnksIHkyID0gcDIueSwgeTMgPSBwMy55LFxuICAgICAgICB6MCA9IHAwLnosIHoxID0gcDEueiwgejIgPSBwMi56LCB6MyA9IHAzLnosXG4gICAgICAgIGR4ID0geDMgLSB4MCwgZHkgPSB5MSAtIHkwLCBkeiA9IHozIC0gejAsIGR6ZHkgPSB6MSAtIHowO1xuXG4gICAgaWYoYXhpcyA9PT0gJ3gnKSB7XG4gICAgICB2YXIgaCA9IGR5LFxuICAgICAgICAgIHcgPSByYXRpbyAqIGgsXG4gICAgICAgICAgd0F2YWlsID0gTWF0aC5zcXJ0KCBkeCAqIGR4ICsgZHogKiBkeiApLFxuICAgICAgICAgIGNvdW50ID0gTWF0aC5yb3VuZCh3QXZhaWwgLyB3KSxcbiAgICAgICAgICBzcGxpdHMgPSBbXTtcblxuICAgICAgdyA9IHdBdmFpbCAvIGNvdW50OyAvLyBDb3JyZWN0IHdpZHRoXG5cbiAgICAgIGNvdW50ID0gTWF0aC5tYXgoMSwgTWF0aC5hYnMoY291bnQpKTtcbiAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKVxuICAgICAgICBzcGxpdHMucHVzaCgxIC8gY291bnQpO1xuXG4gICAgICByZXR1cm4gU0hBUEUuc3BsaXQocXVhZCwgc3BsaXRzLCBbMV0sIHN5bWJvbCk7XG4gICAgfSBlbHNlIGlmKGF4aXMgPT09ICd5Jykge1xuICAgICAgdmFyIHcgPSB4MyAtIHgwLFxuICAgICAgICAgIGggPSB3IC8gcmF0aW8sXG4gICAgICAgICAgaEF2YWlsID0gTWF0aC5zcXJ0KCBkeSAqIGR5ICsgZHpkeSAqIGR6ZHkgKSxcbiAgICAgICAgICBjb3VudCA9IE1hdGgucm91bmQoaEF2YWlsIC8gaCksXG4gICAgICAgICAgc3BsaXRzID0gW107XG5cbiAgICAgIGggPSBoQXZhaWwgLyBjb3VudDsgLy8gQ29ycmVjdCB3aWR0aFxuXG4gICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY291bnQ7IGkrKylcbiAgICAgICAgc3BsaXRzLnB1c2goMSAvIGNvdW50KTtcblxuICAgICAgcmV0dXJuIFNIQVBFLnNwbGl0KHF1YWQsIHNwbGl0cywgWzFdLCBzeW1ib2wpO1xuICAgIH1cbiAgfSxcblxuICBsZXJwOiBmdW5jdGlvbihhLCBiLCB0KSB7XG4gICAgcmV0dXJuIGEgKiAoMSAtIHQpICsgYiAqIHQ7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU0hBUEU7XG4iLCJ2YXIgR2VvbSA9IHJlcXVpcmUoJy4vR2VvbScpLFxuICAgIFNIQVBFID0gcmVxdWlyZSgnLi9TSEFQRS5qcycpLFxuICAgIGdsTWF0cml4ID0gcmVxdWlyZSgnLi9nbE1hdHJpeFN1YnNldCcpLFxuICAgIGVhcmN1dCA9IHJlcXVpcmUoJ2VhcmN1dCcpLFxuICAgIHZlYzMgPSBnbE1hdHJpeC52ZWMzLFxuICAgIG1hdDQgPSBnbE1hdHJpeC5tYXQ0O1xuXG52YXIgXyA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnJ1bGVzID0gW107XG59O1xuXG5fLnByb3RvdHlwZS5kZWZpbmUgPSBmdW5jdGlvbihsaHMsIGNvbmQsIHJocykge1xuICB0aGlzLnJ1bGVzLnB1c2goe1xuICAgIGxoczogbGhzLFxuICAgIGNvbmQ6IGNvbmQsXG4gICAgcmhzOiByaHNcbiAgfSk7XG59O1xuXG5fLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbihzdGF0ZSkge1xuICBcbiAgdmFyIG91dHB1dCA9IFtdLCBydWxlcyA9IHRoaXMucnVsZXMsIG5vbnRlcm1pbmFscyA9IDA7XG5cbiAgc3RhdGUgPSAoc3RhdGUgaW5zdGFuY2VvZiBBcnJheT8gc3RhdGUgOiBbc3RhdGVdKTtcblxuICB3aGlsZShzdGF0ZS5sZW5ndGgpIHtcblxuICAgIHZhciBsaHMgPSBzdGF0ZS5zaGlmdCgpO1xuXG4gICAgaWYobGhzLnN5bSA9PT0gXy5URVJNSU5BTCkge1xuICAgICAgb3V0cHV0LnB1c2gobGhzKTtcbiAgICB9IGVsc2UgZm9yKHZhciBpID0gMCwgSSA9IHJ1bGVzLmxlbmd0aDsgaSA8IEk7IGkrKykge1xuICAgICAgXG4gICAgICB2YXIgcnVsZSA9IHJ1bGVzW2ldO1xuICAgICAgaWYobGhzLnN5bSA9PT0gcnVsZS5saHMgJiYgXG4gICAgICAgIChydWxlLmNvbmQgPT09IG51bGwgfHwgcnVsZS5jb25kLmNhbGwobGhzKSkpIHtcbiAgICAgICAgXG4gICAgICAgIHZhciByZXQgPSBydWxlLnJocy5jYWxsKGxocyk7XG4gICAgICAgIHJldCA9IChyZXQgaW5zdGFuY2VvZiBBcnJheT8gcmV0IDogW3JldF0pO1xuXG4gICAgICAgIGZvcih2YXIgaiA9IDAsIEogPSByZXQubGVuZ3RoOyBqIDwgSjsgaisrKSB7XG4gICAgICAgICAgb3V0cHV0LnB1c2gocmV0W2pdKTtcbiAgICAgICAgICArK25vbnRlcm1pbmFscztcbiAgICAgICAgfVxuXG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiAobm9udGVybWluYWxzID4gMCA/IHRoaXMucnVuKG91dHB1dCkgOiBvdXRwdXQpO1xufVxuXG5fLlRFUk1JTkFMID0gJ1RFUk1JTkFMJztcblxubW9kdWxlLmV4cG9ydHMgPSBfO1xuIiwidmFyIEdMTUFUX0FSUkFZX1RZUEUgPSBGbG9hdDMyQXJyYXk7XG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMsIEJyYW5kb24gSm9uZXMsIENvbGluIE1hY0tlbnppZSBJVi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cblxuUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0IG1vZGlmaWNhdGlvbixcbmFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblxuICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpc1xuICAgIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSxcbiAgICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIFxuICAgIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuXG5USElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbkFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG5XQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIFxuRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBIT0xERVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1JcbkFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OXG5BTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcblNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLiAqL1xuXG4vKipcbiAqIEBjbGFzcyA0eDQgTWF0cml4XG4gKiBAbmFtZSBtYXQ0XG4gKi9cbnZhciBtYXQ0ID0ge307XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBpZGVudGl0eSBtYXQ0XG4gKlxuICogQHJldHVybnMge21hdDR9IGEgbmV3IDR4NCBtYXRyaXhcbiAqL1xubWF0NC5jcmVhdGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoMTYpO1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAxO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDE7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBtYXQ0IGluaXRpYWxpemVkIHdpdGggdmFsdWVzIGZyb20gYW4gZXhpc3RpbmcgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQ0fSBhIG1hdHJpeCB0byBjbG9uZVxuICogQHJldHVybnMge21hdDR9IGEgbmV3IDR4NCBtYXRyaXhcbiAqL1xubWF0NC5jbG9uZSA9IGZ1bmN0aW9uKGEpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoMTYpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIG91dFs5XSA9IGFbOV07XG4gICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgIG91dFsxMV0gPSBhWzExXTtcbiAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ29weSB0aGUgdmFsdWVzIGZyb20gb25lIG1hdDQgdG8gYW5vdGhlclxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5jb3B5ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgb3V0WzZdID0gYVs2XTtcbiAgICBvdXRbN10gPSBhWzddO1xuICAgIG91dFs4XSA9IGFbOF07XG4gICAgb3V0WzldID0gYVs5XTtcbiAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgb3V0WzExXSA9IGFbMTFdO1xuICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICBvdXRbMTNdID0gYVsxM107XG4gICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTZXQgYSBtYXQ0IHRvIHRoZSBpZGVudGl0eSBtYXRyaXhcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LmlkZW50aXR5ID0gZnVuY3Rpb24ob3V0KSB7XG4gICAgb3V0WzBdID0gMTtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IDE7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IDA7XG4gICAgb3V0WzldID0gMDtcbiAgICBvdXRbMTBdID0gMTtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gMDtcbiAgICBvdXRbMTVdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc3Bvc2UgdGhlIHZhbHVlcyBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQudHJhbnNwb3NlID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgLy8gSWYgd2UgYXJlIHRyYW5zcG9zaW5nIG91cnNlbHZlcyB3ZSBjYW4gc2tpcCBhIGZldyBzdGVwcyBidXQgaGF2ZSB0byBjYWNoZSBzb21lIHZhbHVlc1xuICAgIGlmIChvdXQgPT09IGEpIHtcbiAgICAgICAgdmFyIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgICAgICBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICAgICAgb3V0WzFdID0gYVs0XTtcbiAgICAgICAgb3V0WzJdID0gYVs4XTtcbiAgICAgICAgb3V0WzNdID0gYVsxMl07XG4gICAgICAgIG91dFs0XSA9IGEwMTtcbiAgICAgICAgb3V0WzZdID0gYVs5XTtcbiAgICAgICAgb3V0WzddID0gYVsxM107XG4gICAgICAgIG91dFs4XSA9IGEwMjtcbiAgICAgICAgb3V0WzldID0gYTEyO1xuICAgICAgICBvdXRbMTFdID0gYVsxNF07XG4gICAgICAgIG91dFsxMl0gPSBhMDM7XG4gICAgICAgIG91dFsxM10gPSBhMTM7XG4gICAgICAgIG91dFsxNF0gPSBhMjM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgb3V0WzBdID0gYVswXTtcbiAgICAgICAgb3V0WzFdID0gYVs0XTtcbiAgICAgICAgb3V0WzJdID0gYVs4XTtcbiAgICAgICAgb3V0WzNdID0gYVsxMl07XG4gICAgICAgIG91dFs0XSA9IGFbMV07XG4gICAgICAgIG91dFs1XSA9IGFbNV07XG4gICAgICAgIG91dFs2XSA9IGFbOV07XG4gICAgICAgIG91dFs3XSA9IGFbMTNdO1xuICAgICAgICBvdXRbOF0gPSBhWzJdO1xuICAgICAgICBvdXRbOV0gPSBhWzZdO1xuICAgICAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgICAgIG91dFsxMV0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzEyXSA9IGFbM107XG4gICAgICAgIG91dFsxM10gPSBhWzddO1xuICAgICAgICBvdXRbMTRdID0gYVsxMV07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogSW52ZXJ0cyBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQuaW52ZXJ0ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sIGExMSA9IGFbNV0sIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sIGEyMSA9IGFbOV0sIGEyMiA9IGFbMTBdLCBhMjMgPSBhWzExXSxcbiAgICAgICAgYTMwID0gYVsxMl0sIGEzMSA9IGFbMTNdLCBhMzIgPSBhWzE0XSwgYTMzID0gYVsxNV0sXG5cbiAgICAgICAgYjAwID0gYTAwICogYTExIC0gYTAxICogYTEwLFxuICAgICAgICBiMDEgPSBhMDAgKiBhMTIgLSBhMDIgKiBhMTAsXG4gICAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgICAgYjAzID0gYTAxICogYTEyIC0gYTAyICogYTExLFxuICAgICAgICBiMDQgPSBhMDEgKiBhMTMgLSBhMDMgKiBhMTEsXG4gICAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgICAgYjA2ID0gYTIwICogYTMxIC0gYTIxICogYTMwLFxuICAgICAgICBiMDcgPSBhMjAgKiBhMzIgLSBhMjIgKiBhMzAsXG4gICAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgICAgYjA5ID0gYTIxICogYTMyIC0gYTIyICogYTMxLFxuICAgICAgICBiMTAgPSBhMjEgKiBhMzMgLSBhMjMgKiBhMzEsXG4gICAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMixcblxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGRldGVybWluYW50XG4gICAgICAgIGRldCA9IGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNjtcblxuICAgIGlmICghZGV0KSB7IFxuICAgICAgICByZXR1cm4gbnVsbDsgXG4gICAgfVxuICAgIGRldCA9IDEuMCAvIGRldDtcblxuICAgIG91dFswXSA9IChhMTEgKiBiMTEgLSBhMTIgKiBiMTAgKyBhMTMgKiBiMDkpICogZGV0O1xuICAgIG91dFsxXSA9IChhMDIgKiBiMTAgLSBhMDEgKiBiMTEgLSBhMDMgKiBiMDkpICogZGV0O1xuICAgIG91dFsyXSA9IChhMzEgKiBiMDUgLSBhMzIgKiBiMDQgKyBhMzMgKiBiMDMpICogZGV0O1xuICAgIG91dFszXSA9IChhMjIgKiBiMDQgLSBhMjEgKiBiMDUgLSBhMjMgKiBiMDMpICogZGV0O1xuICAgIG91dFs0XSA9IChhMTIgKiBiMDggLSBhMTAgKiBiMTEgLSBhMTMgKiBiMDcpICogZGV0O1xuICAgIG91dFs1XSA9IChhMDAgKiBiMTEgLSBhMDIgKiBiMDggKyBhMDMgKiBiMDcpICogZGV0O1xuICAgIG91dFs2XSA9IChhMzIgKiBiMDIgLSBhMzAgKiBiMDUgLSBhMzMgKiBiMDEpICogZGV0O1xuICAgIG91dFs3XSA9IChhMjAgKiBiMDUgLSBhMjIgKiBiMDIgKyBhMjMgKiBiMDEpICogZGV0O1xuICAgIG91dFs4XSA9IChhMTAgKiBiMTAgLSBhMTEgKiBiMDggKyBhMTMgKiBiMDYpICogZGV0O1xuICAgIG91dFs5XSA9IChhMDEgKiBiMDggLSBhMDAgKiBiMTAgLSBhMDMgKiBiMDYpICogZGV0O1xuICAgIG91dFsxMF0gPSAoYTMwICogYjA0IC0gYTMxICogYjAyICsgYTMzICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTFdID0gKGEyMSAqIGIwMiAtIGEyMCAqIGIwNCAtIGEyMyAqIGIwMCkgKiBkZXQ7XG4gICAgb3V0WzEyXSA9IChhMTEgKiBiMDcgLSBhMTAgKiBiMDkgLSBhMTIgKiBiMDYpICogZGV0O1xuICAgIG91dFsxM10gPSAoYTAwICogYjA5IC0gYTAxICogYjA3ICsgYTAyICogYjA2KSAqIGRldDtcbiAgICBvdXRbMTRdID0gKGEzMSAqIGIwMSAtIGEzMCAqIGIwMyAtIGEzMiAqIGIwMCkgKiBkZXQ7XG4gICAgb3V0WzE1XSA9IChhMjAgKiBiMDMgLSBhMjEgKiBiMDEgKyBhMjIgKiBiMDApICogZGV0O1xuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgYWRqdWdhdGUgb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LmFkam9pbnQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XTtcblxuICAgIG91dFswXSAgPSAgKGExMSAqIChhMjIgKiBhMzMgLSBhMjMgKiBhMzIpIC0gYTIxICogKGExMiAqIGEzMyAtIGExMyAqIGEzMikgKyBhMzEgKiAoYTEyICogYTIzIC0gYTEzICogYTIyKSk7XG4gICAgb3V0WzFdICA9IC0oYTAxICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjEgKiAoYTAyICogYTMzIC0gYTAzICogYTMyKSArIGEzMSAqIChhMDIgKiBhMjMgLSBhMDMgKiBhMjIpKTtcbiAgICBvdXRbMl0gID0gIChhMDEgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSAtIGExMSAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMxICogKGEwMiAqIGExMyAtIGEwMyAqIGExMikpO1xuICAgIG91dFszXSAgPSAtKGEwMSAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpIC0gYTExICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikgKyBhMjEgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzRdICA9IC0oYTEwICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjAgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSArIGEzMCAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpKTtcbiAgICBvdXRbNV0gID0gIChhMDAgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMCAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMwICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikpO1xuICAgIG91dFs2XSAgPSAtKGEwMCAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpIC0gYTEwICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzAgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzddICA9ICAoYTAwICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikgLSBhMTAgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSArIGEyMCAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbOF0gID0gIChhMTAgKiAoYTIxICogYTMzIC0gYTIzICogYTMxKSAtIGEyMCAqIChhMTEgKiBhMzMgLSBhMTMgKiBhMzEpICsgYTMwICogKGExMSAqIGEyMyAtIGExMyAqIGEyMSkpO1xuICAgIG91dFs5XSAgPSAtKGEwMCAqIChhMjEgKiBhMzMgLSBhMjMgKiBhMzEpIC0gYTIwICogKGEwMSAqIGEzMyAtIGEwMyAqIGEzMSkgKyBhMzAgKiAoYTAxICogYTIzIC0gYTAzICogYTIxKSk7XG4gICAgb3V0WzEwXSA9ICAoYTAwICogKGExMSAqIGEzMyAtIGExMyAqIGEzMSkgLSBhMTAgKiAoYTAxICogYTMzIC0gYTAzICogYTMxKSArIGEzMCAqIChhMDEgKiBhMTMgLSBhMDMgKiBhMTEpKTtcbiAgICBvdXRbMTFdID0gLShhMDAgKiAoYTExICogYTIzIC0gYTEzICogYTIxKSAtIGExMCAqIChhMDEgKiBhMjMgLSBhMDMgKiBhMjEpICsgYTIwICogKGEwMSAqIGExMyAtIGEwMyAqIGExMSkpO1xuICAgIG91dFsxMl0gPSAtKGExMCAqIChhMjEgKiBhMzIgLSBhMjIgKiBhMzEpIC0gYTIwICogKGExMSAqIGEzMiAtIGExMiAqIGEzMSkgKyBhMzAgKiAoYTExICogYTIyIC0gYTEyICogYTIxKSk7XG4gICAgb3V0WzEzXSA9ICAoYTAwICogKGEyMSAqIGEzMiAtIGEyMiAqIGEzMSkgLSBhMjAgKiAoYTAxICogYTMyIC0gYTAyICogYTMxKSArIGEzMCAqIChhMDEgKiBhMjIgLSBhMDIgKiBhMjEpKTtcbiAgICBvdXRbMTRdID0gLShhMDAgKiAoYTExICogYTMyIC0gYTEyICogYTMxKSAtIGExMCAqIChhMDEgKiBhMzIgLSBhMDIgKiBhMzEpICsgYTMwICogKGEwMSAqIGExMiAtIGEwMiAqIGExMSkpO1xuICAgIG91dFsxNV0gPSAgKGEwMCAqIChhMTEgKiBhMjIgLSBhMTIgKiBhMjEpIC0gYTEwICogKGEwMSAqIGEyMiAtIGEwMiAqIGEyMSkgKyBhMjAgKiAoYTAxICogYTEyIC0gYTAyICogYTExKSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGV0ZXJtaW5hbnQgb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkZXRlcm1pbmFudCBvZiBhXG4gKi9cbm1hdDQuZGV0ZXJtaW5hbnQgPSBmdW5jdGlvbiAoYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdLFxuXG4gICAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgICAgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwLFxuICAgICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgICAgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExLFxuICAgICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgICAgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwLFxuICAgICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgICAgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxLFxuICAgICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzI7XG5cbiAgICAvLyBDYWxjdWxhdGUgdGhlIGRldGVybWluYW50XG4gICAgcmV0dXJuIGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNjtcbn07XG5cbi8qKlxuICogTXVsdGlwbGllcyB0d28gbWF0NCdzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHttYXQ0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0Lm11bHRpcGx5ID0gZnVuY3Rpb24gKG91dCwgYSwgYikge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdO1xuXG4gICAgLy8gQ2FjaGUgb25seSB0aGUgY3VycmVudCBsaW5lIG9mIHRoZSBzZWNvbmQgbWF0cml4XG4gICAgdmFyIGIwICA9IGJbMF0sIGIxID0gYlsxXSwgYjIgPSBiWzJdLCBiMyA9IGJbM107ICBcbiAgICBvdXRbMF0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzFdID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFsyXSA9IGIwKmEwMiArIGIxKmExMiArIGIyKmEyMiArIGIzKmEzMjtcbiAgICBvdXRbM10gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbNF07IGIxID0gYls1XTsgYjIgPSBiWzZdOyBiMyA9IGJbN107XG4gICAgb3V0WzRdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFs1XSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbNl0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzddID0gYjAqYTAzICsgYjEqYTEzICsgYjIqYTIzICsgYjMqYTMzO1xuXG4gICAgYjAgPSBiWzhdOyBiMSA9IGJbOV07IGIyID0gYlsxMF07IGIzID0gYlsxMV07XG4gICAgb3V0WzhdID0gYjAqYTAwICsgYjEqYTEwICsgYjIqYTIwICsgYjMqYTMwO1xuICAgIG91dFs5XSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMTBdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFsxMV0gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbMTJdOyBiMSA9IGJbMTNdOyBiMiA9IGJbMTRdOyBiMyA9IGJbMTVdO1xuICAgIG91dFsxMl0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzEzXSA9IGIwKmEwMSArIGIxKmExMSArIGIyKmEyMSArIGIzKmEzMTtcbiAgICBvdXRbMTRdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFsxNV0gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayBtYXQ0Lm11bHRpcGx5fVxuICogQGZ1bmN0aW9uXG4gKi9cbm1hdDQubXVsID0gbWF0NC5tdWx0aXBseTtcblxuLyoqXG4gKiBUcmFuc2xhdGUgYSBtYXQ0IGJ5IHRoZSBnaXZlbiB2ZWN0b3JcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gdHJhbnNsYXRlXG4gKiBAcGFyYW0ge3ZlYzN9IHYgdmVjdG9yIHRvIHRyYW5zbGF0ZSBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LnRyYW5zbGF0ZSA9IGZ1bmN0aW9uIChvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdLCB6ID0gdlsyXSxcbiAgICAgICAgYTAwLCBhMDEsIGEwMiwgYTAzLFxuICAgICAgICBhMTAsIGExMSwgYTEyLCBhMTMsXG4gICAgICAgIGEyMCwgYTIxLCBhMjIsIGEyMztcblxuICAgIGlmIChhID09PSBvdXQpIHtcbiAgICAgICAgb3V0WzEyXSA9IGFbMF0gKiB4ICsgYVs0XSAqIHkgKyBhWzhdICogeiArIGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxXSAqIHggKyBhWzVdICogeSArIGFbOV0gKiB6ICsgYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzJdICogeCArIGFbNl0gKiB5ICsgYVsxMF0gKiB6ICsgYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzNdICogeCArIGFbN10gKiB5ICsgYVsxMV0gKiB6ICsgYVsxNV07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgYTAwID0gYVswXTsgYTAxID0gYVsxXTsgYTAyID0gYVsyXTsgYTAzID0gYVszXTtcbiAgICAgICAgYTEwID0gYVs0XTsgYTExID0gYVs1XTsgYTEyID0gYVs2XTsgYTEzID0gYVs3XTtcbiAgICAgICAgYTIwID0gYVs4XTsgYTIxID0gYVs5XTsgYTIyID0gYVsxMF07IGEyMyA9IGFbMTFdO1xuXG4gICAgICAgIG91dFswXSA9IGEwMDsgb3V0WzFdID0gYTAxOyBvdXRbMl0gPSBhMDI7IG91dFszXSA9IGEwMztcbiAgICAgICAgb3V0WzRdID0gYTEwOyBvdXRbNV0gPSBhMTE7IG91dFs2XSA9IGExMjsgb3V0WzddID0gYTEzO1xuICAgICAgICBvdXRbOF0gPSBhMjA7IG91dFs5XSA9IGEyMTsgb3V0WzEwXSA9IGEyMjsgb3V0WzExXSA9IGEyMztcblxuICAgICAgICBvdXRbMTJdID0gYTAwICogeCArIGExMCAqIHkgKyBhMjAgKiB6ICsgYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhMDEgKiB4ICsgYTExICogeSArIGEyMSAqIHogKyBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGEwMiAqIHggKyBhMTIgKiB5ICsgYTIyICogeiArIGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYTAzICogeCArIGExMyAqIHkgKyBhMjMgKiB6ICsgYVsxNV07XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2NhbGVzIHRoZSBtYXQ0IGJ5IHRoZSBkaW1lbnNpb25zIGluIHRoZSBnaXZlbiB2ZWMzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHNjYWxlXG4gKiBAcGFyYW0ge3ZlYzN9IHYgdGhlIHZlYzMgdG8gc2NhbGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICoqL1xubWF0NC5zY2FsZSA9IGZ1bmN0aW9uKG91dCwgYSwgdikge1xuICAgIHZhciB4ID0gdlswXSwgeSA9IHZbMV0sIHogPSB2WzJdO1xuXG4gICAgb3V0WzBdID0gYVswXSAqIHg7XG4gICAgb3V0WzFdID0gYVsxXSAqIHg7XG4gICAgb3V0WzJdID0gYVsyXSAqIHg7XG4gICAgb3V0WzNdID0gYVszXSAqIHg7XG4gICAgb3V0WzRdID0gYVs0XSAqIHk7XG4gICAgb3V0WzVdID0gYVs1XSAqIHk7XG4gICAgb3V0WzZdID0gYVs2XSAqIHk7XG4gICAgb3V0WzddID0gYVs3XSAqIHk7XG4gICAgb3V0WzhdID0gYVs4XSAqIHo7XG4gICAgb3V0WzldID0gYVs5XSAqIHo7XG4gICAgb3V0WzEwXSA9IGFbMTBdICogejtcbiAgICBvdXRbMTFdID0gYVsxMV0gKiB6O1xuICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICBvdXRbMTNdID0gYVsxM107XG4gICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0NCBieSB0aGUgZ2l2ZW4gYW5nbGVcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHBhcmFtIHt2ZWMzfSBheGlzIHRoZSBheGlzIHRvIHJvdGF0ZSBhcm91bmRcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5yb3RhdGUgPSBmdW5jdGlvbiAob3V0LCBhLCByYWQsIGF4aXMpIHtcbiAgICB2YXIgeCA9IGF4aXNbMF0sIHkgPSBheGlzWzFdLCB6ID0gYXhpc1syXSxcbiAgICAgICAgbGVuID0gTWF0aC5zcXJ0KHggKiB4ICsgeSAqIHkgKyB6ICogeiksXG4gICAgICAgIHMsIGMsIHQsXG4gICAgICAgIGEwMCwgYTAxLCBhMDIsIGEwMyxcbiAgICAgICAgYTEwLCBhMTEsIGExMiwgYTEzLFxuICAgICAgICBhMjAsIGEyMSwgYTIyLCBhMjMsXG4gICAgICAgIGIwMCwgYjAxLCBiMDIsXG4gICAgICAgIGIxMCwgYjExLCBiMTIsXG4gICAgICAgIGIyMCwgYjIxLCBiMjI7XG5cbiAgICBpZiAoTWF0aC5hYnMobGVuKSA8IEdMTUFUX0VQU0lMT04pIHsgcmV0dXJuIG51bGw7IH1cbiAgICBcbiAgICBsZW4gPSAxIC8gbGVuO1xuICAgIHggKj0gbGVuO1xuICAgIHkgKj0gbGVuO1xuICAgIHogKj0gbGVuO1xuXG4gICAgcyA9IE1hdGguc2luKHJhZCk7XG4gICAgYyA9IE1hdGguY29zKHJhZCk7XG4gICAgdCA9IDEgLSBjO1xuXG4gICAgYTAwID0gYVswXTsgYTAxID0gYVsxXTsgYTAyID0gYVsyXTsgYTAzID0gYVszXTtcbiAgICBhMTAgPSBhWzRdOyBhMTEgPSBhWzVdOyBhMTIgPSBhWzZdOyBhMTMgPSBhWzddO1xuICAgIGEyMCA9IGFbOF07IGEyMSA9IGFbOV07IGEyMiA9IGFbMTBdOyBhMjMgPSBhWzExXTtcblxuICAgIC8vIENvbnN0cnVjdCB0aGUgZWxlbWVudHMgb2YgdGhlIHJvdGF0aW9uIG1hdHJpeFxuICAgIGIwMCA9IHggKiB4ICogdCArIGM7IGIwMSA9IHkgKiB4ICogdCArIHogKiBzOyBiMDIgPSB6ICogeCAqIHQgLSB5ICogcztcbiAgICBiMTAgPSB4ICogeSAqIHQgLSB6ICogczsgYjExID0geSAqIHkgKiB0ICsgYzsgYjEyID0geiAqIHkgKiB0ICsgeCAqIHM7XG4gICAgYjIwID0geCAqIHogKiB0ICsgeSAqIHM7IGIyMSA9IHkgKiB6ICogdCAtIHggKiBzOyBiMjIgPSB6ICogeiAqIHQgKyBjO1xuXG4gICAgLy8gUGVyZm9ybSByb3RhdGlvbi1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbMF0gPSBhMDAgKiBiMDAgKyBhMTAgKiBiMDEgKyBhMjAgKiBiMDI7XG4gICAgb3V0WzFdID0gYTAxICogYjAwICsgYTExICogYjAxICsgYTIxICogYjAyO1xuICAgIG91dFsyXSA9IGEwMiAqIGIwMCArIGExMiAqIGIwMSArIGEyMiAqIGIwMjtcbiAgICBvdXRbM10gPSBhMDMgKiBiMDAgKyBhMTMgKiBiMDEgKyBhMjMgKiBiMDI7XG4gICAgb3V0WzRdID0gYTAwICogYjEwICsgYTEwICogYjExICsgYTIwICogYjEyO1xuICAgIG91dFs1XSA9IGEwMSAqIGIxMCArIGExMSAqIGIxMSArIGEyMSAqIGIxMjtcbiAgICBvdXRbNl0gPSBhMDIgKiBiMTAgKyBhMTIgKiBiMTEgKyBhMjIgKiBiMTI7XG4gICAgb3V0WzddID0gYTAzICogYjEwICsgYTEzICogYjExICsgYTIzICogYjEyO1xuICAgIG91dFs4XSA9IGEwMCAqIGIyMCArIGExMCAqIGIyMSArIGEyMCAqIGIyMjtcbiAgICBvdXRbOV0gPSBhMDEgKiBiMjAgKyBhMTEgKiBiMjEgKyBhMjEgKiBiMjI7XG4gICAgb3V0WzEwXSA9IGEwMiAqIGIyMCArIGExMiAqIGIyMSArIGEyMiAqIGIyMjtcbiAgICBvdXRbMTFdID0gYTAzICogYjIwICsgYTEzICogYjIxICsgYTIzICogYjIyO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCBsYXN0IHJvd1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXRyaXggYnkgdGhlIGdpdmVuIGFuZ2xlIGFyb3VuZCB0aGUgWCBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5yb3RhdGVYID0gZnVuY3Rpb24gKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIHMgPSBNYXRoLnNpbihyYWQpLFxuICAgICAgICBjID0gTWF0aC5jb3MocmFkKSxcbiAgICAgICAgYTEwID0gYVs0XSxcbiAgICAgICAgYTExID0gYVs1XSxcbiAgICAgICAgYTEyID0gYVs2XSxcbiAgICAgICAgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSxcbiAgICAgICAgYTIxID0gYVs5XSxcbiAgICAgICAgYTIyID0gYVsxMF0sXG4gICAgICAgIGEyMyA9IGFbMTFdO1xuXG4gICAgaWYgKGEgIT09IG91dCkgeyAvLyBJZiB0aGUgc291cmNlIGFuZCBkZXN0aW5hdGlvbiBkaWZmZXIsIGNvcHkgdGhlIHVuY2hhbmdlZCByb3dzXG4gICAgICAgIG91dFswXSAgPSBhWzBdO1xuICAgICAgICBvdXRbMV0gID0gYVsxXTtcbiAgICAgICAgb3V0WzJdICA9IGFbMl07XG4gICAgICAgIG91dFszXSAgPSBhWzNdO1xuICAgICAgICBvdXRbMTJdID0gYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTVdID0gYVsxNV07XG4gICAgfVxuXG4gICAgLy8gUGVyZm9ybSBheGlzLXNwZWNpZmljIG1hdHJpeCBtdWx0aXBsaWNhdGlvblxuICAgIG91dFs0XSA9IGExMCAqIGMgKyBhMjAgKiBzO1xuICAgIG91dFs1XSA9IGExMSAqIGMgKyBhMjEgKiBzO1xuICAgIG91dFs2XSA9IGExMiAqIGMgKyBhMjIgKiBzO1xuICAgIG91dFs3XSA9IGExMyAqIGMgKyBhMjMgKiBzO1xuICAgIG91dFs4XSA9IGEyMCAqIGMgLSBhMTAgKiBzO1xuICAgIG91dFs5XSA9IGEyMSAqIGMgLSBhMTEgKiBzO1xuICAgIG91dFsxMF0gPSBhMjIgKiBjIC0gYTEyICogcztcbiAgICBvdXRbMTFdID0gYTIzICogYyAtIGExMyAqIHM7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdHJpeCBieSB0aGUgZ2l2ZW4gYW5nbGUgYXJvdW5kIHRoZSBZIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LnJvdGF0ZVkgPSBmdW5jdGlvbiAob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICBhMDAgPSBhWzBdLFxuICAgICAgICBhMDEgPSBhWzFdLFxuICAgICAgICBhMDIgPSBhWzJdLFxuICAgICAgICBhMDMgPSBhWzNdLFxuICAgICAgICBhMjAgPSBhWzhdLFxuICAgICAgICBhMjEgPSBhWzldLFxuICAgICAgICBhMjIgPSBhWzEwXSxcbiAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIHJvd3NcbiAgICAgICAgb3V0WzRdICA9IGFbNF07XG4gICAgICAgIG91dFs1XSAgPSBhWzVdO1xuICAgICAgICBvdXRbNl0gID0gYVs2XTtcbiAgICAgICAgb3V0WzddICA9IGFbN107XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzBdID0gYTAwICogYyAtIGEyMCAqIHM7XG4gICAgb3V0WzFdID0gYTAxICogYyAtIGEyMSAqIHM7XG4gICAgb3V0WzJdID0gYTAyICogYyAtIGEyMiAqIHM7XG4gICAgb3V0WzNdID0gYTAzICogYyAtIGEyMyAqIHM7XG4gICAgb3V0WzhdID0gYTAwICogcyArIGEyMCAqIGM7XG4gICAgb3V0WzldID0gYTAxICogcyArIGEyMSAqIGM7XG4gICAgb3V0WzEwXSA9IGEwMiAqIHMgKyBhMjIgKiBjO1xuICAgIG91dFsxMV0gPSBhMDMgKiBzICsgYTIzICogYztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0cml4IGJ5IHRoZSBnaXZlbiBhbmdsZSBhcm91bmQgdGhlIFogYXhpc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQucm90YXRlWiA9IGZ1bmN0aW9uIChvdXQsIGEsIHJhZCkge1xuICAgIHZhciBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCksXG4gICAgICAgIGEwMCA9IGFbMF0sXG4gICAgICAgIGEwMSA9IGFbMV0sXG4gICAgICAgIGEwMiA9IGFbMl0sXG4gICAgICAgIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sXG4gICAgICAgIGExMSA9IGFbNV0sXG4gICAgICAgIGExMiA9IGFbNl0sXG4gICAgICAgIGExMyA9IGFbN107XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIGxhc3Qgcm93XG4gICAgICAgIG91dFs4XSAgPSBhWzhdO1xuICAgICAgICBvdXRbOV0gID0gYVs5XTtcbiAgICAgICAgb3V0WzEwXSA9IGFbMTBdO1xuICAgICAgICBvdXRbMTFdID0gYVsxMV07XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzBdID0gYTAwICogYyArIGExMCAqIHM7XG4gICAgb3V0WzFdID0gYTAxICogYyArIGExMSAqIHM7XG4gICAgb3V0WzJdID0gYTAyICogYyArIGExMiAqIHM7XG4gICAgb3V0WzNdID0gYTAzICogYyArIGExMyAqIHM7XG4gICAgb3V0WzRdID0gYTEwICogYyAtIGEwMCAqIHM7XG4gICAgb3V0WzVdID0gYTExICogYyAtIGEwMSAqIHM7XG4gICAgb3V0WzZdID0gYTEyICogYyAtIGEwMiAqIHM7XG4gICAgb3V0WzddID0gYTEzICogYyAtIGEwMyAqIHM7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG1hdHJpeCBmcm9tIGEgcXVhdGVybmlvbiByb3RhdGlvbiBhbmQgdmVjdG9yIHRyYW5zbGF0aW9uXG4gKiBUaGlzIGlzIGVxdWl2YWxlbnQgdG8gKGJ1dCBtdWNoIGZhc3RlciB0aGFuKTpcbiAqXG4gKiAgICAgbWF0NC5pZGVudGl0eShkZXN0KTtcbiAqICAgICBtYXQ0LnRyYW5zbGF0ZShkZXN0LCB2ZWMpO1xuICogICAgIHZhciBxdWF0TWF0ID0gbWF0NC5jcmVhdGUoKTtcbiAqICAgICBxdWF0NC50b01hdDQocXVhdCwgcXVhdE1hdCk7XG4gKiAgICAgbWF0NC5tdWx0aXBseShkZXN0LCBxdWF0TWF0KTtcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IHJlY2VpdmluZyBvcGVyYXRpb24gcmVzdWx0XG4gKiBAcGFyYW0ge3F1YXQ0fSBxIFJvdGF0aW9uIHF1YXRlcm5pb25cbiAqIEBwYXJhbSB7dmVjM30gdiBUcmFuc2xhdGlvbiB2ZWN0b3JcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5mcm9tUm90YXRpb25UcmFuc2xhdGlvbiA9IGZ1bmN0aW9uIChvdXQsIHEsIHYpIHtcbiAgICAvLyBRdWF0ZXJuaW9uIG1hdGhcbiAgICB2YXIgeCA9IHFbMF0sIHkgPSBxWzFdLCB6ID0gcVsyXSwgdyA9IHFbM10sXG4gICAgICAgIHgyID0geCArIHgsXG4gICAgICAgIHkyID0geSArIHksXG4gICAgICAgIHoyID0geiArIHosXG5cbiAgICAgICAgeHggPSB4ICogeDIsXG4gICAgICAgIHh5ID0geCAqIHkyLFxuICAgICAgICB4eiA9IHggKiB6MixcbiAgICAgICAgeXkgPSB5ICogeTIsXG4gICAgICAgIHl6ID0geSAqIHoyLFxuICAgICAgICB6eiA9IHogKiB6MixcbiAgICAgICAgd3ggPSB3ICogeDIsXG4gICAgICAgIHd5ID0gdyAqIHkyLFxuICAgICAgICB3eiA9IHcgKiB6MjtcblxuICAgIG91dFswXSA9IDEgLSAoeXkgKyB6eik7XG4gICAgb3V0WzFdID0geHkgKyB3ejtcbiAgICBvdXRbMl0gPSB4eiAtIHd5O1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0geHkgLSB3ejtcbiAgICBvdXRbNV0gPSAxIC0gKHh4ICsgenopO1xuICAgIG91dFs2XSA9IHl6ICsgd3g7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSB4eiArIHd5O1xuICAgIG91dFs5XSA9IHl6IC0gd3g7XG4gICAgb3V0WzEwXSA9IDEgLSAoeHggKyB5eSk7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IHZbMF07XG4gICAgb3V0WzEzXSA9IHZbMV07XG4gICAgb3V0WzE0XSA9IHZbMl07XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbm1hdDQuZnJvbVF1YXQgPSBmdW5jdGlvbiAob3V0LCBxKSB7XG4gICAgdmFyIHggPSBxWzBdLCB5ID0gcVsxXSwgeiA9IHFbMl0sIHcgPSBxWzNdLFxuICAgICAgICB4MiA9IHggKyB4LFxuICAgICAgICB5MiA9IHkgKyB5LFxuICAgICAgICB6MiA9IHogKyB6LFxuXG4gICAgICAgIHh4ID0geCAqIHgyLFxuICAgICAgICB5eCA9IHkgKiB4MixcbiAgICAgICAgeXkgPSB5ICogeTIsXG4gICAgICAgIHp4ID0geiAqIHgyLFxuICAgICAgICB6eSA9IHogKiB5MixcbiAgICAgICAgenogPSB6ICogejIsXG4gICAgICAgIHd4ID0gdyAqIHgyLFxuICAgICAgICB3eSA9IHcgKiB5MixcbiAgICAgICAgd3ogPSB3ICogejI7XG5cbiAgICBvdXRbMF0gPSAxIC0geXkgLSB6ejtcbiAgICBvdXRbMV0gPSB5eCArIHd6O1xuICAgIG91dFsyXSA9IHp4IC0gd3k7XG4gICAgb3V0WzNdID0gMDtcblxuICAgIG91dFs0XSA9IHl4IC0gd3o7XG4gICAgb3V0WzVdID0gMSAtIHh4IC0geno7XG4gICAgb3V0WzZdID0genkgKyB3eDtcbiAgICBvdXRbN10gPSAwO1xuXG4gICAgb3V0WzhdID0genggKyB3eTtcbiAgICBvdXRbOV0gPSB6eSAtIHd4O1xuICAgIG91dFsxMF0gPSAxIC0geHggLSB5eTtcbiAgICBvdXRbMTFdID0gMDtcblxuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAwO1xuICAgIG91dFsxNV0gPSAxO1xuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgZnJ1c3R1bSBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gYm91bmRzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHtOdW1iZXJ9IGxlZnQgTGVmdCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IHJpZ2h0IFJpZ2h0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gYm90dG9tIEJvdHRvbSBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IHRvcCBUb3AgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQuZnJ1c3R1bSA9IGZ1bmN0aW9uIChvdXQsIGxlZnQsIHJpZ2h0LCBib3R0b20sIHRvcCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIHJsID0gMSAvIChyaWdodCAtIGxlZnQpLFxuICAgICAgICB0YiA9IDEgLyAodG9wIC0gYm90dG9tKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IChuZWFyICogMikgKiBybDtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IChuZWFyICogMikgKiB0YjtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gKHJpZ2h0ICsgbGVmdCkgKiBybDtcbiAgICBvdXRbOV0gPSAodG9wICsgYm90dG9tKSAqIHRiO1xuICAgIG91dFsxMF0gPSAoZmFyICsgbmVhcikgKiBuZjtcbiAgICBvdXRbMTFdID0gLTE7XG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IChmYXIgKiBuZWFyICogMikgKiBuZjtcbiAgICBvdXRbMTVdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBwZXJzcGVjdGl2ZSBwcm9qZWN0aW9uIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gZm92eSBWZXJ0aWNhbCBmaWVsZCBvZiB2aWV3IGluIHJhZGlhbnNcbiAqIEBwYXJhbSB7bnVtYmVyfSBhc3BlY3QgQXNwZWN0IHJhdGlvLiB0eXBpY2FsbHkgdmlld3BvcnQgd2lkdGgvaGVpZ2h0XG4gKiBAcGFyYW0ge251bWJlcn0gbmVhciBOZWFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gZmFyIEZhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LnBlcnNwZWN0aXZlID0gZnVuY3Rpb24gKG91dCwgZm92eSwgYXNwZWN0LCBuZWFyLCBmYXIpIHtcbiAgICB2YXIgZiA9IDEuMCAvIE1hdGgudGFuKGZvdnkgLyAyKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IGYgLyBhc3BlY3Q7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSBmO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IChmYXIgKyBuZWFyKSAqIG5mO1xuICAgIG91dFsxMV0gPSAtMTtcbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gKDIgKiBmYXIgKiBuZWFyKSAqIG5mO1xuICAgIG91dFsxNV0gPSAwO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIG9ydGhvZ29uYWwgcHJvamVjdGlvbiBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gYm91bmRzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHtudW1iZXJ9IGxlZnQgTGVmdCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IHJpZ2h0IFJpZ2h0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gYm90dG9tIEJvdHRvbSBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IHRvcCBUb3AgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQub3J0aG8gPSBmdW5jdGlvbiAob3V0LCBsZWZ0LCByaWdodCwgYm90dG9tLCB0b3AsIG5lYXIsIGZhcikge1xuICAgIHZhciBsciA9IDEgLyAobGVmdCAtIHJpZ2h0KSxcbiAgICAgICAgYnQgPSAxIC8gKGJvdHRvbSAtIHRvcCksXG4gICAgICAgIG5mID0gMSAvIChuZWFyIC0gZmFyKTtcbiAgICBvdXRbMF0gPSAtMiAqIGxyO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gLTIgKiBidDtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAyICogbmY7XG4gICAgb3V0WzExXSA9IDA7XG4gICAgb3V0WzEyXSA9IChsZWZ0ICsgcmlnaHQpICogbHI7XG4gICAgb3V0WzEzXSA9ICh0b3AgKyBib3R0b20pICogYnQ7XG4gICAgb3V0WzE0XSA9IChmYXIgKyBuZWFyKSAqIG5mO1xuICAgIG91dFsxNV0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIGxvb2stYXQgbWF0cml4IHdpdGggdGhlIGdpdmVuIGV5ZSBwb3NpdGlvbiwgZm9jYWwgcG9pbnQsIGFuZCB1cCBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgbWF0NCBmcnVzdHVtIG1hdHJpeCB3aWxsIGJlIHdyaXR0ZW4gaW50b1xuICogQHBhcmFtIHt2ZWMzfSBleWUgUG9zaXRpb24gb2YgdGhlIHZpZXdlclxuICogQHBhcmFtIHt2ZWMzfSBjZW50ZXIgUG9pbnQgdGhlIHZpZXdlciBpcyBsb29raW5nIGF0XG4gKiBAcGFyYW0ge3ZlYzN9IHVwIHZlYzMgcG9pbnRpbmcgdXBcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5sb29rQXQgPSBmdW5jdGlvbiAob3V0LCBleWUsIGNlbnRlciwgdXApIHtcbiAgICB2YXIgeDAsIHgxLCB4MiwgeTAsIHkxLCB5MiwgejAsIHoxLCB6MiwgbGVuLFxuICAgICAgICBleWV4ID0gZXllWzBdLFxuICAgICAgICBleWV5ID0gZXllWzFdLFxuICAgICAgICBleWV6ID0gZXllWzJdLFxuICAgICAgICB1cHggPSB1cFswXSxcbiAgICAgICAgdXB5ID0gdXBbMV0sXG4gICAgICAgIHVweiA9IHVwWzJdLFxuICAgICAgICBjZW50ZXJ4ID0gY2VudGVyWzBdLFxuICAgICAgICBjZW50ZXJ5ID0gY2VudGVyWzFdLFxuICAgICAgICBjZW50ZXJ6ID0gY2VudGVyWzJdO1xuXG4gICAgaWYgKE1hdGguYWJzKGV5ZXggLSBjZW50ZXJ4KSA8IEdMTUFUX0VQU0lMT04gJiZcbiAgICAgICAgTWF0aC5hYnMoZXlleSAtIGNlbnRlcnkpIDwgR0xNQVRfRVBTSUxPTiAmJlxuICAgICAgICBNYXRoLmFicyhleWV6IC0gY2VudGVyeikgPCBHTE1BVF9FUFNJTE9OKSB7XG4gICAgICAgIHJldHVybiBtYXQ0LmlkZW50aXR5KG91dCk7XG4gICAgfVxuXG4gICAgejAgPSBleWV4IC0gY2VudGVyeDtcbiAgICB6MSA9IGV5ZXkgLSBjZW50ZXJ5O1xuICAgIHoyID0gZXlleiAtIGNlbnRlcno7XG5cbiAgICBsZW4gPSAxIC8gTWF0aC5zcXJ0KHowICogejAgKyB6MSAqIHoxICsgejIgKiB6Mik7XG4gICAgejAgKj0gbGVuO1xuICAgIHoxICo9IGxlbjtcbiAgICB6MiAqPSBsZW47XG5cbiAgICB4MCA9IHVweSAqIHoyIC0gdXB6ICogejE7XG4gICAgeDEgPSB1cHogKiB6MCAtIHVweCAqIHoyO1xuICAgIHgyID0gdXB4ICogejEgLSB1cHkgKiB6MDtcbiAgICBsZW4gPSBNYXRoLnNxcnQoeDAgKiB4MCArIHgxICogeDEgKyB4MiAqIHgyKTtcbiAgICBpZiAoIWxlbikge1xuICAgICAgICB4MCA9IDA7XG4gICAgICAgIHgxID0gMDtcbiAgICAgICAgeDIgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGxlbiA9IDEgLyBsZW47XG4gICAgICAgIHgwICo9IGxlbjtcbiAgICAgICAgeDEgKj0gbGVuO1xuICAgICAgICB4MiAqPSBsZW47XG4gICAgfVxuXG4gICAgeTAgPSB6MSAqIHgyIC0gejIgKiB4MTtcbiAgICB5MSA9IHoyICogeDAgLSB6MCAqIHgyO1xuICAgIHkyID0gejAgKiB4MSAtIHoxICogeDA7XG5cbiAgICBsZW4gPSBNYXRoLnNxcnQoeTAgKiB5MCArIHkxICogeTEgKyB5MiAqIHkyKTtcbiAgICBpZiAoIWxlbikge1xuICAgICAgICB5MCA9IDA7XG4gICAgICAgIHkxID0gMDtcbiAgICAgICAgeTIgPSAwO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIGxlbiA9IDEgLyBsZW47XG4gICAgICAgIHkwICo9IGxlbjtcbiAgICAgICAgeTEgKj0gbGVuO1xuICAgICAgICB5MiAqPSBsZW47XG4gICAgfVxuXG4gICAgb3V0WzBdID0geDA7XG4gICAgb3V0WzFdID0geTA7XG4gICAgb3V0WzJdID0gejA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSB4MTtcbiAgICBvdXRbNV0gPSB5MTtcbiAgICBvdXRbNl0gPSB6MTtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IHgyO1xuICAgIG91dFs5XSA9IHkyO1xuICAgIG91dFsxMF0gPSB6MjtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gLSh4MCAqIGV5ZXggKyB4MSAqIGV5ZXkgKyB4MiAqIGV5ZXopO1xuICAgIG91dFsxM10gPSAtKHkwICogZXlleCArIHkxICogZXlleSArIHkyICogZXlleik7XG4gICAgb3V0WzE0XSA9IC0oejAgKiBleWV4ICsgejEgKiBleWV5ICsgejIgKiBleWV6KTtcbiAgICBvdXRbMTVdID0gMTtcblxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBtYXQgbWF0cml4IHRvIHJlcHJlc2VudCBhcyBhIHN0cmluZ1xuICogQHJldHVybnMge1N0cmluZ30gc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBtYXRyaXhcbiAqL1xubWF0NC5zdHIgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiAnbWF0NCgnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnLCAnICsgYVszXSArICcsICcgK1xuICAgICAgICAgICAgICAgICAgICBhWzRdICsgJywgJyArIGFbNV0gKyAnLCAnICsgYVs2XSArICcsICcgKyBhWzddICsgJywgJyArXG4gICAgICAgICAgICAgICAgICAgIGFbOF0gKyAnLCAnICsgYVs5XSArICcsICcgKyBhWzEwXSArICcsICcgKyBhWzExXSArICcsICcgKyBcbiAgICAgICAgICAgICAgICAgICAgYVsxMl0gKyAnLCAnICsgYVsxM10gKyAnLCAnICsgYVsxNF0gKyAnLCAnICsgYVsxNV0gKyAnKSc7XG59O1xuXG4vKipcbiAqIFJldHVybnMgRnJvYmVuaXVzIG5vcm0gb2YgYSBtYXQ0XG4gKlxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gY2FsY3VsYXRlIEZyb2Jlbml1cyBub3JtIG9mXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBGcm9iZW5pdXMgbm9ybVxuICovXG5tYXQ0LmZyb2IgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybihNYXRoLnNxcnQoTWF0aC5wb3coYVswXSwgMikgKyBNYXRoLnBvdyhhWzFdLCAyKSArIE1hdGgucG93KGFbMl0sIDIpICsgTWF0aC5wb3coYVszXSwgMikgKyBNYXRoLnBvdyhhWzRdLCAyKSArIE1hdGgucG93KGFbNV0sIDIpICsgTWF0aC5wb3coYVs2XSwgMikgKyBNYXRoLnBvdyhhWzZdLCAyKSArIE1hdGgucG93KGFbN10sIDIpICsgTWF0aC5wb3coYVs4XSwgMikgKyBNYXRoLnBvdyhhWzldLCAyKSArIE1hdGgucG93KGFbMTBdLCAyKSArIE1hdGgucG93KGFbMTFdLCAyKSArIE1hdGgucG93KGFbMTJdLCAyKSArIE1hdGgucG93KGFbMTNdLCAyKSArIE1hdGgucG93KGFbMTRdLCAyKSArIE1hdGgucG93KGFbMTVdLCAyKSApKVxufTtcblxuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy5tYXQ0ID0gbWF0NDtcbn1cblxuLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBcbiAgICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cblxuVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG5BTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBcbkRJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SXG5BTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbihJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbkxPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTlxuQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbihJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG5TT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS4gKi9cblxuLyoqXG4gKiBAY2xhc3MgMyBEaW1lbnNpb25hbCBWZWN0b3JcbiAqIEBuYW1lIHZlYzNcbiAqL1xudmFyIHZlYzMgPSB7fTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3LCBlbXB0eSB2ZWMzXG4gKlxuICogQHJldHVybnMge3ZlYzN9IGEgbmV3IDNEIHZlY3RvclxuICovXG52ZWMzLmNyZWF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSgzKTtcbiAgICBvdXRbMF0gPSAwO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHZlYzMgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyB2ZWN0b3JcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdmVjdG9yIHRvIGNsb25lXG4gKiBAcmV0dXJucyB7dmVjM30gYSBuZXcgM0QgdmVjdG9yXG4gKi9cbnZlYzMuY2xvbmUgPSBmdW5jdGlvbihhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDMpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgdmVjMyBpbml0aWFsaXplZCB3aXRoIHRoZSBnaXZlbiB2YWx1ZXNcbiAqXG4gKiBAcGFyYW0ge051bWJlcn0geCBYIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHkgWSBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB6IFogY29tcG9uZW50XG4gKiBAcmV0dXJucyB7dmVjM30gYSBuZXcgM0QgdmVjdG9yXG4gKi9cbnZlYzMuZnJvbVZhbHVlcyA9IGZ1bmN0aW9uKHgsIHksIHopIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoMyk7XG4gICAgb3V0WzBdID0geDtcbiAgICBvdXRbMV0gPSB5O1xuICAgIG91dFsyXSA9IHo7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ29weSB0aGUgdmFsdWVzIGZyb20gb25lIHZlYzMgdG8gYW5vdGhlclxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIHNvdXJjZSB2ZWN0b3JcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5jb3B5ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2V0IHRoZSBjb21wb25lbnRzIG9mIGEgdmVjMyB0byB0aGUgZ2l2ZW4gdmFsdWVzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHogWiBjb21wb25lbnRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5zZXQgPSBmdW5jdGlvbihvdXQsIHgsIHksIHopIHtcbiAgICBvdXRbMF0gPSB4O1xuICAgIG91dFsxXSA9IHk7XG4gICAgb3V0WzJdID0gejtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBZGRzIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMuYWRkID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSArIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSArIGJbMV07XG4gICAgb3V0WzJdID0gYVsyXSArIGJbMl07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU3VidHJhY3RzIHZlY3RvciBiIGZyb20gdmVjdG9yIGFcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMuc3VidHJhY3QgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdIC0gYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdIC0gYlsxXTtcbiAgICBvdXRbMl0gPSBhWzJdIC0gYlsyXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzMuc3VidHJhY3R9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5zdWIgPSB2ZWMzLnN1YnRyYWN0O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5tdWx0aXBseSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKiBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gKiBiWzFdO1xuICAgIG91dFsyXSA9IGFbMl0gKiBiWzJdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMy5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMzLm11bCA9IHZlYzMubXVsdGlwbHk7XG5cbi8qKlxuICogRGl2aWRlcyB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLmRpdmlkZSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gLyBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gLyBiWzFdO1xuICAgIG91dFsyXSA9IGFbMl0gLyBiWzJdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMy5kaXZpZGV9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5kaXYgPSB2ZWMzLmRpdmlkZTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBtaW5pbXVtIG9mIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMubWluID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gTWF0aC5taW4oYVswXSwgYlswXSk7XG4gICAgb3V0WzFdID0gTWF0aC5taW4oYVsxXSwgYlsxXSk7XG4gICAgb3V0WzJdID0gTWF0aC5taW4oYVsyXSwgYlsyXSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbWF4aW11bSBvZiB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLm1heCA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IE1hdGgubWF4KGFbMF0sIGJbMF0pO1xuICAgIG91dFsxXSA9IE1hdGgubWF4KGFbMV0sIGJbMV0pO1xuICAgIG91dFsyXSA9IE1hdGgubWF4KGFbMl0sIGJbMl0pO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNjYWxlcyBhIHZlYzMgYnkgYSBzY2FsYXIgbnVtYmVyXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgdmVjdG9yIHRvIHNjYWxlXG4gKiBAcGFyYW0ge051bWJlcn0gYiBhbW91bnQgdG8gc2NhbGUgdGhlIHZlY3RvciBieVxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLnNjYWxlID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAqIGI7XG4gICAgb3V0WzFdID0gYVsxXSAqIGI7XG4gICAgb3V0WzJdID0gYVsyXSAqIGI7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWRkcyB0d28gdmVjMydzIGFmdGVyIHNjYWxpbmcgdGhlIHNlY29uZCBvcGVyYW5kIGJ5IGEgc2NhbGFyIHZhbHVlXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHBhcmFtIHtOdW1iZXJ9IHNjYWxlIHRoZSBhbW91bnQgdG8gc2NhbGUgYiBieSBiZWZvcmUgYWRkaW5nXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMuc2NhbGVBbmRBZGQgPSBmdW5jdGlvbihvdXQsIGEsIGIsIHNjYWxlKSB7XG4gICAgb3V0WzBdID0gYVswXSArIChiWzBdICogc2NhbGUpO1xuICAgIG91dFsxXSA9IGFbMV0gKyAoYlsxXSAqIHNjYWxlKTtcbiAgICBvdXRbMl0gPSBhWzJdICsgKGJbMl0gKiBzY2FsZSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZXVjbGlkaWFuIGRpc3RhbmNlIGJldHdlZW4gdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge051bWJlcn0gZGlzdGFuY2UgYmV0d2VlbiBhIGFuZCBiXG4gKi9cbnZlYzMuZGlzdGFuY2UgPSBmdW5jdGlvbihhLCBiKSB7XG4gICAgdmFyIHggPSBiWzBdIC0gYVswXSxcbiAgICAgICAgeSA9IGJbMV0gLSBhWzFdLFxuICAgICAgICB6ID0gYlsyXSAtIGFbMl07XG4gICAgcmV0dXJuIE1hdGguc3FydCh4KnggKyB5KnkgKyB6KnopO1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzMuZGlzdGFuY2V9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5kaXN0ID0gdmVjMy5kaXN0YW5jZTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBzcXVhcmVkIGV1Y2xpZGlhbiBkaXN0YW5jZSBiZXR3ZWVuIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IHNxdWFyZWQgZGlzdGFuY2UgYmV0d2VlbiBhIGFuZCBiXG4gKi9cbnZlYzMuc3F1YXJlZERpc3RhbmNlID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHZhciB4ID0gYlswXSAtIGFbMF0sXG4gICAgICAgIHkgPSBiWzFdIC0gYVsxXSxcbiAgICAgICAgeiA9IGJbMl0gLSBhWzJdO1xuICAgIHJldHVybiB4KnggKyB5KnkgKyB6Kno7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMy5zcXVhcmVkRGlzdGFuY2V9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5zcXJEaXN0ID0gdmVjMy5zcXVhcmVkRGlzdGFuY2U7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgbGVuZ3RoIG9mIGEgdmVjM1xuICpcbiAqIEBwYXJhbSB7dmVjM30gYSB2ZWN0b3IgdG8gY2FsY3VsYXRlIGxlbmd0aCBvZlxuICogQHJldHVybnMge051bWJlcn0gbGVuZ3RoIG9mIGFcbiAqL1xudmVjMy5sZW5ndGggPSBmdW5jdGlvbiAoYSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV0sXG4gICAgICAgIHogPSBhWzJdO1xuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5ICsgeip6KTtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMzLmxlbmd0aH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMzLmxlbiA9IHZlYzMubGVuZ3RoO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIHNxdWFyZWQgbGVuZ3RoIG9mIGEgdmVjM1xuICpcbiAqIEBwYXJhbSB7dmVjM30gYSB2ZWN0b3IgdG8gY2FsY3VsYXRlIHNxdWFyZWQgbGVuZ3RoIG9mXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBzcXVhcmVkIGxlbmd0aCBvZiBhXG4gKi9cbnZlYzMuc3F1YXJlZExlbmd0aCA9IGZ1bmN0aW9uIChhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXSxcbiAgICAgICAgeiA9IGFbMl07XG4gICAgcmV0dXJuIHgqeCArIHkqeSArIHoqejtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMzLnNxdWFyZWRMZW5ndGh9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5zcXJMZW4gPSB2ZWMzLnNxdWFyZWRMZW5ndGg7XG5cbi8qKlxuICogTmVnYXRlcyB0aGUgY29tcG9uZW50cyBvZiBhIHZlYzNcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHZlY3RvciB0byBuZWdhdGVcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5uZWdhdGUgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSAtYVswXTtcbiAgICBvdXRbMV0gPSAtYVsxXTtcbiAgICBvdXRbMl0gPSAtYVsyXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBOb3JtYWxpemUgYSB2ZWMzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB2ZWN0b3IgdG8gbm9ybWFsaXplXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMubm9ybWFsaXplID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXSxcbiAgICAgICAgeiA9IGFbMl07XG4gICAgdmFyIGxlbiA9IHgqeCArIHkqeSArIHoqejtcbiAgICBpZiAobGVuID4gMCkge1xuICAgICAgICAvL1RPRE86IGV2YWx1YXRlIHVzZSBvZiBnbG1faW52c3FydCBoZXJlP1xuICAgICAgICBsZW4gPSAxIC8gTWF0aC5zcXJ0KGxlbik7XG4gICAgICAgIG91dFswXSA9IGFbMF0gKiBsZW47XG4gICAgICAgIG91dFsxXSA9IGFbMV0gKiBsZW47XG4gICAgICAgIG91dFsyXSA9IGFbMl0gKiBsZW47XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGRvdCBwcm9kdWN0IG9mIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRvdCBwcm9kdWN0IG9mIGEgYW5kIGJcbiAqL1xudmVjMy5kb3QgPSBmdW5jdGlvbiAoYSwgYikge1xuICAgIHJldHVybiBhWzBdICogYlswXSArIGFbMV0gKiBiWzFdICsgYVsyXSAqIGJbMl07XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBjcm9zcyBwcm9kdWN0IG9mIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMuY3Jvc3MgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICB2YXIgYXggPSBhWzBdLCBheSA9IGFbMV0sIGF6ID0gYVsyXSxcbiAgICAgICAgYnggPSBiWzBdLCBieSA9IGJbMV0sIGJ6ID0gYlsyXTtcblxuICAgIG91dFswXSA9IGF5ICogYnogLSBheiAqIGJ5O1xuICAgIG91dFsxXSA9IGF6ICogYnggLSBheCAqIGJ6O1xuICAgIG91dFsyXSA9IGF4ICogYnkgLSBheSAqIGJ4O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFBlcmZvcm1zIGEgbGluZWFyIGludGVycG9sYXRpb24gYmV0d2VlbiB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHBhcmFtIHtOdW1iZXJ9IHQgaW50ZXJwb2xhdGlvbiBhbW91bnQgYmV0d2VlbiB0aGUgdHdvIGlucHV0c1xuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLmxlcnAgPSBmdW5jdGlvbiAob3V0LCBhLCBiLCB0KSB7XG4gICAgdmFyIGF4ID0gYVswXSxcbiAgICAgICAgYXkgPSBhWzFdLFxuICAgICAgICBheiA9IGFbMl07XG4gICAgb3V0WzBdID0gYXggKyB0ICogKGJbMF0gLSBheCk7XG4gICAgb3V0WzFdID0gYXkgKyB0ICogKGJbMV0gLSBheSk7XG4gICAgb3V0WzJdID0gYXogKyB0ICogKGJbMl0gLSBheik7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgcmFuZG9tIHZlY3RvciB3aXRoIHRoZSBnaXZlbiBzY2FsZVxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge051bWJlcn0gW3NjYWxlXSBMZW5ndGggb2YgdGhlIHJlc3VsdGluZyB2ZWN0b3IuIElmIG9tbWl0dGVkLCBhIHVuaXQgdmVjdG9yIHdpbGwgYmUgcmV0dXJuZWRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5yYW5kb20gPSBmdW5jdGlvbiAob3V0LCBzY2FsZSkge1xuICAgIHNjYWxlID0gc2NhbGUgfHwgMS4wO1xuXG4gICAgdmFyIHIgPSBHTE1BVF9SQU5ET00oKSAqIDIuMCAqIE1hdGguUEk7XG4gICAgdmFyIHogPSAoR0xNQVRfUkFORE9NKCkgKiAyLjApIC0gMS4wO1xuICAgIHZhciB6U2NhbGUgPSBNYXRoLnNxcnQoMS4wLXoqeikgKiBzY2FsZTtcblxuICAgIG91dFswXSA9IE1hdGguY29zKHIpICogelNjYWxlO1xuICAgIG91dFsxXSA9IE1hdGguc2luKHIpICogelNjYWxlO1xuICAgIG91dFsyXSA9IHogKiBzY2FsZTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMzIHdpdGggYSBtYXQ0LlxuICogNHRoIHZlY3RvciBjb21wb25lbnQgaXMgaW1wbGljaXRseSAnMSdcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge21hdDR9IG0gbWF0cml4IHRvIHRyYW5zZm9ybSB3aXRoXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMudHJhbnNmb3JtTWF0NCA9IGZ1bmN0aW9uKG91dCwgYSwgbSkge1xuICAgIHZhciB4ID0gYVswXSwgeSA9IGFbMV0sIHogPSBhWzJdO1xuICAgIG91dFswXSA9IG1bMF0gKiB4ICsgbVs0XSAqIHkgKyBtWzhdICogeiArIG1bMTJdO1xuICAgIG91dFsxXSA9IG1bMV0gKiB4ICsgbVs1XSAqIHkgKyBtWzldICogeiArIG1bMTNdO1xuICAgIG91dFsyXSA9IG1bMl0gKiB4ICsgbVs2XSAqIHkgKyBtWzEwXSAqIHogKyBtWzE0XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMzIHdpdGggYSBtYXQzLlxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIHZlY3RvciB0byB0cmFuc2Zvcm1cbiAqIEBwYXJhbSB7bWF0NH0gbSB0aGUgM3gzIG1hdHJpeCB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLnRyYW5zZm9ybU1hdDMgPSBmdW5jdGlvbihvdXQsIGEsIG0pIHtcbiAgICB2YXIgeCA9IGFbMF0sIHkgPSBhWzFdLCB6ID0gYVsyXTtcbiAgICBvdXRbMF0gPSB4ICogbVswXSArIHkgKiBtWzNdICsgeiAqIG1bNl07XG4gICAgb3V0WzFdID0geCAqIG1bMV0gKyB5ICogbVs0XSArIHogKiBtWzddO1xuICAgIG91dFsyXSA9IHggKiBtWzJdICsgeSAqIG1bNV0gKyB6ICogbVs4XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWMzIHdpdGggYSBxdWF0XG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHtxdWF0fSBxIHF1YXRlcm5pb24gdG8gdHJhbnNmb3JtIHdpdGhcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy50cmFuc2Zvcm1RdWF0ID0gZnVuY3Rpb24ob3V0LCBhLCBxKSB7XG4gICAgLy8gYmVuY2htYXJrczogaHR0cDovL2pzcGVyZi5jb20vcXVhdGVybmlvbi10cmFuc2Zvcm0tdmVjMy1pbXBsZW1lbnRhdGlvbnNcblxuICAgIHZhciB4ID0gYVswXSwgeSA9IGFbMV0sIHogPSBhWzJdLFxuICAgICAgICBxeCA9IHFbMF0sIHF5ID0gcVsxXSwgcXogPSBxWzJdLCBxdyA9IHFbM10sXG5cbiAgICAgICAgLy8gY2FsY3VsYXRlIHF1YXQgKiB2ZWNcbiAgICAgICAgaXggPSBxdyAqIHggKyBxeSAqIHogLSBxeiAqIHksXG4gICAgICAgIGl5ID0gcXcgKiB5ICsgcXogKiB4IC0gcXggKiB6LFxuICAgICAgICBpeiA9IHF3ICogeiArIHF4ICogeSAtIHF5ICogeCxcbiAgICAgICAgaXcgPSAtcXggKiB4IC0gcXkgKiB5IC0gcXogKiB6O1xuXG4gICAgLy8gY2FsY3VsYXRlIHJlc3VsdCAqIGludmVyc2UgcXVhdFxuICAgIG91dFswXSA9IGl4ICogcXcgKyBpdyAqIC1xeCArIGl5ICogLXF6IC0gaXogKiAtcXk7XG4gICAgb3V0WzFdID0gaXkgKiBxdyArIGl3ICogLXF5ICsgaXogKiAtcXggLSBpeCAqIC1xejtcbiAgICBvdXRbMl0gPSBpeiAqIHF3ICsgaXcgKiAtcXogKyBpeCAqIC1xeSAtIGl5ICogLXF4O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKlxuKiBSb3RhdGUgYSAzRCB2ZWN0b3IgYXJvdW5kIHRoZSB4LWF4aXNcbiogQHBhcmFtIHt2ZWMzfSBvdXQgVGhlIHJlY2VpdmluZyB2ZWMzXG4qIEBwYXJhbSB7dmVjM30gYSBUaGUgdmVjMyBwb2ludCB0byByb3RhdGVcbiogQHBhcmFtIHt2ZWMzfSBiIFRoZSBvcmlnaW4gb2YgdGhlIHJvdGF0aW9uXG4qIEBwYXJhbSB7TnVtYmVyfSBjIFRoZSBhbmdsZSBvZiByb3RhdGlvblxuKiBAcmV0dXJucyB7dmVjM30gb3V0XG4qL1xudmVjMy5yb3RhdGVYID0gZnVuY3Rpb24ob3V0LCBhLCBiLCBjKXtcbiAgIHZhciBwID0gW10sIHI9W107XG5cdCAgLy9UcmFuc2xhdGUgcG9pbnQgdG8gdGhlIG9yaWdpblxuXHQgIHBbMF0gPSBhWzBdIC0gYlswXTtcblx0ICBwWzFdID0gYVsxXSAtIGJbMV07XG4gIFx0cFsyXSA9IGFbMl0gLSBiWzJdO1xuXG5cdCAgLy9wZXJmb3JtIHJvdGF0aW9uXG5cdCAgclswXSA9IHBbMF07XG5cdCAgclsxXSA9IHBbMV0qTWF0aC5jb3MoYykgLSBwWzJdKk1hdGguc2luKGMpO1xuXHQgIHJbMl0gPSBwWzFdKk1hdGguc2luKGMpICsgcFsyXSpNYXRoLmNvcyhjKTtcblxuXHQgIC8vdHJhbnNsYXRlIHRvIGNvcnJlY3QgcG9zaXRpb25cblx0ICBvdXRbMF0gPSByWzBdICsgYlswXTtcblx0ICBvdXRbMV0gPSByWzFdICsgYlsxXTtcblx0ICBvdXRbMl0gPSByWzJdICsgYlsyXTtcblxuICBcdHJldHVybiBvdXQ7XG59O1xuXG4vKlxuKiBSb3RhdGUgYSAzRCB2ZWN0b3IgYXJvdW5kIHRoZSB5LWF4aXNcbiogQHBhcmFtIHt2ZWMzfSBvdXQgVGhlIHJlY2VpdmluZyB2ZWMzXG4qIEBwYXJhbSB7dmVjM30gYSBUaGUgdmVjMyBwb2ludCB0byByb3RhdGVcbiogQHBhcmFtIHt2ZWMzfSBiIFRoZSBvcmlnaW4gb2YgdGhlIHJvdGF0aW9uXG4qIEBwYXJhbSB7TnVtYmVyfSBjIFRoZSBhbmdsZSBvZiByb3RhdGlvblxuKiBAcmV0dXJucyB7dmVjM30gb3V0XG4qL1xudmVjMy5yb3RhdGVZID0gZnVuY3Rpb24ob3V0LCBhLCBiLCBjKXtcbiAgXHR2YXIgcCA9IFtdLCByPVtdO1xuICBcdC8vVHJhbnNsYXRlIHBvaW50IHRvIHRoZSBvcmlnaW5cbiAgXHRwWzBdID0gYVswXSAtIGJbMF07XG4gIFx0cFsxXSA9IGFbMV0gLSBiWzFdO1xuICBcdHBbMl0gPSBhWzJdIC0gYlsyXTtcbiAgXG4gIFx0Ly9wZXJmb3JtIHJvdGF0aW9uXG4gIFx0clswXSA9IHBbMl0qTWF0aC5zaW4oYykgKyBwWzBdKk1hdGguY29zKGMpO1xuICBcdHJbMV0gPSBwWzFdO1xuICBcdHJbMl0gPSBwWzJdKk1hdGguY29zKGMpIC0gcFswXSpNYXRoLnNpbihjKTtcbiAgXG4gIFx0Ly90cmFuc2xhdGUgdG8gY29ycmVjdCBwb3NpdGlvblxuICBcdG91dFswXSA9IHJbMF0gKyBiWzBdO1xuICBcdG91dFsxXSA9IHJbMV0gKyBiWzFdO1xuICBcdG91dFsyXSA9IHJbMl0gKyBiWzJdO1xuICBcbiAgXHRyZXR1cm4gb3V0O1xufTtcblxuLypcbiogUm90YXRlIGEgM0QgdmVjdG9yIGFyb3VuZCB0aGUgei1heGlzXG4qIEBwYXJhbSB7dmVjM30gb3V0IFRoZSByZWNlaXZpbmcgdmVjM1xuKiBAcGFyYW0ge3ZlYzN9IGEgVGhlIHZlYzMgcG9pbnQgdG8gcm90YXRlXG4qIEBwYXJhbSB7dmVjM30gYiBUaGUgb3JpZ2luIG9mIHRoZSByb3RhdGlvblxuKiBAcGFyYW0ge051bWJlcn0gYyBUaGUgYW5nbGUgb2Ygcm90YXRpb25cbiogQHJldHVybnMge3ZlYzN9IG91dFxuKi9cbnZlYzMucm90YXRlWiA9IGZ1bmN0aW9uKG91dCwgYSwgYiwgYyl7XG4gIFx0dmFyIHAgPSBbXSwgcj1bXTtcbiAgXHQvL1RyYW5zbGF0ZSBwb2ludCB0byB0aGUgb3JpZ2luXG4gIFx0cFswXSA9IGFbMF0gLSBiWzBdO1xuICBcdHBbMV0gPSBhWzFdIC0gYlsxXTtcbiAgXHRwWzJdID0gYVsyXSAtIGJbMl07XG4gIFxuICBcdC8vcGVyZm9ybSByb3RhdGlvblxuICBcdHJbMF0gPSBwWzBdKk1hdGguY29zKGMpIC0gcFsxXSpNYXRoLnNpbihjKTtcbiAgXHRyWzFdID0gcFswXSpNYXRoLnNpbihjKSArIHBbMV0qTWF0aC5jb3MoYyk7XG4gIFx0clsyXSA9IHBbMl07XG4gIFxuICBcdC8vdHJhbnNsYXRlIHRvIGNvcnJlY3QgcG9zaXRpb25cbiAgXHRvdXRbMF0gPSByWzBdICsgYlswXTtcbiAgXHRvdXRbMV0gPSByWzFdICsgYlsxXTtcbiAgXHRvdXRbMl0gPSByWzJdICsgYlsyXTtcbiAgXG4gIFx0cmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUGVyZm9ybSBzb21lIG9wZXJhdGlvbiBvdmVyIGFuIGFycmF5IG9mIHZlYzNzLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGEgdGhlIGFycmF5IG9mIHZlY3RvcnMgdG8gaXRlcmF0ZSBvdmVyXG4gKiBAcGFyYW0ge051bWJlcn0gc3RyaWRlIE51bWJlciBvZiBlbGVtZW50cyBiZXR3ZWVuIHRoZSBzdGFydCBvZiBlYWNoIHZlYzMuIElmIDAgYXNzdW1lcyB0aWdodGx5IHBhY2tlZFxuICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBOdW1iZXIgb2YgZWxlbWVudHMgdG8gc2tpcCBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBhcnJheVxuICogQHBhcmFtIHtOdW1iZXJ9IGNvdW50IE51bWJlciBvZiB2ZWMzcyB0byBpdGVyYXRlIG92ZXIuIElmIDAgaXRlcmF0ZXMgb3ZlciBlbnRpcmUgYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuIEZ1bmN0aW9uIHRvIGNhbGwgZm9yIGVhY2ggdmVjdG9yIGluIHRoZSBhcnJheVxuICogQHBhcmFtIHtPYmplY3R9IFthcmddIGFkZGl0aW9uYWwgYXJndW1lbnQgdG8gcGFzcyB0byBmblxuICogQHJldHVybnMge0FycmF5fSBhXG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5mb3JFYWNoID0gKGZ1bmN0aW9uKCkge1xuICAgIHZhciB2ZWMgPSB2ZWMzLmNyZWF0ZSgpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGEsIHN0cmlkZSwgb2Zmc2V0LCBjb3VudCwgZm4sIGFyZykge1xuICAgICAgICB2YXIgaSwgbDtcbiAgICAgICAgaWYoIXN0cmlkZSkge1xuICAgICAgICAgICAgc3RyaWRlID0gMztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFvZmZzZXQpIHtcbiAgICAgICAgICAgIG9mZnNldCA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmKGNvdW50KSB7XG4gICAgICAgICAgICBsID0gTWF0aC5taW4oKGNvdW50ICogc3RyaWRlKSArIG9mZnNldCwgYS5sZW5ndGgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbCA9IGEubGVuZ3RoO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yKGkgPSBvZmZzZXQ7IGkgPCBsOyBpICs9IHN0cmlkZSkge1xuICAgICAgICAgICAgdmVjWzBdID0gYVtpXTsgdmVjWzFdID0gYVtpKzFdOyB2ZWNbMl0gPSBhW2krMl07XG4gICAgICAgICAgICBmbih2ZWMsIHZlYywgYXJnKTtcbiAgICAgICAgICAgIGFbaV0gPSB2ZWNbMF07IGFbaSsxXSA9IHZlY1sxXTsgYVtpKzJdID0gdmVjWzJdO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gYTtcbiAgICB9O1xufSkoKTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgdmVjdG9yXG4gKlxuICogQHBhcmFtIHt2ZWMzfSB2ZWMgdmVjdG9yIHRvIHJlcHJlc2VudCBhcyBhIHN0cmluZ1xuICogQHJldHVybnMge1N0cmluZ30gc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSB2ZWN0b3JcbiAqL1xudmVjMy5zdHIgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiAndmVjMygnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnKSc7XG59O1xuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy52ZWMzID0gdmVjMztcbn1cbi8qIENvcHlyaWdodCAoYykgMjAxMywgQnJhbmRvbiBKb25lcywgQ29saW4gTWFjS2VuemllIElWLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5SZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLFxuYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXG4gICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzXG4gICAgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gXG4gICAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cblRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbldBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cbi8qKlxuICogQGNsYXNzIDN4MyBNYXRyaXhcbiAqIEBuYW1lIG1hdDNcbiAqL1xudmFyIG1hdDMgPSB7fTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGlkZW50aXR5IG1hdDNcbiAqXG4gKiBAcmV0dXJucyB7bWF0M30gYSBuZXcgM3gzIG1hdHJpeFxuICovXG5tYXQzLmNyZWF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSg5KTtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDE7XG4gICAgb3V0WzVdID0gMDtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3BpZXMgdGhlIHVwcGVyLWxlZnQgM3gzIHZhbHVlcyBpbnRvIHRoZSBnaXZlbiBtYXQzLlxuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgM3gzIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhICAgdGhlIHNvdXJjZSA0eDQgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuZnJvbU1hdDQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICBvdXRbM10gPSBhWzRdO1xuICAgIG91dFs0XSA9IGFbNV07XG4gICAgb3V0WzVdID0gYVs2XTtcbiAgICBvdXRbNl0gPSBhWzhdO1xuICAgIG91dFs3XSA9IGFbOV07XG4gICAgb3V0WzhdID0gYVsxMF07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBtYXQzIGluaXRpYWxpemVkIHdpdGggdmFsdWVzIGZyb20gYW4gZXhpc3RpbmcgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQzfSBhIG1hdHJpeCB0byBjbG9uZVxuICogQHJldHVybnMge21hdDN9IGEgbmV3IDN4MyBtYXRyaXhcbiAqL1xubWF0My5jbG9uZSA9IGZ1bmN0aW9uKGEpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoOSk7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgb3V0WzZdID0gYVs2XTtcbiAgICBvdXRbN10gPSBhWzddO1xuICAgIG91dFs4XSA9IGFbOF07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ29weSB0aGUgdmFsdWVzIGZyb20gb25lIG1hdDMgdG8gYW5vdGhlclxuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My5jb3B5ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgb3V0WzZdID0gYVs2XTtcbiAgICBvdXRbN10gPSBhWzddO1xuICAgIG91dFs4XSA9IGFbOF07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2V0IGEgbWF0MyB0byB0aGUgaWRlbnRpdHkgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQzfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My5pZGVudGl0eSA9IGZ1bmN0aW9uKG91dCkge1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMTtcbiAgICBvdXRbNV0gPSAwO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zcG9zZSB0aGUgdmFsdWVzIG9mIGEgbWF0M1xuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My50cmFuc3Bvc2UgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICAvLyBJZiB3ZSBhcmUgdHJhbnNwb3Npbmcgb3Vyc2VsdmVzIHdlIGNhbiBza2lwIGEgZmV3IHN0ZXBzIGJ1dCBoYXZlIHRvIGNhY2hlIHNvbWUgdmFsdWVzXG4gICAgaWYgKG91dCA9PT0gYSkge1xuICAgICAgICB2YXIgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTEyID0gYVs1XTtcbiAgICAgICAgb3V0WzFdID0gYVszXTtcbiAgICAgICAgb3V0WzJdID0gYVs2XTtcbiAgICAgICAgb3V0WzNdID0gYTAxO1xuICAgICAgICBvdXRbNV0gPSBhWzddO1xuICAgICAgICBvdXRbNl0gPSBhMDI7XG4gICAgICAgIG91dFs3XSA9IGExMjtcbiAgICB9IGVsc2Uge1xuICAgICAgICBvdXRbMF0gPSBhWzBdO1xuICAgICAgICBvdXRbMV0gPSBhWzNdO1xuICAgICAgICBvdXRbMl0gPSBhWzZdO1xuICAgICAgICBvdXRbM10gPSBhWzFdO1xuICAgICAgICBvdXRbNF0gPSBhWzRdO1xuICAgICAgICBvdXRbNV0gPSBhWzddO1xuICAgICAgICBvdXRbNl0gPSBhWzJdO1xuICAgICAgICBvdXRbN10gPSBhWzVdO1xuICAgICAgICBvdXRbOF0gPSBhWzhdO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBJbnZlcnRzIGEgbWF0M1xuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My5pbnZlcnQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSxcbiAgICAgICAgYTEwID0gYVszXSwgYTExID0gYVs0XSwgYTEyID0gYVs1XSxcbiAgICAgICAgYTIwID0gYVs2XSwgYTIxID0gYVs3XSwgYTIyID0gYVs4XSxcblxuICAgICAgICBiMDEgPSBhMjIgKiBhMTEgLSBhMTIgKiBhMjEsXG4gICAgICAgIGIxMSA9IC1hMjIgKiBhMTAgKyBhMTIgKiBhMjAsXG4gICAgICAgIGIyMSA9IGEyMSAqIGExMCAtIGExMSAqIGEyMCxcblxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGRldGVybWluYW50XG4gICAgICAgIGRldCA9IGEwMCAqIGIwMSArIGEwMSAqIGIxMSArIGEwMiAqIGIyMTtcblxuICAgIGlmICghZGV0KSB7IFxuICAgICAgICByZXR1cm4gbnVsbDsgXG4gICAgfVxuICAgIGRldCA9IDEuMCAvIGRldDtcblxuICAgIG91dFswXSA9IGIwMSAqIGRldDtcbiAgICBvdXRbMV0gPSAoLWEyMiAqIGEwMSArIGEwMiAqIGEyMSkgKiBkZXQ7XG4gICAgb3V0WzJdID0gKGExMiAqIGEwMSAtIGEwMiAqIGExMSkgKiBkZXQ7XG4gICAgb3V0WzNdID0gYjExICogZGV0O1xuICAgIG91dFs0XSA9IChhMjIgKiBhMDAgLSBhMDIgKiBhMjApICogZGV0O1xuICAgIG91dFs1XSA9ICgtYTEyICogYTAwICsgYTAyICogYTEwKSAqIGRldDtcbiAgICBvdXRbNl0gPSBiMjEgKiBkZXQ7XG4gICAgb3V0WzddID0gKC1hMjEgKiBhMDAgKyBhMDEgKiBhMjApICogZGV0O1xuICAgIG91dFs4XSA9IChhMTEgKiBhMDAgLSBhMDEgKiBhMTApICogZGV0O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGFkanVnYXRlIG9mIGEgbWF0M1xuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My5hZGpvaW50ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sXG4gICAgICAgIGExMCA9IGFbM10sIGExMSA9IGFbNF0sIGExMiA9IGFbNV0sXG4gICAgICAgIGEyMCA9IGFbNl0sIGEyMSA9IGFbN10sIGEyMiA9IGFbOF07XG5cbiAgICBvdXRbMF0gPSAoYTExICogYTIyIC0gYTEyICogYTIxKTtcbiAgICBvdXRbMV0gPSAoYTAyICogYTIxIC0gYTAxICogYTIyKTtcbiAgICBvdXRbMl0gPSAoYTAxICogYTEyIC0gYTAyICogYTExKTtcbiAgICBvdXRbM10gPSAoYTEyICogYTIwIC0gYTEwICogYTIyKTtcbiAgICBvdXRbNF0gPSAoYTAwICogYTIyIC0gYTAyICogYTIwKTtcbiAgICBvdXRbNV0gPSAoYTAyICogYTEwIC0gYTAwICogYTEyKTtcbiAgICBvdXRbNl0gPSAoYTEwICogYTIxIC0gYTExICogYTIwKTtcbiAgICBvdXRbN10gPSAoYTAxICogYTIwIC0gYTAwICogYTIxKTtcbiAgICBvdXRbOF0gPSAoYTAwICogYTExIC0gYTAxICogYTEwKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkZXRlcm1pbmFudCBvZiBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRldGVybWluYW50IG9mIGFcbiAqL1xubWF0My5kZXRlcm1pbmFudCA9IGZ1bmN0aW9uIChhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sXG4gICAgICAgIGExMCA9IGFbM10sIGExMSA9IGFbNF0sIGExMiA9IGFbNV0sXG4gICAgICAgIGEyMCA9IGFbNl0sIGEyMSA9IGFbN10sIGEyMiA9IGFbOF07XG5cbiAgICByZXR1cm4gYTAwICogKGEyMiAqIGExMSAtIGExMiAqIGEyMSkgKyBhMDEgKiAoLWEyMiAqIGExMCArIGExMiAqIGEyMCkgKyBhMDIgKiAoYTIxICogYTEwIC0gYTExICogYTIwKTtcbn07XG5cbi8qKlxuICogTXVsdGlwbGllcyB0d28gbWF0MydzXG4gKlxuICogQHBhcmFtIHttYXQzfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0M30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHttYXQzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge21hdDN9IG91dFxuICovXG5tYXQzLm11bHRpcGx5ID0gZnVuY3Rpb24gKG91dCwgYSwgYikge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLFxuICAgICAgICBhMTAgPSBhWzNdLCBhMTEgPSBhWzRdLCBhMTIgPSBhWzVdLFxuICAgICAgICBhMjAgPSBhWzZdLCBhMjEgPSBhWzddLCBhMjIgPSBhWzhdLFxuXG4gICAgICAgIGIwMCA9IGJbMF0sIGIwMSA9IGJbMV0sIGIwMiA9IGJbMl0sXG4gICAgICAgIGIxMCA9IGJbM10sIGIxMSA9IGJbNF0sIGIxMiA9IGJbNV0sXG4gICAgICAgIGIyMCA9IGJbNl0sIGIyMSA9IGJbN10sIGIyMiA9IGJbOF07XG5cbiAgICBvdXRbMF0gPSBiMDAgKiBhMDAgKyBiMDEgKiBhMTAgKyBiMDIgKiBhMjA7XG4gICAgb3V0WzFdID0gYjAwICogYTAxICsgYjAxICogYTExICsgYjAyICogYTIxO1xuICAgIG91dFsyXSA9IGIwMCAqIGEwMiArIGIwMSAqIGExMiArIGIwMiAqIGEyMjtcblxuICAgIG91dFszXSA9IGIxMCAqIGEwMCArIGIxMSAqIGExMCArIGIxMiAqIGEyMDtcbiAgICBvdXRbNF0gPSBiMTAgKiBhMDEgKyBiMTEgKiBhMTEgKyBiMTIgKiBhMjE7XG4gICAgb3V0WzVdID0gYjEwICogYTAyICsgYjExICogYTEyICsgYjEyICogYTIyO1xuXG4gICAgb3V0WzZdID0gYjIwICogYTAwICsgYjIxICogYTEwICsgYjIyICogYTIwO1xuICAgIG91dFs3XSA9IGIyMCAqIGEwMSArIGIyMSAqIGExMSArIGIyMiAqIGEyMTtcbiAgICBvdXRbOF0gPSBiMjAgKiBhMDIgKyBiMjEgKiBhMTIgKyBiMjIgKiBhMjI7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayBtYXQzLm11bHRpcGx5fVxuICogQGZ1bmN0aW9uXG4gKi9cbm1hdDMubXVsID0gbWF0My5tdWx0aXBseTtcblxuLyoqXG4gKiBUcmFuc2xhdGUgYSBtYXQzIGJ5IHRoZSBnaXZlbiB2ZWN0b3JcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBtYXRyaXggdG8gdHJhbnNsYXRlXG4gKiBAcGFyYW0ge3ZlYzJ9IHYgdmVjdG9yIHRvIHRyYW5zbGF0ZSBieVxuICogQHJldHVybnMge21hdDN9IG91dFxuICovXG5tYXQzLnRyYW5zbGF0ZSA9IGZ1bmN0aW9uKG91dCwgYSwgdikge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLFxuICAgICAgICBhMTAgPSBhWzNdLCBhMTEgPSBhWzRdLCBhMTIgPSBhWzVdLFxuICAgICAgICBhMjAgPSBhWzZdLCBhMjEgPSBhWzddLCBhMjIgPSBhWzhdLFxuICAgICAgICB4ID0gdlswXSwgeSA9IHZbMV07XG5cbiAgICBvdXRbMF0gPSBhMDA7XG4gICAgb3V0WzFdID0gYTAxO1xuICAgIG91dFsyXSA9IGEwMjtcblxuICAgIG91dFszXSA9IGExMDtcbiAgICBvdXRbNF0gPSBhMTE7XG4gICAgb3V0WzVdID0gYTEyO1xuXG4gICAgb3V0WzZdID0geCAqIGEwMCArIHkgKiBhMTAgKyBhMjA7XG4gICAgb3V0WzddID0geCAqIGEwMSArIHkgKiBhMTEgKyBhMjE7XG4gICAgb3V0WzhdID0geCAqIGEwMiArIHkgKiBhMTIgKyBhMjI7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdDMgYnkgdGhlIGdpdmVuIGFuZ2xlXG4gKlxuICogQHBhcmFtIHttYXQzfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0M30gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My5yb3RhdGUgPSBmdW5jdGlvbiAob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSxcbiAgICAgICAgYTEwID0gYVszXSwgYTExID0gYVs0XSwgYTEyID0gYVs1XSxcbiAgICAgICAgYTIwID0gYVs2XSwgYTIxID0gYVs3XSwgYTIyID0gYVs4XSxcblxuICAgICAgICBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCk7XG5cbiAgICBvdXRbMF0gPSBjICogYTAwICsgcyAqIGExMDtcbiAgICBvdXRbMV0gPSBjICogYTAxICsgcyAqIGExMTtcbiAgICBvdXRbMl0gPSBjICogYTAyICsgcyAqIGExMjtcblxuICAgIG91dFszXSA9IGMgKiBhMTAgLSBzICogYTAwO1xuICAgIG91dFs0XSA9IGMgKiBhMTEgLSBzICogYTAxO1xuICAgIG91dFs1XSA9IGMgKiBhMTIgLSBzICogYTAyO1xuXG4gICAgb3V0WzZdID0gYTIwO1xuICAgIG91dFs3XSA9IGEyMTtcbiAgICBvdXRbOF0gPSBhMjI7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2NhbGVzIHRoZSBtYXQzIGJ5IHRoZSBkaW1lbnNpb25zIGluIHRoZSBnaXZlbiB2ZWMyXG4gKlxuICogQHBhcmFtIHttYXQzfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0M30gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHt2ZWMyfSB2IHRoZSB2ZWMyIHRvIHNjYWxlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqKi9cbm1hdDMuc2NhbGUgPSBmdW5jdGlvbihvdXQsIGEsIHYpIHtcbiAgICB2YXIgeCA9IHZbMF0sIHkgPSB2WzFdO1xuXG4gICAgb3V0WzBdID0geCAqIGFbMF07XG4gICAgb3V0WzFdID0geCAqIGFbMV07XG4gICAgb3V0WzJdID0geCAqIGFbMl07XG5cbiAgICBvdXRbM10gPSB5ICogYVszXTtcbiAgICBvdXRbNF0gPSB5ICogYVs0XTtcbiAgICBvdXRbNV0gPSB5ICogYVs1XTtcblxuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENvcGllcyB0aGUgdmFsdWVzIGZyb20gYSBtYXQyZCBpbnRvIGEgbWF0M1xuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJkfSBhIHRoZSBtYXRyaXggdG8gY29weVxuICogQHJldHVybnMge21hdDN9IG91dFxuICoqL1xubWF0My5mcm9tTWF0MmQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gMDtcblxuICAgIG91dFszXSA9IGFbMl07XG4gICAgb3V0WzRdID0gYVszXTtcbiAgICBvdXRbNV0gPSAwO1xuXG4gICAgb3V0WzZdID0gYVs0XTtcbiAgICBvdXRbN10gPSBhWzVdO1xuICAgIG91dFs4XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuKiBDYWxjdWxhdGVzIGEgM3gzIG1hdHJpeCBmcm9tIHRoZSBnaXZlbiBxdWF0ZXJuaW9uXG4qXG4qIEBwYXJhbSB7bWF0M30gb3V0IG1hdDMgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiogQHBhcmFtIHtxdWF0fSBxIFF1YXRlcm5pb24gdG8gY3JlYXRlIG1hdHJpeCBmcm9tXG4qXG4qIEByZXR1cm5zIHttYXQzfSBvdXRcbiovXG5tYXQzLmZyb21RdWF0ID0gZnVuY3Rpb24gKG91dCwgcSkge1xuICAgIHZhciB4ID0gcVswXSwgeSA9IHFbMV0sIHogPSBxWzJdLCB3ID0gcVszXSxcbiAgICAgICAgeDIgPSB4ICsgeCxcbiAgICAgICAgeTIgPSB5ICsgeSxcbiAgICAgICAgejIgPSB6ICsgeixcblxuICAgICAgICB4eCA9IHggKiB4MixcbiAgICAgICAgeXggPSB5ICogeDIsXG4gICAgICAgIHl5ID0geSAqIHkyLFxuICAgICAgICB6eCA9IHogKiB4MixcbiAgICAgICAgenkgPSB6ICogeTIsXG4gICAgICAgIHp6ID0geiAqIHoyLFxuICAgICAgICB3eCA9IHcgKiB4MixcbiAgICAgICAgd3kgPSB3ICogeTIsXG4gICAgICAgIHd6ID0gdyAqIHoyO1xuXG4gICAgb3V0WzBdID0gMSAtIHl5IC0geno7XG4gICAgb3V0WzNdID0geXggLSB3ejtcbiAgICBvdXRbNl0gPSB6eCArIHd5O1xuXG4gICAgb3V0WzFdID0geXggKyB3ejtcbiAgICBvdXRbNF0gPSAxIC0geHggLSB6ejtcbiAgICBvdXRbN10gPSB6eSAtIHd4O1xuXG4gICAgb3V0WzJdID0genggLSB3eTtcbiAgICBvdXRbNV0gPSB6eSArIHd4O1xuICAgIG91dFs4XSA9IDEgLSB4eCAtIHl5O1xuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuKiBDYWxjdWxhdGVzIGEgM3gzIG5vcm1hbCBtYXRyaXggKHRyYW5zcG9zZSBpbnZlcnNlKSBmcm9tIHRoZSA0eDQgbWF0cml4XG4qXG4qIEBwYXJhbSB7bWF0M30gb3V0IG1hdDMgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiogQHBhcmFtIHttYXQ0fSBhIE1hdDQgdG8gZGVyaXZlIHRoZSBub3JtYWwgbWF0cml4IGZyb21cbipcbiogQHJldHVybnMge21hdDN9IG91dFxuKi9cbm1hdDMubm9ybWFsRnJvbU1hdDQgPSBmdW5jdGlvbiAob3V0LCBhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sIGExMSA9IGFbNV0sIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sIGEyMSA9IGFbOV0sIGEyMiA9IGFbMTBdLCBhMjMgPSBhWzExXSxcbiAgICAgICAgYTMwID0gYVsxMl0sIGEzMSA9IGFbMTNdLCBhMzIgPSBhWzE0XSwgYTMzID0gYVsxNV0sXG5cbiAgICAgICAgYjAwID0gYTAwICogYTExIC0gYTAxICogYTEwLFxuICAgICAgICBiMDEgPSBhMDAgKiBhMTIgLSBhMDIgKiBhMTAsXG4gICAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgICAgYjAzID0gYTAxICogYTEyIC0gYTAyICogYTExLFxuICAgICAgICBiMDQgPSBhMDEgKiBhMTMgLSBhMDMgKiBhMTEsXG4gICAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgICAgYjA2ID0gYTIwICogYTMxIC0gYTIxICogYTMwLFxuICAgICAgICBiMDcgPSBhMjAgKiBhMzIgLSBhMjIgKiBhMzAsXG4gICAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgICAgYjA5ID0gYTIxICogYTMyIC0gYTIyICogYTMxLFxuICAgICAgICBiMTAgPSBhMjEgKiBhMzMgLSBhMjMgKiBhMzEsXG4gICAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMixcblxuICAgICAgICAvLyBDYWxjdWxhdGUgdGhlIGRldGVybWluYW50XG4gICAgICAgIGRldCA9IGIwMCAqIGIxMSAtIGIwMSAqIGIxMCArIGIwMiAqIGIwOSArIGIwMyAqIGIwOCAtIGIwNCAqIGIwNyArIGIwNSAqIGIwNjtcblxuICAgIGlmICghZGV0KSB7IFxuICAgICAgICByZXR1cm4gbnVsbDsgXG4gICAgfVxuICAgIGRldCA9IDEuMCAvIGRldDtcblxuICAgIG91dFswXSA9IChhMTEgKiBiMTEgLSBhMTIgKiBiMTAgKyBhMTMgKiBiMDkpICogZGV0O1xuICAgIG91dFsxXSA9IChhMTIgKiBiMDggLSBhMTAgKiBiMTEgLSBhMTMgKiBiMDcpICogZGV0O1xuICAgIG91dFsyXSA9IChhMTAgKiBiMTAgLSBhMTEgKiBiMDggKyBhMTMgKiBiMDYpICogZGV0O1xuXG4gICAgb3V0WzNdID0gKGEwMiAqIGIxMCAtIGEwMSAqIGIxMSAtIGEwMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzRdID0gKGEwMCAqIGIxMSAtIGEwMiAqIGIwOCArIGEwMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzVdID0gKGEwMSAqIGIwOCAtIGEwMCAqIGIxMCAtIGEwMyAqIGIwNikgKiBkZXQ7XG5cbiAgICBvdXRbNl0gPSAoYTMxICogYjA1IC0gYTMyICogYjA0ICsgYTMzICogYjAzKSAqIGRldDtcbiAgICBvdXRbN10gPSAoYTMyICogYjAyIC0gYTMwICogYjA1IC0gYTMzICogYjAxKSAqIGRldDtcbiAgICBvdXRbOF0gPSAoYTMwICogYjA0IC0gYTMxICogYjAyICsgYTMzICogYjAwKSAqIGRldDtcblxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgYSBtYXQzXG4gKlxuICogQHBhcmFtIHttYXQzfSBtYXQgbWF0cml4IHRvIHJlcHJlc2VudCBhcyBhIHN0cmluZ1xuICogQHJldHVybnMge1N0cmluZ30gc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSBtYXRyaXhcbiAqL1xubWF0My5zdHIgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiAnbWF0MygnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnLCAnICsgXG4gICAgICAgICAgICAgICAgICAgIGFbM10gKyAnLCAnICsgYVs0XSArICcsICcgKyBhWzVdICsgJywgJyArIFxuICAgICAgICAgICAgICAgICAgICBhWzZdICsgJywgJyArIGFbN10gKyAnLCAnICsgYVs4XSArICcpJztcbn07XG5cbi8qKlxuICogUmV0dXJucyBGcm9iZW5pdXMgbm9ybSBvZiBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIG1hdHJpeCB0byBjYWxjdWxhdGUgRnJvYmVuaXVzIG5vcm0gb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IEZyb2Jlbml1cyBub3JtXG4gKi9cbm1hdDMuZnJvYiA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuKE1hdGguc3FydChNYXRoLnBvdyhhWzBdLCAyKSArIE1hdGgucG93KGFbMV0sIDIpICsgTWF0aC5wb3coYVsyXSwgMikgKyBNYXRoLnBvdyhhWzNdLCAyKSArIE1hdGgucG93KGFbNF0sIDIpICsgTWF0aC5wb3coYVs1XSwgMikgKyBNYXRoLnBvdyhhWzZdLCAyKSArIE1hdGgucG93KGFbN10sIDIpICsgTWF0aC5wb3coYVs4XSwgMikpKVxufTtcblxuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy5tYXQzID0gbWF0Mztcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIG1hdDQ6IG1hdDQsXG4gIG1hdDM6IG1hdDMsXG4gIHZlYzM6IHZlYzNcbn1cbiIsIm1vZHVsZS5leHBvcnRzID0ge1xuICBoc2wycmdiOiBmdW5jdGlvbihoLCBzLCBsKSB7XG5cbiAgICB2YXIgciwgZywgYiwgbSwgYywgeFxuXG4gICAgaWYgKCFpc0Zpbml0ZShoKSkgaCA9IDBcbiAgICBpZiAoIWlzRmluaXRlKHMpKSBzID0gMFxuICAgIGlmICghaXNGaW5pdGUobCkpIGwgPSAwXG5cbiAgICBoIC89IDYwXG4gICAgaWYgKGggPCAwKSBoID0gNiAtICgtaCAlIDYpXG4gICAgaCAlPSA2XG5cbiAgICBzID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgcyAvIDEwMCkpXG4gICAgbCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIGwgLyAxMDApKVxuXG4gICAgYyA9ICgxIC0gTWF0aC5hYnMoKDIgKiBsKSAtIDEpKSAqIHNcbiAgICB4ID0gYyAqICgxIC0gTWF0aC5hYnMoKGggJSAyKSAtIDEpKVxuXG4gICAgaWYgKGggPCAxKSB7XG4gICAgICAgIHIgPSBjXG4gICAgICAgIGcgPSB4XG4gICAgICAgIGIgPSAwXG4gICAgfSBlbHNlIGlmIChoIDwgMikge1xuICAgICAgICByID0geFxuICAgICAgICBnID0gY1xuICAgICAgICBiID0gMFxuICAgIH0gZWxzZSBpZiAoaCA8IDMpIHtcbiAgICAgICAgciA9IDBcbiAgICAgICAgZyA9IGNcbiAgICAgICAgYiA9IHhcbiAgICB9IGVsc2UgaWYgKGggPCA0KSB7XG4gICAgICAgIHIgPSAwXG4gICAgICAgIGcgPSB4XG4gICAgICAgIGIgPSBjXG4gICAgfSBlbHNlIGlmIChoIDwgNSkge1xuICAgICAgICByID0geFxuICAgICAgICBnID0gMFxuICAgICAgICBiID0gY1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHIgPSBjXG4gICAgICAgIGcgPSAwXG4gICAgICAgIGIgPSB4XG4gICAgfVxuXG4gICAgbSA9IGwgLSBjIC8gMlxuICAgIHIgPSBNYXRoLnJvdW5kKChyICsgbSkgKiAyNTUpXG4gICAgZyA9IE1hdGgucm91bmQoKGcgKyBtKSAqIDI1NSlcbiAgICBiID0gTWF0aC5yb3VuZCgoYiArIG0pICogMjU1KVxuXG4gICAgcmV0dXJuIHsgcjogciwgZzogZywgYjogYiB9XG5cbiAgfVxufVxuIiwidmFyIGdsTWF0cml4ID0gcmVxdWlyZSgnLi9saWIvZ2xNYXRyaXhTdWJzZXQnKSxcbiAgICBDb250ZXh0ICA9IHJlcXVpcmUoJy4vQ29udGV4dCcpLFxuICAgIGNhbnZhcyAgID0gQ29udGV4dC5jYW52YXMsXG4gICAgZ2wgICAgICAgPSBDb250ZXh0LmdsLFxuICAgIFJlbmRlcmVyID0gcmVxdWlyZSgnLi9SZW5kZXJlci5qcycpLFxuICAgIExvYWRlciAgID0gcmVxdWlyZSgnLi9saWIvTG9hZGVyJyksXG4gICAgQ2l0eSAgICAgPSByZXF1aXJlKCcuL2dlbmVyYXRvcnMvQ2l0eS5qcycpLFxuICAgIFN0YXRzICAgID0gcmVxdWlyZSgnc3RhdHMtanMnKSxcbiAgICBtYWluU2NlbmUgPSByZXF1aXJlKCcuL3NjZW5lcy9NYWluU2NlbmUuanMnKTtcblxudmFyIHN0YXRzID0gbmV3IFN0YXRzKCk7XG5zdGF0cy5zZXRNb2RlKDApO1xuXG5zdGF0cy5kb21FbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbnN0YXRzLmRvbUVsZW1lbnQuc3R5bGUucmlnaHQgPSAnMXJlbSc7XG5zdGF0cy5kb21FbGVtZW50LnN0eWxlLnRvcCA9ICcxcmVtJztcblxuY2FudmFzLnBhcmVudE5vZGUuYXBwZW5kQ2hpbGQoc3RhdHMuZG9tRWxlbWVudCk7XG5cbnZhciBsb2FkaW5nU3RhdHVzID0gMDtcbnZhciB0MCA9IE5hTjtcblxuTG9hZGVyLnN1YnNjcmliZSgnQmxvY2tzJywgZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCdMb2FkaW5nIGNvbXBsZXRlJyk7XG4gIGxvYWRpbmdTdGF0dXMgPSAxO1xuICB0MCA9IE5hTjtcbiAgc2NlbmVMb29wKCk7XG59KTtcblxuZnVuY3Rpb24gbG9hZGluZ0xvb3AoKSB7XG4gIGlmKGxvYWRpbmdTdGF0dXMgPT09IDApXG4gICAgcmVxdWVzdEFuaW1hdGlvbkZyYW1lKGxvYWRpbmdMb29wKTtcbiAgTG9hZGVyLnJlbmRlcigpO1xufVxuXG5cbmZ1bmN0aW9uIHNjZW5lTG9vcCh0cykge1xuXG4gIGlmKGlzTmFOKHNjZW5lTG9vcC50MCkpXG4gICAgc2NlbmVMb29wLnQwID0gdHM7XG5cbiAgc3RhdHMuYmVnaW4oKTtcbiAgUmVuZGVyZXIucmVuZGVyKG1haW5TY2VuZSk7XG4gIG1haW5TY2VuZS51cGRhdGUodHMgLSBzY2VuZUxvb3AudDApO1xuICBzdGF0cy5lbmQoKTtcblxuICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUoc2NlbmVMb29wKTtcbn1cbmdsLnZpZXdwb3J0KDAsIDAsIENvbnRleHQudywgQ29udGV4dC5oKTtcblxubG9hZGluZ0xvb3AoKTtcblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGVhcmN1dDtcblxuZnVuY3Rpb24gZWFyY3V0KHBvaW50cywgcmV0dXJuSW5kaWNlcykge1xuXG4gICAgdmFyIG91dGVyTm9kZSA9IGZpbHRlclBvaW50cyhsaW5rZWRMaXN0KHBvaW50c1swXSwgdHJ1ZSkpLFxuICAgICAgICB0cmlhbmdsZXMgPSByZXR1cm5JbmRpY2VzID8ge3ZlcnRpY2VzOiBbXSwgaW5kaWNlczogW119IDogW107XG5cbiAgICBpZiAoIW91dGVyTm9kZSkgcmV0dXJuIHRyaWFuZ2xlcztcblxuICAgIHZhciBub2RlLCBtaW5YLCBtaW5ZLCBtYXhYLCBtYXhZLCB4LCB5LCBzaXplLCBpLFxuICAgICAgICB0aHJlc2hvbGQgPSA4MDtcblxuICAgIGZvciAoaSA9IDA7IHRocmVzaG9sZCA+PSAwICYmIGkgPCBwb2ludHMubGVuZ3RoOyBpKyspIHRocmVzaG9sZCAtPSBwb2ludHNbaV0ubGVuZ3RoO1xuXG4gICAgLy8gaWYgdGhlIHNoYXBlIGlzIG5vdCB0b28gc2ltcGxlLCB3ZSdsbCB1c2Ugei1vcmRlciBjdXJ2ZSBoYXNoIGxhdGVyOyBjYWxjdWxhdGUgcG9seWdvbiBiYm94XG4gICAgaWYgKHRocmVzaG9sZCA8IDApIHtcbiAgICAgICAgbm9kZSA9IG91dGVyTm9kZS5uZXh0O1xuICAgICAgICBtaW5YID0gbWF4WCA9IG5vZGUucFswXTtcbiAgICAgICAgbWluWSA9IG1heFkgPSBub2RlLnBbMV07XG4gICAgICAgIGRvIHtcbiAgICAgICAgICAgIHggPSBub2RlLnBbMF07XG4gICAgICAgICAgICB5ID0gbm9kZS5wWzFdO1xuICAgICAgICAgICAgaWYgKHggPCBtaW5YKSBtaW5YID0geDtcbiAgICAgICAgICAgIGlmICh5IDwgbWluWSkgbWluWSA9IHk7XG4gICAgICAgICAgICBpZiAoeCA+IG1heFgpIG1heFggPSB4O1xuICAgICAgICAgICAgaWYgKHkgPiBtYXhZKSBtYXhZID0geTtcbiAgICAgICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG4gICAgICAgIH0gd2hpbGUgKG5vZGUgIT09IG91dGVyTm9kZSk7XG5cbiAgICAgICAgLy8gbWluWCwgbWluWSBhbmQgc2l6ZSBhcmUgbGF0ZXIgdXNlZCB0byB0cmFuc2Zvcm0gY29vcmRzIGludG8gaW50ZWdlcnMgZm9yIHotb3JkZXIgY2FsY3VsYXRpb25cbiAgICAgICAgc2l6ZSA9IE1hdGgubWF4KG1heFggLSBtaW5YLCBtYXhZIC0gbWluWSk7XG4gICAgfVxuXG4gICAgaWYgKHBvaW50cy5sZW5ndGggPiAxKSBvdXRlck5vZGUgPSBlbGltaW5hdGVIb2xlcyhwb2ludHMsIG91dGVyTm9kZSk7XG5cbiAgICBlYXJjdXRMaW5rZWQob3V0ZXJOb2RlLCB0cmlhbmdsZXMsIG1pblgsIG1pblksIHNpemUpO1xuXG4gICAgcmV0dXJuIHRyaWFuZ2xlcztcbn1cblxuLy8gY3JlYXRlIGEgY2lyY3VsYXIgZG91Ymx5IGxpbmtlZCBsaXN0IGZyb20gcG9seWdvbiBwb2ludHMgaW4gdGhlIHNwZWNpZmllZCB3aW5kaW5nIG9yZGVyXG5mdW5jdGlvbiBsaW5rZWRMaXN0KHBvaW50cywgY2xvY2t3aXNlKSB7XG4gICAgdmFyIHN1bSA9IDAsXG4gICAgICAgIGxlbiA9IHBvaW50cy5sZW5ndGgsXG4gICAgICAgIGksIGosIHAxLCBwMiwgbGFzdDtcblxuICAgIC8vIGNhbGN1bGF0ZSBvcmlnaW5hbCB3aW5kaW5nIG9yZGVyIG9mIGEgcG9seWdvbiByaW5nXG4gICAgZm9yIChpID0gMCwgaiA9IGxlbiAtIDE7IGkgPCBsZW47IGogPSBpKyspIHtcbiAgICAgICAgcDEgPSBwb2ludHNbaV07XG4gICAgICAgIHAyID0gcG9pbnRzW2pdO1xuICAgICAgICBzdW0gKz0gKHAyWzBdIC0gcDFbMF0pICogKHAxWzFdICsgcDJbMV0pO1xuICAgIH1cblxuICAgIC8vIGxpbmsgcG9pbnRzIGludG8gY2lyY3VsYXIgZG91Ymx5LWxpbmtlZCBsaXN0IGluIHRoZSBzcGVjaWZpZWQgd2luZGluZyBvcmRlclxuICAgIGlmIChjbG9ja3dpc2UgPT09IChzdW0gPiAwKSkge1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspIGxhc3QgPSBpbnNlcnROb2RlKHBvaW50c1tpXSwgbGFzdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZm9yIChpID0gbGVuIC0gMTsgaSA+PSAwOyBpLS0pIGxhc3QgPSBpbnNlcnROb2RlKHBvaW50c1tpXSwgbGFzdCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGxhc3Q7XG59XG5cbi8vIGVsaW1pbmF0ZSBjb2xpbmVhciBvciBkdXBsaWNhdGUgcG9pbnRzXG5mdW5jdGlvbiBmaWx0ZXJQb2ludHMoc3RhcnQsIGVuZCkge1xuICAgIGlmICghZW5kKSBlbmQgPSBzdGFydDtcblxuICAgIHZhciBub2RlID0gc3RhcnQsXG4gICAgICAgIGFnYWluO1xuICAgIGRvIHtcbiAgICAgICAgYWdhaW4gPSBmYWxzZTtcblxuICAgICAgICBpZiAoZXF1YWxzKG5vZGUucCwgbm9kZS5uZXh0LnApIHx8IG9yaWVudChub2RlLnByZXYucCwgbm9kZS5wLCBub2RlLm5leHQucCkgPT09IDApIHtcblxuICAgICAgICAgICAgLy8gcmVtb3ZlIG5vZGVcbiAgICAgICAgICAgIG5vZGUucHJldi5uZXh0ID0gbm9kZS5uZXh0O1xuICAgICAgICAgICAgbm9kZS5uZXh0LnByZXYgPSBub2RlLnByZXY7XG5cbiAgICAgICAgICAgIGlmIChub2RlLnByZXZaKSBub2RlLnByZXZaLm5leHRaID0gbm9kZS5uZXh0WjtcbiAgICAgICAgICAgIGlmIChub2RlLm5leHRaKSBub2RlLm5leHRaLnByZXZaID0gbm9kZS5wcmV2WjtcblxuICAgICAgICAgICAgbm9kZSA9IGVuZCA9IG5vZGUucHJldjtcblxuICAgICAgICAgICAgaWYgKG5vZGUgPT09IG5vZGUubmV4dCkgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICBhZ2FpbiA9IHRydWU7XG5cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG4gICAgICAgIH1cbiAgICB9IHdoaWxlIChhZ2FpbiB8fCBub2RlICE9PSBlbmQpO1xuXG4gICAgcmV0dXJuIGVuZDtcbn1cblxuLy8gbWFpbiBlYXIgc2xpY2luZyBsb29wIHdoaWNoIHRyaWFuZ3VsYXRlcyBhIHBvbHlnb24gKGdpdmVuIGFzIGEgbGlua2VkIGxpc3QpXG5mdW5jdGlvbiBlYXJjdXRMaW5rZWQoZWFyLCB0cmlhbmdsZXMsIG1pblgsIG1pblksIHNpemUsIHBhc3MpIHtcbiAgICBpZiAoIWVhcikgcmV0dXJuO1xuXG4gICAgdmFyIGluZGV4ZWQgPSB0cmlhbmdsZXMudmVydGljZXMgIT09IHVuZGVmaW5lZDtcblxuICAgIC8vIGludGVybGluayBwb2x5Z29uIG5vZGVzIGluIHotb3JkZXJcbiAgICBpZiAoIXBhc3MgJiYgbWluWCAhPT0gdW5kZWZpbmVkKSBpbmRleEN1cnZlKGVhciwgbWluWCwgbWluWSwgc2l6ZSk7XG5cbiAgICB2YXIgc3RvcCA9IGVhcixcbiAgICAgICAgcHJldiwgbmV4dDtcblxuICAgIC8vIGl0ZXJhdGUgdGhyb3VnaCBlYXJzLCBzbGljaW5nIHRoZW0gb25lIGJ5IG9uZVxuICAgIHdoaWxlIChlYXIucHJldiAhPT0gZWFyLm5leHQpIHtcbiAgICAgICAgcHJldiA9IGVhci5wcmV2O1xuICAgICAgICBuZXh0ID0gZWFyLm5leHQ7XG5cbiAgICAgICAgaWYgKGlzRWFyKGVhciwgbWluWCwgbWluWSwgc2l6ZSkpIHtcbiAgICAgICAgICAgIC8vIGN1dCBvZmYgdGhlIHRyaWFuZ2xlXG4gICAgICAgICAgICBpZiAoaW5kZXhlZCkge1xuICAgICAgICAgICAgICAgIGFkZEluZGV4ZWRWZXJ0ZXgodHJpYW5nbGVzLCBwcmV2KTtcbiAgICAgICAgICAgICAgICBhZGRJbmRleGVkVmVydGV4KHRyaWFuZ2xlcywgZWFyKTtcbiAgICAgICAgICAgICAgICBhZGRJbmRleGVkVmVydGV4KHRyaWFuZ2xlcywgbmV4dCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyaWFuZ2xlcy5wdXNoKHByZXYucCk7XG4gICAgICAgICAgICAgICAgdHJpYW5nbGVzLnB1c2goZWFyLnApO1xuICAgICAgICAgICAgICAgIHRyaWFuZ2xlcy5wdXNoKG5leHQucCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIHJlbW92ZSBlYXIgbm9kZVxuICAgICAgICAgICAgbmV4dC5wcmV2ID0gcHJldjtcbiAgICAgICAgICAgIHByZXYubmV4dCA9IG5leHQ7XG5cbiAgICAgICAgICAgIGlmIChlYXIucHJldlopIGVhci5wcmV2Wi5uZXh0WiA9IGVhci5uZXh0WjtcbiAgICAgICAgICAgIGlmIChlYXIubmV4dFopIGVhci5uZXh0Wi5wcmV2WiA9IGVhci5wcmV2WjtcblxuICAgICAgICAgICAgLy8gc2tpcHBpbmcgdGhlIG5leHQgdmVydGljZSBsZWFkcyB0byBsZXNzIHNsaXZlciB0cmlhbmdsZXNcbiAgICAgICAgICAgIGVhciA9IG5leHQubmV4dDtcbiAgICAgICAgICAgIHN0b3AgPSBuZXh0Lm5leHQ7XG5cbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG5cbiAgICAgICAgZWFyID0gbmV4dDtcblxuICAgICAgICAvLyBpZiB3ZSBsb29wZWQgdGhyb3VnaCB0aGUgd2hvbGUgcmVtYWluaW5nIHBvbHlnb24gYW5kIGNhbid0IGZpbmQgYW55IG1vcmUgZWFyc1xuICAgICAgICBpZiAoZWFyID09PSBzdG9wKSB7XG4gICAgICAgICAgICAvLyB0cnkgZmlsdGVyaW5nIHBvaW50cyBhbmQgc2xpY2luZyBhZ2FpblxuICAgICAgICAgICAgaWYgKCFwYXNzKSB7XG4gICAgICAgICAgICAgICAgZWFyY3V0TGlua2VkKGZpbHRlclBvaW50cyhlYXIpLCB0cmlhbmdsZXMsIG1pblgsIG1pblksIHNpemUsIDEpO1xuXG4gICAgICAgICAgICAvLyBpZiB0aGlzIGRpZG4ndCB3b3JrLCB0cnkgY3VyaW5nIGFsbCBzbWFsbCBzZWxmLWludGVyc2VjdGlvbnMgbG9jYWxseVxuICAgICAgICAgICAgfSBlbHNlIGlmIChwYXNzID09PSAxKSB7XG4gICAgICAgICAgICAgICAgZWFyID0gY3VyZUxvY2FsSW50ZXJzZWN0aW9ucyhlYXIsIHRyaWFuZ2xlcyk7XG4gICAgICAgICAgICAgICAgZWFyY3V0TGlua2VkKGVhciwgdHJpYW5nbGVzLCBtaW5YLCBtaW5ZLCBzaXplLCAyKTtcblxuICAgICAgICAgICAgLy8gYXMgYSBsYXN0IHJlc29ydCwgdHJ5IHNwbGl0dGluZyB0aGUgcmVtYWluaW5nIHBvbHlnb24gaW50byB0d29cbiAgICAgICAgICAgIH0gZWxzZSBpZiAocGFzcyA9PT0gMikge1xuICAgICAgICAgICAgICAgIHNwbGl0RWFyY3V0KGVhciwgdHJpYW5nbGVzLCBtaW5YLCBtaW5ZLCBzaXplKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG59XG5cbmZ1bmN0aW9uIGFkZEluZGV4ZWRWZXJ0ZXgodHJpYW5nbGVzLCBub2RlKSB7XG4gICAgaWYgKG5vZGUuc291cmNlKSBub2RlID0gbm9kZS5zb3VyY2U7XG5cbiAgICB2YXIgaSA9IG5vZGUuaW5kZXg7XG4gICAgaWYgKGkgPT09IG51bGwpIHtcbiAgICAgICAgdmFyIGRpbSA9IG5vZGUucC5sZW5ndGg7XG4gICAgICAgIHZhciB2ZXJ0aWNlcyA9IHRyaWFuZ2xlcy52ZXJ0aWNlcztcbiAgICAgICAgbm9kZS5pbmRleCA9IGkgPSB2ZXJ0aWNlcy5sZW5ndGggLyBkaW07XG5cbiAgICAgICAgZm9yICh2YXIgZCA9IDA7IGQgPCBkaW07IGQrKykgdmVydGljZXMucHVzaChub2RlLnBbZF0pO1xuICAgIH1cbiAgICB0cmlhbmdsZXMuaW5kaWNlcy5wdXNoKGkpO1xufVxuXG4vLyBjaGVjayB3aGV0aGVyIGEgcG9seWdvbiBub2RlIGZvcm1zIGEgdmFsaWQgZWFyIHdpdGggYWRqYWNlbnQgbm9kZXNcbmZ1bmN0aW9uIGlzRWFyKGVhciwgbWluWCwgbWluWSwgc2l6ZSkge1xuXG4gICAgdmFyIGEgPSBlYXIucHJldi5wLFxuICAgICAgICBiID0gZWFyLnAsXG4gICAgICAgIGMgPSBlYXIubmV4dC5wLFxuXG4gICAgICAgIGF4ID0gYVswXSwgYnggPSBiWzBdLCBjeCA9IGNbMF0sXG4gICAgICAgIGF5ID0gYVsxXSwgYnkgPSBiWzFdLCBjeSA9IGNbMV0sXG5cbiAgICAgICAgYWJkID0gYXggKiBieSAtIGF5ICogYngsXG4gICAgICAgIGFjZCA9IGF4ICogY3kgLSBheSAqIGN4LFxuICAgICAgICBjYmQgPSBjeCAqIGJ5IC0gY3kgKiBieCxcbiAgICAgICAgQSA9IGFiZCAtIGFjZCAtIGNiZDtcblxuICAgIGlmIChBIDw9IDApIHJldHVybiBmYWxzZTsgLy8gcmVmbGV4LCBjYW4ndCBiZSBhbiBlYXJcblxuICAgIC8vIG5vdyBtYWtlIHN1cmUgd2UgZG9uJ3QgaGF2ZSBvdGhlciBwb2ludHMgaW5zaWRlIHRoZSBwb3RlbnRpYWwgZWFyO1xuICAgIC8vIHRoZSBjb2RlIGJlbG93IGlzIGEgYml0IHZlcmJvc2UgYW5kIHJlcGV0aXRpdmUgYnV0IHRoaXMgaXMgZG9uZSBmb3IgcGVyZm9ybWFuY2VcblxuICAgIHZhciBjYXkgPSBjeSAtIGF5LFxuICAgICAgICBhY3ggPSBheCAtIGN4LFxuICAgICAgICBhYnkgPSBheSAtIGJ5LFxuICAgICAgICBiYXggPSBieCAtIGF4LFxuICAgICAgICBwLCBweCwgcHksIHMsIHQsIGssIG5vZGU7XG5cbiAgICAvLyBpZiB3ZSB1c2Ugei1vcmRlciBjdXJ2ZSBoYXNoaW5nLCBpdGVyYXRlIHRocm91Z2ggdGhlIGN1cnZlXG4gICAgaWYgKG1pblggIT09IHVuZGVmaW5lZCkge1xuXG4gICAgICAgIC8vIHRyaWFuZ2xlIGJib3g7IG1pbiAmIG1heCBhcmUgY2FsY3VsYXRlZCBsaWtlIHRoaXMgZm9yIHNwZWVkXG4gICAgICAgIHZhciBtaW5UWCA9IGF4IDwgYnggPyAoYXggPCBjeCA/IGF4IDogY3gpIDogKGJ4IDwgY3ggPyBieCA6IGN4KSxcbiAgICAgICAgICAgIG1pblRZID0gYXkgPCBieSA/IChheSA8IGN5ID8gYXkgOiBjeSkgOiAoYnkgPCBjeSA/IGJ5IDogY3kpLFxuICAgICAgICAgICAgbWF4VFggPSBheCA+IGJ4ID8gKGF4ID4gY3ggPyBheCA6IGN4KSA6IChieCA+IGN4ID8gYnggOiBjeCksXG4gICAgICAgICAgICBtYXhUWSA9IGF5ID4gYnkgPyAoYXkgPiBjeSA/IGF5IDogY3kpIDogKGJ5ID4gY3kgPyBieSA6IGN5KSxcblxuICAgICAgICAgICAgLy8gei1vcmRlciByYW5nZSBmb3IgdGhlIGN1cnJlbnQgdHJpYW5nbGUgYmJveDtcbiAgICAgICAgICAgIG1pblogPSB6T3JkZXIobWluVFgsIG1pblRZLCBtaW5YLCBtaW5ZLCBzaXplKSxcbiAgICAgICAgICAgIG1heFogPSB6T3JkZXIobWF4VFgsIG1heFRZLCBtaW5YLCBtaW5ZLCBzaXplKTtcblxuICAgICAgICAvLyBmaXJzdCBsb29rIGZvciBwb2ludHMgaW5zaWRlIHRoZSB0cmlhbmdsZSBpbiBpbmNyZWFzaW5nIHotb3JkZXJcbiAgICAgICAgbm9kZSA9IGVhci5uZXh0WjtcblxuICAgICAgICB3aGlsZSAobm9kZSAmJiBub2RlLnogPD0gbWF4Wikge1xuICAgICAgICAgICAgcCA9IG5vZGUucDtcbiAgICAgICAgICAgIG5vZGUgPSBub2RlLm5leHRaO1xuICAgICAgICAgICAgaWYgKHAgPT09IGEgfHwgcCA9PT0gYykgY29udGludWU7XG5cbiAgICAgICAgICAgIHB4ID0gcFswXTtcbiAgICAgICAgICAgIHB5ID0gcFsxXTtcblxuICAgICAgICAgICAgcyA9IGNheSAqIHB4ICsgYWN4ICogcHkgLSBhY2Q7XG4gICAgICAgICAgICBpZiAocyA+PSAwKSB7XG4gICAgICAgICAgICAgICAgdCA9IGFieSAqIHB4ICsgYmF4ICogcHkgKyBhYmQ7XG4gICAgICAgICAgICAgICAgaWYgKHQgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICBrID0gQSAtIHMgLSB0O1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGsgPj0gMCkgJiYgKChzICYmIHQpIHx8IChzICYmIGspIHx8ICh0ICYmIGspKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIHRoZW4gbG9vayBmb3IgcG9pbnRzIGluIGRlY3JlYXNpbmcgei1vcmRlclxuICAgICAgICBub2RlID0gZWFyLnByZXZaO1xuXG4gICAgICAgIHdoaWxlIChub2RlICYmIG5vZGUueiA+PSBtaW5aKSB7XG4gICAgICAgICAgICBwID0gbm9kZS5wO1xuICAgICAgICAgICAgbm9kZSA9IG5vZGUucHJldlo7XG4gICAgICAgICAgICBpZiAocCA9PT0gYSB8fCBwID09PSBjKSBjb250aW51ZTtcblxuICAgICAgICAgICAgcHggPSBwWzBdO1xuICAgICAgICAgICAgcHkgPSBwWzFdO1xuXG4gICAgICAgICAgICBzID0gY2F5ICogcHggKyBhY3ggKiBweSAtIGFjZDtcbiAgICAgICAgICAgIGlmIChzID49IDApIHtcbiAgICAgICAgICAgICAgICB0ID0gYWJ5ICogcHggKyBiYXggKiBweSArIGFiZDtcbiAgICAgICAgICAgICAgICBpZiAodCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGsgPSBBIC0gcyAtIHQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoayA+PSAwKSAmJiAoKHMgJiYgdCkgfHwgKHMgJiYgaykgfHwgKHQgJiYgaykpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAvLyBpZiB3ZSBkb24ndCB1c2Ugei1vcmRlciBjdXJ2ZSBoYXNoLCBzaW1wbHkgaXRlcmF0ZSB0aHJvdWdoIGFsbCBvdGhlciBwb2ludHNcbiAgICB9IGVsc2Uge1xuICAgICAgICBub2RlID0gZWFyLm5leHQubmV4dDtcblxuICAgICAgICB3aGlsZSAobm9kZSAhPT0gZWFyLnByZXYpIHtcbiAgICAgICAgICAgIHAgPSBub2RlLnA7XG4gICAgICAgICAgICBub2RlID0gbm9kZS5uZXh0O1xuXG4gICAgICAgICAgICBweCA9IHBbMF07XG4gICAgICAgICAgICBweSA9IHBbMV07XG5cbiAgICAgICAgICAgIHMgPSBjYXkgKiBweCArIGFjeCAqIHB5IC0gYWNkO1xuICAgICAgICAgICAgaWYgKHMgPj0gMCkge1xuICAgICAgICAgICAgICAgIHQgPSBhYnkgKiBweCArIGJheCAqIHB5ICsgYWJkO1xuICAgICAgICAgICAgICAgIGlmICh0ID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgayA9IEEgLSBzIC0gdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKChrID49IDApICYmICgocyAmJiB0KSB8fCAocyAmJiBrKSB8fCAodCAmJiBrKSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gZ28gdGhyb3VnaCBhbGwgcG9seWdvbiBub2RlcyBhbmQgY3VyZSBzbWFsbCBsb2NhbCBzZWxmLWludGVyc2VjdGlvbnNcbmZ1bmN0aW9uIGN1cmVMb2NhbEludGVyc2VjdGlvbnMoc3RhcnQsIHRyaWFuZ2xlcykge1xuICAgIHZhciBpbmRleGVkID0gISF0cmlhbmdsZXMudmVydGljZXM7XG5cbiAgICB2YXIgbm9kZSA9IHN0YXJ0O1xuICAgIGRvIHtcbiAgICAgICAgdmFyIGEgPSBub2RlLnByZXYsXG4gICAgICAgICAgICBiID0gbm9kZS5uZXh0Lm5leHQ7XG5cbiAgICAgICAgLy8gYSBzZWxmLWludGVyc2VjdGlvbiB3aGVyZSBlZGdlICh2W2ktMV0sdltpXSkgaW50ZXJzZWN0cyAodltpKzFdLHZbaSsyXSlcbiAgICAgICAgaWYgKGEucCAhPT0gYi5wICYmIGludGVyc2VjdHMoYS5wLCBub2RlLnAsIG5vZGUubmV4dC5wLCBiLnApICYmIGxvY2FsbHlJbnNpZGUoYSwgYikgJiYgbG9jYWxseUluc2lkZShiLCBhKSkge1xuXG4gICAgICAgICAgICBpZiAoaW5kZXhlZCkge1xuICAgICAgICAgICAgICAgIGFkZEluZGV4ZWRWZXJ0ZXgodHJpYW5nbGVzLCBhKTtcbiAgICAgICAgICAgICAgICBhZGRJbmRleGVkVmVydGV4KHRyaWFuZ2xlcywgbm9kZSk7XG4gICAgICAgICAgICAgICAgYWRkSW5kZXhlZFZlcnRleCh0cmlhbmdsZXMsIGIpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0cmlhbmdsZXMucHVzaChhLnApO1xuICAgICAgICAgICAgICAgIHRyaWFuZ2xlcy5wdXNoKG5vZGUucCk7XG4gICAgICAgICAgICAgICAgdHJpYW5nbGVzLnB1c2goYi5wKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcmVtb3ZlIHR3byBub2RlcyBpbnZvbHZlZFxuICAgICAgICAgICAgYS5uZXh0ID0gYjtcbiAgICAgICAgICAgIGIucHJldiA9IGE7XG5cbiAgICAgICAgICAgIHZhciBheiA9IG5vZGUucHJldlosXG4gICAgICAgICAgICAgICAgYnogPSBub2RlLm5leHRaICYmIG5vZGUubmV4dFoubmV4dFo7XG5cbiAgICAgICAgICAgIGlmIChheikgYXoubmV4dFogPSBiejtcbiAgICAgICAgICAgIGlmIChieikgYnoucHJldlogPSBhejtcblxuICAgICAgICAgICAgbm9kZSA9IHN0YXJ0ID0gYjtcbiAgICAgICAgfVxuICAgICAgICBub2RlID0gbm9kZS5uZXh0O1xuICAgIH0gd2hpbGUgKG5vZGUgIT09IHN0YXJ0KTtcblxuICAgIHJldHVybiBub2RlO1xufVxuXG4vLyB0cnkgc3BsaXR0aW5nIHBvbHlnb24gaW50byB0d28gYW5kIHRyaWFuZ3VsYXRlIHRoZW0gaW5kZXBlbmRlbnRseVxuZnVuY3Rpb24gc3BsaXRFYXJjdXQoc3RhcnQsIHRyaWFuZ2xlcywgbWluWCwgbWluWSwgc2l6ZSkge1xuICAgIC8vIGxvb2sgZm9yIGEgdmFsaWQgZGlhZ29uYWwgdGhhdCBkaXZpZGVzIHRoZSBwb2x5Z29uIGludG8gdHdvXG4gICAgdmFyIGEgPSBzdGFydDtcbiAgICBkbyB7XG4gICAgICAgIHZhciBiID0gYS5uZXh0Lm5leHQ7XG4gICAgICAgIHdoaWxlIChiICE9PSBhLnByZXYpIHtcbiAgICAgICAgICAgIGlmIChhLnAgIT09IGIucCAmJiBpc1ZhbGlkRGlhZ29uYWwoYSwgYikpIHtcbiAgICAgICAgICAgICAgICAvLyBzcGxpdCB0aGUgcG9seWdvbiBpbiB0d28gYnkgdGhlIGRpYWdvbmFsXG4gICAgICAgICAgICAgICAgdmFyIGMgPSBzcGxpdFBvbHlnb24oYSwgYik7XG5cbiAgICAgICAgICAgICAgICAvLyBmaWx0ZXIgY29saW5lYXIgcG9pbnRzIGFyb3VuZCB0aGUgY3V0c1xuICAgICAgICAgICAgICAgIGEgPSBmaWx0ZXJQb2ludHMoYSwgYS5uZXh0KTtcbiAgICAgICAgICAgICAgICBjID0gZmlsdGVyUG9pbnRzKGMsIGMubmV4dCk7XG5cbiAgICAgICAgICAgICAgICAvLyBydW4gZWFyY3V0IG9uIGVhY2ggaGFsZlxuICAgICAgICAgICAgICAgIGVhcmN1dExpbmtlZChhLCB0cmlhbmdsZXMsIG1pblgsIG1pblksIHNpemUpO1xuICAgICAgICAgICAgICAgIGVhcmN1dExpbmtlZChjLCB0cmlhbmdsZXMsIG1pblgsIG1pblksIHNpemUpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGIgPSBiLm5leHQ7XG4gICAgICAgIH1cbiAgICAgICAgYSA9IGEubmV4dDtcbiAgICB9IHdoaWxlIChhICE9PSBzdGFydCk7XG59XG5cbi8vIGxpbmsgZXZlcnkgaG9sZSBpbnRvIHRoZSBvdXRlciBsb29wLCBwcm9kdWNpbmcgYSBzaW5nbGUtcmluZyBwb2x5Z29uIHdpdGhvdXQgaG9sZXNcbmZ1bmN0aW9uIGVsaW1pbmF0ZUhvbGVzKHBvaW50cywgb3V0ZXJOb2RlKSB7XG4gICAgdmFyIGxlbiA9IHBvaW50cy5sZW5ndGg7XG5cbiAgICB2YXIgcXVldWUgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMTsgaSA8IGxlbjsgaSsrKSB7XG4gICAgICAgIHZhciBsaXN0ID0gZmlsdGVyUG9pbnRzKGxpbmtlZExpc3QocG9pbnRzW2ldLCBmYWxzZSkpO1xuICAgICAgICBpZiAobGlzdCkgcXVldWUucHVzaChnZXRMZWZ0bW9zdChsaXN0KSk7XG4gICAgfVxuICAgIHF1ZXVlLnNvcnQoY29tcGFyZVgpO1xuXG4gICAgLy8gcHJvY2VzcyBob2xlcyBmcm9tIGxlZnQgdG8gcmlnaHRcbiAgICBmb3IgKGkgPSAwOyBpIDwgcXVldWUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgZWxpbWluYXRlSG9sZShxdWV1ZVtpXSwgb3V0ZXJOb2RlKTtcbiAgICAgICAgb3V0ZXJOb2RlID0gZmlsdGVyUG9pbnRzKG91dGVyTm9kZSwgb3V0ZXJOb2RlLm5leHQpO1xuICAgIH1cblxuICAgIHJldHVybiBvdXRlck5vZGU7XG59XG5cbi8vIGZpbmQgYSBicmlkZ2UgYmV0d2VlbiB2ZXJ0aWNlcyB0aGF0IGNvbm5lY3RzIGhvbGUgd2l0aCBhbiBvdXRlciByaW5nIGFuZCBhbmQgbGluayBpdFxuZnVuY3Rpb24gZWxpbWluYXRlSG9sZShob2xlTm9kZSwgb3V0ZXJOb2RlKSB7XG4gICAgb3V0ZXJOb2RlID0gZmluZEhvbGVCcmlkZ2UoaG9sZU5vZGUsIG91dGVyTm9kZSk7XG4gICAgaWYgKG91dGVyTm9kZSkge1xuICAgICAgICB2YXIgYiA9IHNwbGl0UG9seWdvbihvdXRlck5vZGUsIGhvbGVOb2RlKTtcbiAgICAgICAgZmlsdGVyUG9pbnRzKGIsIGIubmV4dCk7XG4gICAgfVxufVxuXG4vLyBEYXZpZCBFYmVybHkncyBhbGdvcml0aG0gZm9yIGZpbmRpbmcgYSBicmlkZ2UgYmV0d2VlbiBob2xlIGFuZCBvdXRlciBwb2x5Z29uXG5mdW5jdGlvbiBmaW5kSG9sZUJyaWRnZShob2xlTm9kZSwgb3V0ZXJOb2RlKSB7XG4gICAgdmFyIG5vZGUgPSBvdXRlck5vZGUsXG4gICAgICAgIHAgPSBob2xlTm9kZS5wLFxuICAgICAgICBweCA9IHBbMF0sXG4gICAgICAgIHB5ID0gcFsxXSxcbiAgICAgICAgcU1heCA9IC1JbmZpbml0eSxcbiAgICAgICAgbU5vZGUsIGEsIGI7XG5cbiAgICAvLyBmaW5kIGEgc2VnbWVudCBpbnRlcnNlY3RlZCBieSBhIHJheSBmcm9tIHRoZSBob2xlJ3MgbGVmdG1vc3QgcG9pbnQgdG8gdGhlIGxlZnQ7XG4gICAgLy8gc2VnbWVudCdzIGVuZHBvaW50IHdpdGggbGVzc2VyIHggd2lsbCBiZSBwb3RlbnRpYWwgY29ubmVjdGlvbiBwb2ludFxuICAgIGRvIHtcbiAgICAgICAgYSA9IG5vZGUucDtcbiAgICAgICAgYiA9IG5vZGUubmV4dC5wO1xuXG4gICAgICAgIGlmIChweSA8PSBhWzFdICYmIHB5ID49IGJbMV0pIHtcbiAgICAgICAgICAgIHZhciBxeCA9IGFbMF0gKyAocHkgLSBhWzFdKSAqIChiWzBdIC0gYVswXSkgLyAoYlsxXSAtIGFbMV0pO1xuICAgICAgICAgICAgaWYgKHF4IDw9IHB4ICYmIHF4ID4gcU1heCkge1xuICAgICAgICAgICAgICAgIHFNYXggPSBxeDtcbiAgICAgICAgICAgICAgICBtTm9kZSA9IGFbMF0gPCBiWzBdID8gbm9kZSA6IG5vZGUubmV4dDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICBub2RlID0gbm9kZS5uZXh0O1xuICAgIH0gd2hpbGUgKG5vZGUgIT09IG91dGVyTm9kZSk7XG5cbiAgICBpZiAoIW1Ob2RlKSByZXR1cm4gbnVsbDtcblxuICAgIC8vIGxvb2sgZm9yIHBvaW50cyBzdHJpY3RseSBpbnNpZGUgdGhlIHRyaWFuZ2xlIG9mIGhvbGUgcG9pbnQsIHNlZ21lbnQgaW50ZXJzZWN0aW9uIGFuZCBlbmRwb2ludDtcbiAgICAvLyBpZiB0aGVyZSBhcmUgbm8gcG9pbnRzIGZvdW5kLCB3ZSBoYXZlIGEgdmFsaWQgY29ubmVjdGlvbjtcbiAgICAvLyBvdGhlcndpc2UgY2hvb3NlIHRoZSBwb2ludCBvZiB0aGUgbWluaW11bSBhbmdsZSB3aXRoIHRoZSByYXkgYXMgY29ubmVjdGlvbiBwb2ludFxuXG4gICAgdmFyIGJ4ID0gbU5vZGUucFswXSxcbiAgICAgICAgYnkgPSBtTm9kZS5wWzFdLFxuICAgICAgICBwYmQgPSBweCAqIGJ5IC0gcHkgKiBieCxcbiAgICAgICAgcGNkID0gcHggKiBweSAtIHB5ICogcU1heCxcbiAgICAgICAgY3B5ID0gcHkgLSBweSxcbiAgICAgICAgcGN4ID0gcHggLSBxTWF4LFxuICAgICAgICBwYnkgPSBweSAtIGJ5LFxuICAgICAgICBicHggPSBieCAtIHB4LFxuICAgICAgICBBID0gcGJkIC0gcGNkIC0gKHFNYXggKiBieSAtIHB5ICogYngpLFxuICAgICAgICBzaWduID0gQSA8PSAwID8gLTEgOiAxLFxuICAgICAgICBzdG9wID0gbU5vZGUsXG4gICAgICAgIHRhbk1pbiA9IEluZmluaXR5LFxuICAgICAgICBteCwgbXksIGFteCwgcywgdCwgdGFuO1xuXG4gICAgbm9kZSA9IG1Ob2RlLm5leHQ7XG5cbiAgICB3aGlsZSAobm9kZSAhPT0gc3RvcCkge1xuXG4gICAgICAgIG14ID0gbm9kZS5wWzBdO1xuICAgICAgICBteSA9IG5vZGUucFsxXTtcbiAgICAgICAgYW14ID0gcHggLSBteDtcblxuICAgICAgICBpZiAoYW14ID49IDAgJiYgbXggPj0gYngpIHtcbiAgICAgICAgICAgIHMgPSAoY3B5ICogbXggKyBwY3ggKiBteSAtIHBjZCkgKiBzaWduO1xuICAgICAgICAgICAgaWYgKHMgPj0gMCkge1xuICAgICAgICAgICAgICAgIHQgPSAocGJ5ICogbXggKyBicHggKiBteSArIHBiZCkgKiBzaWduO1xuXG4gICAgICAgICAgICAgICAgaWYgKHQgPj0gMCAmJiBBICogc2lnbiAtIHMgLSB0ID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgdGFuID0gTWF0aC5hYnMocHkgLSBteSkgLyBhbXg7IC8vIHRhbmdlbnRpYWxcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRhbiA8IHRhbk1pbiAmJiBsb2NhbGx5SW5zaWRlKG5vZGUsIGhvbGVOb2RlKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbU5vZGUgPSBub2RlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFuTWluID0gdGFuO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbm9kZSA9IG5vZGUubmV4dDtcbiAgICB9XG5cbiAgICByZXR1cm4gbU5vZGU7XG59XG5cbi8vIGludGVybGluayBwb2x5Z29uIG5vZGVzIGluIHotb3JkZXJcbmZ1bmN0aW9uIGluZGV4Q3VydmUoc3RhcnQsIG1pblgsIG1pblksIHNpemUpIHtcbiAgICB2YXIgbm9kZSA9IHN0YXJ0O1xuXG4gICAgZG8ge1xuICAgICAgICBpZiAobm9kZS56ID09PSBudWxsKSBub2RlLnogPSB6T3JkZXIobm9kZS5wWzBdLCBub2RlLnBbMV0sIG1pblgsIG1pblksIHNpemUpO1xuICAgICAgICBub2RlLnByZXZaID0gbm9kZS5wcmV2O1xuICAgICAgICBub2RlLm5leHRaID0gbm9kZS5uZXh0O1xuICAgICAgICBub2RlID0gbm9kZS5uZXh0O1xuICAgIH0gd2hpbGUgKG5vZGUgIT09IHN0YXJ0KTtcblxuICAgIG5vZGUucHJldloubmV4dFogPSBudWxsO1xuICAgIG5vZGUucHJldlogPSBudWxsO1xuXG4gICAgc29ydExpbmtlZChub2RlKTtcbn1cblxuLy8gU2ltb24gVGF0aGFtJ3MgbGlua2VkIGxpc3QgbWVyZ2Ugc29ydCBhbGdvcml0aG1cbi8vIGh0dHA6Ly93d3cuY2hpYXJrLmdyZWVuZW5kLm9yZy51ay9+c2d0YXRoYW0vYWxnb3JpdGhtcy9saXN0c29ydC5odG1sXG5mdW5jdGlvbiBzb3J0TGlua2VkKGxpc3QpIHtcbiAgICB2YXIgaSwgcCwgcSwgZSwgdGFpbCwgbnVtTWVyZ2VzLCBwU2l6ZSwgcVNpemUsXG4gICAgICAgIGluU2l6ZSA9IDE7XG5cbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICBwID0gbGlzdDtcbiAgICAgICAgbGlzdCA9IG51bGw7XG4gICAgICAgIHRhaWwgPSBudWxsO1xuICAgICAgICBudW1NZXJnZXMgPSAwO1xuXG4gICAgICAgIHdoaWxlIChwKSB7XG4gICAgICAgICAgICBudW1NZXJnZXMrKztcbiAgICAgICAgICAgIHEgPSBwO1xuICAgICAgICAgICAgcFNpemUgPSAwO1xuICAgICAgICAgICAgZm9yIChpID0gMDsgaSA8IGluU2l6ZTsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcFNpemUrKztcbiAgICAgICAgICAgICAgICBxID0gcS5uZXh0WjtcbiAgICAgICAgICAgICAgICBpZiAoIXEpIGJyZWFrO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBxU2l6ZSA9IGluU2l6ZTtcblxuICAgICAgICAgICAgd2hpbGUgKHBTaXplID4gMCB8fCAocVNpemUgPiAwICYmIHEpKSB7XG5cbiAgICAgICAgICAgICAgICBpZiAocFNpemUgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgZSA9IHE7XG4gICAgICAgICAgICAgICAgICAgIHEgPSBxLm5leHRaO1xuICAgICAgICAgICAgICAgICAgICBxU2l6ZS0tO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocVNpemUgPT09IDAgfHwgIXEpIHtcbiAgICAgICAgICAgICAgICAgICAgZSA9IHA7XG4gICAgICAgICAgICAgICAgICAgIHAgPSBwLm5leHRaO1xuICAgICAgICAgICAgICAgICAgICBwU2l6ZS0tO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocC56IDw9IHEueikge1xuICAgICAgICAgICAgICAgICAgICBlID0gcDtcbiAgICAgICAgICAgICAgICAgICAgcCA9IHAubmV4dFo7XG4gICAgICAgICAgICAgICAgICAgIHBTaXplLS07XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZSA9IHE7XG4gICAgICAgICAgICAgICAgICAgIHEgPSBxLm5leHRaO1xuICAgICAgICAgICAgICAgICAgICBxU2l6ZS0tO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICh0YWlsKSB0YWlsLm5leHRaID0gZTtcbiAgICAgICAgICAgICAgICBlbHNlIGxpc3QgPSBlO1xuXG4gICAgICAgICAgICAgICAgZS5wcmV2WiA9IHRhaWw7XG4gICAgICAgICAgICAgICAgdGFpbCA9IGU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHAgPSBxO1xuICAgICAgICB9XG5cbiAgICAgICAgdGFpbC5uZXh0WiA9IG51bGw7XG5cbiAgICAgICAgaWYgKG51bU1lcmdlcyA8PSAxKSByZXR1cm4gbGlzdDtcblxuICAgICAgICBpblNpemUgKj0gMjtcbiAgICB9XG59XG5cbi8vIHotb3JkZXIgb2YgYSBwb2ludCBnaXZlbiBjb29yZHMgYW5kIHNpemUgb2YgdGhlIGRhdGEgYm91bmRpbmcgYm94XG5mdW5jdGlvbiB6T3JkZXIoeCwgeSwgbWluWCwgbWluWSwgc2l6ZSkge1xuICAgIC8vIGNvb3JkcyBhcmUgdHJhbnNmb3JtZWQgaW50byAoMC4uMTAwMCkgaW50ZWdlciByYW5nZVxuICAgIHggPSAxMDAwICogKHggLSBtaW5YKSAvIHNpemU7XG4gICAgeCA9ICh4IHwgKHggPDwgOCkpICYgMHgwMEZGMDBGRjtcbiAgICB4ID0gKHggfCAoeCA8PCA0KSkgJiAweDBGMEYwRjBGO1xuICAgIHggPSAoeCB8ICh4IDw8IDIpKSAmIDB4MzMzMzMzMzM7XG4gICAgeCA9ICh4IHwgKHggPDwgMSkpICYgMHg1NTU1NTU1NTtcblxuICAgIHkgPSAxMDAwICogKHkgLSBtaW5ZKSAvIHNpemU7XG4gICAgeSA9ICh5IHwgKHkgPDwgOCkpICYgMHgwMEZGMDBGRjtcbiAgICB5ID0gKHkgfCAoeSA8PCA0KSkgJiAweDBGMEYwRjBGO1xuICAgIHkgPSAoeSB8ICh5IDw8IDIpKSAmIDB4MzMzMzMzMzM7XG4gICAgeSA9ICh5IHwgKHkgPDwgMSkpICYgMHg1NTU1NTU1NTtcblxuICAgIHJldHVybiB4IHwgKHkgPDwgMSk7XG59XG5cbi8vIGZpbmQgdGhlIGxlZnRtb3N0IG5vZGUgb2YgYSBwb2x5Z29uIHJpbmdcbmZ1bmN0aW9uIGdldExlZnRtb3N0KHN0YXJ0KSB7XG4gICAgdmFyIG5vZGUgPSBzdGFydCxcbiAgICAgICAgbGVmdG1vc3QgPSBzdGFydDtcbiAgICBkbyB7XG4gICAgICAgIGlmIChub2RlLnBbMF0gPCBsZWZ0bW9zdC5wWzBdKSBsZWZ0bW9zdCA9IG5vZGU7XG4gICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG4gICAgfSB3aGlsZSAobm9kZSAhPT0gc3RhcnQpO1xuXG4gICAgcmV0dXJuIGxlZnRtb3N0O1xufVxuXG4vLyBjaGVjayBpZiBhIGRpYWdvbmFsIGJldHdlZW4gdHdvIHBvbHlnb24gbm9kZXMgaXMgdmFsaWQgKGxpZXMgaW4gcG9seWdvbiBpbnRlcmlvcilcbmZ1bmN0aW9uIGlzVmFsaWREaWFnb25hbChhLCBiKSB7XG4gICAgcmV0dXJuICFpbnRlcnNlY3RzUG9seWdvbihhLCBhLnAsIGIucCkgJiZcbiAgICAgICAgICAgbG9jYWxseUluc2lkZShhLCBiKSAmJiBsb2NhbGx5SW5zaWRlKGIsIGEpICYmXG4gICAgICAgICAgIG1pZGRsZUluc2lkZShhLCBhLnAsIGIucCk7XG59XG5cbi8vIHdpbmRpbmcgb3JkZXIgb2YgdHJpYW5nbGUgZm9ybWVkIGJ5IDMgZ2l2ZW4gcG9pbnRzXG5mdW5jdGlvbiBvcmllbnQocCwgcSwgcikge1xuICAgIHZhciBvID0gKHFbMV0gLSBwWzFdKSAqIChyWzBdIC0gcVswXSkgLSAocVswXSAtIHBbMF0pICogKHJbMV0gLSBxWzFdKTtcbiAgICByZXR1cm4gbyA+IDAgPyAxIDpcbiAgICAgICAgICAgbyA8IDAgPyAtMSA6IDA7XG59XG5cbi8vIGNoZWNrIGlmIHR3byBwb2ludHMgYXJlIGVxdWFsXG5mdW5jdGlvbiBlcXVhbHMocDEsIHAyKSB7XG4gICAgcmV0dXJuIHAxWzBdID09PSBwMlswXSAmJiBwMVsxXSA9PT0gcDJbMV07XG59XG5cbi8vIGNoZWNrIGlmIHR3byBzZWdtZW50cyBpbnRlcnNlY3RcbmZ1bmN0aW9uIGludGVyc2VjdHMocDEsIHExLCBwMiwgcTIpIHtcbiAgICByZXR1cm4gb3JpZW50KHAxLCBxMSwgcDIpICE9PSBvcmllbnQocDEsIHExLCBxMikgJiZcbiAgICAgICAgICAgb3JpZW50KHAyLCBxMiwgcDEpICE9PSBvcmllbnQocDIsIHEyLCBxMSk7XG59XG5cbi8vIGNoZWNrIGlmIGEgcG9seWdvbiBkaWFnb25hbCBpbnRlcnNlY3RzIGFueSBwb2x5Z29uIHNlZ21lbnRzXG5mdW5jdGlvbiBpbnRlcnNlY3RzUG9seWdvbihzdGFydCwgYSwgYikge1xuICAgIHZhciBub2RlID0gc3RhcnQ7XG4gICAgZG8ge1xuICAgICAgICB2YXIgcDEgPSBub2RlLnAsXG4gICAgICAgICAgICBwMiA9IG5vZGUubmV4dC5wO1xuXG4gICAgICAgIGlmIChwMSAhPT0gYSAmJiBwMiAhPT0gYSAmJiBwMSAhPT0gYiAmJiBwMiAhPT0gYiAmJiBpbnRlcnNlY3RzKHAxLCBwMiwgYSwgYikpIHJldHVybiB0cnVlO1xuXG4gICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG4gICAgfSB3aGlsZSAobm9kZSAhPT0gc3RhcnQpO1xuXG4gICAgcmV0dXJuIGZhbHNlO1xufVxuXG4vLyBjaGVjayBpZiBhIHBvbHlnb24gZGlhZ29uYWwgaXMgbG9jYWxseSBpbnNpZGUgdGhlIHBvbHlnb25cbmZ1bmN0aW9uIGxvY2FsbHlJbnNpZGUoYSwgYikge1xuICAgIHJldHVybiBvcmllbnQoYS5wcmV2LnAsIGEucCwgYS5uZXh0LnApID09PSAtMSA/XG4gICAgICAgIG9yaWVudChhLnAsIGIucCwgYS5uZXh0LnApICE9PSAtMSAmJiBvcmllbnQoYS5wLCBhLnByZXYucCwgYi5wKSAhPT0gLTEgOlxuICAgICAgICBvcmllbnQoYS5wLCBiLnAsIGEucHJldi5wKSA9PT0gLTEgfHwgb3JpZW50KGEucCwgYS5uZXh0LnAsIGIucCkgPT09IC0xO1xufVxuXG4vLyBjaGVjayBpZiB0aGUgbWlkZGxlIHBvaW50IG9mIGEgcG9seWdvbiBkaWFnb25hbCBpcyBpbnNpZGUgdGhlIHBvbHlnb25cbmZ1bmN0aW9uIG1pZGRsZUluc2lkZShzdGFydCwgYSwgYikge1xuICAgIHZhciBub2RlID0gc3RhcnQsXG4gICAgICAgIGluc2lkZSA9IGZhbHNlLFxuICAgICAgICBweCA9IChhWzBdICsgYlswXSkgLyAyLFxuICAgICAgICBweSA9IChhWzFdICsgYlsxXSkgLyAyO1xuICAgIGRvIHtcbiAgICAgICAgdmFyIHAxID0gbm9kZS5wLFxuICAgICAgICAgICAgcDIgPSBub2RlLm5leHQucDtcblxuICAgICAgICBpZiAoKChwMVsxXSA+IHB5KSAhPT0gKHAyWzFdID4gcHkpKSAmJlxuICAgICAgICAgICAgKHB4IDwgKHAyWzBdIC0gcDFbMF0pICogKHB5IC0gcDFbMV0pIC8gKHAyWzFdIC0gcDFbMV0pICsgcDFbMF0pKSBpbnNpZGUgPSAhaW5zaWRlO1xuXG4gICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG4gICAgfSB3aGlsZSAobm9kZSAhPT0gc3RhcnQpO1xuXG4gICAgcmV0dXJuIGluc2lkZTtcbn1cblxuZnVuY3Rpb24gY29tcGFyZVgoYSwgYikge1xuICAgIHJldHVybiBhLnBbMF0gLSBiLnBbMF07XG59XG5cbi8vIGxpbmsgdHdvIHBvbHlnb24gdmVydGljZXMgd2l0aCBhIGJyaWRnZTsgaWYgdGhlIHZlcnRpY2VzIGJlbG9uZyB0byB0aGUgc2FtZSByaW5nLCBpdCBzcGxpdHMgcG9seWdvbiBpbnRvIHR3bztcbi8vIGlmIG9uZSBiZWxvbmdzIHRvIHRoZSBvdXRlciByaW5nIGFuZCBhbm90aGVyIHRvIGEgaG9sZSwgaXQgbWVyZ2VzIGl0IGludG8gYSBzaW5nbGUgcmluZ1xuZnVuY3Rpb24gc3BsaXRQb2x5Z29uKGEsIGIpIHtcbiAgICB2YXIgYTIgPSBuZXcgTm9kZShhLnApLFxuICAgICAgICBiMiA9IG5ldyBOb2RlKGIucCksXG4gICAgICAgIGFuID0gYS5uZXh0LFxuICAgICAgICBicCA9IGIucHJldjtcblxuICAgIGEyLnNvdXJjZSA9IGE7XG4gICAgYjIuc291cmNlID0gYjtcblxuICAgIGEubmV4dCA9IGI7XG4gICAgYi5wcmV2ID0gYTtcblxuICAgIGEyLm5leHQgPSBhbjtcbiAgICBhbi5wcmV2ID0gYTI7XG5cbiAgICBiMi5uZXh0ID0gYTI7XG4gICAgYTIucHJldiA9IGIyO1xuXG4gICAgYnAubmV4dCA9IGIyO1xuICAgIGIyLnByZXYgPSBicDtcblxuICAgIHJldHVybiBiMjtcbn1cblxuLy8gY3JlYXRlIGEgbm9kZSBhbmQgb3B0aW9uYWxseSBsaW5rIGl0IHdpdGggcHJldmlvdXMgb25lIChpbiBhIGNpcmN1bGFyIGRvdWJseSBsaW5rZWQgbGlzdClcbmZ1bmN0aW9uIGluc2VydE5vZGUocG9pbnQsIGxhc3QpIHtcbiAgICB2YXIgbm9kZSA9IG5ldyBOb2RlKHBvaW50KTtcblxuICAgIGlmICghbGFzdCkge1xuICAgICAgICBub2RlLnByZXYgPSBub2RlO1xuICAgICAgICBub2RlLm5leHQgPSBub2RlO1xuXG4gICAgfSBlbHNlIHtcbiAgICAgICAgbm9kZS5uZXh0ID0gbGFzdC5uZXh0O1xuICAgICAgICBub2RlLnByZXYgPSBsYXN0O1xuICAgICAgICBsYXN0Lm5leHQucHJldiA9IG5vZGU7XG4gICAgICAgIGxhc3QubmV4dCA9IG5vZGU7XG4gICAgfVxuICAgIHJldHVybiBub2RlO1xufVxuXG5mdW5jdGlvbiBOb2RlKHApIHtcbiAgICAvLyB2ZXJ0ZXggY29vcmRpbmF0ZXNcbiAgICB0aGlzLnAgPSBwO1xuXG4gICAgLy8gcHJldmlvdXMgYW5kIG5leHQgdmVydGljZSBub2RlcyBpbiBhIHBvbHlnb24gcmluZ1xuICAgIHRoaXMucHJldiA9IG51bGw7XG4gICAgdGhpcy5uZXh0ID0gbnVsbDtcblxuICAgIC8vIHotb3JkZXIgY3VydmUgdmFsdWVcbiAgICB0aGlzLnogPSBudWxsO1xuXG4gICAgLy8gcHJldmlvdXMgYW5kIG5leHQgbm9kZXMgaW4gei1vcmRlclxuICAgIHRoaXMucHJldlogPSBudWxsO1xuICAgIHRoaXMubmV4dFogPSBudWxsO1xuXG4gICAgLy8gdXNlZCBmb3IgaW5kZXhlZCBvdXRwdXRcbiAgICB0aGlzLnNvdXJjZSA9IG51bGw7XG4gICAgdGhpcy5pbmRleCA9IG51bGw7XG59XG4iLCIoZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIGRlZmluZShmYWN0b3J5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByb290Lk1lcnNlbm5lVHdpc3RlciA9IGZhY3RvcnkoKTtcbiAgICB9XG59KHRoaXMsIGZ1bmN0aW9uICgpIHtcbiAgICAvKipcbiAgICAgKiBBIHN0YW5kYWxvbmUsIHB1cmUgSmF2YVNjcmlwdCBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgTWVyc2VubmUgVHdpc3RlciBwc2V1ZG8gcmFuZG9tIG51bWJlciBnZW5lcmF0b3IuIENvbXBhdGlibGVcbiAgICAgKiB3aXRoIE5vZGUuanMsIHJlcXVpcmVqcyBhbmQgYnJvd3NlciBlbnZpcm9ubWVudHMuIFBhY2thZ2VzIGFyZSBhdmFpbGFibGUgZm9yIG5wbSwgSmFtIGFuZCBCb3dlci5cbiAgICAgKlxuICAgICAqIEBtb2R1bGUgTWVyc2VubmVUd2lzdGVyXG4gICAgICogQGF1dGhvciBSYXBoYWVsIFBpZ3VsbGEgPHBpZ3VsbGFAZm91cjY2LmNvbT5cbiAgICAgKiBAbGljZW5zZSBTZWUgdGhlIGF0dGFjaGVkIExJQ0VOU0UgZmlsZS5cbiAgICAgKiBAdmVyc2lvbiAwLjIuMVxuICAgICAqL1xuXG4gICAgLypcbiAgICAgKiBNb3N0IGNvbW1lbnRzIHdlcmUgc3RyaXBwZWQgZnJvbSB0aGUgc291cmNlLiBJZiBuZWVkZWQgeW91IGNhbiBzdGlsbCBmaW5kIHRoZW0gaW4gdGhlIG9yaWdpbmFsIEMgY29kZTpcbiAgICAgKiBodHRwOi8vd3d3Lm1hdGguc2NpLmhpcm9zaGltYS11LmFjLmpwL35tLW1hdC9NVC9NVDIwMDIvQ09ERVMvbXQxOTkzN2FyLmNcbiAgICAgKlxuICAgICAqIFRoZSBvcmlnaW5hbCBwb3J0IHRvIEphdmFTY3JpcHQsIG9uIHdoaWNoIHRoaXMgZmlsZSBpcyBiYXNlZCwgd2FzIGRvbmUgYnkgU2VhbiBNY0N1bGxvdWdoLiBJdCBjYW4gYmUgZm91bmQgYXQ6XG4gICAgICogaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vYmFua3NlYW4vMzAwNDk0XG4gICAgICovXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIE1BWF9JTlQgPSA0Mjk0OTY3Mjk2LjAsXG4gICAgICAgIE4gPSA2MjQsXG4gICAgICAgIE0gPSAzOTcsXG4gICAgICAgIFVQUEVSX01BU0sgPSAweDgwMDAwMDAwLFxuICAgICAgICBMT1dFUl9NQVNLID0gMHg3ZmZmZmZmZixcbiAgICAgICAgTUFUUklYX0EgPSAweDk5MDhiMGRmO1xuXG4gICAgLyoqXG4gICAgICogSW5zdGFudGlhdGVzIGEgbmV3IE1lcnNlbm5lIFR3aXN0ZXIuXG4gICAgICpcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAYWxpYXMgbW9kdWxlOk1lcnNlbm5lVHdpc3RlclxuICAgICAqIEBzaW5jZSAwLjEuMFxuICAgICAqIEBwYXJhbSB7bnVtYmVyPX0gc2VlZCBUaGUgaW5pdGlhbCBzZWVkIHZhbHVlLlxuICAgICAqL1xuICAgIHZhciBNZXJzZW5uZVR3aXN0ZXIgPSBmdW5jdGlvbiAoc2VlZCkge1xuICAgICAgICBpZiAodHlwZW9mIHNlZWQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBzZWVkID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm10ID0gbmV3IEFycmF5KE4pO1xuICAgICAgICB0aGlzLm10aSA9IE4gKyAxO1xuXG4gICAgICAgIHRoaXMuc2VlZChzZWVkKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogSW5pdGlhbGl6ZXMgdGhlIHN0YXRlIHZlY3RvciBieSB1c2luZyBvbmUgdW5zaWduZWQgMzItYml0IGludGVnZXIgXCJzZWVkXCIsIHdoaWNoIG1heSBiZSB6ZXJvLlxuICAgICAqXG4gICAgICogQHNpbmNlIDAuMS4wXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNlZWQgVGhlIHNlZWQgdmFsdWUuXG4gICAgICovXG4gICAgTWVyc2VubmVUd2lzdGVyLnByb3RvdHlwZS5zZWVkID0gZnVuY3Rpb24gKHNlZWQpIHtcbiAgICAgICAgdmFyIHM7XG5cbiAgICAgICAgdGhpcy5tdFswXSA9IHNlZWQgPj4+IDA7XG5cbiAgICAgICAgZm9yICh0aGlzLm10aSA9IDE7IHRoaXMubXRpIDwgTjsgdGhpcy5tdGkrKykge1xuICAgICAgICAgICAgcyA9IHRoaXMubXRbdGhpcy5tdGkgLSAxXSBeICh0aGlzLm10W3RoaXMubXRpIC0gMV0gPj4+IDMwKTtcbiAgICAgICAgICAgIHRoaXMubXRbdGhpcy5tdGldID1cbiAgICAgICAgICAgICAgICAoKCgoKHMgJiAweGZmZmYwMDAwKSA+Pj4gMTYpICogMTgxMjQzMzI1MykgPDwgMTYpICsgKHMgJiAweDAwMDBmZmZmKSAqIDE4MTI0MzMyNTMpICsgdGhpcy5tdGk7XG4gICAgICAgICAgICB0aGlzLm10W3RoaXMubXRpXSA+Pj49IDA7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogSW5pdGlhbGl6ZXMgdGhlIHN0YXRlIHZlY3RvciBieSB1c2luZyBhbiBhcnJheSBrZXlbXSBvZiB1bnNpZ25lZCAzMi1iaXQgaW50ZWdlcnMgb2YgdGhlIHNwZWNpZmllZCBsZW5ndGguIElmXG4gICAgICogbGVuZ3RoIGlzIHNtYWxsZXIgdGhhbiA2MjQsIHRoZW4gZWFjaCBhcnJheSBvZiAzMi1iaXQgaW50ZWdlcnMgZ2l2ZXMgZGlzdGluY3QgaW5pdGlhbCBzdGF0ZSB2ZWN0b3IuIFRoaXMgaXNcbiAgICAgKiB1c2VmdWwgaWYgeW91IHdhbnQgYSBsYXJnZXIgc2VlZCBzcGFjZSB0aGFuIDMyLWJpdCB3b3JkLlxuICAgICAqXG4gICAgICogQHNpbmNlIDAuMS4wXG4gICAgICogQHBhcmFtIHthcnJheX0gdmVjdG9yIFRoZSBzZWVkIHZlY3Rvci5cbiAgICAgKi9cbiAgICBNZXJzZW5uZVR3aXN0ZXIucHJvdG90eXBlLnNlZWRBcnJheSA9IGZ1bmN0aW9uICh2ZWN0b3IpIHtcbiAgICAgICAgdmFyIGkgPSAxLFxuICAgICAgICAgICAgaiA9IDAsXG4gICAgICAgICAgICBrID0gTiA+IHZlY3Rvci5sZW5ndGggPyBOIDogdmVjdG9yLmxlbmd0aCxcbiAgICAgICAgICAgIHM7XG5cbiAgICAgICAgdGhpcy5zZWVkKDE5NjUwMjE4KTtcblxuICAgICAgICBmb3IgKDsgayA+IDA7IGstLSkge1xuICAgICAgICAgICAgcyA9IHRoaXMubXRbaS0xXSBeICh0aGlzLm10W2ktMV0gPj4+IDMwKTtcblxuICAgICAgICAgICAgdGhpcy5tdFtpXSA9ICh0aGlzLm10W2ldIF4gKCgoKChzICYgMHhmZmZmMDAwMCkgPj4+IDE2KSAqIDE2NjQ1MjUpIDw8IDE2KSArICgocyAmIDB4MDAwMGZmZmYpICogMTY2NDUyNSkpKSArXG4gICAgICAgICAgICAgICAgdmVjdG9yW2pdICsgajtcbiAgICAgICAgICAgIHRoaXMubXRbaV0gPj4+PSAwO1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgaisrO1xuICAgICAgICAgICAgaWYgKGkgPj0gTikge1xuICAgICAgICAgICAgICAgIHRoaXMubXRbMF0gPSB0aGlzLm10W04gLSAxXTtcbiAgICAgICAgICAgICAgICBpID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChqID49IHZlY3Rvci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBqID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoayA9IE4gLSAxOyBrOyBrLS0pIHtcbiAgICAgICAgICAgIHMgPSB0aGlzLm10W2kgLSAxXSBeICh0aGlzLm10W2kgLSAxXSA+Pj4gMzApO1xuICAgICAgICAgICAgdGhpcy5tdFtpXSA9XG4gICAgICAgICAgICAgICAgKHRoaXMubXRbaV0gXiAoKCgoKHMgJiAweGZmZmYwMDAwKSA+Pj4gMTYpICogMTU2NjA4Mzk0MSkgPDwgMTYpICsgKHMgJiAweDAwMDBmZmZmKSAqIDE1NjYwODM5NDEpKSAtIGk7XG4gICAgICAgICAgICB0aGlzLm10W2ldID4+Pj0gMDtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIGlmIChpID49IE4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLm10WzBdID0gdGhpcy5tdFtOIC0gMV07XG4gICAgICAgICAgICAgICAgaSA9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm10WzBdID0gMHg4MDAwMDAwMDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgcmFuZG9tIHVuc2lnbmVkIDMyLWJpdCBpbnRlZ2VyLlxuICAgICAqXG4gICAgICogQHNpbmNlIDAuMS4wXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBNZXJzZW5uZVR3aXN0ZXIucHJvdG90eXBlLmludCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHksXG4gICAgICAgICAgICBrayxcbiAgICAgICAgICAgIG1hZzAxID0gbmV3IEFycmF5KDAsIE1BVFJJWF9BKTtcblxuICAgICAgICBpZiAodGhpcy5tdGkgPj0gTikge1xuICAgICAgICAgICAgaWYgKHRoaXMubXRpID09PSBOICsgMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VlZCg1NDg5KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChrayA9IDA7IGtrIDwgTiAtIE07IGtrKyspIHtcbiAgICAgICAgICAgICAgICB5ID0gKHRoaXMubXRba2tdICYgVVBQRVJfTUFTSykgfCAodGhpcy5tdFtrayArIDFdICYgTE9XRVJfTUFTSyk7XG4gICAgICAgICAgICAgICAgdGhpcy5tdFtra10gPSB0aGlzLm10W2trICsgTV0gXiAoeSA+Pj4gMSkgXiBtYWcwMVt5ICYgMV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoOyBrayA8IE4gLSAxOyBraysrKSB7XG4gICAgICAgICAgICAgICAgeSA9ICh0aGlzLm10W2trXSAmIFVQUEVSX01BU0spIHwgKHRoaXMubXRba2sgKyAxXSAmIExPV0VSX01BU0spO1xuICAgICAgICAgICAgICAgIHRoaXMubXRba2tdID0gdGhpcy5tdFtrayArIChNIC0gTildIF4gKHkgPj4+IDEpIF4gbWFnMDFbeSAmIDFdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB5ID0gKHRoaXMubXRbTiAtIDFdICYgVVBQRVJfTUFTSykgfCAodGhpcy5tdFswXSAmIExPV0VSX01BU0spO1xuICAgICAgICAgICAgdGhpcy5tdFtOIC0gMV0gPSB0aGlzLm10W00gLSAxXSBeICh5ID4+PiAxKSBeIG1hZzAxW3kgJiAxXTtcbiAgICAgICAgICAgIHRoaXMubXRpID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHkgPSB0aGlzLm10W3RoaXMubXRpKytdO1xuXG4gICAgICAgIHkgXj0gKHkgPj4+IDExKTtcbiAgICAgICAgeSBePSAoeSA8PCA3KSAmIDB4OWQyYzU2ODA7XG4gICAgICAgIHkgXj0gKHkgPDwgMTUpICYgMHhlZmM2MDAwMDtcbiAgICAgICAgeSBePSAoeSA+Pj4gMTgpO1xuXG4gICAgICAgIHJldHVybiB5ID4+PiAwO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSByYW5kb20gdW5zaWduZWQgMzEtYml0IGludGVnZXIuXG4gICAgICpcbiAgICAgKiBAc2luY2UgMC4xLjBcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIE1lcnNlbm5lVHdpc3Rlci5wcm90b3R5cGUuaW50MzEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmludCgpID4+PiAxO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSByYW5kb20gcmVhbCBpbiB0aGUgaW50ZXJ2YWwgWzA7MV0gd2l0aCAzMi1iaXQgcmVzb2x1dGlvbi5cbiAgICAgKlxuICAgICAqIEBzaW5jZSAwLjEuMFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgTWVyc2VubmVUd2lzdGVyLnByb3RvdHlwZS5yZWFsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbnQoKSAqICgxLjAgLyAoTUFYX0lOVCAtIDEpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgcmFuZG9tIHJlYWwgaW4gdGhlIGludGVydmFsIF0wOzFbIHdpdGggMzItYml0IHJlc29sdXRpb24uXG4gICAgICpcbiAgICAgKiBAc2luY2UgMC4xLjBcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIE1lcnNlbm5lVHdpc3Rlci5wcm90b3R5cGUucmVhbHggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAodGhpcy5pbnQoKSArIDAuNSkgKiAoMS4wIC8gTUFYX0lOVCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlcyBhIHJhbmRvbSByZWFsIGluIHRoZSBpbnRlcnZhbCBbMDsxWyB3aXRoIDMyLWJpdCByZXNvbHV0aW9uLlxuICAgICAqXG4gICAgICogQHNpbmNlIDAuMS4wXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBNZXJzZW5uZVR3aXN0ZXIucHJvdG90eXBlLnJuZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW50KCkgKiAoMS4wIC8gTUFYX0lOVCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlcyBhIHJhbmRvbSByZWFsIGluIHRoZSBpbnRlcnZhbCBbMDsxWyB3aXRoIDMyLWJpdCByZXNvbHV0aW9uLlxuICAgICAqXG4gICAgICogU2FtZSBhcyAucm5kKCkgbWV0aG9kIC0gZm9yIGNvbnNpc3RlbmN5IHdpdGggTWF0aC5yYW5kb20oKSBpbnRlcmZhY2UuXG4gICAgICpcbiAgICAgKiBAc2luY2UgMC4yLjBcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIE1lcnNlbm5lVHdpc3Rlci5wcm90b3R5cGUucmFuZG9tID0gTWVyc2VubmVUd2lzdGVyLnByb3RvdHlwZS5ybmQ7XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSByYW5kb20gcmVhbCBpbiB0aGUgaW50ZXJ2YWwgWzA7MVsgd2l0aCA1My1iaXQgcmVzb2x1dGlvbi5cbiAgICAgKlxuICAgICAqIEBzaW5jZSAwLjEuMFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgTWVyc2VubmVUd2lzdGVyLnByb3RvdHlwZS5ybmRIaVJlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGEgPSB0aGlzLmludCgpID4+PiA1LFxuICAgICAgICAgICAgYiA9IHRoaXMuaW50KCkgPj4+IDY7XG5cbiAgICAgICAgcmV0dXJuIChhICogNjcxMDg4NjQuMCArIGIpICogKDEuMCAvIDkwMDcxOTkyNTQ3NDA5OTIuMCk7XG4gICAgfTtcblxuICAgIHZhciBpbnN0YW5jZSA9IG5ldyBNZXJzZW5uZVR3aXN0ZXIoKTtcblxuICAgIC8qKlxuICAgICAqIEEgc3RhdGljIHZlcnNpb24gb2YgW3JuZF17QGxpbmsgbW9kdWxlOk1lcnNlbm5lVHdpc3RlciNybmR9IG9uIGEgcmFuZG9tbHkgc2VlZGVkIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBmdW5jdGlvbiByYW5kb21cbiAgICAgKiBAbWVtYmVyb2YgbW9kdWxlOk1lcnNlbm5lVHdpc3RlclxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgTWVyc2VubmVUd2lzdGVyLnJhbmRvbSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGluc3RhbmNlLnJuZCgpO1xuICAgIH07XG5cbiAgICByZXR1cm4gTWVyc2VubmVUd2lzdGVyO1xufSkpO1xuIiwiLy8gc3RhdHMuanMgLSBodHRwOi8vZ2l0aHViLmNvbS9tcmRvb2Ivc3RhdHMuanNcbnZhciBTdGF0cz1mdW5jdGlvbigpe3ZhciBsPURhdGUubm93KCksbT1sLGc9MCxuPUluZmluaXR5LG89MCxoPTAscD1JbmZpbml0eSxxPTAscj0wLHM9MCxmPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7Zi5pZD1cInN0YXRzXCI7Zi5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsZnVuY3Rpb24oYil7Yi5wcmV2ZW50RGVmYXVsdCgpO3QoKytzJTIpfSwhMSk7Zi5zdHlsZS5jc3NUZXh0PVwid2lkdGg6ODBweDtvcGFjaXR5OjAuOTtjdXJzb3I6cG9pbnRlclwiO3ZhciBhPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7YS5pZD1cImZwc1wiO2Euc3R5bGUuY3NzVGV4dD1cInBhZGRpbmc6MCAwIDNweCAzcHg7dGV4dC1hbGlnbjpsZWZ0O2JhY2tncm91bmQtY29sb3I6IzAwMlwiO2YuYXBwZW5kQ2hpbGQoYSk7dmFyIGk9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtpLmlkPVwiZnBzVGV4dFwiO2kuc3R5bGUuY3NzVGV4dD1cImNvbG9yOiMwZmY7Zm9udC1mYW1pbHk6SGVsdmV0aWNhLEFyaWFsLHNhbnMtc2VyaWY7Zm9udC1zaXplOjlweDtmb250LXdlaWdodDpib2xkO2xpbmUtaGVpZ2h0OjE1cHhcIjtcbmkuaW5uZXJIVE1MPVwiRlBTXCI7YS5hcHBlbmRDaGlsZChpKTt2YXIgYz1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO2MuaWQ9XCJmcHNHcmFwaFwiO2Muc3R5bGUuY3NzVGV4dD1cInBvc2l0aW9uOnJlbGF0aXZlO3dpZHRoOjc0cHg7aGVpZ2h0OjMwcHg7YmFja2dyb3VuZC1jb2xvcjojMGZmXCI7Zm9yKGEuYXBwZW5kQ2hpbGQoYyk7NzQ+Yy5jaGlsZHJlbi5sZW5ndGg7KXt2YXIgaj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtqLnN0eWxlLmNzc1RleHQ9XCJ3aWR0aDoxcHg7aGVpZ2h0OjMwcHg7ZmxvYXQ6bGVmdDtiYWNrZ3JvdW5kLWNvbG9yOiMxMTNcIjtjLmFwcGVuZENoaWxkKGopfXZhciBkPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7ZC5pZD1cIm1zXCI7ZC5zdHlsZS5jc3NUZXh0PVwicGFkZGluZzowIDAgM3B4IDNweDt0ZXh0LWFsaWduOmxlZnQ7YmFja2dyb3VuZC1jb2xvcjojMDIwO2Rpc3BsYXk6bm9uZVwiO2YuYXBwZW5kQ2hpbGQoZCk7dmFyIGs9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbmsuaWQ9XCJtc1RleHRcIjtrLnN0eWxlLmNzc1RleHQ9XCJjb2xvcjojMGYwO2ZvbnQtZmFtaWx5OkhlbHZldGljYSxBcmlhbCxzYW5zLXNlcmlmO2ZvbnQtc2l6ZTo5cHg7Zm9udC13ZWlnaHQ6Ym9sZDtsaW5lLWhlaWdodDoxNXB4XCI7ay5pbm5lckhUTUw9XCJNU1wiO2QuYXBwZW5kQ2hpbGQoayk7dmFyIGU9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtlLmlkPVwibXNHcmFwaFwiO2Uuc3R5bGUuY3NzVGV4dD1cInBvc2l0aW9uOnJlbGF0aXZlO3dpZHRoOjc0cHg7aGVpZ2h0OjMwcHg7YmFja2dyb3VuZC1jb2xvcjojMGYwXCI7Zm9yKGQuYXBwZW5kQ2hpbGQoZSk7NzQ+ZS5jaGlsZHJlbi5sZW5ndGg7KWo9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIiksai5zdHlsZS5jc3NUZXh0PVwid2lkdGg6MXB4O2hlaWdodDozMHB4O2Zsb2F0OmxlZnQ7YmFja2dyb3VuZC1jb2xvcjojMTMxXCIsZS5hcHBlbmRDaGlsZChqKTt2YXIgdD1mdW5jdGlvbihiKXtzPWI7c3dpdGNoKHMpe2Nhc2UgMDphLnN0eWxlLmRpc3BsYXk9XG5cImJsb2NrXCI7ZC5zdHlsZS5kaXNwbGF5PVwibm9uZVwiO2JyZWFrO2Nhc2UgMTphLnN0eWxlLmRpc3BsYXk9XCJub25lXCIsZC5zdHlsZS5kaXNwbGF5PVwiYmxvY2tcIn19O3JldHVybntSRVZJU0lPTjoxMixkb21FbGVtZW50OmYsc2V0TW9kZTp0LGJlZ2luOmZ1bmN0aW9uKCl7bD1EYXRlLm5vdygpfSxlbmQ6ZnVuY3Rpb24oKXt2YXIgYj1EYXRlLm5vdygpO2c9Yi1sO249TWF0aC5taW4obixnKTtvPU1hdGgubWF4KG8sZyk7ay50ZXh0Q29udGVudD1nK1wiIE1TIChcIituK1wiLVwiK28rXCIpXCI7dmFyIGE9TWF0aC5taW4oMzAsMzAtMzAqKGcvMjAwKSk7ZS5hcHBlbmRDaGlsZChlLmZpcnN0Q2hpbGQpLnN0eWxlLmhlaWdodD1hK1wicHhcIjtyKys7Yj5tKzFFMyYmKGg9TWF0aC5yb3VuZCgxRTMqci8oYi1tKSkscD1NYXRoLm1pbihwLGgpLHE9TWF0aC5tYXgocSxoKSxpLnRleHRDb250ZW50PWgrXCIgRlBTIChcIitwK1wiLVwiK3ErXCIpXCIsYT1NYXRoLm1pbigzMCwzMC0zMCooaC8xMDApKSxjLmFwcGVuZENoaWxkKGMuZmlyc3RDaGlsZCkuc3R5bGUuaGVpZ2h0PVxuYStcInB4XCIsbT1iLHI9MCk7cmV0dXJuIGJ9LHVwZGF0ZTpmdW5jdGlvbigpe2w9dGhpcy5lbmQoKX19fTtcIm9iamVjdFwiPT09dHlwZW9mIG1vZHVsZSYmKG1vZHVsZS5leHBvcnRzPVN0YXRzKTtcbiIsInZhciBnbE1hdHJpeCA9IHJlcXVpcmUoJy4vLi4vbGliL2dsTWF0cml4U3Vic2V0JyksXG4gICAgQ29udGV4dCAgPSByZXF1aXJlKCcuLy4uL0NvbnRleHQnKSxcbiAgICBNZXNoICAgICA9IHJlcXVpcmUoJy4vLi4vbGliL01lc2gnKSxcbiAgICBHZW9tICAgICA9IHJlcXVpcmUoJy4vLi4vbGliL0dlb20nKSxcbiAgICBRdWFkVHJlZSA9IHJlcXVpcmUoJy4vLi4vbGliL1F1YWRUcmVlJyksXG4gICAgTG9hZGVyICAgPSByZXF1aXJlKCcuLy4uL2xpYi9Mb2FkZXInKSxcbiAgICB2ZWMzICAgICA9IGdsTWF0cml4LnZlYzMsXG4gICAgbWF0NCAgICAgPSBnbE1hdHJpeC5tYXQ0LFxuICAgIGdsICAgICAgID0gQ29udGV4dC5nbCxcbiAgICBCdWlsZGluZ1NIRyA9IHJlcXVpcmUoJy4uL2dlbmVyYXRvcnMvQnVpbGRpbmdTSEcuanMnKSxcbiAgICBDaXR5ID0gcmVxdWlyZSgnLi4vZ2VuZXJhdG9ycy9DaXR5LmpzJyk7XG5cbnZhciBjb21wdXRlQmxvY2tNZXNoID0gZnVuY3Rpb24oYmxvY2ssIGF2YWlsQ29sb3JzKSB7XG4gIHZhciB2ZXJ0aWNlcyA9IFtdLFxuICAgICAgbm9ybWFscyAgPSBbXSxcbiAgICAgIHV2cyAgICAgID0gW10sXG4gICAgICBleHRyYSAgICA9IFtdLFxuICAgICAgbGlnaHRzICAgPSBbXSxcbiAgICAgIGNvdW50ICAgID0gMDtcblxuICBmb3IodmFyIGogPSAwLCBuID0gYmxvY2subG90cy5sZW5ndGg7IGogPCBuOyBqKyspIHtcbiAgICB2YXIgbG90LCBoLCBhbmdsZSwgY3gsIGN5LCB4bSwgeE0sIHltLCB5TTtcbiAgICBsb3QgPSBibG9jay5sb3RzW2pdO1xuICAgIGggPSBsb3QuaGVpZ2h0LCBhbmdsZSA9IGxvdC5hbmdsZSwgbG90ID0gbG90LnBvbHk7XG5cbiAgICBjeCA9IGN5ID0gMDtcbiAgICB4bSA9IHltID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICAgIHhNID0geU0gPSBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFk7XG5cbiAgICBmb3IodmFyIGsgPSAwLCBLID0gbG90Lmxlbmd0aDsgayA8IEs7IGsrKykge1xuICAgICAgdmFyIGN1ciA9IGxvdFtrXTtcbiAgICAgIGN4ICs9IGN1ci54O1xuICAgICAgY3kgKz0gY3VyLnk7XG5cbiAgICAgIHhtID0gTWF0aC5taW4oeG0sIGN1ci54KTtcbiAgICAgIHhNID0gTWF0aC5tYXgoeE0sIGN1ci54KTtcbiAgICAgIHltID0gTWF0aC5taW4oeW0sIGN1ci55KTtcbiAgICAgIHlNID0gTWF0aC5tYXgoeU0sIGN1ci55KTtcblxuICAgIH1cbiAgICBcbiAgICBjeCAvPSBsb3QubGVuZ3RoO1xuICAgIGN5IC89IGxvdC5sZW5ndGg7XG5cbiAgICB2YXIgYmxkZyA9IEJ1aWxkaW5nU0hHLmNyZWF0ZSh7XG4gICAgICB4OiBjeCwgeTogY3ksXG4gICAgICB3aWR0aDogTWF0aC5hYnMoeE0gLSB4bSkgKiAuOSxcbiAgICAgIGRlcHRoOiBNYXRoLmFicyh5TSAtIHltKSAqIC45LFxuICAgICAgYW5nbGU6IGFuZ2xlXG4gICAgfSksIFxuICAgIGJsZGdHZW9tID0gYmxkZy5nZW9tLCBcbiAgICBjb2xvciA9IGJsZGcuY29sb3I7XG5cbiAgICBmb3IodmFyIGwgPSAwLCBMID0gYmxkZ0dlb20ubGVuZ3RoOyBsIDwgTDsgbCsrKSB7XG5cbiAgICAgIHZhciBiZyA9IGJsZGdHZW9tW2xdOyAvLy5zaGlmdCgpO1xuXG4gICAgICBpZihiZy5zeW0gPT09ICdMSUdIVCcpXG4gICAgICAgIGxpZ2h0cy5wdXNoKGJnLmxpZ2h0UG9zKTtcbiAgICAgIGVsc2VcbiAgICAgICAgZm9yKHZhciBrID0gMCwgSyA9IGJnLnZlcnRpY2VzLmxlbmd0aDsgayA8IEs7IGsrKykge1xuICAgICAgICAgIHZlcnRpY2VzLnB1c2goYmcudmVydGljZXNba10pO1xuICAgICAgICAgIG5vcm1hbHMucHVzaChiZy5ub3JtYWxzW2tdKTtcbiAgICAgICAgICB1dnMucHVzaChiZy51dnNba10pO1xuICAgICAgICAgIGV4dHJhLnB1c2goY29sb3JbayAlIDNdKTtcbiAgICAgICAgfVxuXG4gICAgICBibGRnR2VvbVtsXSA9IG51bGw7XG4gICAgfVxuXG4gIH1cblxuICByZXR1cm4ge1xuICAgIG1lc2g6IG5ldyBNZXNoKHZlcnRpY2VzLCBub3JtYWxzLCB1dnMsIGV4dHJhKSxcbiAgICBsaWdodHM6IGxpZ2h0cyxcbiAgICB4OiBibG9jay54LFxuICAgIHk6IGJsb2NrLnksXG4gICAgdzogYmxvY2sud1xuICB9O1xufVxuXG52YXIgY2l0eSA9IG5ldyBDaXR5KDApLFxuICAgIGdlb20gPSB7XG4gICAgICBxdWFkdHJlZTogbnVsbCxcbiAgICAgIHF1YWR0cmVlTGlnaHRzOiBudWxsLFxuICAgICAgZml4ZWRNZXNoZXM6IFtdXG4gICAgfTtcblxudmFyIGxvZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3ByZScpO1xubG9nLnN0eWxlLmJhY2tncm91bmQgPSAnd2hpdGUnO1xubG9nLnN0eWxlLmNvbG9yID0gJ2JsYWNrJztcbmxvZy5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5sb2cuc3R5bGUucmlnaHQgPSAnMXJlbSc7XG5sb2cuc3R5bGUudG9wID0gJzdyZW0nO1xuXG5Db250ZXh0LmNhbnZhcy5wYXJlbnRFbGVtZW50LmFwcGVuZENoaWxkKGxvZyk7XG5cbihmdW5jdGlvbigpIHtcbiAgdmFyIHZlcnRpY2VzID0gW10sXG4gICAgICBub3JtYWxzICA9IFtdLFxuICAgICAgdXZzICAgICAgPSBbXSxcbiAgICAgIGV4dHJhICAgID0gW10sXG4gICAgICBjb3VudCA9IDAsXG4gICAgICBibG9jaywgYmxvY2txLCBsb3QsIGgsIGNvbCxcbiAgICAgIG1JID0gMCxcbiAgICAgIG1lc2hlcyA9IFtdLFxuICAgICAgYmxvY2tzID0gW10sXG4gICAgICBsaWdodHMgPSBbXSxcbiAgICAgIHF0cmVlLCBxdHJlZUw7XG5cbiAgdmFyIGJsb2Nrc1Byb2dyZXNzID0gMCwgYmxvY2tzQ291bnQgPSBjaXR5LmJsb2Nrcy5sZW5ndGg7XG5cbiAgd2hpbGUoY2l0eS5ibG9ja3MubGVuZ3RoKSB7XG4gICAgYmxvY2sgPSBjaXR5LmJsb2Nrcy5zaGlmdCgpO1xuICAgIHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgbSA9IGNvbXB1dGVCbG9ja01lc2godGhpcyk7XG4gICAgICBibG9ja3MucHVzaChtKTtcbiAgICAgIGJsb2Nrc1Byb2dyZXNzKys7XG4gICAgICBMb2FkZXIucHJvZ3Jlc3MoJ0Jsb2NrcycsIGJsb2Nrc1Byb2dyZXNzIC8gYmxvY2tzQ291bnQpO1xuICAgIH0uYmluZChibG9jayksIDApO1xuICB9XG5cbiAgTG9hZGVyLnN1YnNjcmliZSgnQmxvY2tzJywgKGZ1bmN0aW9uKGdlb20sIGJsb2NrcykgeyByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHhtLCB5bSwgeE0sIHlNO1xuICAgIHhtID0geW0gPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgeE0gPSB5TSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcblxuICAgIGJsb2Nrcy5mb3JFYWNoKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHhtID0gTWF0aC5taW4oeG0sIGkueCAtIGkudyk7XG4gICAgICB4TSA9IE1hdGgubWF4KHhNLCBpLnggKyBpLncpO1xuICAgICAgeW0gPSBNYXRoLm1pbih5bSwgaS55IC0gaS53KTtcbiAgICAgIHlNID0gTWF0aC5tYXgoeU0sIGkueSArIGkudyk7XG4gICAgfSk7XG5cbiAgICB2YXIgcXggPSBNYXRoLmFicyh4TSAtIHhtKSAvIDIsXG4gICAgICAgIHF5ID0gTWF0aC5hYnMoeU0gLSB5bSkgLyAyO1xuXG4gICAgcXRyZWUgPSBuZXcgUXVhZFRyZWUocXgsIHF5LCBNYXRoLm1heChxeCwgcXkpLCA0KTtcbiAgICBxdHJlZUwgPSBuZXcgUXVhZFRyZWUocXgsIHF5LCBNYXRoLm1heChxeCwgcXkpLCA4KTtcblxuICAgIGJsb2Nrcy5mb3JFYWNoKGZ1bmN0aW9uKGkpIHtcbiAgICAgIHF0cmVlLmluc2VydChpKTtcbiAgICAgIC8qaS5saWdodHMuZm9yRWFjaChmdW5jdGlvbihpKSB7XG4gICAgICAgIHF0cmVlTC5pbnNlcnQoeyB4OiBpLngsIHk6IGkueiwgbDogaSB9KTtcbiAgICAgIH0pOyovXG4gICAgfSk7XG5cbiAgICBnZW9tLnF1YWR0cmVlID0gcXRyZWU7XG4gICAgZ2VvbS5xdWFkdHJlZUxpZ2h0cyA9IHF0cmVlTDtcblxuICAgIGNvbnNvbGUubG9nKGdlb20ucXVhZHRyZWVMaWdodHMucXVlcnkoNiwgNiwgLjI1KS5sZW5ndGgpO1xuXG4gIH19KGdlb20sIGJsb2NrcykpKTtcblxuICB2ZXJ0aWNlcy5wdXNoLmFwcGx5KHZlcnRpY2VzLCBbXG4gICAgLTIwLCAtMTBlLTQsIC0yMCwgIC0yMCwgLTEwZS00LCAyMCwgIDIwLCAtMTBlLTQsIDIwLFxuICAgIC0yMCwgLTEwZS00LCAtMjAsICAgMjAsIC0xMGUtNCwgMjAsICAyMCwgLTEwZS00LCAtMjBcbiAgXSk7XG5cbiAgbm9ybWFscy5wdXNoLmFwcGx5KG5vcm1hbHMsIFtcbiAgICAwLCAxLCAwLCAgMCwgMSwgMCwgIDAsIDEsIDAsXG4gICAgMCwgMSwgMCwgIDAsIDEsIDAsICAwLCAxLCAwXG4gIF0pO1xuICB1dnMucHVzaC5hcHBseSh1dnMsIFtcbiAgICAwLCAwLCAzLCAgMCwgNDAsIDMsICA0MCwgNDAsIDMsICBcbiAgICAwLCAwLCAzLCAgNDAsIDQwLCAzLCAgNDAsIDAsIDNcbiAgXSk7XG4gIGV4dHJhLnB1c2guYXBwbHkoZXh0cmEsIFtcbiAgICAwLCAwLCAwLCAgMCwgMCwgMCwgIDAsIDAsIDAsXG4gICAgMCwgMCwgMCwgIDAsIDAsIDAsICAwLCAwLCAwXG4gIF0pO1xuXG4gIHZhciByb2FkUXVhZHMgPSBjaXR5LnJvYWRRdWFkcy5yZWR1Y2UoKGZ1bmN0aW9uKCkgeyBcbiAgICB2YXIgTiwgVTtcbiAgICBOID0gW1xuICAgICAgMCwgLTEsIDAsIDAsIC0xLCAwLCAwLCAtMSwgMCxcbiAgICAgIDAsIC0xLCAwLCAwLCAtMSwgMCwgMCwgLTEsIDBcbiAgICBdO1xuICAgIFUgPSBbXG4gICAgICAwLCAwLCAyLCAgMCwgMSwgMiwgIDEsIDEsIDIsICBcbiAgICAgIDAsIDAsIDIsICAxLCAxLCAyLCAgMSwgMCwgMlxuICAgIF07XG4gICAgcmV0dXJuIGZ1bmN0aW9uKG91dCwgaSkge1xuICBcbiAgICAgIHZhciBhYSA9IGlbMF0sIGJiID0gaVsxXSxcbiAgICAgICAgICBzbG9wZSA9IE1hdGguYXRhbjIoYmIueSAtIGFhLnksIGJiLnggLSBhYS54KSArIE1hdGguUEkgLyAyLFxuICAgICAgICAgIGR4ID0gTWF0aC5hYnMoLjA5ICogTWF0aC5jb3Moc2xvcGUpKSwgXG4gICAgICAgICAgZHkgPSBNYXRoLmFicyguMDkgKiBNYXRoLnNpbihzbG9wZSkpLFxuICAgICAgICAgIC8vYiA9IGJiLCBhID0gYWEsXG4gICAgICAgICAgYSA9IHsgeDogYWEueCArIGR5LCB5OiBhYS55ICsgZHggfSxcbiAgICAgICAgICBiID0geyB4OiBiYi54IC0gZHksIHk6IGJiLnkgLSBkeCB9LFxuICAgICAgICAgIGxlbiA9IE1hdGguc3FydCggTWF0aC5wb3coYi55IC0gYS55LCAyKSArIE1hdGgucG93KGIueCAtIGEueCwgMikgKTtcblxuICAgICAgdmFyIHZlcnRpY2VzID0gW1xuICAgICAgICBhLnggLSBkeCwgMCwgYS55IC0gZHksICBiLnggLSBkeCwgMCwgYi55IC0gZHksICBiLnggKyBkeCwgMCwgYi55ICsgZHksXG4gICAgICAgIGEueCAtIGR4LCAwLCBhLnkgLSBkeSwgIGIueCArIGR4LCAwLCBiLnkgKyBkeSwgIGEueCArIGR4LCAwLCBhLnkgKyBkeVxuICAgICAgXSwgdXZzID0gVS5tYXAoZnVuY3Rpb24oaSwgaWR4KSB7XG4gICAgICAgIHN3aXRjaChpZHggJSAzKSB7XG4gICAgICAgICAgY2FzZSAwOiByZXR1cm4gaTsgYnJlYWs7XG4gICAgICAgICAgY2FzZSAxOiByZXR1cm4gaSAqIGxlbjsgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDogcmV0dXJuIGk7XG4gICAgICAgIH1cbiAgICAgICByZXR1cm4gaTtcbiAgICAgIH0pO1xuXG4gICAgICBmb3IodmFyIGsgPSAwLCBLID0gdmVydGljZXMubGVuZ3RoOyBrIDwgSzsgaysrKSB7XG4gICAgICAgIG91dC52ZXJ0aWNlcy5wdXNoKHZlcnRpY2VzW2tdKTtcbiAgICAgICAgb3V0Lm5vcm1hbHMucHVzaChOW2tdKTtcbiAgICAgICAgb3V0LnV2cy5wdXNoKHV2c1trXSk7XG4gICAgICAgIG91dC5leHRyYS5wdXNoKDApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gb3V0O1xuICAgIH1cbiAgfSgpKSwgeyB2ZXJ0aWNlczogW10sIG5vcm1hbHM6IFtdLCB1dnM6IFtdLCBleHRyYTogW10gfSk7XG5cbiAgZm9yKHZhciBrID0gMCwgSyA9IHJvYWRRdWFkcy52ZXJ0aWNlcy5sZW5ndGg7IGsgPCBLOyBrKyspIHtcbiAgICB2ZXJ0aWNlcy5wdXNoKHJvYWRRdWFkcy52ZXJ0aWNlc1trXSk7XG4gICAgbm9ybWFscy5wdXNoKHJvYWRRdWFkcy5ub3JtYWxzW2tdKTtcbiAgICB1dnMucHVzaChyb2FkUXVhZHMudXZzW2tdKTtcbiAgICBleHRyYS5wdXNoKHJvYWRRdWFkcy5leHRyYVtrXSk7XG4gIH1cblxuICBnZW9tLmZpeGVkTWVzaGVzID0gW25ldyBNZXNoKHZlcnRpY2VzLCBub3JtYWxzLCB1dnMsIGV4dHJhKV07XG5cbn0oKSk7XG5cbnZhciBzY2VuZSA9IHtcbiAgbWVzaGVzOiBbXSxcbiAgbGlnaHRzOiBbXSxcbiAgbGlnaHRQb3M6IHZlYzMuY3JlYXRlKCksXG4gIHZpZXc6ICBtYXQ0LmNyZWF0ZSgpLFxuICBtb2RlbDogbWF0NC5jcmVhdGUoKSxcbiAgY291bnQ6IDBcbn07XG5cbmNvbnNvbGUubG9nKGdlb20pXG5cbnZhciB0ID0gMC4sIHB1c2hGbiA9IGZ1bmN0aW9uKG8sIGkpIHsgby5wdXNoKGkpOyByZXR1cm4gbzsgfSxcbiAgICB4ID0gNiwgeSA9IC4wNSwgeiA9IDYsIGFscGhhID0gMCwgYmV0YSA9IDAsXG4gICAgZHggPSAwLCBkeiA9IDA7XG5cbnZhciB0bGVycCA9IGZ1bmN0aW9uKHN0YXJ0LCBlbmQsIHRzKSB7XG4gIHJldHVybiAodHMgLSBzdGFydCkgLyAoZW5kIC0gc3RhcnQpO1xufVxuXG52YXIgbGVycCA9IGZ1bmN0aW9uKGEsIGIsIHQpIHtcbiAgcmV0dXJuIGEgKiAoMSAtIHQpICsgYiAqIHQ7XG59XG5cbnZhciBwb2x5RWFzaW5nID0gZnVuY3Rpb24oeCkgeyByZXR1cm4geCAqIHggKiB4ICogKHggKiAoNiAqIHggLSAxNSkgKyAxMCkgfTtcblxudmFyIGNhbGNQb3NpdGlvbnMgPSBmdW5jdGlvbih0cykge1xuXG4gIGxvZy50ZXh0Q29udGVudCA9IHBhcnNlSW50KHRzKTtcbiAgaWYodHMgPCA1MDAwKSB7XG4gICAgdmFyIHQgPSBwb2x5RWFzaW5nKHRsZXJwKDAsIDUwMDAsIHRzKSk7XG4gICAgeSA9IGxlcnAoMjAsIC4wNSwgdCk7XG4gIH1cblxuICBpZih0cyA+PSA0MDAwICYmIHRzIDwgNTAwMCkge1xuICAgIHZhciB0ID0gcG9seUVhc2luZyh0bGVycCg0MDAwLCA1MDAwLCB0cykpO1xuICAgIGFscGhhID0gbGVycChNYXRoLlBJIC8gMiwgMCwgdCk7XG4gICAgYmV0YSA9IGxlcnAoMCwgTWF0aC5QSSwgdCk7XG4gIH1cblxuICBpZih0cyA+PSA0MDAwICYmIHRzIDwgMjAwMDApIHtcbiAgICB2YXIgdCA9IHBvbHlFYXNpbmcodGxlcnAoNDAwMCwgMjAwMDAsIHRzKSk7XG4gICAgeCA9IGxlcnAoNiwgMTAsIHQpO1xuICB9XG5cbiAgaWYodHMgPj0gNTAwMCAmJiB0cyA8IDE5NTAwKSB7XG4gICAgdmFyIHQgPSBwb2x5RWFzaW5nKHRsZXJwKDUwMDAsIDIwMDAwLCB0cykpO1xuICAgIGJldGEgPSBsZXJwKE1hdGguUEksIE1hdGguUEkgKiAzLzIsIHQpO1xuICB9XG5cbiAgaWYodHMgPj0gMTk1MDAgJiYgdHMgPCAyMDUwMCkge1xuICAgIHZhciB0ID0gcG9seUVhc2luZyh0bGVycCgxOTUwMCwgMjA1MDAsIHRzKSk7XG4gICAgYWxwaGEgPSBsZXJwKDAsIC0gTWF0aC5QSSAvIDIsIHQpO1xuICB9XG5cbiAgaWYodHMgPj0gMjAwMDAgJiYgdHMgPCAyMjUwMCkge1xuICAgIHZhciB0ID0gcG9seUVhc2luZyh0bGVycCgyMDAwMCwgMjI1MDAsIHRzKSk7XG4gICAgYmV0YSA9IGxlcnAoTWF0aC5QSSAqIDMgLyAyLCBNYXRoLlBJLCB0KTtcbiAgICB5ID0gbGVycCguMDUsIDEuMDUsIHQpO1xuICAgIHogPSBsZXJwKDYsIDAsIHQpO1xuICB9XG5cbiAgaWYodHMgPj0gMjA1MDAgJiYgdHMgPCAyMjUwMCkge1xuICAgIHZhciB0ID0gcG9seUVhc2luZyh0bGVycCgyMDUwMCwgMjI1MDAsIHRzKSk7XG4gICAgYWxwaGEgPSBsZXJwKC0gTWF0aC5QSSAvIDIsIDAsIHQpO1xuICB9XG5cbiAgaWYodHMgPj0gMjI1MDAgJiYgdHMgPCAzMDAwMCkge1xuICAgIHZhciB0ID0gcG9seUVhc2luZyh0bGVycCgyMjUwMCwgMzAwMDAsIHRzKSk7XG4gICAgeiA9IGxlcnAoMCwgMTQsIHQpO1xuICB9XG5cbiAgaWYodHMgPj0gMzAwMDApIHtcbiAgICB2YXIgdCA9IHRsZXJwKDMwMDAwLCA0MDAwMCwgdHMpO1xuICAgIHogPSAwO1xuICAgIGFscGhhID0gTWF0aC5QSSAvIDg7XG4gICAgeCA9IGxlcnAoMTIsIDAsIHQpO1xuICB9XG5cbn1cblxuc2NlbmUudXBkYXRlID0gZnVuY3Rpb24odGltZXN0YW1wKSB7XG5cbiAgLy9jYWxjUG9zaXRpb25zKHRpbWVzdGFtcCk7XG4gIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xuICB4ICs9IChNYXRoLmNvcyhiZXRhKSAqIGR4IC0gTWF0aC5zaW4oYmV0YSkgKiBkeikgKiBNYXRoLmNvcyhhbHBoYSk7XG4gIHkgKz0gTWF0aC5zaW4oYWxwaGEpICogZHo7XG4gIHogKz0gKE1hdGguc2luKGJldGEpICogZHggKyBNYXRoLmNvcyhiZXRhKSAqIGR6KSAqIE1hdGguY29zKGFscGhhKTtcblxuICBsb2cudGV4dENvbnRlbnQgPSBbeCx5LHpdLm1hcChmdW5jdGlvbihpKSB7IHJldHVybiBpLnRvRml4ZWQoMikgfSkuam9pbignLCAnKSArICcgJyArXG4gICAgKE1hdGguUEkgLyBhbHBoYSkudG9GaXhlZCgyKSArICcgJyArIFxuICAgIChNYXRoLlBJIC8gYmV0YSkudG9GaXhlZCgyKTtcbiAgLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXG5cbiAgdmVjMy5zZXQoc2NlbmUubGlnaHRQb3MsIDYsLjA1LCA2KTtcbiAgbWF0NC5pZGVudGl0eShzY2VuZS52aWV3KTtcblxuICBtYXQ0LnJvdGF0ZVgoc2NlbmUudmlldywgc2NlbmUudmlldywgYWxwaGEpO1xuICBtYXQ0LnJvdGF0ZVkoc2NlbmUudmlldywgc2NlbmUudmlldywgYmV0YSk7XG4gIG1hdDQudHJhbnNsYXRlKHNjZW5lLnZpZXcsIHNjZW5lLnZpZXcsIFsgLXgsIC15LCAteiBdKTtcblxuICBzY2VuZS5tZXNoZXMgPSBnZW9tLmZpeGVkTWVzaGVzLnJlZHVjZShwdXNoRm4sIFtdKTtcblxuICBzY2VuZS5tZXNoZXMgPSBnZW9tLnF1YWR0cmVlXG4gICAgLnF1ZXJ5KHgsIHosIDQpXG4gICAgLm1hcChmdW5jdGlvbihpKSB7IHJldHVybiBpLm1lc2ggfSlcbiAgICAucmVkdWNlKHB1c2hGbiwgc2NlbmUubWVzaGVzKTtcblxuICBsb2cudGV4dENvbnRlbnQgPSBzY2VuZS5tZXNoZXMubGVuZ3RoO1xuXG4gIHNjZW5lLmxpZ2h0cyA9IGdlb20ucXVhZHRyZWVMaWdodHNcbiAgICAucXVlcnkoeCwgeiwgLjUpXG4gICAgLm1hcChmdW5jdGlvbihpKSB7IFxuICAgICAgcmV0dXJuIFsgaS5sLngsIGkubC55LCBpLmwueiBdO1xuICAgIH0pO1xuXG4gIHQgKz0gLjAwMTtcblxuICAvL2NvbnNvbGUubG9nKHNjZW5lLm1lc2hlcy5yZWR1Y2UoZnVuY3Rpb24obywgaSkgeyBvICs9IGkuY291bnQ7IHJldHVybiBvOyB9LCAwKSk7XG5cbn1cbi8vIDg3IDY1IDgzIDY4O1xuXG5kb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBmdW5jdGlvbihldnQpIHtcblxuICBzd2l0Y2goZXZ0LndoaWNoKSB7XG4gICAgY2FzZSA4NzogZHogPSAtLjAwODsgYnJlYWs7XG4gICAgY2FzZSA4MzogZHogPSAuMDA4OyBicmVhaztcbiAgICBjYXNlIDY1OiBkeCA9IC0uMDA4OyBicmVhaztcbiAgICBjYXNlIDY4OiBkeCA9IC4wMDg7IGJyZWFrO1xuICB9XG5cbn0pO1xuXG5kb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2tleXVwJywgZnVuY3Rpb24oZXZ0KSB7XG5cbiAgc3dpdGNoKGV2dC53aGljaCkge1xuICAgIGNhc2UgODc6IGR6ID0gMDsgYnJlYWs7XG4gICAgY2FzZSA4MzogZHogPSAwOyBicmVhaztcbiAgICBjYXNlIDY1OiBkeCA9IDA7IGJyZWFrO1xuICAgIGNhc2UgNjg6IGR4ID0gMDsgYnJlYWs7XG4gIH1cblxufSk7XG5cbkNvbnRleHQuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlZG93bicsIGZ1bmN0aW9uKGV2dCkge1xuXG4gIHZhciBvbk1vdmUsIG9uVXAsIHgwID0gZXZ0LmNsaWVudFgsIHkwID0gZXZ0LmNsaWVudFk7XG5cbiAgb25Nb3ZlID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgdmFyIGR4ID0gZXZ0LmNsaWVudFggLSB4MCxcbiAgICAgICAgZHkgPSBldnQuY2xpZW50WSAtIHkwO1xuXG4gICAgYWxwaGEgKz0gZHkgKiAuMDA1O1xuICAgIGJldGEgKz0gZHggKiAuMDA1O1xuXG4gICAgeDAgPSBldnQuY2xpZW50WDtcbiAgICB5MCA9IGV2dC5jbGllbnRZO1xuXG4gICAgbG9nLnRleHRDb250ZW50ID0gW3gseSx6XS5tYXAoZnVuY3Rpb24oaSkgeyByZXR1cm4gaS50b0ZpeGVkKDIpIH0pLmpvaW4oJywgJykgKyAnICcgK1xuICAgICAgKE1hdGguUEkgLyBhbHBoYSkudG9GaXhlZCgyKSArICcgJyArIFxuICAgICAgKE1hdGguUEkgLyBiZXRhKS50b0ZpeGVkKDIpO1xuICAgIH1cblxuICBvblVwID0gZnVuY3Rpb24oZXZ0KSB7XG4gICAgQ29udGV4dC5jYW52YXMucmVtb3ZlRXZlbnRMaXN0ZW5lcignbW91c2Vtb3ZlJywgb25Nb3ZlKTtcbiAgICBDb250ZXh0LmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgb25VcCk7XG4gIH1cblxuICBDb250ZXh0LmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBvbk1vdmUpO1xuICBDb250ZXh0LmNhbnZhcy5hZGRFdmVudExpc3RlbmVyKCdtb3VzZXVwJywgb25VcCk7XG5cbn0pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHNjZW5lO1xuIl19
