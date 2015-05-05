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
    glMatrix    = require('gl-matrix'),
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
    extDrawbuffers, extDepthTexture,
    vsrcPass, vsrcLight, fsrcPass, fsrcLight;

vsrcPass  = "uniform mat4 projection, viewmodel;\nuniform mat3 normalM;\n\nattribute vec3 vertex, normal, uv, extra;\n\nvarying vec4 vPosition;\nvarying vec3 texUV, vNormal, vExtra;\n\nvoid main() {\n  \n  vec4 viewPos = viewmodel * vec4(vertex, 1.);\n  gl_Position = projection * viewPos;\n\n  vPosition = viewPos;\n  vNormal = normalize(normalM * normal);\n  vExtra = extra;\n  texUV = uv;\n\n}\n\n";
fsrcPass  = "#extension GL_OES_standard_derivatives : require\n#extension GL_EXT_draw_buffers : require\n\nprecision highp float;\n\nvarying vec4 vPosition;\nvarying vec3 texUV, vNormal, vExtra;\n\n////////////////////////////////////////////////////////////////////////////////\n// https://github.com/ashima/webgl-noise/blob/master/src/noise2D.glsl         //\n////////////////////////////////////////////////////////////////////////////////\n\nvec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }\nvec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }\nvec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }\nfloat snoise(vec2 v) {\n  const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0\n                      0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)\n                     -0.577350269189626,  // -1.0 + 2.0 * C.x\n                      0.024390243902439); // 1.0 / 41.0\n  vec2 i  = floor(v + dot(v, C.yy) );\n  vec2 x0 = v -   i + dot(i, C.xx);\n  vec2 i1;\n  i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);\n  vec4 x12 = x0.xyxy + C.xxzz;\n  x12.xy -= i1;\n  i = mod289(i);\n  vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))\n\t\t+ i.x + vec3(0.0, i1.x, 1.0 ));\n  vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);\n  m = m*m ;\n  m = m*m ;\n  vec3 x = 2.0 * fract(p * C.www) - 1.0;\n  vec3 h = abs(x) - 0.5;\n  vec3 ox = floor(x + 0.5);\n  vec3 a0 = x - ox;\n  m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );\n  vec3 g;\n  g.x  = a0.x  * x0.x  + h.x  * x0.y;\n  g.yz = a0.yz * x12.xz + h.yz * x12.yw;\n  return 130.0 * dot(m, g);\n}\n\n////////////////////////////////////////////////////////////////////////////////\n// Procedural textures\n////////////////////////////////////////////////////////////////////////////////\n\nvec3 bumpMap(vec3 fvert, vec3 fnorm, float bump) {\n\n  vec3 bU = dFdx(bump) * cross(fnorm, normalize(dFdy(fvert))),\n       bV = dFdy(bump) * cross(normalize(dFdx(fvert)), fnorm),\n       bD = fnorm + .5 * (bU + bV);\n\n  return normalize(bD);\n}\n\nstruct TTextureInfo {\n  vec3 color;\n  vec3 normal;\n};\n\n#define textureBrickI(x, p, notp) ((floor(x)*(p))+max(fract(x)-(notp), 0.0))\nTTextureInfo textureBrick(vec3 fvert, vec3 fnorm, float fdepth, vec2 uv, vec3 brickColor) {\n\n  const float bW  = .125,\n              bH  = .0625,\n              mS  = 1. / 128.,\n              mWf = mS * .5 / bW,\n              mHf = mS * .5 / bH;\n  const vec3 mortarColor = vec3(.9, .9, .9);\n\n  float u = uv.s / bW,\n        v = uv.t / bH,\n        brU = floor(u),\n        brV = floor(v);\n\n  if(mod(v * .5, 1.) > .5)\n    u += .5;\n  brU = floor(u);\n\n  float noisev = 1. +\n                 //snoise(uv * 16.) * .0625 +\n                 snoise(uv * 64.) * .125;\n  float brickDamp = 1. + .125 * sin(1.57 * (brU + 1.)) * sin(2. * (brV + 1.));\n\n  vec2 uuv = vec2(u, v),\n       fw = 2. * vec2(fwidth(uuv.x), fwidth(uuv.y)),\n       mortarPct = vec2(mWf, mHf),\n       brickPct = vec2(1., 1.) - mortarPct,\n       ub = (textureBrickI(uuv + fw, brickPct, mortarPct) -\n             textureBrickI(uuv, brickPct, mortarPct)) / fw;\n\n  vec3 color = mix(mortarColor, brickColor * brickDamp, ub.x * ub.y);\n\n  float bump = noisev / fdepth + (ub.x * ub.y) - dFdx(ub.x) * dFdy(ub.y);\n\n  return TTextureInfo(\n    color,\n    bumpMap(fvert, fnorm, bump)\n  );\n}\n\n/******************************************************************************\\\n * Window texture\n\\******************************************************************************/\n\nTTextureInfo textureWindow(vec3 fvert, vec3 fnorm, float fdepth, vec2 uv, vec3 windowColor) {\n\n  const vec2 patternPct   = vec2(1., 1.),\n             patternStart = vec2(0., 0.), //(1. - patternPct) * .25,\n             patternEnd   = patternStart + patternPct,\n             framePct     = vec2(1. / 32., 1. / 32.),\n             frameStart   = patternStart + framePct,\n             frameEnd     = patternEnd   - framePct;\n  //const vec3 windowColor  = vec3(.8, .94, .99),\n  const vec3 frameColor   = vec3(.5, .5, .5);\n\n  vec2 fk   = fwidth(uv) * 2.,\n       uuv  = mod(uv, .5 - 1. / 64.),\n       patF = (smoothstep(frameEnd, frameEnd + fk, uuv) - smoothstep(frameStart, frameStart + fk, uuv));\n  float noisep = 1. + \n                snoise(-uv * .5) * .25;\n  float noisev = 1. + \n                 snoise(uv * 16.) * .0625 +\n                 abs(snoise(uv * 512.)) * .0625;\n\n  return TTextureInfo(\n    mix(frameColor, windowColor * noisep, patF.x * patF.y),\n    bumpMap(fvert, fnorm, patF.x * patF.y)\n  );\n}\n\n/******************************************************************************\\\n * Road texture\n\\******************************************************************************/\n\nvec3 textureRoad(vec2 uuv) {\n  const float padding = 1. / 32.,\n              tapeW   = 1. / 32.,\n              tapeL0  = padding,\n              tapeL1  = padding + tapeW,\n              tapeR1  = 1. - tapeL0,\n              tapeR0  = 1. - tapeL1,\n              tapeC0  = .5 - tapeW * .5,\n              tapeC1  = .5 + tapeW * .5,\n              vertDiv = 4.;\n  const vec3 asphaltColor = vec3(.2, .2, .2),\n             stripColor = vec3(.8, .8, .8);\n\n  vec2 uv = uuv + vec2(0, .5), fk = fwidth(uv);\n  float csSpacing = mod(.25 + uv.t * vertDiv, 1.),\n        q = \n    (\n      smoothstep(tapeL0, tapeL0 + fk.x, uv.s) - \n      smoothstep(tapeL1, tapeL1 + fk.x, uv.s)\n    ) +\n    (\n      smoothstep(tapeR0, tapeR0 + fk.x, uv.s) - \n      smoothstep(tapeR1, tapeR1 + fk.x, uv.s)\n    ) +\n    (\n      smoothstep(tapeC0, tapeC0 + fk.x, uv.s) - \n      smoothstep(tapeC1, tapeC1 + fk.x, uv.s)\n    ) * \n    (\n      smoothstep(.5 - fk.y, .5 + fk.y, csSpacing) *\n      (1. - smoothstep(1. - 2. * fk.y, 1., csSpacing))\n    )\n    ;\n\n  float noiseA = 1. +\n                 abs(snoise(uv * 16.))  * .0625 +\n                 abs(snoise(uv * 32.))  * .0625 +\n                 abs(snoise(uv * 128.)) * .125,\n        noiseS = 1. + \n                 abs(snoise(uv * 128.)) * .125;\n\n  return mix(asphaltColor * noiseA, stripColor * noiseS, q);\n}\n\nvec3 textureAsphalt(vec2 uuv) {\n  const vec3 asphaltColor = vec3(.2, .2, .2);\n\n  vec2 uv = uuv + vec2(0, .5);\n  float noiseA = 1. +\n                 abs(snoise(uv * 16.))  * .0625 +\n                 abs(snoise(uv * 32.))  * .0625 +\n                 abs(snoise(uv * 128.)) * .125;\n  return asphaltColor * 1.5 * noiseA;\n}\n////////////////////////////////////////////////////////////////////////////////\n\nvoid main() {\n\n  TTextureInfo ti; // = textureBrick(vPosition.xyz, vNormal.xyz, vNormal.w, texUV.st, vExtra.xyz);\n  vec3 color, normal;\n\n  float depth = gl_FragCoord.z / gl_FragCoord.w;\n\n  normal = normalize(faceforward(vNormal, gl_FragCoord.xyz, vNormal));\n\n  if(texUV.z > 5.1) {\n    ti = textureBrick(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.xy, 1.), vExtra);\n    color = ti.color;\n    normal = ti.normal;\n  }\n  else if(texUV.z > 4.1) {\n    ti = textureWindow(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.yx, 1.), vec3(1., 1., .7));\n    color = ti.color;\n    normal = ti.normal;\n  }\n  else if(texUV.z > 3.1) {\n    ti = textureWindow(vPosition.xyz, vNormal, gl_FragCoord.z, mod(texUV.yx, 1.), vec3(.3, .3, .3));\n    color = ti.color;\n    normal = ti.normal;\n  }\n  else if(texUV.z > 2.1)\n    color = textureAsphalt(mod(texUV.yx, 1.));\n  else if(texUV.z > 1.1)\n    color = textureRoad(mod(texUV.xy, 1.));\n  else\n    color = textureAsphalt(mod(texUV.yx, 1.)); //textureWindow(uuv, fextra);\n\n  gl_FragData[0] = vPosition;\n  gl_FragData[1] = vec4(normal, depth);\n  gl_FragData[2] = vec4(color, 1.);\n}\n";
vsrcLight = "uniform mat4 viewMatrix;\nuniform vec3 lightPos;\n\nattribute vec2 position;\n//attribute vec3 lightPosition;\nvarying vec2 coord;\n\nvarying vec3 lPos;\n\nvoid main() {\n  gl_Position = vec4(position, 0., 1.);\n  coord = .5 + .5 * position;\n  lPos = vec3(0., 0., 0.); //(viewMatrix * vec4(lightPos, 1.)).xyz;\n  //lPos = (viewMatrix * vec4(lightPos, 1.)).xyz;\n}\n";
fsrcLight = "#extension GL_OES_standard_derivatives : enable\nprecision highp float;\n\n/* #pragma glslify: fxaa = require(glsl-fxaa) */\n\nuniform sampler2D target0, target1, target2, depthBuffer, randMap;\nuniform mat4 viewMatrix;\nuniform vec3 lightPos;\n\nvarying vec2 coord;\nvarying vec3 lPos;\n\n//uniform vec3 lightPos;\n\nfloat sample(vec3 p, vec3 n, vec2 uv) {\n  vec3 dstP = texture2D(target0, uv).xyz,\n       posV = dstP - p;\n\n  float intens = max(dot(normalize(posV), n) - .05, 0.),\n        dist = length(posV),\n        att  = 1. / (2. + (5. * dist));\n  return intens * att;\n}\n\nhighp float rand(vec2 co)\n{\n    highp float a = 12.9898;\n    highp float b = 78.233;\n    highp float c = 43758.5453;\n    highp float dt= dot(co.xy ,vec2(a,b));\n    highp float sn= mod(dt,3.14);\n    return fract(sin(sn) * c);\n}\n\n\n////////////////////////////////////////////////////////////////////////////////\n// Main\n////////////////////////////////////////////////////////////////////////////////\n\n\nvoid main() {\n  /*vec3 lights[4];\n  lights[0] = vec3(6. - .025, .2, 6. - .025);\n  lights[1] = vec3(6. - .025, .2, 6. + .025);\n  lights[2] = vec3(6. + .025, .2, 6. + .025);\n  lights[3] = vec3(6. + .025, .2, 6. - .025);*/\n  /*vec4 t0 = fxaa(target0, coord, res),\n       t1 = fxaa(target1, coord, res),\n       t2 = fxaa(target2, coord, res);*/\n  vec4 t0 = texture2D(target0, coord),\n       t1 = texture2D(target1, coord),\n       t2 = texture2D(target2, coord);\n\n  vec3  vertex = t0.xyz,\n        normal = normalize(t1.xyz),\n        color  = t2.xyz;\n  float depth  = t1.w;\n\n\n\n  vec3 lightDir = lPos - vertex;\n  float lambert = max(dot(faceforward(-normal, lightDir, normal), normalize(lightDir)), 0.),\n        dist = length(lightDir),\n        att = min(1., 1. / (1. + 2.5 * dist + 5. * dist * dist));\n\n  /*float lambert = 0., att = 1.;\n  for(int i = 0; i < 4; i++) {\n    vec3 lightDir = (viewMatrix * vec4(lights[i], 1.)).xyz - vertex;\n    float llambert = max(dot(faceforward(-normal, lightDir, normal), normalize(lightDir)), 0.),\n          dist = length(lightDir),\n          latt = min(1., 1. / (1. + .5 * dist + 5. * dist * dist));\n    lambert += llambert * latt * .25;\n  }*/\n\n  //////////////////////////////////////////////////////////////////////////////\n  // SSAO\n  //////////////////////////////////////////////////////////////////////////////\n  vec2 kernel[4];\n  kernel[0] = vec2(0., 1.);\n  kernel[1] = vec2(1., 0.);\n  kernel[2] = vec2(0., -1.);\n  kernel[3] = vec2(-1., 0.);\n\n  const float sin45 = .707107, sRad = 40.;\n\n  float occlusion = 0., kRad = sRad * (1. - depth);\n\n  for(int i = 0; i < 4; ++i) {\n    vec2 k1 = reflect(kernel[i], .6 * vec2(rand(sin(coord)), rand(-coord)));\n    vec2 k2 = vec2(k1.x * sin45 - k1.y * sin45,\n                   k1.x * sin45 + k1.y * sin45);\n    occlusion += sample(vertex, normal, coord + k1 * kRad);\n    occlusion += sample(vertex, normal, coord + k1 * kRad * .75);\n    occlusion += sample(vertex, normal, coord + k1 * kRad * .5);\n    occlusion += sample(vertex, normal, coord + k1 * kRad * .25);\n  }\n  occlusion /= 16.;\n  occlusion = clamp(occlusion, 0., 1.);\n\n  color = clamp(color - occlusion, 0., 1.);\n  gl_FragColor = vec4(lambert * att * 2. * color, 1.);\n  //gl_FragColor = vec4(color, 1.);\n}\n";
/*vsrcPass  = glslify(__dirname + '/shaders/pass-vertex.glsl', 'utf-8');
fsrcPass  = glslify(__dirname + '/shaders/pass-fragment.glsl', 'utf-8');
vsrcLight = glslify(__dirname + '/shaders/light-vertex.glsl', 'utf-8');
fsrcLight = glslify(__dirname + '/shaders/light-fragment.glsl', 'utf-8');*/

gl.clearColor(0, 0, 0, 0);
gl.depthFunc(gl.LESS);
gl.getExtension('OES_standard_derivatives');
gl.getExtension('OES_texture_float');
gl.getExtension('OES_texture_float_linear');
extDrawbuffers = gl.getExtension('WEBGL_draw_buffers');
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
 * Target 0: | Pos.x  | Pos.y  | Pos.z  | Depth  |
 * Target 1: | Norm.x | Norm.y | Norm.z | ?      |
 * Target 2: | Col.r  | Col.g  | Col.b  | ?      |
 *******************************************************************************/

var target0     = gl.createTexture(),
    target1     = gl.createTexture(),
    target2     = gl.createTexture(),
    depthTex    = gl.createTexture(),
    framebuffer = gl.createFramebuffer(),
    drawbuffers;

gl.bindTexture(gl.TEXTURE_2D, depthTex);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, Context.w, Context.h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);
    
[target0, target1, target2].forEach(function(target) {
  gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, Context.w, Context.h, 0, gl.RGBA, gl.FLOAT, null);
});

gl.bindTexture(gl.TEXTURE_2D, null);

gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);

try {
  drawbuffers = [
    extDrawbuffers.COLOR_ATTACHMENT0_WEBGL,
    extDrawbuffers.COLOR_ATTACHMENT1_WEBGL,
    extDrawbuffers.COLOR_ATTACHMENT2_WEBGL
  ];
  extDrawbuffers.drawBuffersWEBGL(drawbuffers);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, drawbuffers[0], gl.TEXTURE_2D, target0, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, drawbuffers[1], gl.TEXTURE_2D, target1, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, drawbuffers[2], gl.TEXTURE_2D, target2, 0);
} catch(e) {}


gl.bindFramebuffer(gl.FRAMEBUFFER, null);

/*******************************************************************************
 * Setup global matrices and VBOs
 *******************************************************************************/
var quadBuf      = gl.createBuffer(),
    lightBuf     = gl.createBuffer(),
    quadArr      = [],
    projection   = mat4.create();

for(var i = 0; i < 128; i++) {
  quadArr.push(1, -1, -1, -1, -1, 1,  1, -1, -1, 1, 1, 1);
}

// Quad data directly in screen space coordinates
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
//gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(quadArr), gl.STATIC_DRAW);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([1, -1, -1, -1, -1, 1,  1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
gl.bindBuffer(gl.ARRAY_BUFFER, null);

mat4.perspective(projection, Math.PI / 2, Context.aspectRatio, .001, 1000.);

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

['target0', 'target1', 'target2', 'depthBuffer', 'viewMatrix', 'lightPos'].forEach(function(i) {
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

  /*//
  // VBO setup
  //
  gl.bindBuffer(gl.ARRAY_BUFFER, scene.vBuf);
  gl.vertexAttribPointer(programPass.vertex, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, scene.nBuf);
  gl.vertexAttribPointer(programPass.normal, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, scene.uBuf);
  gl.vertexAttribPointer(programPass.uv,     3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, scene.eBuf);
  gl.vertexAttribPointer(programPass.extra,  3, gl.FLOAT, false, 0, 0);*/
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
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, target1);
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, target2);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  //
  // VBO setup
  //
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
  gl.vertexAttribPointer(programLight.position, 2, gl.FLOAT, false, 0, 0);

  gl.uniform1i(programLight.target0, 0);
  gl.uniform1i(programLight.target1, 1);
  gl.uniform1i(programLight.target2, 2);
  gl.uniform1i(programLight.depthBuffer, 3);

  gl.uniformMatrix4fv(programLight.viewMatrix, false, scene.view);

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

},{"./Context":1,"./generators/BuildingSHG.js":5,"./lib/util.js":16,"gl-matrix":19}],3:[function(require,module,exports){
var ShapeGrammar = require('./../lib/ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('./../lib/Geom'),
    PRNG         = require('./PRNG');

module.exports = {
  augment: function(shg) {
    shg.define('Balcony', null, null, null, function() {

      var p = this.points,
          floorFace, floorFace1, border, fence;

      if(Math.abs(this.cos) < 10e-1) {
        floorFace  = { 
          sym: 'BalconyFloor', 
          x0: p.x0, y0: p.y0, z0: p.z0,
          x1: p.x1, y1: p.y1, z1: p.z1,
          x2: p.x2, y2: p.y2, z2: p.z2,
          x3: p.x3, y3: p.y3, z3: p.z3,
          extrudeBorders: this.floorHeight
        },
        floorFace1 = { 
          sym: 'BalconyFloor', 
          x0: p.x0, y0: p.y0 + this.floorHeight, z0: p.z0,
          x1: p.x1, y1: p.y1 + this.floorHeight, z1: p.z1,
          x2: p.x2, y2: p.y2 + this.floorHeight, z2: p.z2,
          x3: p.x3, y3: p.y3 + this.floorHeight, z3: p.z3
        },
        border = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0, z: p.z0 },
          { x: p.x1, y: p.y1, z: p.z1 },
          { x: p.x2, y: p.y2, z: p.z2 },
          { x: p.x3, y: p.y3, z: p.z3 }
        ], this.floorHeight, 'TQuad'),
        fence = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0 + this.floorHeight, z: p.z0 },
          { x: p.x1, y: p.y1 + this.floorHeight, z: p.z1 },
          { x: p.x2, y: p.y2 + this.floorHeight, z: p.z2 },
          { x: p.x3, y: p.y3 + this.floorHeight, z: p.z3 }
        ], this.fenceHeight, 'Fence');
      } else { 
        floorFace  = { 
          sym: 'BalconyFloorRot', 
          x0: p.x0, y0: p.y0, z0: p.z0,
          x1: p.x1, y1: p.y1, z1: p.z1,
          x2: p.x2, y2: p.y2, z2: p.z2,
          x3: p.x3, y3: p.y3, z3: p.z3,
          extrudeBorders: this.floorHeight
        },
        floorFace1 = { 
          sym: 'BalconyFloorRot', 
          x0: p.x0, y0: p.y0 + this.floorHeight, z0: p.z0,
          x1: p.x1, y1: p.y1 + this.floorHeight, z1: p.z1,
          x2: p.x2, y2: p.y2 + this.floorHeight, z2: p.z2,
          x3: p.x3, y3: p.y3 + this.floorHeight, z3: p.z3
        },
        border = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0, z: p.z0 },
          { x: p.x1, y: p.y1, z: p.z1 },
          { x: p.x2, y: p.y2, z: p.z2 },
          { x: p.x3, y: p.y3, z: p.z3 }
        ], this.floorHeight, 'TQuad'),
        fence = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0 + this.floorHeight, z: p.z0 },
          { x: p.x1, y: p.y1 + this.floorHeight, z: p.z1 },
          { x: p.x2, y: p.y2 + this.floorHeight, z: p.z2 },
          { x: p.x3, y: p.y3 + this.floorHeight, z: p.z3 }
        ], this.fenceHeight, 'Fence');
      }

      fence.pop();
      border.push.apply(border, fence)
      border.push(floorFace, floorFace1);
      return border;

    });

    shg.define('BalconyFloor', null, null, null, function() {

      var fl = SHAPE.splitXZ(this, [ .8, .15, .05 ], [ .05, .45, .5 ], 'TQuad'),
          p = fl.splice(4, 1).shift();

      if('extrudeBorders' in this) {
        var borders = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0, z: p.z0 },
          { x: p.x1, y: p.y1, z: p.z1 },
          { x: p.x2, y: p.y2, z: p.z2 },
          { x: p.x3, y: p.y3, z: p.z3 }
        ], this.extrudeBorders, 'TQuad');
        fl.push.apply(fl, borders);
      }

      return fl;

    });

    shg.define('BalconyFloorRot', null, null, null, function() {

      var fl = SHAPE.splitZX(this, [ .05, .45, .5 ], [ .8, .15, .05 ], 'TQuad'),
          p = fl.splice(4, 1).shift();

      if('extrudeBorders' in this) {
        var borders = SHAPE.extrudeAll([
          { x: p.x0, y: p.y0, z: p.z0 },
          { x: p.x1, y: p.y1, z: p.z1 },
          { x: p.x2, y: p.y2, z: p.z2 },
          { x: p.x3, y: p.y3, z: p.z3 }
        ], this.extrudeBorders, 'TQuad');
        fl.push.apply(fl, borders);
      }

      this.sym = 'TQuad';
      return fl;

    });

    shg.define('Fence', null, null, null, function() {
      var stickBase = SHAPE.fit('x', this, 'StickBase', .25),
          dx = this.x3 - this.x0,
          dy = this.y1 - this.y0,
          dz = this.z3 - this.z0,
          angle = Math.atan2(dz, dx) - Math.PI / 2,
          width = Math.sqrt(dx * dx + dz * dz),
          p = { // Handle base
            sym: 'TQuad',
            x0: this.x0, y0: this.y1, z0: this.z0,
            x3: this.x3, y3: this.y1, z3: this.z3,
            y1: this.y1, y2: this.y1,
            x1: this.x0 + Math.cos(angle) * .005,
            x2: this.x3 + Math.cos(angle) * .005,
            z1: this.z0 + Math.sin(angle) * .005,
            z2: this.z3 + Math.sin(angle) * .005
          },
          p1 = {
            sym: 'TQuad',
            x0: this.x0, y0: this.y1 + .005, z0: this.z0,
            x3: this.x3, y3: this.y1 + .005, z3: this.z3,
            y1: this.y1 + .005, y2: this.y1 + .005,
            x1: this.x0 + Math.cos(angle) * .005,
            x2: this.x3 + Math.cos(angle) * .005,
            z1: this.z0 + Math.sin(angle) * .005,
            z2: this.z3 + Math.sin(angle) * .005
          };

      stickBase.push(p);
      stickBase.push(p1);
      stickBase.push.apply(stickBase, SHAPE.extrudeAll([
        { x: p.x0, y: p.y0, z: p.z0 },
        { x: p.x1, y: p.y1, z: p.z1 },
        { x: p.x2, y: p.y2, z: p.z2 },
        { x: p.x3, y: p.y3, z: p.z3 }
      ], .005, 'TQuad'));

      return stickBase;
    });

    shg.define('StickBase', null, null, null, function() {

      var subds = SHAPE.split(this, [ .45, .1, .45 ], [1], null),
          stick = subds[1],
          dx = stick.x3 - stick.x0,
          dy = stick.y1 - stick.y0,
          dz = stick.z3 - stick.z0,
          angle = Math.atan2(dz, dx) - Math.PI / 2,
          width = Math.sqrt(dx * dx + dz * dz),
          height = Math.abs(dy);

      return {
        sym: 'Stick',
        x0: stick.x0, y0: stick.y0, z0: stick.z0,
        x3: stick.x3, y3: stick.y0, z3: stick.z3,

        y1: stick.y0, y2: stick.y0,

        x1: stick.x0 + Math.cos(angle) * width,
        x2: stick.x3 + Math.cos(angle) * width,
        z1: stick.z0 + Math.sin(angle) * width,
        z2: stick.z3 + Math.sin(angle) * width,

        stickHeight: height
      }

    });

    shg.define('Stick', null, null, null, function() {
      
      var p = this;
      return SHAPE.extrudeAll([
        { x: p.x0, y: p.y0, z: p.z0 },
        { x: p.x1, y: p.y1, z: p.z1 },
        { x: p.x2, y: p.y2, z: p.z2 },
        { x: p.x3, y: p.y3, z: p.z3 }
      ], this.stickHeight, 'TQuad');
    });

  
  }
}

},{"../lib/SHAPE.js":14,"./../lib/Geom":10,"./../lib/ShapeGrammar":15,"./PRNG":7,"earcut":18}],4:[function(require,module,exports){
var PRNG = require('./PRNG'),
    Geom = require('./../lib/Geom'),
    ShapeGrammar = require('./../lib/ShapeGrammar');

var lerp = function(a, b, t) { return (1 - t) * a + t * b; }

// Inspired to https://www.cs.purdue.edu/cgvlab/papers/aliaga/eg2012.pdf
var subdivideStrip = function(block, strip, rng) {
  var points = [], quads = [], i1, i2, i3, 
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
    m = ~~(rng.random() * 3 + 2);
    /*if(len < .35)
      m = 1;
    else if(len < .6)
      m = Math.min(m, 2);
    else if(len < .8)
      m = Math.min(m, 3);*/

    quads.push(m);

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
        rng.random() + .5 
      ));
    }
  }

  return lots;
}

var Building = function(poly, height) {
  this.poly = poly;
  this.height = height;

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

},{"./../lib/Geom":10,"./../lib/ShapeGrammar":15,"./PRNG":7}],5:[function(require,module,exports){
var ShapeGrammar = require('./../lib/ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('./../lib/Geom'),
    PRNG         = require('./PRNG'),
    BalconySHG   = require('./BalconySHG.js'),
    StaircaseSHG = require('./StaircaseSHG.js');

var shg = new ShapeGrammar(),
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

    curHeight += fli.height;
    
    ret.push(floor);
  }

  return ret;

});

shg.define('FL_GndFloor', null, function() {
  
  var facades = SHAPE.extrudeAll(this.points, this.height, 'Facade', [0, 1, 0]);

  switch(this.params.tiles) {
    case 'OneDoor':
      for(var i = 1, I = facades.length; i < I; i++)
        facades[i].type = 'Windows';
      facades[0].type = 'OneDoor';
      break;
  }

  return facades;

});

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

  facadesIn.push({
    sym: 'Poly',
    points: extrPoints
  });

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

  //quads[ ~~(quads.length / 2) ].sym = 'Door';
  quads.splice(Math.floor(quads.length / 2), 1);
  
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

  //quads[ Math.round(quads.length / 2) ].sym = 'Door';
  
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
  windowPane.texID = 4;

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

var availColors = [
  [ .88, .88, .88 ],
  [ .66, .66, .66 ],
  [ 1,   .97, .83 ],
  [ .68, .53, .46 ]
];

shg.UVSCALE = .1;

module.exports = {
  shg: shg,
  create: function(lot) {
    //context.rng.seed(10);

    var dx = lot.width / 2, dy = lot.depth / 2,
        x0 = lot.x - dx, x1 = lot.x + dx,
        y0 = lot.y - dy, y1 = lot.y + dy,
        ratio = Math.max(dx / dy, dy / dx);
   var pts = [];

    if(ratio < 1.3 && rng.random() < .3) {
      for(var i = 0; i < 8; i++)
        pts.push({ x : lot.x + dx * Math.cos(-i * Math.PI / 4), y: 0, z: lot.y + dy * Math.sin(-i * Math.PI / 4) }); 
    } else {
      pts.push(
        { x: x0, y: 0, z: y0 },
        { x: x0, y: 0, z: y1 },
        { x: x1, y: 0, z: y1 },
        { x: x1, y: 0, z: y0 }
      );
    }

    var floorLayout = [
      { type: 'FL_GndFloor', height: .1, tiles: 'OneDoor' },
      { type: 'FL_Ledge',    height: .025, width: .0125 }
    ];

    for(var i = 0, I = 4 + ~~(rng.random() * 10); i < I; i++)
      floorLayout.push(
        { type: 'FL_Floor',  height: .1, windows: 'Double' }
      );
    floorLayout.push(
      { type: 'FL_Ledge',    height: .025, width: .003125 },
      { type: 'FL_Floor',    height: .15, windows: 'Single' },
      { type: 'FL_Rooftop',  height: .025, width: .00625 }
    );

    var axiom = {
      sym: 'Building',
      floorsLayout: floorLayout,
      points: pts
    };

    var color = availColors[ ~~(rng.random() * availColors.length) ];

    var ret = shg.run(axiom);
    return { geom: ret, color: color };
  },
  getGeom: function() {
    return context;
  }

}

},{"../lib/SHAPE.js":14,"./../lib/Geom":10,"./../lib/ShapeGrammar":15,"./BalconySHG.js":3,"./PRNG":7,"./StaircaseSHG.js":9,"earcut":18}],6:[function(require,module,exports){
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

},{"../lib/ShapeGrammar.js":15,"./../lib/Geom":10,"./Block.js":4,"./PRNG":7,"./Roads.js":8}],7:[function(require,module,exports){
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

},{"mersennetwister":20}],8:[function(require,module,exports){
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

},{"./PRNG":7}],9:[function(require,module,exports){
var ShapeGrammar = require('./../lib/ShapeGrammar'),
    SHAPE        = require('../lib/SHAPE.js'),
    earcut       = require('earcut'),
    Geom         = require('./../lib/Geom'),
    PRNG         = require('./PRNG');

module.exports = {
  augment: function(shg) {
  
    shg.define('Staircase', null, null, null, function() {
      var stairHeightTot = (this.stairHeight + this.stairSpace),
          stairCount = Math.abs(this.height / stairHeightTot),
          stairPosm  = Math.abs(this.width / stairCount),
          stairs = [];

      for(var i = 0; i <= stairCount; i++) {
        stairs.push({
          sym: 'Stair',
          x: this.x + stairPosm * i,
          y: this.y + stairHeightTot * i,
          z: this.z,
          height: this.stairHeight,
          width: stairPosm,
          depth: this.stairDepth
        });
      }

      stairs.push({
        sym: 'TQuad',
        x0: this.x - stairPosm / 2, y0: this.y, z0: this.z - this.stairDepth / 2,
        x1: this.x - stairPosm / 2 + this.width, y1: this.y + this.height, z1: this.z - this.stairDepth / 2,
        x2: this.x + stairPosm / 2 + this.width, y2: this.y + this.height, z2: this.z - this.stairDepth / 2,
        x3: this.x + stairPosm / 2, y3: this.y, z3: this.z - this.stairDepth / 2
      }, {
        sym: 'TQuad',
        x0: this.x - stairPosm / 2, y0: this.y, z0: this.z + this.stairDepth / 2,
        x1: this.x - stairPosm / 2 + this.width, y1: this.y + this.height, z1: this.z + this.stairDepth / 2,
        x2: this.x + stairPosm / 2 + this.width, y2: this.y + this.height, z2: this.z + this.stairDepth / 2,
        x3: this.x + stairPosm / 2, y3: this.y, z3: this.z + this.stairDepth / 2
      })

      return stairs;
    });

    shg.define('Stair', null, null, null, function() {

      var dx = this.width / 2,
          dy = this.height / 2,
          dz = this.depth / 2;

      var ret = [{
          sym: 'TQuad',
          x0: this.x - dx, y0: this.y - dy, z0: this.z - dz,
          x1: this.x - dx, y1: this.y - dy, z1: this.z + dz,
          x2: this.x + dx, y2: this.y - dy, z2: this.z + dz,
          x3: this.x + dx, y3: this.y - dy, z3: this.z - dz
        }, {
          sym: 'TQuad',
          x0: this.x - dx, y0: this.y + dy, z0: this.z - dz,
          x1: this.x - dx, y1: this.y + dy, z1: this.z + dz,
          x2: this.x + dx, y2: this.y + dy, z2: this.z + dz,
          x3: this.x + dx, y3: this.y + dy, z3: this.z - dz
        },
      ];

      ret.push.apply(ret, SHAPE.extrudeAll([
        { x: ret[0].x0, y: ret[0].y0, z: ret[0].z0 },
        { x: ret[0].x1, y: ret[0].y1, z: ret[0].z1 },
        { x: ret[0].x2, y: ret[0].y2, z: ret[0].z2 },
        { x: ret[0].x3, y: ret[0].y3, z: ret[0].z3 }
      ], this.height, 'TQuad'));

      return ret;
    });

  }
}

},{"../lib/SHAPE.js":14,"./../lib/Geom":10,"./../lib/ShapeGrammar":15,"./PRNG":7,"earcut":18}],10:[function(require,module,exports){
var glMatrix = require('gl-matrix'),
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

},{"gl-matrix":19}],11:[function(require,module,exports){
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

},{"./../Context":1}],12:[function(require,module,exports){
var glMatrix = require('gl-matrix'),
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

},{"./../Context":1,"gl-matrix":19}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
var Geom = require('./Geom'),
    SHAPE = require('./SHAPE.js'),
    glMatrix = require('gl-matrix'),
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

},{"./Geom":10,"./SHAPE.js":14,"earcut":18,"gl-matrix":19}],16:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
var glMatrix = require('gl-matrix'),
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


},{"./Context":1,"./Renderer.js":2,"./generators/City.js":6,"./lib/Loader":11,"./scenes/MainScene.js":22,"gl-matrix":19,"stats-js":21}],18:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
/**
 * @fileoverview gl-matrix - High performance matrix and vector operations
 * @author Brandon Jones
 * @author Colin MacKenzie IV
 * @version 2.2.1
 */

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


(function(_global) {
  "use strict";

  var shim = {};
  if (typeof(exports) === 'undefined') {
    if(typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
      shim.exports = {};
      define(function() {
        return shim.exports;
      });
    } else {
      // gl-matrix lives in a browser, define its namespaces in global
      shim.exports = typeof(window) !== 'undefined' ? window : _global;
    }
  }
  else {
    // gl-matrix lives in commonjs, define its namespaces in exports
    shim.exports = exports;
  }

  (function(exports) {
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


if(!GLMAT_EPSILON) {
    var GLMAT_EPSILON = 0.000001;
}

if(!GLMAT_ARRAY_TYPE) {
    var GLMAT_ARRAY_TYPE = (typeof Float32Array !== 'undefined') ? Float32Array : Array;
}

if(!GLMAT_RANDOM) {
    var GLMAT_RANDOM = Math.random;
}

/**
 * @class Common utilities
 * @name glMatrix
 */
var glMatrix = {};

/**
 * Sets the type of array used when creating new vectors and matricies
 *
 * @param {Type} type Array type, such as Float32Array or Array
 */
glMatrix.setMatrixArrayType = function(type) {
    GLMAT_ARRAY_TYPE = type;
}

if(typeof(exports) !== 'undefined') {
    exports.glMatrix = glMatrix;
}

var degree = Math.PI / 180;

/**
* Convert Degree To Radian
*
* @param {Number} Angle in Degrees
*/
glMatrix.toRadian = function(a){
     return a * degree;
}
;
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
 * @class 2 Dimensional Vector
 * @name vec2
 */

var vec2 = {};

/**
 * Creates a new, empty vec2
 *
 * @returns {vec2} a new 2D vector
 */
vec2.create = function() {
    var out = new GLMAT_ARRAY_TYPE(2);
    out[0] = 0;
    out[1] = 0;
    return out;
};

/**
 * Creates a new vec2 initialized with values from an existing vector
 *
 * @param {vec2} a vector to clone
 * @returns {vec2} a new 2D vector
 */
vec2.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(2);
    out[0] = a[0];
    out[1] = a[1];
    return out;
};

/**
 * Creates a new vec2 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} a new 2D vector
 */
vec2.fromValues = function(x, y) {
    var out = new GLMAT_ARRAY_TYPE(2);
    out[0] = x;
    out[1] = y;
    return out;
};

/**
 * Copy the values from one vec2 to another
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the source vector
 * @returns {vec2} out
 */
vec2.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    return out;
};

/**
 * Set the components of a vec2 to the given values
 *
 * @param {vec2} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @returns {vec2} out
 */
vec2.set = function(out, x, y) {
    out[0] = x;
    out[1] = y;
    return out;
};

/**
 * Adds two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.add = function(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    return out;
};

/**
 * Subtracts vector b from vector a
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.subtract = function(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    return out;
};

/**
 * Alias for {@link vec2.subtract}
 * @function
 */
vec2.sub = vec2.subtract;

/**
 * Multiplies two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.multiply = function(out, a, b) {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    return out;
};

/**
 * Alias for {@link vec2.multiply}
 * @function
 */
vec2.mul = vec2.multiply;

/**
 * Divides two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.divide = function(out, a, b) {
    out[0] = a[0] / b[0];
    out[1] = a[1] / b[1];
    return out;
};

/**
 * Alias for {@link vec2.divide}
 * @function
 */
vec2.div = vec2.divide;

/**
 * Returns the minimum of two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.min = function(out, a, b) {
    out[0] = Math.min(a[0], b[0]);
    out[1] = Math.min(a[1], b[1]);
    return out;
};

/**
 * Returns the maximum of two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec2} out
 */
vec2.max = function(out, a, b) {
    out[0] = Math.max(a[0], b[0]);
    out[1] = Math.max(a[1], b[1]);
    return out;
};

/**
 * Scales a vec2 by a scalar number
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec2} out
 */
vec2.scale = function(out, a, b) {
    out[0] = a[0] * b;
    out[1] = a[1] * b;
    return out;
};

/**
 * Adds two vec2's after scaling the second operand by a scalar value
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec2} out
 */
vec2.scaleAndAdd = function(out, a, b, scale) {
    out[0] = a[0] + (b[0] * scale);
    out[1] = a[1] + (b[1] * scale);
    return out;
};

/**
 * Calculates the euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} distance between a and b
 */
vec2.distance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1];
    return Math.sqrt(x*x + y*y);
};

/**
 * Alias for {@link vec2.distance}
 * @function
 */
vec2.dist = vec2.distance;

/**
 * Calculates the squared euclidian distance between two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} squared distance between a and b
 */
vec2.squaredDistance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1];
    return x*x + y*y;
};

/**
 * Alias for {@link vec2.squaredDistance}
 * @function
 */
vec2.sqrDist = vec2.squaredDistance;

/**
 * Calculates the length of a vec2
 *
 * @param {vec2} a vector to calculate length of
 * @returns {Number} length of a
 */
vec2.length = function (a) {
    var x = a[0],
        y = a[1];
    return Math.sqrt(x*x + y*y);
};

/**
 * Alias for {@link vec2.length}
 * @function
 */
vec2.len = vec2.length;

/**
 * Calculates the squared length of a vec2
 *
 * @param {vec2} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
vec2.squaredLength = function (a) {
    var x = a[0],
        y = a[1];
    return x*x + y*y;
};

/**
 * Alias for {@link vec2.squaredLength}
 * @function
 */
vec2.sqrLen = vec2.squaredLength;

/**
 * Negates the components of a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to negate
 * @returns {vec2} out
 */
vec2.negate = function(out, a) {
    out[0] = -a[0];
    out[1] = -a[1];
    return out;
};

/**
 * Normalize a vec2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a vector to normalize
 * @returns {vec2} out
 */
vec2.normalize = function(out, a) {
    var x = a[0],
        y = a[1];
    var len = x*x + y*y;
    if (len > 0) {
        //TODO: evaluate use of glm_invsqrt here?
        len = 1 / Math.sqrt(len);
        out[0] = a[0] * len;
        out[1] = a[1] * len;
    }
    return out;
};

/**
 * Calculates the dot product of two vec2's
 *
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {Number} dot product of a and b
 */
vec2.dot = function (a, b) {
    return a[0] * b[0] + a[1] * b[1];
};

/**
 * Computes the cross product of two vec2's
 * Note that the cross product must by definition produce a 3D vector
 *
 * @param {vec3} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @returns {vec3} out
 */
vec2.cross = function(out, a, b) {
    var z = a[0] * b[1] - a[1] * b[0];
    out[0] = out[1] = 0;
    out[2] = z;
    return out;
};

/**
 * Performs a linear interpolation between two vec2's
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the first operand
 * @param {vec2} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec2} out
 */
vec2.lerp = function (out, a, b, t) {
    var ax = a[0],
        ay = a[1];
    out[0] = ax + t * (b[0] - ax);
    out[1] = ay + t * (b[1] - ay);
    return out;
};

/**
 * Generates a random vector with the given scale
 *
 * @param {vec2} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec2} out
 */
vec2.random = function (out, scale) {
    scale = scale || 1.0;
    var r = GLMAT_RANDOM() * 2.0 * Math.PI;
    out[0] = Math.cos(r) * scale;
    out[1] = Math.sin(r) * scale;
    return out;
};

/**
 * Transforms the vec2 with a mat2
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat2} m matrix to transform with
 * @returns {vec2} out
 */
vec2.transformMat2 = function(out, a, m) {
    var x = a[0],
        y = a[1];
    out[0] = m[0] * x + m[2] * y;
    out[1] = m[1] * x + m[3] * y;
    return out;
};

/**
 * Transforms the vec2 with a mat2d
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat2d} m matrix to transform with
 * @returns {vec2} out
 */
vec2.transformMat2d = function(out, a, m) {
    var x = a[0],
        y = a[1];
    out[0] = m[0] * x + m[2] * y + m[4];
    out[1] = m[1] * x + m[3] * y + m[5];
    return out;
};

/**
 * Transforms the vec2 with a mat3
 * 3rd vector component is implicitly '1'
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat3} m matrix to transform with
 * @returns {vec2} out
 */
vec2.transformMat3 = function(out, a, m) {
    var x = a[0],
        y = a[1];
    out[0] = m[0] * x + m[3] * y + m[6];
    out[1] = m[1] * x + m[4] * y + m[7];
    return out;
};

/**
 * Transforms the vec2 with a mat4
 * 3rd vector component is implicitly '0'
 * 4th vector component is implicitly '1'
 *
 * @param {vec2} out the receiving vector
 * @param {vec2} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec2} out
 */
vec2.transformMat4 = function(out, a, m) {
    var x = a[0], 
        y = a[1];
    out[0] = m[0] * x + m[4] * y + m[12];
    out[1] = m[1] * x + m[5] * y + m[13];
    return out;
};

/**
 * Perform some operation over an array of vec2s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec2. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec2s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
vec2.forEach = (function() {
    var vec = vec2.create();

    return function(a, stride, offset, count, fn, arg) {
        var i, l;
        if(!stride) {
            stride = 2;
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
            vec[0] = a[i]; vec[1] = a[i+1];
            fn(vec, vec, arg);
            a[i] = vec[0]; a[i+1] = vec[1];
        }
        
        return a;
    };
})();

/**
 * Returns a string representation of a vector
 *
 * @param {vec2} vec vector to represent as a string
 * @returns {String} string representation of the vector
 */
vec2.str = function (a) {
    return 'vec2(' + a[0] + ', ' + a[1] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.vec2 = vec2;
}
;
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
;
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
 * @class 4 Dimensional Vector
 * @name vec4
 */

var vec4 = {};

/**
 * Creates a new, empty vec4
 *
 * @returns {vec4} a new 4D vector
 */
vec4.create = function() {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 0;
    return out;
};

/**
 * Creates a new vec4 initialized with values from an existing vector
 *
 * @param {vec4} a vector to clone
 * @returns {vec4} a new 4D vector
 */
vec4.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

/**
 * Creates a new vec4 initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {vec4} a new 4D vector
 */
vec4.fromValues = function(x, y, z, w) {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
    return out;
};

/**
 * Copy the values from one vec4 to another
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the source vector
 * @returns {vec4} out
 */
vec4.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

/**
 * Set the components of a vec4 to the given values
 *
 * @param {vec4} out the receiving vector
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {vec4} out
 */
vec4.set = function(out, x, y, z, w) {
    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = w;
    return out;
};

/**
 * Adds two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.add = function(out, a, b) {
    out[0] = a[0] + b[0];
    out[1] = a[1] + b[1];
    out[2] = a[2] + b[2];
    out[3] = a[3] + b[3];
    return out;
};

/**
 * Subtracts vector b from vector a
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.subtract = function(out, a, b) {
    out[0] = a[0] - b[0];
    out[1] = a[1] - b[1];
    out[2] = a[2] - b[2];
    out[3] = a[3] - b[3];
    return out;
};

/**
 * Alias for {@link vec4.subtract}
 * @function
 */
vec4.sub = vec4.subtract;

/**
 * Multiplies two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.multiply = function(out, a, b) {
    out[0] = a[0] * b[0];
    out[1] = a[1] * b[1];
    out[2] = a[2] * b[2];
    out[3] = a[3] * b[3];
    return out;
};

/**
 * Alias for {@link vec4.multiply}
 * @function
 */
vec4.mul = vec4.multiply;

/**
 * Divides two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.divide = function(out, a, b) {
    out[0] = a[0] / b[0];
    out[1] = a[1] / b[1];
    out[2] = a[2] / b[2];
    out[3] = a[3] / b[3];
    return out;
};

/**
 * Alias for {@link vec4.divide}
 * @function
 */
vec4.div = vec4.divide;

/**
 * Returns the minimum of two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.min = function(out, a, b) {
    out[0] = Math.min(a[0], b[0]);
    out[1] = Math.min(a[1], b[1]);
    out[2] = Math.min(a[2], b[2]);
    out[3] = Math.min(a[3], b[3]);
    return out;
};

/**
 * Returns the maximum of two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {vec4} out
 */
vec4.max = function(out, a, b) {
    out[0] = Math.max(a[0], b[0]);
    out[1] = Math.max(a[1], b[1]);
    out[2] = Math.max(a[2], b[2]);
    out[3] = Math.max(a[3], b[3]);
    return out;
};

/**
 * Scales a vec4 by a scalar number
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {vec4} out
 */
vec4.scale = function(out, a, b) {
    out[0] = a[0] * b;
    out[1] = a[1] * b;
    out[2] = a[2] * b;
    out[3] = a[3] * b;
    return out;
};

/**
 * Adds two vec4's after scaling the second operand by a scalar value
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @param {Number} scale the amount to scale b by before adding
 * @returns {vec4} out
 */
vec4.scaleAndAdd = function(out, a, b, scale) {
    out[0] = a[0] + (b[0] * scale);
    out[1] = a[1] + (b[1] * scale);
    out[2] = a[2] + (b[2] * scale);
    out[3] = a[3] + (b[3] * scale);
    return out;
};

/**
 * Calculates the euclidian distance between two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} distance between a and b
 */
vec4.distance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2],
        w = b[3] - a[3];
    return Math.sqrt(x*x + y*y + z*z + w*w);
};

/**
 * Alias for {@link vec4.distance}
 * @function
 */
vec4.dist = vec4.distance;

/**
 * Calculates the squared euclidian distance between two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} squared distance between a and b
 */
vec4.squaredDistance = function(a, b) {
    var x = b[0] - a[0],
        y = b[1] - a[1],
        z = b[2] - a[2],
        w = b[3] - a[3];
    return x*x + y*y + z*z + w*w;
};

/**
 * Alias for {@link vec4.squaredDistance}
 * @function
 */
vec4.sqrDist = vec4.squaredDistance;

/**
 * Calculates the length of a vec4
 *
 * @param {vec4} a vector to calculate length of
 * @returns {Number} length of a
 */
vec4.length = function (a) {
    var x = a[0],
        y = a[1],
        z = a[2],
        w = a[3];
    return Math.sqrt(x*x + y*y + z*z + w*w);
};

/**
 * Alias for {@link vec4.length}
 * @function
 */
vec4.len = vec4.length;

/**
 * Calculates the squared length of a vec4
 *
 * @param {vec4} a vector to calculate squared length of
 * @returns {Number} squared length of a
 */
vec4.squaredLength = function (a) {
    var x = a[0],
        y = a[1],
        z = a[2],
        w = a[3];
    return x*x + y*y + z*z + w*w;
};

/**
 * Alias for {@link vec4.squaredLength}
 * @function
 */
vec4.sqrLen = vec4.squaredLength;

/**
 * Negates the components of a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to negate
 * @returns {vec4} out
 */
vec4.negate = function(out, a) {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    out[3] = -a[3];
    return out;
};

/**
 * Normalize a vec4
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a vector to normalize
 * @returns {vec4} out
 */
vec4.normalize = function(out, a) {
    var x = a[0],
        y = a[1],
        z = a[2],
        w = a[3];
    var len = x*x + y*y + z*z + w*w;
    if (len > 0) {
        len = 1 / Math.sqrt(len);
        out[0] = a[0] * len;
        out[1] = a[1] * len;
        out[2] = a[2] * len;
        out[3] = a[3] * len;
    }
    return out;
};

/**
 * Calculates the dot product of two vec4's
 *
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @returns {Number} dot product of a and b
 */
vec4.dot = function (a, b) {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
};

/**
 * Performs a linear interpolation between two vec4's
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the first operand
 * @param {vec4} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {vec4} out
 */
vec4.lerp = function (out, a, b, t) {
    var ax = a[0],
        ay = a[1],
        az = a[2],
        aw = a[3];
    out[0] = ax + t * (b[0] - ax);
    out[1] = ay + t * (b[1] - ay);
    out[2] = az + t * (b[2] - az);
    out[3] = aw + t * (b[3] - aw);
    return out;
};

/**
 * Generates a random vector with the given scale
 *
 * @param {vec4} out the receiving vector
 * @param {Number} [scale] Length of the resulting vector. If ommitted, a unit vector will be returned
 * @returns {vec4} out
 */
vec4.random = function (out, scale) {
    scale = scale || 1.0;

    //TODO: This is a pretty awful way of doing this. Find something better.
    out[0] = GLMAT_RANDOM();
    out[1] = GLMAT_RANDOM();
    out[2] = GLMAT_RANDOM();
    out[3] = GLMAT_RANDOM();
    vec4.normalize(out, out);
    vec4.scale(out, out, scale);
    return out;
};

/**
 * Transforms the vec4 with a mat4.
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to transform
 * @param {mat4} m matrix to transform with
 * @returns {vec4} out
 */
vec4.transformMat4 = function(out, a, m) {
    var x = a[0], y = a[1], z = a[2], w = a[3];
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
    out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
    return out;
};

/**
 * Transforms the vec4 with a quat
 *
 * @param {vec4} out the receiving vector
 * @param {vec4} a the vector to transform
 * @param {quat} q quaternion to transform with
 * @returns {vec4} out
 */
vec4.transformQuat = function(out, a, q) {
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

/**
 * Perform some operation over an array of vec4s.
 *
 * @param {Array} a the array of vectors to iterate over
 * @param {Number} stride Number of elements between the start of each vec4. If 0 assumes tightly packed
 * @param {Number} offset Number of elements to skip at the beginning of the array
 * @param {Number} count Number of vec2s to iterate over. If 0 iterates over entire array
 * @param {Function} fn Function to call for each vector in the array
 * @param {Object} [arg] additional argument to pass to fn
 * @returns {Array} a
 * @function
 */
vec4.forEach = (function() {
    var vec = vec4.create();

    return function(a, stride, offset, count, fn, arg) {
        var i, l;
        if(!stride) {
            stride = 4;
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
            vec[0] = a[i]; vec[1] = a[i+1]; vec[2] = a[i+2]; vec[3] = a[i+3];
            fn(vec, vec, arg);
            a[i] = vec[0]; a[i+1] = vec[1]; a[i+2] = vec[2]; a[i+3] = vec[3];
        }
        
        return a;
    };
})();

/**
 * Returns a string representation of a vector
 *
 * @param {vec4} vec vector to represent as a string
 * @returns {String} string representation of the vector
 */
vec4.str = function (a) {
    return 'vec4(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.vec4 = vec4;
}
;
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
 * @class 2x2 Matrix
 * @name mat2
 */

var mat2 = {};

/**
 * Creates a new identity mat2
 *
 * @returns {mat2} a new 2x2 matrix
 */
mat2.create = function() {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
};

/**
 * Creates a new mat2 initialized with values from an existing matrix
 *
 * @param {mat2} a matrix to clone
 * @returns {mat2} a new 2x2 matrix
 */
mat2.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

/**
 * Copy the values from one mat2 to another
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the source matrix
 * @returns {mat2} out
 */
mat2.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    return out;
};

/**
 * Set a mat2 to the identity matrix
 *
 * @param {mat2} out the receiving matrix
 * @returns {mat2} out
 */
mat2.identity = function(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
};

/**
 * Transpose the values of a mat2
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the source matrix
 * @returns {mat2} out
 */
mat2.transpose = function(out, a) {
    // If we are transposing ourselves we can skip a few steps but have to cache some values
    if (out === a) {
        var a1 = a[1];
        out[1] = a[2];
        out[2] = a1;
    } else {
        out[0] = a[0];
        out[1] = a[2];
        out[2] = a[1];
        out[3] = a[3];
    }
    
    return out;
};

/**
 * Inverts a mat2
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the source matrix
 * @returns {mat2} out
 */
mat2.invert = function(out, a) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],

        // Calculate the determinant
        det = a0 * a3 - a2 * a1;

    if (!det) {
        return null;
    }
    det = 1.0 / det;
    
    out[0] =  a3 * det;
    out[1] = -a1 * det;
    out[2] = -a2 * det;
    out[3] =  a0 * det;

    return out;
};

/**
 * Calculates the adjugate of a mat2
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the source matrix
 * @returns {mat2} out
 */
mat2.adjoint = function(out, a) {
    // Caching this value is nessecary if out == a
    var a0 = a[0];
    out[0] =  a[3];
    out[1] = -a[1];
    out[2] = -a[2];
    out[3] =  a0;

    return out;
};

/**
 * Calculates the determinant of a mat2
 *
 * @param {mat2} a the source matrix
 * @returns {Number} determinant of a
 */
mat2.determinant = function (a) {
    return a[0] * a[3] - a[2] * a[1];
};

/**
 * Multiplies two mat2's
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the first operand
 * @param {mat2} b the second operand
 * @returns {mat2} out
 */
mat2.multiply = function (out, a, b) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3];
    var b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = a0 * b0 + a2 * b1;
    out[1] = a1 * b0 + a3 * b1;
    out[2] = a0 * b2 + a2 * b3;
    out[3] = a1 * b2 + a3 * b3;
    return out;
};

/**
 * Alias for {@link mat2.multiply}
 * @function
 */
mat2.mul = mat2.multiply;

/**
 * Rotates a mat2 by the given angle
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat2} out
 */
mat2.rotate = function (out, a, rad) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],
        s = Math.sin(rad),
        c = Math.cos(rad);
    out[0] = a0 *  c + a2 * s;
    out[1] = a1 *  c + a3 * s;
    out[2] = a0 * -s + a2 * c;
    out[3] = a1 * -s + a3 * c;
    return out;
};

/**
 * Scales the mat2 by the dimensions in the given vec2
 *
 * @param {mat2} out the receiving matrix
 * @param {mat2} a the matrix to rotate
 * @param {vec2} v the vec2 to scale the matrix by
 * @returns {mat2} out
 **/
mat2.scale = function(out, a, v) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],
        v0 = v[0], v1 = v[1];
    out[0] = a0 * v0;
    out[1] = a1 * v0;
    out[2] = a2 * v1;
    out[3] = a3 * v1;
    return out;
};

/**
 * Returns a string representation of a mat2
 *
 * @param {mat2} mat matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
mat2.str = function (a) {
    return 'mat2(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ')';
};

/**
 * Returns Frobenius norm of a mat2
 *
 * @param {mat2} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */
mat2.frob = function (a) {
    return(Math.sqrt(Math.pow(a[0], 2) + Math.pow(a[1], 2) + Math.pow(a[2], 2) + Math.pow(a[3], 2)))
};

/**
 * Returns L, D and U matrices (Lower triangular, Diagonal and Upper triangular) by factorizing the input matrix
 * @param {mat2} L the lower triangular matrix 
 * @param {mat2} D the diagonal matrix 
 * @param {mat2} U the upper triangular matrix 
 * @param {mat2} a the input matrix to factorize
 */

mat2.LDU = function (L, D, U, a) { 
    L[2] = a[2]/a[0]; 
    U[0] = a[0]; 
    U[1] = a[1]; 
    U[3] = a[3] - L[2] * U[1]; 
    return [L, D, U];       
}; 

if(typeof(exports) !== 'undefined') {
    exports.mat2 = mat2;
}
;
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
 * @class 2x3 Matrix
 * @name mat2d
 * 
 * @description 
 * A mat2d contains six elements defined as:
 * <pre>
 * [a, c, tx,
 *  b, d, ty]
 * </pre>
 * This is a short form for the 3x3 matrix:
 * <pre>
 * [a, c, tx,
 *  b, d, ty,
 *  0, 0, 1]
 * </pre>
 * The last row is ignored so the array is shorter and operations are faster.
 */

var mat2d = {};

/**
 * Creates a new identity mat2d
 *
 * @returns {mat2d} a new 2x3 matrix
 */
mat2d.create = function() {
    var out = new GLMAT_ARRAY_TYPE(6);
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    out[4] = 0;
    out[5] = 0;
    return out;
};

/**
 * Creates a new mat2d initialized with values from an existing matrix
 *
 * @param {mat2d} a matrix to clone
 * @returns {mat2d} a new 2x3 matrix
 */
mat2d.clone = function(a) {
    var out = new GLMAT_ARRAY_TYPE(6);
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    return out;
};

/**
 * Copy the values from one mat2d to another
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the source matrix
 * @returns {mat2d} out
 */
mat2d.copy = function(out, a) {
    out[0] = a[0];
    out[1] = a[1];
    out[2] = a[2];
    out[3] = a[3];
    out[4] = a[4];
    out[5] = a[5];
    return out;
};

/**
 * Set a mat2d to the identity matrix
 *
 * @param {mat2d} out the receiving matrix
 * @returns {mat2d} out
 */
mat2d.identity = function(out) {
    out[0] = 1;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    out[4] = 0;
    out[5] = 0;
    return out;
};

/**
 * Inverts a mat2d
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the source matrix
 * @returns {mat2d} out
 */
mat2d.invert = function(out, a) {
    var aa = a[0], ab = a[1], ac = a[2], ad = a[3],
        atx = a[4], aty = a[5];

    var det = aa * ad - ab * ac;
    if(!det){
        return null;
    }
    det = 1.0 / det;

    out[0] = ad * det;
    out[1] = -ab * det;
    out[2] = -ac * det;
    out[3] = aa * det;
    out[4] = (ac * aty - ad * atx) * det;
    out[5] = (ab * atx - aa * aty) * det;
    return out;
};

/**
 * Calculates the determinant of a mat2d
 *
 * @param {mat2d} a the source matrix
 * @returns {Number} determinant of a
 */
mat2d.determinant = function (a) {
    return a[0] * a[3] - a[1] * a[2];
};

/**
 * Multiplies two mat2d's
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the first operand
 * @param {mat2d} b the second operand
 * @returns {mat2d} out
 */
mat2d.multiply = function (out, a, b) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5],
        b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3], b4 = b[4], b5 = b[5];
    out[0] = a0 * b0 + a2 * b1;
    out[1] = a1 * b0 + a3 * b1;
    out[2] = a0 * b2 + a2 * b3;
    out[3] = a1 * b2 + a3 * b3;
    out[4] = a0 * b4 + a2 * b5 + a4;
    out[5] = a1 * b4 + a3 * b5 + a5;
    return out;
};

/**
 * Alias for {@link mat2d.multiply}
 * @function
 */
mat2d.mul = mat2d.multiply;


/**
 * Rotates a mat2d by the given angle
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the matrix to rotate
 * @param {Number} rad the angle to rotate the matrix by
 * @returns {mat2d} out
 */
mat2d.rotate = function (out, a, rad) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5],
        s = Math.sin(rad),
        c = Math.cos(rad);
    out[0] = a0 *  c + a2 * s;
    out[1] = a1 *  c + a3 * s;
    out[2] = a0 * -s + a2 * c;
    out[3] = a1 * -s + a3 * c;
    out[4] = a4;
    out[5] = a5;
    return out;
};

/**
 * Scales the mat2d by the dimensions in the given vec2
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the matrix to translate
 * @param {vec2} v the vec2 to scale the matrix by
 * @returns {mat2d} out
 **/
mat2d.scale = function(out, a, v) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5],
        v0 = v[0], v1 = v[1];
    out[0] = a0 * v0;
    out[1] = a1 * v0;
    out[2] = a2 * v1;
    out[3] = a3 * v1;
    out[4] = a4;
    out[5] = a5;
    return out;
};

/**
 * Translates the mat2d by the dimensions in the given vec2
 *
 * @param {mat2d} out the receiving matrix
 * @param {mat2d} a the matrix to translate
 * @param {vec2} v the vec2 to translate the matrix by
 * @returns {mat2d} out
 **/
mat2d.translate = function(out, a, v) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3], a4 = a[4], a5 = a[5],
        v0 = v[0], v1 = v[1];
    out[0] = a0;
    out[1] = a1;
    out[2] = a2;
    out[3] = a3;
    out[4] = a0 * v0 + a2 * v1 + a4;
    out[5] = a1 * v0 + a3 * v1 + a5;
    return out;
};

/**
 * Returns a string representation of a mat2d
 *
 * @param {mat2d} a matrix to represent as a string
 * @returns {String} string representation of the matrix
 */
mat2d.str = function (a) {
    return 'mat2d(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + 
                    a[3] + ', ' + a[4] + ', ' + a[5] + ')';
};

/**
 * Returns Frobenius norm of a mat2d
 *
 * @param {mat2d} a the matrix to calculate Frobenius norm of
 * @returns {Number} Frobenius norm
 */
mat2d.frob = function (a) { 
    return(Math.sqrt(Math.pow(a[0], 2) + Math.pow(a[1], 2) + Math.pow(a[2], 2) + Math.pow(a[3], 2) + Math.pow(a[4], 2) + Math.pow(a[5], 2) + 1))
}; 

if(typeof(exports) !== 'undefined') {
    exports.mat2d = mat2d;
}
;
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
;
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
;
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
 * @class Quaternion
 * @name quat
 */

var quat = {};

/**
 * Creates a new identity quat
 *
 * @returns {quat} a new quaternion
 */
quat.create = function() {
    var out = new GLMAT_ARRAY_TYPE(4);
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
};

/**
 * Sets a quaternion to represent the shortest rotation from one
 * vector to another.
 *
 * Both vectors are assumed to be unit length.
 *
 * @param {quat} out the receiving quaternion.
 * @param {vec3} a the initial vector
 * @param {vec3} b the destination vector
 * @returns {quat} out
 */
quat.rotationTo = (function() {
    var tmpvec3 = vec3.create();
    var xUnitVec3 = vec3.fromValues(1,0,0);
    var yUnitVec3 = vec3.fromValues(0,1,0);

    return function(out, a, b) {
        var dot = vec3.dot(a, b);
        if (dot < -0.999999) {
            vec3.cross(tmpvec3, xUnitVec3, a);
            if (vec3.length(tmpvec3) < 0.000001)
                vec3.cross(tmpvec3, yUnitVec3, a);
            vec3.normalize(tmpvec3, tmpvec3);
            quat.setAxisAngle(out, tmpvec3, Math.PI);
            return out;
        } else if (dot > 0.999999) {
            out[0] = 0;
            out[1] = 0;
            out[2] = 0;
            out[3] = 1;
            return out;
        } else {
            vec3.cross(tmpvec3, a, b);
            out[0] = tmpvec3[0];
            out[1] = tmpvec3[1];
            out[2] = tmpvec3[2];
            out[3] = 1 + dot;
            return quat.normalize(out, out);
        }
    };
})();

/**
 * Sets the specified quaternion with values corresponding to the given
 * axes. Each axis is a vec3 and is expected to be unit length and
 * perpendicular to all other specified axes.
 *
 * @param {vec3} view  the vector representing the viewing direction
 * @param {vec3} right the vector representing the local "right" direction
 * @param {vec3} up    the vector representing the local "up" direction
 * @returns {quat} out
 */
quat.setAxes = (function() {
    var matr = mat3.create();

    return function(out, view, right, up) {
        matr[0] = right[0];
        matr[3] = right[1];
        matr[6] = right[2];

        matr[1] = up[0];
        matr[4] = up[1];
        matr[7] = up[2];

        matr[2] = -view[0];
        matr[5] = -view[1];
        matr[8] = -view[2];

        return quat.normalize(out, quat.fromMat3(out, matr));
    };
})();

/**
 * Creates a new quat initialized with values from an existing quaternion
 *
 * @param {quat} a quaternion to clone
 * @returns {quat} a new quaternion
 * @function
 */
quat.clone = vec4.clone;

/**
 * Creates a new quat initialized with the given values
 *
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {quat} a new quaternion
 * @function
 */
quat.fromValues = vec4.fromValues;

/**
 * Copy the values from one quat to another
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the source quaternion
 * @returns {quat} out
 * @function
 */
quat.copy = vec4.copy;

/**
 * Set the components of a quat to the given values
 *
 * @param {quat} out the receiving quaternion
 * @param {Number} x X component
 * @param {Number} y Y component
 * @param {Number} z Z component
 * @param {Number} w W component
 * @returns {quat} out
 * @function
 */
quat.set = vec4.set;

/**
 * Set a quat to the identity quaternion
 *
 * @param {quat} out the receiving quaternion
 * @returns {quat} out
 */
quat.identity = function(out) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    out[3] = 1;
    return out;
};

/**
 * Sets a quat from the given angle and rotation axis,
 * then returns it.
 *
 * @param {quat} out the receiving quaternion
 * @param {vec3} axis the axis around which to rotate
 * @param {Number} rad the angle in radians
 * @returns {quat} out
 **/
quat.setAxisAngle = function(out, axis, rad) {
    rad = rad * 0.5;
    var s = Math.sin(rad);
    out[0] = s * axis[0];
    out[1] = s * axis[1];
    out[2] = s * axis[2];
    out[3] = Math.cos(rad);
    return out;
};

/**
 * Adds two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {quat} out
 * @function
 */
quat.add = vec4.add;

/**
 * Multiplies two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {quat} out
 */
quat.multiply = function(out, a, b) {
    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        bx = b[0], by = b[1], bz = b[2], bw = b[3];

    out[0] = ax * bw + aw * bx + ay * bz - az * by;
    out[1] = ay * bw + aw * by + az * bx - ax * bz;
    out[2] = az * bw + aw * bz + ax * by - ay * bx;
    out[3] = aw * bw - ax * bx - ay * by - az * bz;
    return out;
};

/**
 * Alias for {@link quat.multiply}
 * @function
 */
quat.mul = quat.multiply;

/**
 * Scales a quat by a scalar number
 *
 * @param {quat} out the receiving vector
 * @param {quat} a the vector to scale
 * @param {Number} b amount to scale the vector by
 * @returns {quat} out
 * @function
 */
quat.scale = vec4.scale;

/**
 * Rotates a quaternion by the given angle about the X axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
quat.rotateX = function (out, a, rad) {
    rad *= 0.5; 

    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        bx = Math.sin(rad), bw = Math.cos(rad);

    out[0] = ax * bw + aw * bx;
    out[1] = ay * bw + az * bx;
    out[2] = az * bw - ay * bx;
    out[3] = aw * bw - ax * bx;
    return out;
};

/**
 * Rotates a quaternion by the given angle about the Y axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
quat.rotateY = function (out, a, rad) {
    rad *= 0.5; 

    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        by = Math.sin(rad), bw = Math.cos(rad);

    out[0] = ax * bw - az * by;
    out[1] = ay * bw + aw * by;
    out[2] = az * bw + ax * by;
    out[3] = aw * bw - ay * by;
    return out;
};

/**
 * Rotates a quaternion by the given angle about the Z axis
 *
 * @param {quat} out quat receiving operation result
 * @param {quat} a quat to rotate
 * @param {number} rad angle (in radians) to rotate
 * @returns {quat} out
 */
quat.rotateZ = function (out, a, rad) {
    rad *= 0.5; 

    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        bz = Math.sin(rad), bw = Math.cos(rad);

    out[0] = ax * bw + ay * bz;
    out[1] = ay * bw - ax * bz;
    out[2] = az * bw + aw * bz;
    out[3] = aw * bw - az * bz;
    return out;
};

/**
 * Calculates the W component of a quat from the X, Y, and Z components.
 * Assumes that quaternion is 1 unit in length.
 * Any existing W component will be ignored.
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate W component of
 * @returns {quat} out
 */
quat.calculateW = function (out, a) {
    var x = a[0], y = a[1], z = a[2];

    out[0] = x;
    out[1] = y;
    out[2] = z;
    out[3] = -Math.sqrt(Math.abs(1.0 - x * x - y * y - z * z));
    return out;
};

/**
 * Calculates the dot product of two quat's
 *
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @returns {Number} dot product of a and b
 * @function
 */
quat.dot = vec4.dot;

/**
 * Performs a linear interpolation between two quat's
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {quat} out
 * @function
 */
quat.lerp = vec4.lerp;

/**
 * Performs a spherical linear interpolation between two quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a the first operand
 * @param {quat} b the second operand
 * @param {Number} t interpolation amount between the two inputs
 * @returns {quat} out
 */
quat.slerp = function (out, a, b, t) {
    // benchmarks:
    //    http://jsperf.com/quaternion-slerp-implementations

    var ax = a[0], ay = a[1], az = a[2], aw = a[3],
        bx = b[0], by = b[1], bz = b[2], bw = b[3];

    var        omega, cosom, sinom, scale0, scale1;

    // calc cosine
    cosom = ax * bx + ay * by + az * bz + aw * bw;
    // adjust signs (if necessary)
    if ( cosom < 0.0 ) {
        cosom = -cosom;
        bx = - bx;
        by = - by;
        bz = - bz;
        bw = - bw;
    }
    // calculate coefficients
    if ( (1.0 - cosom) > 0.000001 ) {
        // standard case (slerp)
        omega  = Math.acos(cosom);
        sinom  = Math.sin(omega);
        scale0 = Math.sin((1.0 - t) * omega) / sinom;
        scale1 = Math.sin(t * omega) / sinom;
    } else {        
        // "from" and "to" quaternions are very close 
        //  ... so we can do a linear interpolation
        scale0 = 1.0 - t;
        scale1 = t;
    }
    // calculate final values
    out[0] = scale0 * ax + scale1 * bx;
    out[1] = scale0 * ay + scale1 * by;
    out[2] = scale0 * az + scale1 * bz;
    out[3] = scale0 * aw + scale1 * bw;
    
    return out;
};

/**
 * Calculates the inverse of a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate inverse of
 * @returns {quat} out
 */
quat.invert = function(out, a) {
    var a0 = a[0], a1 = a[1], a2 = a[2], a3 = a[3],
        dot = a0*a0 + a1*a1 + a2*a2 + a3*a3,
        invDot = dot ? 1.0/dot : 0;
    
    // TODO: Would be faster to return [0,0,0,0] immediately if dot == 0

    out[0] = -a0*invDot;
    out[1] = -a1*invDot;
    out[2] = -a2*invDot;
    out[3] = a3*invDot;
    return out;
};

/**
 * Calculates the conjugate of a quat
 * If the quaternion is normalized, this function is faster than quat.inverse and produces the same result.
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quat to calculate conjugate of
 * @returns {quat} out
 */
quat.conjugate = function (out, a) {
    out[0] = -a[0];
    out[1] = -a[1];
    out[2] = -a[2];
    out[3] = a[3];
    return out;
};

/**
 * Calculates the length of a quat
 *
 * @param {quat} a vector to calculate length of
 * @returns {Number} length of a
 * @function
 */
quat.length = vec4.length;

/**
 * Alias for {@link quat.length}
 * @function
 */
quat.len = quat.length;

/**
 * Calculates the squared length of a quat
 *
 * @param {quat} a vector to calculate squared length of
 * @returns {Number} squared length of a
 * @function
 */
quat.squaredLength = vec4.squaredLength;

/**
 * Alias for {@link quat.squaredLength}
 * @function
 */
quat.sqrLen = quat.squaredLength;

/**
 * Normalize a quat
 *
 * @param {quat} out the receiving quaternion
 * @param {quat} a quaternion to normalize
 * @returns {quat} out
 * @function
 */
quat.normalize = vec4.normalize;

/**
 * Creates a quaternion from the given 3x3 rotation matrix.
 *
 * NOTE: The resultant quaternion is not normalized, so you should be sure
 * to renormalize the quaternion yourself where necessary.
 *
 * @param {quat} out the receiving quaternion
 * @param {mat3} m rotation matrix
 * @returns {quat} out
 * @function
 */
quat.fromMat3 = function(out, m) {
    // Algorithm in Ken Shoemake's article in 1987 SIGGRAPH course notes
    // article "Quaternion Calculus and Fast Animation".
    var fTrace = m[0] + m[4] + m[8];
    var fRoot;

    if ( fTrace > 0.0 ) {
        // |w| > 1/2, may as well choose w > 1/2
        fRoot = Math.sqrt(fTrace + 1.0);  // 2w
        out[3] = 0.5 * fRoot;
        fRoot = 0.5/fRoot;  // 1/(4w)
        out[0] = (m[7]-m[5])*fRoot;
        out[1] = (m[2]-m[6])*fRoot;
        out[2] = (m[3]-m[1])*fRoot;
    } else {
        // |w| <= 1/2
        var i = 0;
        if ( m[4] > m[0] )
          i = 1;
        if ( m[8] > m[i*3+i] )
          i = 2;
        var j = (i+1)%3;
        var k = (i+2)%3;
        
        fRoot = Math.sqrt(m[i*3+i]-m[j*3+j]-m[k*3+k] + 1.0);
        out[i] = 0.5 * fRoot;
        fRoot = 0.5 / fRoot;
        out[3] = (m[k*3+j] - m[j*3+k]) * fRoot;
        out[j] = (m[j*3+i] + m[i*3+j]) * fRoot;
        out[k] = (m[k*3+i] + m[i*3+k]) * fRoot;
    }
    
    return out;
};

/**
 * Returns a string representation of a quatenion
 *
 * @param {quat} vec vector to represent as a string
 * @returns {String} string representation of the vector
 */
quat.str = function (a) {
    return 'quat(' + a[0] + ', ' + a[1] + ', ' + a[2] + ', ' + a[3] + ')';
};

if(typeof(exports) !== 'undefined') {
    exports.quat = quat;
}
;













  })(shim.exports);
})(this);

},{}],20:[function(require,module,exports){
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

},{}],21:[function(require,module,exports){
// stats.js - http://github.com/mrdoob/stats.js
var Stats=function(){var l=Date.now(),m=l,g=0,n=Infinity,o=0,h=0,p=Infinity,q=0,r=0,s=0,f=document.createElement("div");f.id="stats";f.addEventListener("mousedown",function(b){b.preventDefault();t(++s%2)},!1);f.style.cssText="width:80px;opacity:0.9;cursor:pointer";var a=document.createElement("div");a.id="fps";a.style.cssText="padding:0 0 3px 3px;text-align:left;background-color:#002";f.appendChild(a);var i=document.createElement("div");i.id="fpsText";i.style.cssText="color:#0ff;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px";
i.innerHTML="FPS";a.appendChild(i);var c=document.createElement("div");c.id="fpsGraph";c.style.cssText="position:relative;width:74px;height:30px;background-color:#0ff";for(a.appendChild(c);74>c.children.length;){var j=document.createElement("span");j.style.cssText="width:1px;height:30px;float:left;background-color:#113";c.appendChild(j)}var d=document.createElement("div");d.id="ms";d.style.cssText="padding:0 0 3px 3px;text-align:left;background-color:#020;display:none";f.appendChild(d);var k=document.createElement("div");
k.id="msText";k.style.cssText="color:#0f0;font-family:Helvetica,Arial,sans-serif;font-size:9px;font-weight:bold;line-height:15px";k.innerHTML="MS";d.appendChild(k);var e=document.createElement("div");e.id="msGraph";e.style.cssText="position:relative;width:74px;height:30px;background-color:#0f0";for(d.appendChild(e);74>e.children.length;)j=document.createElement("span"),j.style.cssText="width:1px;height:30px;float:left;background-color:#131",e.appendChild(j);var t=function(b){s=b;switch(s){case 0:a.style.display=
"block";d.style.display="none";break;case 1:a.style.display="none",d.style.display="block"}};return{REVISION:12,domElement:f,setMode:t,begin:function(){l=Date.now()},end:function(){var b=Date.now();g=b-l;n=Math.min(n,g);o=Math.max(o,g);k.textContent=g+" MS ("+n+"-"+o+")";var a=Math.min(30,30-30*(g/200));e.appendChild(e.firstChild).style.height=a+"px";r++;b>m+1E3&&(h=Math.round(1E3*r/(b-m)),p=Math.min(p,h),q=Math.max(q,h),i.textContent=h+" FPS ("+p+"-"+q+")",a=Math.min(30,30-30*(h/100)),c.appendChild(c.firstChild).style.height=
a+"px",m=b,r=0);return b},update:function(){l=this.end()}}};"object"===typeof module&&(module.exports=Stats);

},{}],22:[function(require,module,exports){
var glMatrix = require('gl-matrix'),
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
    var lot, h, cx, cy, xm, xM, ym, yM;
    lot = block.lots[j];
    h = lot.height, lot = lot.poly;

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
      depth: Math.abs(yM - ym) * .9
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
    x = 6, y = 20, z = 6, alpha = Math.PI / 2, beta = 0;

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

  calcPositions(timestamp);

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

  scene.lights = geom.quadtreeLights
    .query(x, z, .5)
    .map(function(i) { 
      return [ i.l.x, i.l.y, i.l.z ];
    });

  t += .001;

  //console.log(scene.meshes.reduce(function(o, i) { o += i.count; return o; }, 0));

}
// 87 65 83 68;

/*document.body.addEventListener('keydown', function(evt) {

  var dx = 0, dz = 0;

  switch(evt.which) {
    case 87: dz = -.04; break;
    case 83: dz = .04; break;
    case 65: dx = -.04; break;
    case 68: dx = .04; break;
  }

  x += -Math.sin(beta) * Math.cos(alpha) * dz;
  y += Math.sin(alpha) * dz;
  z += Math.cos(beta) * Math.cos(alpha) * dz;

  log.textContent = [x,y,z].map(function(i) { return i.toFixed(2) }).join(', ') + ' ' +
    (Math.PI / alpha).toFixed(2) + ' ' + 
    (Math.PI / beta).toFixed(2);

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

});*/

module.exports = scene;

},{"../generators/BuildingSHG.js":5,"../generators/City.js":6,"./../Context":1,"./../lib/Geom":10,"./../lib/Loader":11,"./../lib/Mesh":12,"./../lib/QuadTree":13,"gl-matrix":19}]},{},[17])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy93YXRjaGlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiQ29udGV4dC5qcyIsIlJlbmRlcmVyLmpzIiwiZ2VuZXJhdG9ycy9CYWxjb255U0hHLmpzIiwiZ2VuZXJhdG9ycy9CbG9jay5qcyIsImdlbmVyYXRvcnMvQnVpbGRpbmdTSEcuanMiLCJnZW5lcmF0b3JzL0NpdHkuanMiLCJnZW5lcmF0b3JzL1BSTkcuanMiLCJnZW5lcmF0b3JzL1JvYWRzLmpzIiwiZ2VuZXJhdG9ycy9TdGFpcmNhc2VTSEcuanMiLCJsaWIvR2VvbS5qcyIsImxpYi9Mb2FkZXIuanMiLCJsaWIvTWVzaC5qcyIsImxpYi9RdWFkVHJlZS5qcyIsImxpYi9TSEFQRS5qcyIsImxpYi9TaGFwZUdyYW1tYXIuanMiLCJsaWIvdXRpbC5qcyIsIm1haW4uanMiLCJub2RlX21vZHVsZXMvZWFyY3V0L3NyYy9lYXJjdXQuanMiLCJub2RlX21vZHVsZXMvZ2wtbWF0cml4L2Rpc3QvZ2wtbWF0cml4LmpzIiwibm9kZV9tb2R1bGVzL21lcnNlbm5ldHdpc3Rlci9zcmMvTWVyc2VubmVUd2lzdGVyLmpzIiwibm9kZV9tb2R1bGVzL3N0YXRzLWpzL2J1aWxkL3N0YXRzLm1pbi5qcyIsInNjZW5lcy9NYWluU2NlbmUuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdlNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2piQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6SkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeERBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3REQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcHJCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4cElBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25QQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJ2YXIgY2FudmFzICAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZCgndGhlc2lzLWNhbnZhcycpLFxuICAgIGdsICAgICAgID0gY2FudmFzLmdldENvbnRleHQoJ3dlYmdsJyksXG4gICAgYmNyICAgICAgPSBjYW52YXMuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCksXG4gICAgdyAgICAgICAgPSBiY3Iud2lkdGgsXG4gICAgaCAgICAgICAgPSBiY3IuaGVpZ2h0O1xuXG5jYW52YXMud2lkdGggID0gdztcbmNhbnZhcy5oZWlnaHQgPSBoO1xuY2FudmFzLnN0eWxlLmJhY2tncm91bmQgPSAnYmxhY2snO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgY2FudmFzOiBjYW52YXMsXG4gIGdsOiBnbCxcbiAgdzogdyxcbiAgaDogaCxcbiAgYXNwZWN0UmF0aW86IHcgLyBoXG59XG4iLCJcbi8vdmFyIGdsc2xpZnkgICAgID0gcmVxdWlyZSgnZ2xzbGlmeScpO1xudmFyIFV0aWwgICAgICAgID0gcmVxdWlyZSgnLi9saWIvdXRpbC5qcycpLFxuICAgIGdsTWF0cml4ICAgID0gcmVxdWlyZSgnZ2wtbWF0cml4JyksXG4gICAgdmVjMyAgICAgICAgPSBnbE1hdHJpeC52ZWMzLFxuICAgIG1hdDMgICAgICAgID0gZ2xNYXRyaXgubWF0MyxcbiAgICBtYXQ0ICAgICAgICA9IGdsTWF0cml4Lm1hdDQsXG4gICAgQ29udGV4dCAgICAgPSByZXF1aXJlKCcuL0NvbnRleHQnKSxcbiAgICBnbCAgICAgICAgICA9IENvbnRleHQuZ2wsXG4gICAgQnVpbGRpbmdTSEcgPSByZXF1aXJlKCcuL2dlbmVyYXRvcnMvQnVpbGRpbmdTSEcuanMnKTtcblxudmFyIHByb2dyYW1QYXNzICA9IGdsLmNyZWF0ZVByb2dyYW0oKSxcbiAgICBwcm9ncmFtTGlnaHQgPSBnbC5jcmVhdGVQcm9ncmFtKCksXG4gICAgdnNoUGFzcyAgICAgID0gZ2wuY3JlYXRlU2hhZGVyKGdsLlZFUlRFWF9TSEFERVIpLFxuICAgIGZzaFBhc3MgICAgICA9IGdsLmNyZWF0ZVNoYWRlcihnbC5GUkFHTUVOVF9TSEFERVIpLFxuICAgIHZzaExpZ2h0ICAgICA9IGdsLmNyZWF0ZVNoYWRlcihnbC5WRVJURVhfU0hBREVSKSxcbiAgICBmc2hMaWdodCAgICAgPSBnbC5jcmVhdGVTaGFkZXIoZ2wuRlJBR01FTlRfU0hBREVSKSxcbiAgICBleHREcmF3YnVmZmVycywgZXh0RGVwdGhUZXh0dXJlLFxuICAgIHZzcmNQYXNzLCB2c3JjTGlnaHQsIGZzcmNQYXNzLCBmc3JjTGlnaHQ7XG5cbnZzcmNQYXNzICA9IFwidW5pZm9ybSBtYXQ0IHByb2plY3Rpb24sIHZpZXdtb2RlbDtcXG51bmlmb3JtIG1hdDMgbm9ybWFsTTtcXG5cXG5hdHRyaWJ1dGUgdmVjMyB2ZXJ0ZXgsIG5vcm1hbCwgdXYsIGV4dHJhO1xcblxcbnZhcnlpbmcgdmVjNCB2UG9zaXRpb247XFxudmFyeWluZyB2ZWMzIHRleFVWLCB2Tm9ybWFsLCB2RXh0cmE7XFxuXFxudm9pZCBtYWluKCkge1xcbiAgXFxuICB2ZWM0IHZpZXdQb3MgPSB2aWV3bW9kZWwgKiB2ZWM0KHZlcnRleCwgMS4pO1xcbiAgZ2xfUG9zaXRpb24gPSBwcm9qZWN0aW9uICogdmlld1BvcztcXG5cXG4gIHZQb3NpdGlvbiA9IHZpZXdQb3M7XFxuICB2Tm9ybWFsID0gbm9ybWFsaXplKG5vcm1hbE0gKiBub3JtYWwpO1xcbiAgdkV4dHJhID0gZXh0cmE7XFxuICB0ZXhVViA9IHV2O1xcblxcbn1cXG5cXG5cIjtcbmZzcmNQYXNzICA9IFwiI2V4dGVuc2lvbiBHTF9PRVNfc3RhbmRhcmRfZGVyaXZhdGl2ZXMgOiByZXF1aXJlXFxuI2V4dGVuc2lvbiBHTF9FWFRfZHJhd19idWZmZXJzIDogcmVxdWlyZVxcblxcbnByZWNpc2lvbiBoaWdocCBmbG9hdDtcXG5cXG52YXJ5aW5nIHZlYzQgdlBvc2l0aW9uO1xcbnZhcnlpbmcgdmVjMyB0ZXhVViwgdk5vcm1hbCwgdkV4dHJhO1xcblxcbi8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vXFxuLy8gaHR0cHM6Ly9naXRodWIuY29tL2FzaGltYS93ZWJnbC1ub2lzZS9ibG9iL21hc3Rlci9zcmMvbm9pc2UyRC5nbHNsICAgICAgICAgLy9cXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xcblxcbnZlYzMgbW9kMjg5KHZlYzMgeCkgeyByZXR1cm4geCAtIGZsb29yKHggKiAoMS4wIC8gMjg5LjApKSAqIDI4OS4wOyB9XFxudmVjMiBtb2QyODkodmVjMiB4KSB7IHJldHVybiB4IC0gZmxvb3IoeCAqICgxLjAgLyAyODkuMCkpICogMjg5LjA7IH1cXG52ZWMzIHBlcm11dGUodmVjMyB4KSB7IHJldHVybiBtb2QyODkoKCh4KjM0LjApKzEuMCkqeCk7IH1cXG5mbG9hdCBzbm9pc2UodmVjMiB2KSB7XFxuICBjb25zdCB2ZWM0IEMgPSB2ZWM0KDAuMjExMzI0ODY1NDA1MTg3LCAgLy8gKDMuMC1zcXJ0KDMuMCkpLzYuMFxcbiAgICAgICAgICAgICAgICAgICAgICAwLjM2NjAyNTQwMzc4NDQzOSwgIC8vIDAuNSooc3FydCgzLjApLTEuMClcXG4gICAgICAgICAgICAgICAgICAgICAtMC41NzczNTAyNjkxODk2MjYsICAvLyAtMS4wICsgMi4wICogQy54XFxuICAgICAgICAgICAgICAgICAgICAgIDAuMDI0MzkwMjQzOTAyNDM5KTsgLy8gMS4wIC8gNDEuMFxcbiAgdmVjMiBpICA9IGZsb29yKHYgKyBkb3QodiwgQy55eSkgKTtcXG4gIHZlYzIgeDAgPSB2IC0gICBpICsgZG90KGksIEMueHgpO1xcbiAgdmVjMiBpMTtcXG4gIGkxID0gKHgwLnggPiB4MC55KSA/IHZlYzIoMS4wLCAwLjApIDogdmVjMigwLjAsIDEuMCk7XFxuICB2ZWM0IHgxMiA9IHgwLnh5eHkgKyBDLnh4eno7XFxuICB4MTIueHkgLT0gaTE7XFxuICBpID0gbW9kMjg5KGkpO1xcbiAgdmVjMyBwID0gcGVybXV0ZSggcGVybXV0ZSggaS55ICsgdmVjMygwLjAsIGkxLnksIDEuMCApKVxcblxcdFxcdCsgaS54ICsgdmVjMygwLjAsIGkxLngsIDEuMCApKTtcXG4gIHZlYzMgbSA9IG1heCgwLjUgLSB2ZWMzKGRvdCh4MCx4MCksIGRvdCh4MTIueHkseDEyLnh5KSwgZG90KHgxMi56dyx4MTIuencpKSwgMC4wKTtcXG4gIG0gPSBtKm0gO1xcbiAgbSA9IG0qbSA7XFxuICB2ZWMzIHggPSAyLjAgKiBmcmFjdChwICogQy53d3cpIC0gMS4wO1xcbiAgdmVjMyBoID0gYWJzKHgpIC0gMC41O1xcbiAgdmVjMyBveCA9IGZsb29yKHggKyAwLjUpO1xcbiAgdmVjMyBhMCA9IHggLSBveDtcXG4gIG0gKj0gMS43OTI4NDI5MTQwMDE1OSAtIDAuODUzNzM0NzIwOTUzMTQgKiAoIGEwKmEwICsgaCpoICk7XFxuICB2ZWMzIGc7XFxuICBnLnggID0gYTAueCAgKiB4MC54ICArIGgueCAgKiB4MC55O1xcbiAgZy55eiA9IGEwLnl6ICogeDEyLnh6ICsgaC55eiAqIHgxMi55dztcXG4gIHJldHVybiAxMzAuMCAqIGRvdChtLCBnKTtcXG59XFxuXFxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cXG4vLyBQcm9jZWR1cmFsIHRleHR1cmVzXFxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cXG5cXG52ZWMzIGJ1bXBNYXAodmVjMyBmdmVydCwgdmVjMyBmbm9ybSwgZmxvYXQgYnVtcCkge1xcblxcbiAgdmVjMyBiVSA9IGRGZHgoYnVtcCkgKiBjcm9zcyhmbm9ybSwgbm9ybWFsaXplKGRGZHkoZnZlcnQpKSksXFxuICAgICAgIGJWID0gZEZkeShidW1wKSAqIGNyb3NzKG5vcm1hbGl6ZShkRmR4KGZ2ZXJ0KSksIGZub3JtKSxcXG4gICAgICAgYkQgPSBmbm9ybSArIC41ICogKGJVICsgYlYpO1xcblxcbiAgcmV0dXJuIG5vcm1hbGl6ZShiRCk7XFxufVxcblxcbnN0cnVjdCBUVGV4dHVyZUluZm8ge1xcbiAgdmVjMyBjb2xvcjtcXG4gIHZlYzMgbm9ybWFsO1xcbn07XFxuXFxuI2RlZmluZSB0ZXh0dXJlQnJpY2tJKHgsIHAsIG5vdHApICgoZmxvb3IoeCkqKHApKSttYXgoZnJhY3QoeCktKG5vdHApLCAwLjApKVxcblRUZXh0dXJlSW5mbyB0ZXh0dXJlQnJpY2sodmVjMyBmdmVydCwgdmVjMyBmbm9ybSwgZmxvYXQgZmRlcHRoLCB2ZWMyIHV2LCB2ZWMzIGJyaWNrQ29sb3IpIHtcXG5cXG4gIGNvbnN0IGZsb2F0IGJXICA9IC4xMjUsXFxuICAgICAgICAgICAgICBiSCAgPSAuMDYyNSxcXG4gICAgICAgICAgICAgIG1TICA9IDEuIC8gMTI4LixcXG4gICAgICAgICAgICAgIG1XZiA9IG1TICogLjUgLyBiVyxcXG4gICAgICAgICAgICAgIG1IZiA9IG1TICogLjUgLyBiSDtcXG4gIGNvbnN0IHZlYzMgbW9ydGFyQ29sb3IgPSB2ZWMzKC45LCAuOSwgLjkpO1xcblxcbiAgZmxvYXQgdSA9IHV2LnMgLyBiVyxcXG4gICAgICAgIHYgPSB1di50IC8gYkgsXFxuICAgICAgICBiclUgPSBmbG9vcih1KSxcXG4gICAgICAgIGJyViA9IGZsb29yKHYpO1xcblxcbiAgaWYobW9kKHYgKiAuNSwgMS4pID4gLjUpXFxuICAgIHUgKz0gLjU7XFxuICBiclUgPSBmbG9vcih1KTtcXG5cXG4gIGZsb2F0IG5vaXNldiA9IDEuICtcXG4gICAgICAgICAgICAgICAgIC8vc25vaXNlKHV2ICogMTYuKSAqIC4wNjI1ICtcXG4gICAgICAgICAgICAgICAgIHNub2lzZSh1diAqIDY0LikgKiAuMTI1O1xcbiAgZmxvYXQgYnJpY2tEYW1wID0gMS4gKyAuMTI1ICogc2luKDEuNTcgKiAoYnJVICsgMS4pKSAqIHNpbigyLiAqIChiclYgKyAxLikpO1xcblxcbiAgdmVjMiB1dXYgPSB2ZWMyKHUsIHYpLFxcbiAgICAgICBmdyA9IDIuICogdmVjMihmd2lkdGgodXV2LngpLCBmd2lkdGgodXV2LnkpKSxcXG4gICAgICAgbW9ydGFyUGN0ID0gdmVjMihtV2YsIG1IZiksXFxuICAgICAgIGJyaWNrUGN0ID0gdmVjMigxLiwgMS4pIC0gbW9ydGFyUGN0LFxcbiAgICAgICB1YiA9ICh0ZXh0dXJlQnJpY2tJKHV1diArIGZ3LCBicmlja1BjdCwgbW9ydGFyUGN0KSAtXFxuICAgICAgICAgICAgIHRleHR1cmVCcmlja0kodXV2LCBicmlja1BjdCwgbW9ydGFyUGN0KSkgLyBmdztcXG5cXG4gIHZlYzMgY29sb3IgPSBtaXgobW9ydGFyQ29sb3IsIGJyaWNrQ29sb3IgKiBicmlja0RhbXAsIHViLnggKiB1Yi55KTtcXG5cXG4gIGZsb2F0IGJ1bXAgPSBub2lzZXYgLyBmZGVwdGggKyAodWIueCAqIHViLnkpIC0gZEZkeCh1Yi54KSAqIGRGZHkodWIueSk7XFxuXFxuICByZXR1cm4gVFRleHR1cmVJbmZvKFxcbiAgICBjb2xvcixcXG4gICAgYnVtcE1hcChmdmVydCwgZm5vcm0sIGJ1bXApXFxuICApO1xcbn1cXG5cXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXFxcXFxcbiAqIFdpbmRvdyB0ZXh0dXJlXFxuXFxcXCoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cXG5cXG5UVGV4dHVyZUluZm8gdGV4dHVyZVdpbmRvdyh2ZWMzIGZ2ZXJ0LCB2ZWMzIGZub3JtLCBmbG9hdCBmZGVwdGgsIHZlYzIgdXYsIHZlYzMgd2luZG93Q29sb3IpIHtcXG5cXG4gIGNvbnN0IHZlYzIgcGF0dGVyblBjdCAgID0gdmVjMigxLiwgMS4pLFxcbiAgICAgICAgICAgICBwYXR0ZXJuU3RhcnQgPSB2ZWMyKDAuLCAwLiksIC8vKDEuIC0gcGF0dGVyblBjdCkgKiAuMjUsXFxuICAgICAgICAgICAgIHBhdHRlcm5FbmQgICA9IHBhdHRlcm5TdGFydCArIHBhdHRlcm5QY3QsXFxuICAgICAgICAgICAgIGZyYW1lUGN0ICAgICA9IHZlYzIoMS4gLyAzMi4sIDEuIC8gMzIuKSxcXG4gICAgICAgICAgICAgZnJhbWVTdGFydCAgID0gcGF0dGVyblN0YXJ0ICsgZnJhbWVQY3QsXFxuICAgICAgICAgICAgIGZyYW1lRW5kICAgICA9IHBhdHRlcm5FbmQgICAtIGZyYW1lUGN0O1xcbiAgLy9jb25zdCB2ZWMzIHdpbmRvd0NvbG9yICA9IHZlYzMoLjgsIC45NCwgLjk5KSxcXG4gIGNvbnN0IHZlYzMgZnJhbWVDb2xvciAgID0gdmVjMyguNSwgLjUsIC41KTtcXG5cXG4gIHZlYzIgZmsgICA9IGZ3aWR0aCh1dikgKiAyLixcXG4gICAgICAgdXV2ICA9IG1vZCh1diwgLjUgLSAxLiAvIDY0LiksXFxuICAgICAgIHBhdEYgPSAoc21vb3Roc3RlcChmcmFtZUVuZCwgZnJhbWVFbmQgKyBmaywgdXV2KSAtIHNtb290aHN0ZXAoZnJhbWVTdGFydCwgZnJhbWVTdGFydCArIGZrLCB1dXYpKTtcXG4gIGZsb2F0IG5vaXNlcCA9IDEuICsgXFxuICAgICAgICAgICAgICAgIHNub2lzZSgtdXYgKiAuNSkgKiAuMjU7XFxuICBmbG9hdCBub2lzZXYgPSAxLiArIFxcbiAgICAgICAgICAgICAgICAgc25vaXNlKHV2ICogMTYuKSAqIC4wNjI1ICtcXG4gICAgICAgICAgICAgICAgIGFicyhzbm9pc2UodXYgKiA1MTIuKSkgKiAuMDYyNTtcXG5cXG4gIHJldHVybiBUVGV4dHVyZUluZm8oXFxuICAgIG1peChmcmFtZUNvbG9yLCB3aW5kb3dDb2xvciAqIG5vaXNlcCwgcGF0Ri54ICogcGF0Ri55KSxcXG4gICAgYnVtcE1hcChmdmVydCwgZm5vcm0sIHBhdEYueCAqIHBhdEYueSlcXG4gICk7XFxufVxcblxcbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcXFxcXFxuICogUm9hZCB0ZXh0dXJlXFxuXFxcXCoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cXG5cXG52ZWMzIHRleHR1cmVSb2FkKHZlYzIgdXV2KSB7XFxuICBjb25zdCBmbG9hdCBwYWRkaW5nID0gMS4gLyAzMi4sXFxuICAgICAgICAgICAgICB0YXBlVyAgID0gMS4gLyAzMi4sXFxuICAgICAgICAgICAgICB0YXBlTDAgID0gcGFkZGluZyxcXG4gICAgICAgICAgICAgIHRhcGVMMSAgPSBwYWRkaW5nICsgdGFwZVcsXFxuICAgICAgICAgICAgICB0YXBlUjEgID0gMS4gLSB0YXBlTDAsXFxuICAgICAgICAgICAgICB0YXBlUjAgID0gMS4gLSB0YXBlTDEsXFxuICAgICAgICAgICAgICB0YXBlQzAgID0gLjUgLSB0YXBlVyAqIC41LFxcbiAgICAgICAgICAgICAgdGFwZUMxICA9IC41ICsgdGFwZVcgKiAuNSxcXG4gICAgICAgICAgICAgIHZlcnREaXYgPSA0LjtcXG4gIGNvbnN0IHZlYzMgYXNwaGFsdENvbG9yID0gdmVjMyguMiwgLjIsIC4yKSxcXG4gICAgICAgICAgICAgc3RyaXBDb2xvciA9IHZlYzMoLjgsIC44LCAuOCk7XFxuXFxuICB2ZWMyIHV2ID0gdXV2ICsgdmVjMigwLCAuNSksIGZrID0gZndpZHRoKHV2KTtcXG4gIGZsb2F0IGNzU3BhY2luZyA9IG1vZCguMjUgKyB1di50ICogdmVydERpdiwgMS4pLFxcbiAgICAgICAgcSA9IFxcbiAgICAoXFxuICAgICAgc21vb3Roc3RlcCh0YXBlTDAsIHRhcGVMMCArIGZrLngsIHV2LnMpIC0gXFxuICAgICAgc21vb3Roc3RlcCh0YXBlTDEsIHRhcGVMMSArIGZrLngsIHV2LnMpXFxuICAgICkgK1xcbiAgICAoXFxuICAgICAgc21vb3Roc3RlcCh0YXBlUjAsIHRhcGVSMCArIGZrLngsIHV2LnMpIC0gXFxuICAgICAgc21vb3Roc3RlcCh0YXBlUjEsIHRhcGVSMSArIGZrLngsIHV2LnMpXFxuICAgICkgK1xcbiAgICAoXFxuICAgICAgc21vb3Roc3RlcCh0YXBlQzAsIHRhcGVDMCArIGZrLngsIHV2LnMpIC0gXFxuICAgICAgc21vb3Roc3RlcCh0YXBlQzEsIHRhcGVDMSArIGZrLngsIHV2LnMpXFxuICAgICkgKiBcXG4gICAgKFxcbiAgICAgIHNtb290aHN0ZXAoLjUgLSBmay55LCAuNSArIGZrLnksIGNzU3BhY2luZykgKlxcbiAgICAgICgxLiAtIHNtb290aHN0ZXAoMS4gLSAyLiAqIGZrLnksIDEuLCBjc1NwYWNpbmcpKVxcbiAgICApXFxuICAgIDtcXG5cXG4gIGZsb2F0IG5vaXNlQSA9IDEuICtcXG4gICAgICAgICAgICAgICAgIGFicyhzbm9pc2UodXYgKiAxNi4pKSAgKiAuMDYyNSArXFxuICAgICAgICAgICAgICAgICBhYnMoc25vaXNlKHV2ICogMzIuKSkgICogLjA2MjUgK1xcbiAgICAgICAgICAgICAgICAgYWJzKHNub2lzZSh1diAqIDEyOC4pKSAqIC4xMjUsXFxuICAgICAgICBub2lzZVMgPSAxLiArIFxcbiAgICAgICAgICAgICAgICAgYWJzKHNub2lzZSh1diAqIDEyOC4pKSAqIC4xMjU7XFxuXFxuICByZXR1cm4gbWl4KGFzcGhhbHRDb2xvciAqIG5vaXNlQSwgc3RyaXBDb2xvciAqIG5vaXNlUywgcSk7XFxufVxcblxcbnZlYzMgdGV4dHVyZUFzcGhhbHQodmVjMiB1dXYpIHtcXG4gIGNvbnN0IHZlYzMgYXNwaGFsdENvbG9yID0gdmVjMyguMiwgLjIsIC4yKTtcXG5cXG4gIHZlYzIgdXYgPSB1dXYgKyB2ZWMyKDAsIC41KTtcXG4gIGZsb2F0IG5vaXNlQSA9IDEuICtcXG4gICAgICAgICAgICAgICAgIGFicyhzbm9pc2UodXYgKiAxNi4pKSAgKiAuMDYyNSArXFxuICAgICAgICAgICAgICAgICBhYnMoc25vaXNlKHV2ICogMzIuKSkgICogLjA2MjUgK1xcbiAgICAgICAgICAgICAgICAgYWJzKHNub2lzZSh1diAqIDEyOC4pKSAqIC4xMjU7XFxuICByZXR1cm4gYXNwaGFsdENvbG9yICogMS41ICogbm9pc2VBO1xcbn1cXG4vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xcblxcbnZvaWQgbWFpbigpIHtcXG5cXG4gIFRUZXh0dXJlSW5mbyB0aTsgLy8gPSB0ZXh0dXJlQnJpY2sodlBvc2l0aW9uLnh5eiwgdk5vcm1hbC54eXosIHZOb3JtYWwudywgdGV4VVYuc3QsIHZFeHRyYS54eXopO1xcbiAgdmVjMyBjb2xvciwgbm9ybWFsO1xcblxcbiAgZmxvYXQgZGVwdGggPSBnbF9GcmFnQ29vcmQueiAvIGdsX0ZyYWdDb29yZC53O1xcblxcbiAgbm9ybWFsID0gbm9ybWFsaXplKGZhY2Vmb3J3YXJkKHZOb3JtYWwsIGdsX0ZyYWdDb29yZC54eXosIHZOb3JtYWwpKTtcXG5cXG4gIGlmKHRleFVWLnogPiA1LjEpIHtcXG4gICAgdGkgPSB0ZXh0dXJlQnJpY2sodlBvc2l0aW9uLnh5eiwgdk5vcm1hbCwgZ2xfRnJhZ0Nvb3JkLnosIG1vZCh0ZXhVVi54eSwgMS4pLCB2RXh0cmEpO1xcbiAgICBjb2xvciA9IHRpLmNvbG9yO1xcbiAgICBub3JtYWwgPSB0aS5ub3JtYWw7XFxuICB9XFxuICBlbHNlIGlmKHRleFVWLnogPiA0LjEpIHtcXG4gICAgdGkgPSB0ZXh0dXJlV2luZG93KHZQb3NpdGlvbi54eXosIHZOb3JtYWwsIGdsX0ZyYWdDb29yZC56LCBtb2QodGV4VVYueXgsIDEuKSwgdmVjMygxLiwgMS4sIC43KSk7XFxuICAgIGNvbG9yID0gdGkuY29sb3I7XFxuICAgIG5vcm1hbCA9IHRpLm5vcm1hbDtcXG4gIH1cXG4gIGVsc2UgaWYodGV4VVYueiA+IDMuMSkge1xcbiAgICB0aSA9IHRleHR1cmVXaW5kb3codlBvc2l0aW9uLnh5eiwgdk5vcm1hbCwgZ2xfRnJhZ0Nvb3JkLnosIG1vZCh0ZXhVVi55eCwgMS4pLCB2ZWMzKC4zLCAuMywgLjMpKTtcXG4gICAgY29sb3IgPSB0aS5jb2xvcjtcXG4gICAgbm9ybWFsID0gdGkubm9ybWFsO1xcbiAgfVxcbiAgZWxzZSBpZih0ZXhVVi56ID4gMi4xKVxcbiAgICBjb2xvciA9IHRleHR1cmVBc3BoYWx0KG1vZCh0ZXhVVi55eCwgMS4pKTtcXG4gIGVsc2UgaWYodGV4VVYueiA+IDEuMSlcXG4gICAgY29sb3IgPSB0ZXh0dXJlUm9hZChtb2QodGV4VVYueHksIDEuKSk7XFxuICBlbHNlXFxuICAgIGNvbG9yID0gdGV4dHVyZUFzcGhhbHQobW9kKHRleFVWLnl4LCAxLikpOyAvL3RleHR1cmVXaW5kb3codXV2LCBmZXh0cmEpO1xcblxcbiAgZ2xfRnJhZ0RhdGFbMF0gPSB2UG9zaXRpb247XFxuICBnbF9GcmFnRGF0YVsxXSA9IHZlYzQobm9ybWFsLCBkZXB0aCk7XFxuICBnbF9GcmFnRGF0YVsyXSA9IHZlYzQoY29sb3IsIDEuKTtcXG59XFxuXCI7XG52c3JjTGlnaHQgPSBcInVuaWZvcm0gbWF0NCB2aWV3TWF0cml4O1xcbnVuaWZvcm0gdmVjMyBsaWdodFBvcztcXG5cXG5hdHRyaWJ1dGUgdmVjMiBwb3NpdGlvbjtcXG4vL2F0dHJpYnV0ZSB2ZWMzIGxpZ2h0UG9zaXRpb247XFxudmFyeWluZyB2ZWMyIGNvb3JkO1xcblxcbnZhcnlpbmcgdmVjMyBsUG9zO1xcblxcbnZvaWQgbWFpbigpIHtcXG4gIGdsX1Bvc2l0aW9uID0gdmVjNChwb3NpdGlvbiwgMC4sIDEuKTtcXG4gIGNvb3JkID0gLjUgKyAuNSAqIHBvc2l0aW9uO1xcbiAgbFBvcyA9IHZlYzMoMC4sIDAuLCAwLik7IC8vKHZpZXdNYXRyaXggKiB2ZWM0KGxpZ2h0UG9zLCAxLikpLnh5ejtcXG4gIC8vbFBvcyA9ICh2aWV3TWF0cml4ICogdmVjNChsaWdodFBvcywgMS4pKS54eXo7XFxufVxcblwiO1xuZnNyY0xpZ2h0ID0gXCIjZXh0ZW5zaW9uIEdMX09FU19zdGFuZGFyZF9kZXJpdmF0aXZlcyA6IGVuYWJsZVxcbnByZWNpc2lvbiBoaWdocCBmbG9hdDtcXG5cXG4vKiAjcHJhZ21hIGdsc2xpZnk6IGZ4YWEgPSByZXF1aXJlKGdsc2wtZnhhYSkgKi9cXG5cXG51bmlmb3JtIHNhbXBsZXIyRCB0YXJnZXQwLCB0YXJnZXQxLCB0YXJnZXQyLCBkZXB0aEJ1ZmZlciwgcmFuZE1hcDtcXG51bmlmb3JtIG1hdDQgdmlld01hdHJpeDtcXG51bmlmb3JtIHZlYzMgbGlnaHRQb3M7XFxuXFxudmFyeWluZyB2ZWMyIGNvb3JkO1xcbnZhcnlpbmcgdmVjMyBsUG9zO1xcblxcbi8vdW5pZm9ybSB2ZWMzIGxpZ2h0UG9zO1xcblxcbmZsb2F0IHNhbXBsZSh2ZWMzIHAsIHZlYzMgbiwgdmVjMiB1dikge1xcbiAgdmVjMyBkc3RQID0gdGV4dHVyZTJEKHRhcmdldDAsIHV2KS54eXosXFxuICAgICAgIHBvc1YgPSBkc3RQIC0gcDtcXG5cXG4gIGZsb2F0IGludGVucyA9IG1heChkb3Qobm9ybWFsaXplKHBvc1YpLCBuKSAtIC4wNSwgMC4pLFxcbiAgICAgICAgZGlzdCA9IGxlbmd0aChwb3NWKSxcXG4gICAgICAgIGF0dCAgPSAxLiAvICgyLiArICg1LiAqIGRpc3QpKTtcXG4gIHJldHVybiBpbnRlbnMgKiBhdHQ7XFxufVxcblxcbmhpZ2hwIGZsb2F0IHJhbmQodmVjMiBjbylcXG57XFxuICAgIGhpZ2hwIGZsb2F0IGEgPSAxMi45ODk4O1xcbiAgICBoaWdocCBmbG9hdCBiID0gNzguMjMzO1xcbiAgICBoaWdocCBmbG9hdCBjID0gNDM3NTguNTQ1MztcXG4gICAgaGlnaHAgZmxvYXQgZHQ9IGRvdChjby54eSAsdmVjMihhLGIpKTtcXG4gICAgaGlnaHAgZmxvYXQgc249IG1vZChkdCwzLjE0KTtcXG4gICAgcmV0dXJuIGZyYWN0KHNpbihzbikgKiBjKTtcXG59XFxuXFxuXFxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cXG4vLyBNYWluXFxuLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cXG5cXG5cXG52b2lkIG1haW4oKSB7XFxuICAvKnZlYzMgbGlnaHRzWzRdO1xcbiAgbGlnaHRzWzBdID0gdmVjMyg2LiAtIC4wMjUsIC4yLCA2LiAtIC4wMjUpO1xcbiAgbGlnaHRzWzFdID0gdmVjMyg2LiAtIC4wMjUsIC4yLCA2LiArIC4wMjUpO1xcbiAgbGlnaHRzWzJdID0gdmVjMyg2LiArIC4wMjUsIC4yLCA2LiArIC4wMjUpO1xcbiAgbGlnaHRzWzNdID0gdmVjMyg2LiArIC4wMjUsIC4yLCA2LiAtIC4wMjUpOyovXFxuICAvKnZlYzQgdDAgPSBmeGFhKHRhcmdldDAsIGNvb3JkLCByZXMpLFxcbiAgICAgICB0MSA9IGZ4YWEodGFyZ2V0MSwgY29vcmQsIHJlcyksXFxuICAgICAgIHQyID0gZnhhYSh0YXJnZXQyLCBjb29yZCwgcmVzKTsqL1xcbiAgdmVjNCB0MCA9IHRleHR1cmUyRCh0YXJnZXQwLCBjb29yZCksXFxuICAgICAgIHQxID0gdGV4dHVyZTJEKHRhcmdldDEsIGNvb3JkKSxcXG4gICAgICAgdDIgPSB0ZXh0dXJlMkQodGFyZ2V0MiwgY29vcmQpO1xcblxcbiAgdmVjMyAgdmVydGV4ID0gdDAueHl6LFxcbiAgICAgICAgbm9ybWFsID0gbm9ybWFsaXplKHQxLnh5eiksXFxuICAgICAgICBjb2xvciAgPSB0Mi54eXo7XFxuICBmbG9hdCBkZXB0aCAgPSB0MS53O1xcblxcblxcblxcbiAgdmVjMyBsaWdodERpciA9IGxQb3MgLSB2ZXJ0ZXg7XFxuICBmbG9hdCBsYW1iZXJ0ID0gbWF4KGRvdChmYWNlZm9yd2FyZCgtbm9ybWFsLCBsaWdodERpciwgbm9ybWFsKSwgbm9ybWFsaXplKGxpZ2h0RGlyKSksIDAuKSxcXG4gICAgICAgIGRpc3QgPSBsZW5ndGgobGlnaHREaXIpLFxcbiAgICAgICAgYXR0ID0gbWluKDEuLCAxLiAvICgxLiArIDIuNSAqIGRpc3QgKyA1LiAqIGRpc3QgKiBkaXN0KSk7XFxuXFxuICAvKmZsb2F0IGxhbWJlcnQgPSAwLiwgYXR0ID0gMS47XFxuICBmb3IoaW50IGkgPSAwOyBpIDwgNDsgaSsrKSB7XFxuICAgIHZlYzMgbGlnaHREaXIgPSAodmlld01hdHJpeCAqIHZlYzQobGlnaHRzW2ldLCAxLikpLnh5eiAtIHZlcnRleDtcXG4gICAgZmxvYXQgbGxhbWJlcnQgPSBtYXgoZG90KGZhY2Vmb3J3YXJkKC1ub3JtYWwsIGxpZ2h0RGlyLCBub3JtYWwpLCBub3JtYWxpemUobGlnaHREaXIpKSwgMC4pLFxcbiAgICAgICAgICBkaXN0ID0gbGVuZ3RoKGxpZ2h0RGlyKSxcXG4gICAgICAgICAgbGF0dCA9IG1pbigxLiwgMS4gLyAoMS4gKyAuNSAqIGRpc3QgKyA1LiAqIGRpc3QgKiBkaXN0KSk7XFxuICAgIGxhbWJlcnQgKz0gbGxhbWJlcnQgKiBsYXR0ICogLjI1O1xcbiAgfSovXFxuXFxuICAvLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy9cXG4gIC8vIFNTQU9cXG4gIC8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vLy8vL1xcbiAgdmVjMiBrZXJuZWxbNF07XFxuICBrZXJuZWxbMF0gPSB2ZWMyKDAuLCAxLik7XFxuICBrZXJuZWxbMV0gPSB2ZWMyKDEuLCAwLik7XFxuICBrZXJuZWxbMl0gPSB2ZWMyKDAuLCAtMS4pO1xcbiAga2VybmVsWzNdID0gdmVjMigtMS4sIDAuKTtcXG5cXG4gIGNvbnN0IGZsb2F0IHNpbjQ1ID0gLjcwNzEwNywgc1JhZCA9IDQwLjtcXG5cXG4gIGZsb2F0IG9jY2x1c2lvbiA9IDAuLCBrUmFkID0gc1JhZCAqICgxLiAtIGRlcHRoKTtcXG5cXG4gIGZvcihpbnQgaSA9IDA7IGkgPCA0OyArK2kpIHtcXG4gICAgdmVjMiBrMSA9IHJlZmxlY3Qoa2VybmVsW2ldLCAuNiAqIHZlYzIocmFuZChzaW4oY29vcmQpKSwgcmFuZCgtY29vcmQpKSk7XFxuICAgIHZlYzIgazIgPSB2ZWMyKGsxLnggKiBzaW40NSAtIGsxLnkgKiBzaW40NSxcXG4gICAgICAgICAgICAgICAgICAgazEueCAqIHNpbjQ1ICsgazEueSAqIHNpbjQ1KTtcXG4gICAgb2NjbHVzaW9uICs9IHNhbXBsZSh2ZXJ0ZXgsIG5vcm1hbCwgY29vcmQgKyBrMSAqIGtSYWQpO1xcbiAgICBvY2NsdXNpb24gKz0gc2FtcGxlKHZlcnRleCwgbm9ybWFsLCBjb29yZCArIGsxICoga1JhZCAqIC43NSk7XFxuICAgIG9jY2x1c2lvbiArPSBzYW1wbGUodmVydGV4LCBub3JtYWwsIGNvb3JkICsgazEgKiBrUmFkICogLjUpO1xcbiAgICBvY2NsdXNpb24gKz0gc2FtcGxlKHZlcnRleCwgbm9ybWFsLCBjb29yZCArIGsxICoga1JhZCAqIC4yNSk7XFxuICB9XFxuICBvY2NsdXNpb24gLz0gMTYuO1xcbiAgb2NjbHVzaW9uID0gY2xhbXAob2NjbHVzaW9uLCAwLiwgMS4pO1xcblxcbiAgY29sb3IgPSBjbGFtcChjb2xvciAtIG9jY2x1c2lvbiwgMC4sIDEuKTtcXG4gIGdsX0ZyYWdDb2xvciA9IHZlYzQobGFtYmVydCAqIGF0dCAqIDIuICogY29sb3IsIDEuKTtcXG4gIC8vZ2xfRnJhZ0NvbG9yID0gdmVjNChjb2xvciwgMS4pO1xcbn1cXG5cIjtcbi8qdnNyY1Bhc3MgID0gZ2xzbGlmeShfX2Rpcm5hbWUgKyAnL3NoYWRlcnMvcGFzcy12ZXJ0ZXguZ2xzbCcsICd1dGYtOCcpO1xuZnNyY1Bhc3MgID0gZ2xzbGlmeShfX2Rpcm5hbWUgKyAnL3NoYWRlcnMvcGFzcy1mcmFnbWVudC5nbHNsJywgJ3V0Zi04Jyk7XG52c3JjTGlnaHQgPSBnbHNsaWZ5KF9fZGlybmFtZSArICcvc2hhZGVycy9saWdodC12ZXJ0ZXguZ2xzbCcsICd1dGYtOCcpO1xuZnNyY0xpZ2h0ID0gZ2xzbGlmeShfX2Rpcm5hbWUgKyAnL3NoYWRlcnMvbGlnaHQtZnJhZ21lbnQuZ2xzbCcsICd1dGYtOCcpOyovXG5cbmdsLmNsZWFyQ29sb3IoMCwgMCwgMCwgMCk7XG5nbC5kZXB0aEZ1bmMoZ2wuTEVTUyk7XG5nbC5nZXRFeHRlbnNpb24oJ09FU19zdGFuZGFyZF9kZXJpdmF0aXZlcycpO1xuZ2wuZ2V0RXh0ZW5zaW9uKCdPRVNfdGV4dHVyZV9mbG9hdCcpO1xuZ2wuZ2V0RXh0ZW5zaW9uKCdPRVNfdGV4dHVyZV9mbG9hdF9saW5lYXInKTtcbmV4dERyYXdidWZmZXJzID0gZ2wuZ2V0RXh0ZW5zaW9uKCdXRUJHTF9kcmF3X2J1ZmZlcnMnKTtcbmV4dERlcHRoVGV4dHVyZSA9IGdsLmdldEV4dGVuc2lvbignV0VCR0xfZGVwdGhfdGV4dHVyZScpO1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICogR2VvbWV0cnkgcGFzcyBzaGFkZXIgY29tcGlsYXRpb24gJiBsaW5raW5nXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbmdsLnNoYWRlclNvdXJjZSh2c2hQYXNzLCB2c3JjUGFzcyk7XG5nbC5zaGFkZXJTb3VyY2UoZnNoUGFzcywgZnNyY1Bhc3MpO1xuZ2wuY29tcGlsZVNoYWRlcih2c2hQYXNzKTtcbmdsLmNvbXBpbGVTaGFkZXIoZnNoUGFzcyk7XG5nbC5hdHRhY2hTaGFkZXIocHJvZ3JhbVBhc3MsIHZzaFBhc3MpO1xuZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW1QYXNzLCBmc2hQYXNzKTtcbmdsLmxpbmtQcm9ncmFtKHByb2dyYW1QYXNzKTtcblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAqIExpZ2h0IHBhc3Mgc2hhZGVyIGNvbXBpbGF0aW9uICYgbGlua2luZ1xuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5nbC5zaGFkZXJTb3VyY2UodnNoTGlnaHQsIHZzcmNMaWdodCk7XG5nbC5zaGFkZXJTb3VyY2UoZnNoTGlnaHQsIGZzcmNMaWdodCk7XG5nbC5jb21waWxlU2hhZGVyKHZzaExpZ2h0KTtcbmdsLmNvbXBpbGVTaGFkZXIoZnNoTGlnaHQpO1xuZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW1MaWdodCwgdnNoTGlnaHQpO1xuZ2wuYXR0YWNoU2hhZGVyKHByb2dyYW1MaWdodCwgZnNoTGlnaHQpO1xuZ2wubGlua1Byb2dyYW0ocHJvZ3JhbUxpZ2h0KTtcblxuY29uc29sZS5sb2coJ1ZQOicsIGdsLmdldFNoYWRlckluZm9Mb2codnNoUGFzcyksXG4gICAgICAgICAgICAnRlA6JywgZ2wuZ2V0U2hhZGVySW5mb0xvZyhmc2hQYXNzKSxcbiAgICAgICAgICAgICdWTDonLCBnbC5nZXRTaGFkZXJJbmZvTG9nKHZzaExpZ2h0KSxcbiAgICAgICAgICAgICdGTDonLCBnbC5nZXRTaGFkZXJJbmZvTG9nKGZzaExpZ2h0KSk7XG5cbi8qKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqXG4gKiBUZXh0dXJlIE1SVHMgc2V0dXAuXG4gKiBMYXlvdXQ6ICAgIFxuICogVGFyZ2V0IDA6IHwgUG9zLnggIHwgUG9zLnkgIHwgUG9zLnogIHwgRGVwdGggIHxcbiAqIFRhcmdldCAxOiB8IE5vcm0ueCB8IE5vcm0ueSB8IE5vcm0ueiB8ID8gICAgICB8XG4gKiBUYXJnZXQgMjogfCBDb2wuciAgfCBDb2wuZyAgfCBDb2wuYiAgfCA/ICAgICAgfFxuICoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKiovXG5cbnZhciB0YXJnZXQwICAgICA9IGdsLmNyZWF0ZVRleHR1cmUoKSxcbiAgICB0YXJnZXQxICAgICA9IGdsLmNyZWF0ZVRleHR1cmUoKSxcbiAgICB0YXJnZXQyICAgICA9IGdsLmNyZWF0ZVRleHR1cmUoKSxcbiAgICBkZXB0aFRleCAgICA9IGdsLmNyZWF0ZVRleHR1cmUoKSxcbiAgICBmcmFtZWJ1ZmZlciA9IGdsLmNyZWF0ZUZyYW1lYnVmZmVyKCksXG4gICAgZHJhd2J1ZmZlcnM7XG5cbmdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIGRlcHRoVGV4KTtcbmdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5ORUFSRVNUKTtcbmdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NSU5fRklMVEVSLCBnbC5ORUFSRVNUKTtcbmdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1MsIGdsLkNMQU1QX1RPX0VER0UpO1xuZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfVCwgZ2wuQ0xBTVBfVE9fRURHRSk7XG5nbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGdsLkRFUFRIX0NPTVBPTkVOVCwgQ29udGV4dC53LCBDb250ZXh0LmgsIDAsIGdsLkRFUFRIX0NPTVBPTkVOVCwgZ2wuVU5TSUdORURfU0hPUlQsIG51bGwpO1xuICAgIFxuW3RhcmdldDAsIHRhcmdldDEsIHRhcmdldDJdLmZvckVhY2goZnVuY3Rpb24odGFyZ2V0KSB7XG4gIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRhcmdldCk7XG4gIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9NQUdfRklMVEVSLCBnbC5MSU5FQVIpO1xuICBnbC50ZXhQYXJhbWV0ZXJpKGdsLlRFWFRVUkVfMkQsIGdsLlRFWFRVUkVfTUlOX0ZJTFRFUiwgZ2wuTElORUFSKTtcbiAgZ2wudGV4UGFyYW1ldGVyaShnbC5URVhUVVJFXzJELCBnbC5URVhUVVJFX1dSQVBfUywgZ2wuQ0xBTVBfVE9fRURHRSk7XG4gIGdsLnRleFBhcmFtZXRlcmkoZ2wuVEVYVFVSRV8yRCwgZ2wuVEVYVFVSRV9XUkFQX1QsIGdsLkNMQU1QX1RPX0VER0UpO1xuICBnbC50ZXhJbWFnZTJEKGdsLlRFWFRVUkVfMkQsIDAsIGdsLlJHQkEsIENvbnRleHQudywgQ29udGV4dC5oLCAwLCBnbC5SR0JBLCBnbC5GTE9BVCwgbnVsbCk7XG59KTtcblxuZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgbnVsbCk7XG5cbmdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXIpO1xuXG50cnkge1xuICBkcmF3YnVmZmVycyA9IFtcbiAgICBleHREcmF3YnVmZmVycy5DT0xPUl9BVFRBQ0hNRU5UMF9XRUJHTCxcbiAgICBleHREcmF3YnVmZmVycy5DT0xPUl9BVFRBQ0hNRU5UMV9XRUJHTCxcbiAgICBleHREcmF3YnVmZmVycy5DT0xPUl9BVFRBQ0hNRU5UMl9XRUJHTFxuICBdO1xuICBleHREcmF3YnVmZmVycy5kcmF3QnVmZmVyc1dFQkdMKGRyYXdidWZmZXJzKTtcbiAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGdsLkRFUFRIX0FUVEFDSE1FTlQsIGdsLlRFWFRVUkVfMkQsIGRlcHRoVGV4LCAwKTtcbiAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGRyYXdidWZmZXJzWzBdLCBnbC5URVhUVVJFXzJELCB0YXJnZXQwLCAwKTtcbiAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGRyYXdidWZmZXJzWzFdLCBnbC5URVhUVVJFXzJELCB0YXJnZXQxLCAwKTtcbiAgZ2wuZnJhbWVidWZmZXJUZXh0dXJlMkQoZ2wuRlJBTUVCVUZGRVIsIGRyYXdidWZmZXJzWzJdLCBnbC5URVhUVVJFXzJELCB0YXJnZXQyLCAwKTtcbn0gY2F0Y2goZSkge31cblxuXG5nbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICogU2V0dXAgZ2xvYmFsIG1hdHJpY2VzIGFuZCBWQk9zXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbnZhciBxdWFkQnVmICAgICAgPSBnbC5jcmVhdGVCdWZmZXIoKSxcbiAgICBsaWdodEJ1ZiAgICAgPSBnbC5jcmVhdGVCdWZmZXIoKSxcbiAgICBxdWFkQXJyICAgICAgPSBbXSxcbiAgICBwcm9qZWN0aW9uICAgPSBtYXQ0LmNyZWF0ZSgpO1xuXG5mb3IodmFyIGkgPSAwOyBpIDwgMTI4OyBpKyspIHtcbiAgcXVhZEFyci5wdXNoKDEsIC0xLCAtMSwgLTEsIC0xLCAxLCAgMSwgLTEsIC0xLCAxLCAxLCAxKTtcbn1cblxuLy8gUXVhZCBkYXRhIGRpcmVjdGx5IGluIHNjcmVlbiBzcGFjZSBjb29yZGluYXRlc1xuZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHF1YWRCdWYpO1xuLy9nbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgbmV3IEZsb2F0MzJBcnJheShxdWFkQXJyKSwgZ2wuU1RBVElDX0RSQVcpO1xuZ2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIG5ldyBGbG9hdDMyQXJyYXkoWzEsIC0xLCAtMSwgLTEsIC0xLCAxLCAgMSwgLTEsIC0xLCAxLCAxLCAxXSksIGdsLlNUQVRJQ19EUkFXKTtcbmdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBudWxsKTtcblxubWF0NC5wZXJzcGVjdGl2ZShwcm9qZWN0aW9uLCBNYXRoLlBJIC8gMiwgQ29udGV4dC5hc3BlY3RSYXRpbywgLjAwMSwgMTAwMC4pO1xuXG4vKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKlxuICogVW5pZm9ybXMgYW5kIGF0dHJpYnV0ZXMgc2V0dXBcbiAqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqL1xuXG5bJ3ZlcnRleCcsICdub3JtYWwnLCAndXYnLCAnZXh0cmEnXS5mb3JFYWNoKGZ1bmN0aW9uKGkpIHtcbiAgcHJvZ3JhbVBhc3NbaV0gPSBnbC5nZXRBdHRyaWJMb2NhdGlvbihwcm9ncmFtUGFzcywgaSk7XG59KTtcblxuWydwcm9qZWN0aW9uJywgJ3ZpZXdtb2RlbCcsICdub3JtYWxNJ10uZm9yRWFjaChmdW5jdGlvbihpKSB7XG4gIHByb2dyYW1QYXNzW2ldID0gZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW1QYXNzLCBpKTtcbn0pO1xuXG5bJ3Bvc2l0aW9uJywgJ2xpZ2h0UG9zaXRpb24nXS5mb3JFYWNoKGZ1bmN0aW9uKGkpIHtcbiAgcHJvZ3JhbUxpZ2h0W2ldID0gZ2wuZ2V0QXR0cmliTG9jYXRpb24ocHJvZ3JhbUxpZ2h0LCBpKTtcbn0pO1xuXG5bJ3RhcmdldDAnLCAndGFyZ2V0MScsICd0YXJnZXQyJywgJ2RlcHRoQnVmZmVyJywgJ3ZpZXdNYXRyaXgnLCAnbGlnaHRQb3MnXS5mb3JFYWNoKGZ1bmN0aW9uKGkpIHtcbiAgcHJvZ3JhbUxpZ2h0W2ldID0gZ2wuZ2V0VW5pZm9ybUxvY2F0aW9uKHByb2dyYW1MaWdodCwgaSk7XG59KTtcblxuLyoqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKipcbiAqIFByb2NlZHVyZXMgdGhhdCBzZXR1cC9jbGVhbnVwIGJ1ZmZlcnMgYW5kIG1hdHJpY2VzIGZvciB0aGUgc2hhZGVyXG4gKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKioqKi9cbnByb2dyYW1QYXNzLmFjdGl2YXRlID0gZnVuY3Rpb24oc2NlbmUpIHtcbiAgZ2wudXNlUHJvZ3JhbShwcm9ncmFtUGFzcyk7XG4gIGdsLmJpbmRGcmFtZWJ1ZmZlcihnbC5GUkFNRUJVRkZFUiwgZnJhbWVidWZmZXIpO1xuXG4gIGdsLmVuYWJsZShnbC5ERVBUSF9URVNUKTtcbiAgZ2wuY2xlYXIoZ2wuQ09MT1JfQlVGRkVSX0JJVCB8IGdsLkRFUFRIX0JVRkZFUl9CSVQpO1xuXG4gIC8qLy9cbiAgLy8gVkJPIHNldHVwXG4gIC8vXG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBzY2VuZS52QnVmKTtcbiAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihwcm9ncmFtUGFzcy52ZXJ0ZXgsIDMsIGdsLkZMT0FULCBmYWxzZSwgMCwgMCk7XG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBzY2VuZS5uQnVmKTtcbiAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihwcm9ncmFtUGFzcy5ub3JtYWwsIDMsIGdsLkZMT0FULCBmYWxzZSwgMCwgMCk7XG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBzY2VuZS51QnVmKTtcbiAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihwcm9ncmFtUGFzcy51diwgICAgIDMsIGdsLkZMT0FULCBmYWxzZSwgMCwgMCk7XG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBzY2VuZS5lQnVmKTtcbiAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihwcm9ncmFtUGFzcy5leHRyYSwgIDMsIGdsLkZMT0FULCBmYWxzZSwgMCwgMCk7Ki9cbiAgLy9cbiAgLy8gVW5pZm9ybXMgc2V0dXBcbiAgLy9cbiAgdmFyIHZpZXdtb2RlbCA9IG1hdDQuY3JlYXRlKCksIG5vcm1hbE0gPSBtYXQzLmNyZWF0ZSgpO1xuICBtYXQ0Lm11bCh2aWV3bW9kZWwsIHNjZW5lLnZpZXcsIHNjZW5lLm1vZGVsKTtcbiAgbWF0My5ub3JtYWxGcm9tTWF0NChub3JtYWxNLCB2aWV3bW9kZWwpO1xuXG4gIGdsLnVuaWZvcm1NYXRyaXg0ZnYocHJvZ3JhbVBhc3MucHJvamVjdGlvbiwgZmFsc2UsIHByb2plY3Rpb24pO1xuICBnbC51bmlmb3JtTWF0cml4NGZ2KHByb2dyYW1QYXNzLnZpZXdtb2RlbCwgZmFsc2UsIHZpZXdtb2RlbCk7XG4gIGdsLnVuaWZvcm1NYXRyaXgzZnYocHJvZ3JhbVBhc3Mubm9ybWFsTSwgZmFsc2UsIG5vcm1hbE0pO1xuXG4gIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1QYXNzLnZlcnRleCk7XG4gIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1QYXNzLm5vcm1hbCk7XG4gIGdsLmVuYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1QYXNzLnV2KTtcbiAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbVBhc3MuZXh0cmEpO1xuXG4gIHNjZW5lLm1lc2hlcy5mb3JFYWNoKGZ1bmN0aW9uKG1lc2gpIHtcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbWVzaC52QnVmKTtcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1QYXNzLnZlcnRleCwgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbWVzaC5uQnVmKTtcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1QYXNzLm5vcm1hbCwgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbWVzaC51QnVmKTtcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1QYXNzLnV2LCAgICAgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbWVzaC5lQnVmKTtcbiAgICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1QYXNzLmV4dHJhLCAgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgICBnbC5kcmF3QXJyYXlzKGdsLlRSSUFOR0xFUywgMCwgbWVzaC5jb3VudCk7XG4gIFxuICB9KTtcblxuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbnVsbCk7XG59XG52YXIgc2MgPSBmdW5jdGlvbihsaWdodHMpIHtcbiAgY29uc29sZS5sb2cobGlnaHRzKTtcbn1cblxucHJvZ3JhbVBhc3MuZGVhY3RpdmF0ZSA9IGZ1bmN0aW9uKCkge1xuICBnbC5iaW5kRnJhbWVidWZmZXIoZ2wuRlJBTUVCVUZGRVIsIG51bGwpO1xuICBcbiAgZ2wuZGlzYWJsZVZlcnRleEF0dHJpYkFycmF5KHByb2dyYW1QYXNzLnZlcnRleCk7XG4gIGdsLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheShwcm9ncmFtUGFzcy5ub3JtYWwpO1xuICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbVBhc3MudXYpO1xuICBnbC5kaXNhYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbVBhc3MuZXh0cmEpO1xuICBnbC5kaXNhYmxlKGdsLkRFUFRIX1RFU1QpO1xufVxuXG52YXIgX19kbyA9IGZhbHNlLCBjbnQgPSAwO1xuXG5wcm9ncmFtTGlnaHQuYWN0aXZhdGUgPSBmdW5jdGlvbihzY2VuZSkge1xuICBnbC51c2VQcm9ncmFtKHByb2dyYW1MaWdodCk7XG5cbiAgZ2wuZW5hYmxlKGdsLkJMRU5EKTtcbiAgZ2wuYmxlbmRGdW5jKGdsLk9ORSwgZ2wuT05FKTtcbiAgZ2wuY2xlYXIoZ2wuQ09MT1JfQlVGRkVSX0JJVCk7XG5cbiAgLy9cbiAgLy8gVW5pZm9ybSBzZXR1cFxuICAvL1xuICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUwKTtcbiAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgdGFyZ2V0MCk7XG4gIGdsLmFjdGl2ZVRleHR1cmUoZ2wuVEVYVFVSRTEpO1xuICBnbC5iaW5kVGV4dHVyZShnbC5URVhUVVJFXzJELCB0YXJnZXQxKTtcbiAgZ2wuYWN0aXZlVGV4dHVyZShnbC5URVhUVVJFMik7XG4gIGdsLmJpbmRUZXh0dXJlKGdsLlRFWFRVUkVfMkQsIHRhcmdldDIpO1xuICBnbC5hY3RpdmVUZXh0dXJlKGdsLlRFWFRVUkUzKTtcbiAgZ2wuYmluZFRleHR1cmUoZ2wuVEVYVFVSRV8yRCwgZGVwdGhUZXgpO1xuICAvL1xuICAvLyBWQk8gc2V0dXBcbiAgLy9cbiAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIHF1YWRCdWYpO1xuICBnbC52ZXJ0ZXhBdHRyaWJQb2ludGVyKHByb2dyYW1MaWdodC5wb3NpdGlvbiwgMiwgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcblxuICBnbC51bmlmb3JtMWkocHJvZ3JhbUxpZ2h0LnRhcmdldDAsIDApO1xuICBnbC51bmlmb3JtMWkocHJvZ3JhbUxpZ2h0LnRhcmdldDEsIDEpO1xuICBnbC51bmlmb3JtMWkocHJvZ3JhbUxpZ2h0LnRhcmdldDIsIDIpO1xuICBnbC51bmlmb3JtMWkocHJvZ3JhbUxpZ2h0LmRlcHRoQnVmZmVyLCAzKTtcblxuICBnbC51bmlmb3JtTWF0cml4NGZ2KHByb2dyYW1MaWdodC52aWV3TWF0cml4LCBmYWxzZSwgc2NlbmUudmlldyk7XG5cbiAgZ2wuZW5hYmxlVmVydGV4QXR0cmliQXJyYXkocHJvZ3JhbUxpZ2h0LnBvc2l0aW9uKTtcbiAgLy9nbC5lbmFibGVWZXJ0ZXhBdHRyaWJBcnJheShwcm9ncmFtTGlnaHQubGlnaHRQb3NpdGlvbik7XG5cbiAgZ2wudW5pZm9ybTNmdihwcm9ncmFtTGlnaHQubGlnaHRQb3MsIHNjZW5lLmxpZ2h0UG9zKTsgLy9bMCwuMDI1LC0uMDVdKTtcbiAgZ2wuZHJhd0FycmF5cyhnbC5UUklBTkdMRVMsIDAsIDYpO1xuICAvKnZhciBJID0gc2NlbmUubGlnaHRzLmxlbmd0aDtcbiAgaWYoSSA+IDAgJiYgX19kbyA9PT0gZmFsc2UpIHtcblxuICAgIHZhciBsdiA9IG5ldyBGbG9hdDMyQXJyYXkoSSAqIDE4KTtcbiAgICBmb3IodmFyIGkgPSAwOyBpIDwgSTsgaSsrKSB7XG4gICAgICB2YXIgaWkgPSBpICogMztcbiAgICAgIGZvcih2YXIgaiA9IDA7IGogPCAxODsgaisrKSB7XG4gICAgICAgIGx2W2lpICsgal0gPSBzY2VuZS5saWdodHNbaV1baiAlIDNdO1xuICAgICAgfVxuICAgIH1cbiAgICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgbGlnaHRCdWYpO1xuICAgIGdsLmJ1ZmZlckRhdGEoZ2wuQVJSQVlfQlVGRkVSLCBsdiwgZ2wuU1RBVElDX0RSQVcpO1xuICAgIGNudCA9IEk7XG4gICAgY29uc29sZS5sb2coY250KVxuICAgIF9fZG8gPSB0cnVlO1xuICAgIFxuICB9XG5cbiAgZ2wuYmluZEJ1ZmZlcihnbC5BUlJBWV9CVUZGRVIsIGxpZ2h0QnVmKTtcbiAgZ2wudmVydGV4QXR0cmliUG9pbnRlcihwcm9ncmFtTGlnaHQubGlnaHRQb3NpdGlvbiwgMywgZ2wuRkxPQVQsIGZhbHNlLCAwLCAwKTtcbiAgZ2wuZHJhd0FycmF5cyhnbC5UUklBTkdMRVMsIDAsIGNudCAqIDYpOyovXG59XG5cbnByb2dyYW1MaWdodC5kZWFjdGl2YXRlID0gZnVuY3Rpb24oKSB7XG4gIGdsLmRpc2FibGVWZXJ0ZXhBdHRyaWJBcnJheShwcm9ncmFtTGlnaHQucG9zaXRpb24pO1xuICBnbC5kaXNhYmxlKGdsLkJMRU5EKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHJlbmRlcjogZnVuY3Rpb24oc2NlbmUpIHtcbiAgICBwcm9ncmFtUGFzcy5hY3RpdmF0ZShzY2VuZSk7XG4gICAgcHJvZ3JhbVBhc3MuZGVhY3RpdmF0ZSgpO1xuICAgIHByb2dyYW1MaWdodC5hY3RpdmF0ZShzY2VuZSk7XG4gICAgcHJvZ3JhbUxpZ2h0LmRlYWN0aXZhdGUoKTtcbiAgfVxufVxuIiwidmFyIFNoYXBlR3JhbW1hciA9IHJlcXVpcmUoJy4vLi4vbGliL1NoYXBlR3JhbW1hcicpLFxuICAgIFNIQVBFICAgICAgICA9IHJlcXVpcmUoJy4uL2xpYi9TSEFQRS5qcycpLFxuICAgIGVhcmN1dCAgICAgICA9IHJlcXVpcmUoJ2VhcmN1dCcpLFxuICAgIEdlb20gICAgICAgICA9IHJlcXVpcmUoJy4vLi4vbGliL0dlb20nKSxcbiAgICBQUk5HICAgICAgICAgPSByZXF1aXJlKCcuL1BSTkcnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF1Z21lbnQ6IGZ1bmN0aW9uKHNoZykge1xuICAgIHNoZy5kZWZpbmUoJ0JhbGNvbnknLCBudWxsLCBudWxsLCBudWxsLCBmdW5jdGlvbigpIHtcblxuICAgICAgdmFyIHAgPSB0aGlzLnBvaW50cyxcbiAgICAgICAgICBmbG9vckZhY2UsIGZsb29yRmFjZTEsIGJvcmRlciwgZmVuY2U7XG5cbiAgICAgIGlmKE1hdGguYWJzKHRoaXMuY29zKSA8IDEwZS0xKSB7XG4gICAgICAgIGZsb29yRmFjZSAgPSB7IFxuICAgICAgICAgIHN5bTogJ0JhbGNvbnlGbG9vcicsIFxuICAgICAgICAgIHgwOiBwLngwLCB5MDogcC55MCwgejA6IHAuejAsXG4gICAgICAgICAgeDE6IHAueDEsIHkxOiBwLnkxLCB6MTogcC56MSxcbiAgICAgICAgICB4MjogcC54MiwgeTI6IHAueTIsIHoyOiBwLnoyLFxuICAgICAgICAgIHgzOiBwLngzLCB5MzogcC55MywgejM6IHAuejMsXG4gICAgICAgICAgZXh0cnVkZUJvcmRlcnM6IHRoaXMuZmxvb3JIZWlnaHRcbiAgICAgICAgfSxcbiAgICAgICAgZmxvb3JGYWNlMSA9IHsgXG4gICAgICAgICAgc3ltOiAnQmFsY29ueUZsb29yJywgXG4gICAgICAgICAgeDA6IHAueDAsIHkwOiBwLnkwICsgdGhpcy5mbG9vckhlaWdodCwgejA6IHAuejAsXG4gICAgICAgICAgeDE6IHAueDEsIHkxOiBwLnkxICsgdGhpcy5mbG9vckhlaWdodCwgejE6IHAuejEsXG4gICAgICAgICAgeDI6IHAueDIsIHkyOiBwLnkyICsgdGhpcy5mbG9vckhlaWdodCwgejI6IHAuejIsXG4gICAgICAgICAgeDM6IHAueDMsIHkzOiBwLnkzICsgdGhpcy5mbG9vckhlaWdodCwgejM6IHAuejNcbiAgICAgICAgfSxcbiAgICAgICAgYm9yZGVyID0gU0hBUEUuZXh0cnVkZUFsbChbXG4gICAgICAgICAgeyB4OiBwLngwLCB5OiBwLnkwLCB6OiBwLnowIH0sXG4gICAgICAgICAgeyB4OiBwLngxLCB5OiBwLnkxLCB6OiBwLnoxIH0sXG4gICAgICAgICAgeyB4OiBwLngyLCB5OiBwLnkyLCB6OiBwLnoyIH0sXG4gICAgICAgICAgeyB4OiBwLngzLCB5OiBwLnkzLCB6OiBwLnozIH1cbiAgICAgICAgXSwgdGhpcy5mbG9vckhlaWdodCwgJ1RRdWFkJyksXG4gICAgICAgIGZlbmNlID0gU0hBUEUuZXh0cnVkZUFsbChbXG4gICAgICAgICAgeyB4OiBwLngwLCB5OiBwLnkwICsgdGhpcy5mbG9vckhlaWdodCwgejogcC56MCB9LFxuICAgICAgICAgIHsgeDogcC54MSwgeTogcC55MSArIHRoaXMuZmxvb3JIZWlnaHQsIHo6IHAuejEgfSxcbiAgICAgICAgICB7IHg6IHAueDIsIHk6IHAueTIgKyB0aGlzLmZsb29ySGVpZ2h0LCB6OiBwLnoyIH0sXG4gICAgICAgICAgeyB4OiBwLngzLCB5OiBwLnkzICsgdGhpcy5mbG9vckhlaWdodCwgejogcC56MyB9XG4gICAgICAgIF0sIHRoaXMuZmVuY2VIZWlnaHQsICdGZW5jZScpO1xuICAgICAgfSBlbHNlIHsgXG4gICAgICAgIGZsb29yRmFjZSAgPSB7IFxuICAgICAgICAgIHN5bTogJ0JhbGNvbnlGbG9vclJvdCcsIFxuICAgICAgICAgIHgwOiBwLngwLCB5MDogcC55MCwgejA6IHAuejAsXG4gICAgICAgICAgeDE6IHAueDEsIHkxOiBwLnkxLCB6MTogcC56MSxcbiAgICAgICAgICB4MjogcC54MiwgeTI6IHAueTIsIHoyOiBwLnoyLFxuICAgICAgICAgIHgzOiBwLngzLCB5MzogcC55MywgejM6IHAuejMsXG4gICAgICAgICAgZXh0cnVkZUJvcmRlcnM6IHRoaXMuZmxvb3JIZWlnaHRcbiAgICAgICAgfSxcbiAgICAgICAgZmxvb3JGYWNlMSA9IHsgXG4gICAgICAgICAgc3ltOiAnQmFsY29ueUZsb29yUm90JywgXG4gICAgICAgICAgeDA6IHAueDAsIHkwOiBwLnkwICsgdGhpcy5mbG9vckhlaWdodCwgejA6IHAuejAsXG4gICAgICAgICAgeDE6IHAueDEsIHkxOiBwLnkxICsgdGhpcy5mbG9vckhlaWdodCwgejE6IHAuejEsXG4gICAgICAgICAgeDI6IHAueDIsIHkyOiBwLnkyICsgdGhpcy5mbG9vckhlaWdodCwgejI6IHAuejIsXG4gICAgICAgICAgeDM6IHAueDMsIHkzOiBwLnkzICsgdGhpcy5mbG9vckhlaWdodCwgejM6IHAuejNcbiAgICAgICAgfSxcbiAgICAgICAgYm9yZGVyID0gU0hBUEUuZXh0cnVkZUFsbChbXG4gICAgICAgICAgeyB4OiBwLngwLCB5OiBwLnkwLCB6OiBwLnowIH0sXG4gICAgICAgICAgeyB4OiBwLngxLCB5OiBwLnkxLCB6OiBwLnoxIH0sXG4gICAgICAgICAgeyB4OiBwLngyLCB5OiBwLnkyLCB6OiBwLnoyIH0sXG4gICAgICAgICAgeyB4OiBwLngzLCB5OiBwLnkzLCB6OiBwLnozIH1cbiAgICAgICAgXSwgdGhpcy5mbG9vckhlaWdodCwgJ1RRdWFkJyksXG4gICAgICAgIGZlbmNlID0gU0hBUEUuZXh0cnVkZUFsbChbXG4gICAgICAgICAgeyB4OiBwLngwLCB5OiBwLnkwICsgdGhpcy5mbG9vckhlaWdodCwgejogcC56MCB9LFxuICAgICAgICAgIHsgeDogcC54MSwgeTogcC55MSArIHRoaXMuZmxvb3JIZWlnaHQsIHo6IHAuejEgfSxcbiAgICAgICAgICB7IHg6IHAueDIsIHk6IHAueTIgKyB0aGlzLmZsb29ySGVpZ2h0LCB6OiBwLnoyIH0sXG4gICAgICAgICAgeyB4OiBwLngzLCB5OiBwLnkzICsgdGhpcy5mbG9vckhlaWdodCwgejogcC56MyB9XG4gICAgICAgIF0sIHRoaXMuZmVuY2VIZWlnaHQsICdGZW5jZScpO1xuICAgICAgfVxuXG4gICAgICBmZW5jZS5wb3AoKTtcbiAgICAgIGJvcmRlci5wdXNoLmFwcGx5KGJvcmRlciwgZmVuY2UpXG4gICAgICBib3JkZXIucHVzaChmbG9vckZhY2UsIGZsb29yRmFjZTEpO1xuICAgICAgcmV0dXJuIGJvcmRlcjtcblxuICAgIH0pO1xuXG4gICAgc2hnLmRlZmluZSgnQmFsY29ueUZsb29yJywgbnVsbCwgbnVsbCwgbnVsbCwgZnVuY3Rpb24oKSB7XG5cbiAgICAgIHZhciBmbCA9IFNIQVBFLnNwbGl0WFoodGhpcywgWyAuOCwgLjE1LCAuMDUgXSwgWyAuMDUsIC40NSwgLjUgXSwgJ1RRdWFkJyksXG4gICAgICAgICAgcCA9IGZsLnNwbGljZSg0LCAxKS5zaGlmdCgpO1xuXG4gICAgICBpZignZXh0cnVkZUJvcmRlcnMnIGluIHRoaXMpIHtcbiAgICAgICAgdmFyIGJvcmRlcnMgPSBTSEFQRS5leHRydWRlQWxsKFtcbiAgICAgICAgICB7IHg6IHAueDAsIHk6IHAueTAsIHo6IHAuejAgfSxcbiAgICAgICAgICB7IHg6IHAueDEsIHk6IHAueTEsIHo6IHAuejEgfSxcbiAgICAgICAgICB7IHg6IHAueDIsIHk6IHAueTIsIHo6IHAuejIgfSxcbiAgICAgICAgICB7IHg6IHAueDMsIHk6IHAueTMsIHo6IHAuejMgfVxuICAgICAgICBdLCB0aGlzLmV4dHJ1ZGVCb3JkZXJzLCAnVFF1YWQnKTtcbiAgICAgICAgZmwucHVzaC5hcHBseShmbCwgYm9yZGVycyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBmbDtcblxuICAgIH0pO1xuXG4gICAgc2hnLmRlZmluZSgnQmFsY29ueUZsb29yUm90JywgbnVsbCwgbnVsbCwgbnVsbCwgZnVuY3Rpb24oKSB7XG5cbiAgICAgIHZhciBmbCA9IFNIQVBFLnNwbGl0WlgodGhpcywgWyAuMDUsIC40NSwgLjUgXSwgWyAuOCwgLjE1LCAuMDUgXSwgJ1RRdWFkJyksXG4gICAgICAgICAgcCA9IGZsLnNwbGljZSg0LCAxKS5zaGlmdCgpO1xuXG4gICAgICBpZignZXh0cnVkZUJvcmRlcnMnIGluIHRoaXMpIHtcbiAgICAgICAgdmFyIGJvcmRlcnMgPSBTSEFQRS5leHRydWRlQWxsKFtcbiAgICAgICAgICB7IHg6IHAueDAsIHk6IHAueTAsIHo6IHAuejAgfSxcbiAgICAgICAgICB7IHg6IHAueDEsIHk6IHAueTEsIHo6IHAuejEgfSxcbiAgICAgICAgICB7IHg6IHAueDIsIHk6IHAueTIsIHo6IHAuejIgfSxcbiAgICAgICAgICB7IHg6IHAueDMsIHk6IHAueTMsIHo6IHAuejMgfVxuICAgICAgICBdLCB0aGlzLmV4dHJ1ZGVCb3JkZXJzLCAnVFF1YWQnKTtcbiAgICAgICAgZmwucHVzaC5hcHBseShmbCwgYm9yZGVycyk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuc3ltID0gJ1RRdWFkJztcbiAgICAgIHJldHVybiBmbDtcblxuICAgIH0pO1xuXG4gICAgc2hnLmRlZmluZSgnRmVuY2UnLCBudWxsLCBudWxsLCBudWxsLCBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBzdGlja0Jhc2UgPSBTSEFQRS5maXQoJ3gnLCB0aGlzLCAnU3RpY2tCYXNlJywgLjI1KSxcbiAgICAgICAgICBkeCA9IHRoaXMueDMgLSB0aGlzLngwLFxuICAgICAgICAgIGR5ID0gdGhpcy55MSAtIHRoaXMueTAsXG4gICAgICAgICAgZHogPSB0aGlzLnozIC0gdGhpcy56MCxcbiAgICAgICAgICBhbmdsZSA9IE1hdGguYXRhbjIoZHosIGR4KSAtIE1hdGguUEkgLyAyLFxuICAgICAgICAgIHdpZHRoID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeiAqIGR6KSxcbiAgICAgICAgICBwID0geyAvLyBIYW5kbGUgYmFzZVxuICAgICAgICAgICAgc3ltOiAnVFF1YWQnLFxuICAgICAgICAgICAgeDA6IHRoaXMueDAsIHkwOiB0aGlzLnkxLCB6MDogdGhpcy56MCxcbiAgICAgICAgICAgIHgzOiB0aGlzLngzLCB5MzogdGhpcy55MSwgejM6IHRoaXMuejMsXG4gICAgICAgICAgICB5MTogdGhpcy55MSwgeTI6IHRoaXMueTEsXG4gICAgICAgICAgICB4MTogdGhpcy54MCArIE1hdGguY29zKGFuZ2xlKSAqIC4wMDUsXG4gICAgICAgICAgICB4MjogdGhpcy54MyArIE1hdGguY29zKGFuZ2xlKSAqIC4wMDUsXG4gICAgICAgICAgICB6MTogdGhpcy56MCArIE1hdGguc2luKGFuZ2xlKSAqIC4wMDUsXG4gICAgICAgICAgICB6MjogdGhpcy56MyArIE1hdGguc2luKGFuZ2xlKSAqIC4wMDVcbiAgICAgICAgICB9LFxuICAgICAgICAgIHAxID0ge1xuICAgICAgICAgICAgc3ltOiAnVFF1YWQnLFxuICAgICAgICAgICAgeDA6IHRoaXMueDAsIHkwOiB0aGlzLnkxICsgLjAwNSwgejA6IHRoaXMuejAsXG4gICAgICAgICAgICB4MzogdGhpcy54MywgeTM6IHRoaXMueTEgKyAuMDA1LCB6MzogdGhpcy56MyxcbiAgICAgICAgICAgIHkxOiB0aGlzLnkxICsgLjAwNSwgeTI6IHRoaXMueTEgKyAuMDA1LFxuICAgICAgICAgICAgeDE6IHRoaXMueDAgKyBNYXRoLmNvcyhhbmdsZSkgKiAuMDA1LFxuICAgICAgICAgICAgeDI6IHRoaXMueDMgKyBNYXRoLmNvcyhhbmdsZSkgKiAuMDA1LFxuICAgICAgICAgICAgejE6IHRoaXMuejAgKyBNYXRoLnNpbihhbmdsZSkgKiAuMDA1LFxuICAgICAgICAgICAgejI6IHRoaXMuejMgKyBNYXRoLnNpbihhbmdsZSkgKiAuMDA1XG4gICAgICAgICAgfTtcblxuICAgICAgc3RpY2tCYXNlLnB1c2gocCk7XG4gICAgICBzdGlja0Jhc2UucHVzaChwMSk7XG4gICAgICBzdGlja0Jhc2UucHVzaC5hcHBseShzdGlja0Jhc2UsIFNIQVBFLmV4dHJ1ZGVBbGwoW1xuICAgICAgICB7IHg6IHAueDAsIHk6IHAueTAsIHo6IHAuejAgfSxcbiAgICAgICAgeyB4OiBwLngxLCB5OiBwLnkxLCB6OiBwLnoxIH0sXG4gICAgICAgIHsgeDogcC54MiwgeTogcC55MiwgejogcC56MiB9LFxuICAgICAgICB7IHg6IHAueDMsIHk6IHAueTMsIHo6IHAuejMgfVxuICAgICAgXSwgLjAwNSwgJ1RRdWFkJykpO1xuXG4gICAgICByZXR1cm4gc3RpY2tCYXNlO1xuICAgIH0pO1xuXG4gICAgc2hnLmRlZmluZSgnU3RpY2tCYXNlJywgbnVsbCwgbnVsbCwgbnVsbCwgZnVuY3Rpb24oKSB7XG5cbiAgICAgIHZhciBzdWJkcyA9IFNIQVBFLnNwbGl0KHRoaXMsIFsgLjQ1LCAuMSwgLjQ1IF0sIFsxXSwgbnVsbCksXG4gICAgICAgICAgc3RpY2sgPSBzdWJkc1sxXSxcbiAgICAgICAgICBkeCA9IHN0aWNrLngzIC0gc3RpY2sueDAsXG4gICAgICAgICAgZHkgPSBzdGljay55MSAtIHN0aWNrLnkwLFxuICAgICAgICAgIGR6ID0gc3RpY2suejMgLSBzdGljay56MCxcbiAgICAgICAgICBhbmdsZSA9IE1hdGguYXRhbjIoZHosIGR4KSAtIE1hdGguUEkgLyAyLFxuICAgICAgICAgIHdpZHRoID0gTWF0aC5zcXJ0KGR4ICogZHggKyBkeiAqIGR6KSxcbiAgICAgICAgICBoZWlnaHQgPSBNYXRoLmFicyhkeSk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN5bTogJ1N0aWNrJyxcbiAgICAgICAgeDA6IHN0aWNrLngwLCB5MDogc3RpY2sueTAsIHowOiBzdGljay56MCxcbiAgICAgICAgeDM6IHN0aWNrLngzLCB5Mzogc3RpY2sueTAsIHozOiBzdGljay56MyxcblxuICAgICAgICB5MTogc3RpY2sueTAsIHkyOiBzdGljay55MCxcblxuICAgICAgICB4MTogc3RpY2sueDAgKyBNYXRoLmNvcyhhbmdsZSkgKiB3aWR0aCxcbiAgICAgICAgeDI6IHN0aWNrLngzICsgTWF0aC5jb3MoYW5nbGUpICogd2lkdGgsXG4gICAgICAgIHoxOiBzdGljay56MCArIE1hdGguc2luKGFuZ2xlKSAqIHdpZHRoLFxuICAgICAgICB6Mjogc3RpY2suejMgKyBNYXRoLnNpbihhbmdsZSkgKiB3aWR0aCxcblxuICAgICAgICBzdGlja0hlaWdodDogaGVpZ2h0XG4gICAgICB9XG5cbiAgICB9KTtcblxuICAgIHNoZy5kZWZpbmUoJ1N0aWNrJywgbnVsbCwgbnVsbCwgbnVsbCwgZnVuY3Rpb24oKSB7XG4gICAgICBcbiAgICAgIHZhciBwID0gdGhpcztcbiAgICAgIHJldHVybiBTSEFQRS5leHRydWRlQWxsKFtcbiAgICAgICAgeyB4OiBwLngwLCB5OiBwLnkwLCB6OiBwLnowIH0sXG4gICAgICAgIHsgeDogcC54MSwgeTogcC55MSwgejogcC56MSB9LFxuICAgICAgICB7IHg6IHAueDIsIHk6IHAueTIsIHo6IHAuejIgfSxcbiAgICAgICAgeyB4OiBwLngzLCB5OiBwLnkzLCB6OiBwLnozIH1cbiAgICAgIF0sIHRoaXMuc3RpY2tIZWlnaHQsICdUUXVhZCcpO1xuICAgIH0pO1xuXG4gIFxuICB9XG59XG4iLCJ2YXIgUFJORyA9IHJlcXVpcmUoJy4vUFJORycpLFxuICAgIEdlb20gPSByZXF1aXJlKCcuLy4uL2xpYi9HZW9tJyksXG4gICAgU2hhcGVHcmFtbWFyID0gcmVxdWlyZSgnLi8uLi9saWIvU2hhcGVHcmFtbWFyJyk7XG5cbnZhciBsZXJwID0gZnVuY3Rpb24oYSwgYiwgdCkgeyByZXR1cm4gKDEgLSB0KSAqIGEgKyB0ICogYjsgfVxuXG4vLyBJbnNwaXJlZCB0byBodHRwczovL3d3dy5jcy5wdXJkdWUuZWR1L2NndmxhYi9wYXBlcnMvYWxpYWdhL2VnMjAxMi5wZGZcbnZhciBzdWJkaXZpZGVTdHJpcCA9IGZ1bmN0aW9uKGJsb2NrLCBzdHJpcCwgcm5nKSB7XG4gIHZhciBwb2ludHMgPSBbXSwgcXVhZHMgPSBbXSwgaTEsIGkyLCBpMywgXG4gICAgICBiMSwgYjIsIGR4LCBkeSwgaSwgaiwgbSwgbiwgcCwgbGVuLFxuICAgICAgbG90cyA9IFtdO1xuXG4gIGZvcihpID0gMCwgbiA9IGJsb2NrLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgIGkxID0gKGkgKyAxKSAlIG47XG4gICAgaTIgPSAoaSArIDIpICUgbjtcbiAgICBpMyA9IChpIC0gMSArIG4pICUgbjtcbiAgICBiMSA9IEdlb20ubGluZUludGVyc2VjdGlvbihibG9ja1tpXSwgYmxvY2tbaTFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBzdHJpcFtpM10sIHN0cmlwW2ldKTtcbiAgICBiMiA9IEdlb20ubGluZUludGVyc2VjdGlvbihibG9ja1tpXSwgYmxvY2tbaTFdLFxuICAgICAgICAgICAgICAgICAgICAgICAgICBzdHJpcFtpMV0sIHN0cmlwW2kyXSk7XG4gICAgZHggPSBiMS54IC0gYjIueDtcbiAgICBkeSA9IGIxLnkgLSBiMi55O1xuICAgIGxlbiA9IE1hdGguc3FydChkeCAqIGR4ICsgZHkgKiBkeSk7XG4gICAgbSA9IH5+KHJuZy5yYW5kb20oKSAqIDMgKyAyKTtcbiAgICAvKmlmKGxlbiA8IC4zNSlcbiAgICAgIG0gPSAxO1xuICAgIGVsc2UgaWYobGVuIDwgLjYpXG4gICAgICBtID0gTWF0aC5taW4obSwgMik7XG4gICAgZWxzZSBpZihsZW4gPCAuOClcbiAgICAgIG0gPSBNYXRoLm1pbihtLCAzKTsqL1xuXG4gICAgcXVhZHMucHVzaChtKTtcblxuICAgIGZvcihqID0gMDsgaiA8IG07IGorKykge1xuICAgICAgdmFyIGptID0gaiAvIChtIC0gMSk7XG4gICAgICBweDEgPSBsZXJwKGIxLngsIGIyLngsIGptKTtcbiAgICAgIHB5MSA9IGxlcnAoYjEueSwgYjIueSwgam0pO1xuICAgICAgcHgyID0gbGVycChzdHJpcFtpXS54LCBzdHJpcFtpMV0ueCwgam0pO1xuICAgICAgcHkyID0gbGVycChzdHJpcFtpXS55LCBzdHJpcFtpMV0ueSwgam0pO1xuICAgICAgcG9pbnRzLnB1c2goXG4gICAgICAgIHsgeDogbGVycChiMS54LCBiMi54LCBqbSksIHk6IGxlcnAoYjEueSwgYjIueSwgam0pIH0sXG4gICAgICAgIHsgeDogbGVycChzdHJpcFtpXS54LCBzdHJpcFtpMV0ueCwgam0pLCB5OiBsZXJwKHN0cmlwW2ldLnksIHN0cmlwW2kxXS55LCBqbSkgfVxuICAgICAgKTtcbiAgICB9XG4gIH1cbiAgcG9pbnRzLnB1c2gocG9pbnRzWzBdKTtcblxuICBmb3IoaSA9IDAsIG4gPSBibG9jay5sZW5ndGg7IGkgPCBuOyBpKyspIHtcbiAgICBwID0gW107XG4gICAgZm9yKGogPSAwOyBqIDwgcXVhZHNbaV07IGorKykge1xuICAgICAgcC5wdXNoKHBvaW50cy5zaGlmdCgpKTtcbiAgICAgIHAucHVzaChwb2ludHMuc2hpZnQoKSk7XG4gICAgfVxuICAgIHAucHVzaChibG9ja1soaSArIDEpICUgbl0pO1xuICAgIHAucHVzaChwb2ludHNbMF0gfHwgYmxvY2tbMF0pO1xuICAgIGZvcih2YXIgayA9IDAsIG0gPSBwLmxlbmd0aDsgayA8IG0gLSAyOyBrKz0gMikge1xuICAgICAgbG90cy5wdXNoKG5ldyBCdWlsZGluZyhcbiAgICAgICAgW3Bba10sIHBbKGsgKyAxKSAlIG1dLCBwWyhrICsgMykgJSBtXSwgcFsoayArIDIpICUgbV1dLCBcbiAgICAgICAgcm5nLnJhbmRvbSgpICsgLjUgXG4gICAgICApKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbG90cztcbn1cblxudmFyIEJ1aWxkaW5nID0gZnVuY3Rpb24ocG9seSwgaGVpZ2h0KSB7XG4gIHRoaXMucG9seSA9IHBvbHk7XG4gIHRoaXMuaGVpZ2h0ID0gaGVpZ2h0O1xuXG59XG5cbnZhciBCbG9jayA9IGZ1bmN0aW9uKHBvbHksIHNlZWQpIHtcbiAgdmFyIHJuZyA9IG5ldyBQUk5HKHNlZWQpO1xuICB0aGlzLnBvbHkgPSBwb2x5O1xuICB0aGlzLmJsb2NrID0gR2VvbS5pbnNldFBvbHlnb24odGhpcy5wb2x5LCAwLjA1KTtcbiAgdGhpcy5sb3RzID0gc3ViZGl2aWRlU3RyaXAoR2VvbS5pbnNldFBvbHlnb24odGhpcy5ibG9jaywgMC4xKSwgR2VvbS5pbnNldFBvbHlnb24odGhpcy5ibG9jaywgMC40KSwgcm5nKTtcblxuICB2YXIgY2QgPSBwb2x5LnJlZHVjZShmdW5jdGlvbihvLCBpKSB7XG4gIFxuICAgIG8uY3ggKz0gaS54O1xuICAgIG8uY3kgKz0gaS55O1xuXG4gICAgaWYoby54bSA+IGkueClcbiAgICAgIG8ueG0gPSBpLng7XG4gICAgaWYoby54TSA8IGkueClcbiAgICAgIG8ueE0gPSBpLng7XG4gICAgaWYoby55bSA+IGkueSlcbiAgICAgIG8ueW0gPSBpLnk7XG4gICAgaWYoby55TSA8IGkueSlcbiAgICAgIG8ueU0gPSBpLnk7XG5cbiAgICByZXR1cm4gbztcblxuICB9LCB7IFxuICAgIHhtOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIFxuICAgIHltOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIFxuICAgIHhNOiBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksIFxuICAgIHlNOiBOdW1iZXIuTkVHQVRJVkVfSU5GSU5JVFksIFxuICAgIGN4OiAwLCBjeTogMFxuICB9KTtcblxuICB0aGlzLnggPSBjZC5jeCAvIHBvbHkubGVuZ3RoO1xuICB0aGlzLnkgPSBjZC5jeSAvIHBvbHkubGVuZ3RoO1xuICB0aGlzLncgPSBNYXRoLm1heChNYXRoLmFicyhjZC54TSAtIGNkLnhtKSwgTWF0aC5hYnMoY2QueU0gLSBjZC55bSkpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEJsb2NrO1xuIiwidmFyIFNoYXBlR3JhbW1hciA9IHJlcXVpcmUoJy4vLi4vbGliL1NoYXBlR3JhbW1hcicpLFxuICAgIFNIQVBFICAgICAgICA9IHJlcXVpcmUoJy4uL2xpYi9TSEFQRS5qcycpLFxuICAgIGVhcmN1dCAgICAgICA9IHJlcXVpcmUoJ2VhcmN1dCcpLFxuICAgIEdlb20gICAgICAgICA9IHJlcXVpcmUoJy4vLi4vbGliL0dlb20nKSxcbiAgICBQUk5HICAgICAgICAgPSByZXF1aXJlKCcuL1BSTkcnKSxcbiAgICBCYWxjb255U0hHICAgPSByZXF1aXJlKCcuL0JhbGNvbnlTSEcuanMnKSxcbiAgICBTdGFpcmNhc2VTSEcgPSByZXF1aXJlKCcuL1N0YWlyY2FzZVNIRy5qcycpO1xuXG52YXIgc2hnID0gbmV3IFNoYXBlR3JhbW1hcigpLFxuICAgIHJuZyA9IG5ldyBQUk5HKDMxMzM3KTtcblxuc2hnLmRlZmluZSgnQnVpbGRpbmcnLCBudWxsLCBmdW5jdGlvbigpIHtcblxuICB2YXIgcmV0ID0gW10sXG4gICAgICBjdXJIZWlnaHQgPSAwO1xuICBcbiAgZm9yKHZhciBpID0gMCwgSSA9IHRoaXMuZmxvb3JzTGF5b3V0Lmxlbmd0aDsgaSA8IEk7IGkrKykge1xuICAgIHZhciBmbGkgPSB0aGlzLmZsb29yc0xheW91dFtpXSwgZmxvb3IgPSB7XG4gICAgICBzeW06IGZsaS50eXBlLFxuICAgICAgaGVpZ2h0OiBmbGkuaGVpZ2h0LFxuICAgICAgcGFyYW1zOiBmbGksXG4gICAgICBwb2ludHM6IHRoaXMucG9pbnRzLm1hcChmdW5jdGlvbihpKSB7XG4gICAgICAgIHJldHVybiB7IHg6IGkueCwgeTogaS55ICsgY3VySGVpZ2h0LCB6OiBpLnogfTtcbiAgICAgIH0pXG4gICAgfTtcblxuICAgIGN1ckhlaWdodCArPSBmbGkuaGVpZ2h0O1xuICAgIFxuICAgIHJldC5wdXNoKGZsb29yKTtcbiAgfVxuXG4gIHJldHVybiByZXQ7XG5cbn0pO1xuXG5zaGcuZGVmaW5lKCdGTF9HbmRGbG9vcicsIG51bGwsIGZ1bmN0aW9uKCkge1xuICBcbiAgdmFyIGZhY2FkZXMgPSBTSEFQRS5leHRydWRlQWxsKHRoaXMucG9pbnRzLCB0aGlzLmhlaWdodCwgJ0ZhY2FkZScsIFswLCAxLCAwXSk7XG5cbiAgc3dpdGNoKHRoaXMucGFyYW1zLnRpbGVzKSB7XG4gICAgY2FzZSAnT25lRG9vcic6XG4gICAgICBmb3IodmFyIGkgPSAxLCBJID0gZmFjYWRlcy5sZW5ndGg7IGkgPCBJOyBpKyspXG4gICAgICAgIGZhY2FkZXNbaV0udHlwZSA9ICdXaW5kb3dzJztcbiAgICAgIGZhY2FkZXNbMF0udHlwZSA9ICdPbmVEb29yJztcbiAgICAgIGJyZWFrO1xuICB9XG5cbiAgcmV0dXJuIGZhY2FkZXM7XG5cbn0pO1xuXG5zaGcuZGVmaW5lKCdGTF9GbG9vcicsIG51bGwsIGZ1bmN0aW9uKCkge1xuICBcbiAgdmFyIGZhY2FkZXMgPSBTSEFQRS5leHRydWRlQWxsKHRoaXMucG9pbnRzLCB0aGlzLmhlaWdodCwgJ0ZhY2FkZScsIFswLCAxLCAwXSk7XG5cbiAgZm9yKHZhciBpID0gMCwgSSA9IGZhY2FkZXMubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgZmFjYWRlc1tpXS50eXBlID0gJ1dpbmRvd3MnO1xuICAgIGZhY2FkZXNbaV0ud2luZG93cyA9IHRoaXMucGFyYW1zLndpbmRvd3M7XG4gIH1cblxuICByZXR1cm4gZmFjYWRlcztcblxufSk7XG5cbnNoZy5kZWZpbmUoJ0ZMX0xlZGdlJywgbnVsbCwgZnVuY3Rpb24oKSB7XG5cbiAgdmFyIGV4dHJQb2ludHMgPSBbXSwgaCA9IHRoaXMuaGVpZ2h0O1xuXG4gIGZvcih2YXIgaSA9IDAsIEkgPSB0aGlzLnBvaW50cy5sZW5ndGg7IGkgPCBJOyBpKyspIHtcbiAgICB2YXIgcDAgPSB0aGlzLnBvaW50c1tpXSwgcDEgPSB0aGlzLnBvaW50c1soaSArIDEpICUgSV0sXG4gICAgICAgIGFuZ2xlID0gTWF0aC5hdGFuMihwMS56IC0gcDAueiwgcDEueCAtIHAwLngpLFxuICAgICAgICBhbmdsZXAgPSBhbmdsZSAtIE1hdGguUEkgLyAyLFxuICAgICAgICBjb3MgPSBNYXRoLmNvcyhhbmdsZSkgKyBNYXRoLmNvcyhhbmdsZXApLFxuICAgICAgICBzaW4gPSBNYXRoLnNpbihhbmdsZSkgKyBNYXRoLnNpbihhbmdsZXApO1xuXG4gICAgZXh0clBvaW50cy5wdXNoKHtcbiAgICAgIHg6IHAwLnggLSB0aGlzLnBhcmFtcy53aWR0aCAqIGNvcyxcbiAgICAgIHk6IHAwLnksIFxuICAgICAgejogcDAueiAtIHRoaXMucGFyYW1zLndpZHRoICogc2luXG4gICAgfSlcbiAgfVxuXG4gIHZhciBmYWNhZGVzID0gU0hBUEUuZXh0cnVkZUFsbChleHRyUG9pbnRzLCB0aGlzLmhlaWdodCwgJ1F1YWQnLCBbMCwgMSwgMF0pO1xuXG4gIGZhY2FkZXMuZm9yRWFjaChmdW5jdGlvbihpKSB7XG4gICAgdmFyIGR4ID0gaS5wb2ludHNbM10ueCAtIGkucG9pbnRzWzBdLngsXG4gICAgICAgIGR5ID0gaS5wb2ludHNbMV0ueSAtIGkucG9pbnRzWzBdLnksXG4gICAgICAgIGR6ID0gaS5wb2ludHNbM10ueiAtIGkucG9pbnRzWzBdLno7XG4gICAgdmFyIHQgPSBoIC8gc2hnLlVWU0NBTEUsXG4gICAgICAgIHMgPSB0ICogTWF0aC5zcXJ0KGR4ICogZHggKyBkeiAqIGR6KSAvIGR5O1xuXG4gICAgaS51dnMgPSBbXG4gICAgICB7IHM6IDAsIHQ6IHQgfSxcbiAgICAgIHsgczogMCwgdDogMCB9LFxuICAgICAgeyBzOiBzLCB0OiAwIH0sXG4gICAgICB7IHM6IHMsIHQ6IHQgfVxuICAgIF07XG4gICAgaS50ZXhJRCA9IDY7XG4gIH0pO1xuXG4gIGZhY2FkZXMucHVzaCh7XG4gICAgc3ltOiAnUG9seScsXG4gICAgdGV4SUQ6IDYsXG4gICAgcG9pbnRzOiBleHRyUG9pbnRzXG4gIH0pO1xuXG4gIGZhY2FkZXMucHVzaCh7XG4gICAgc3ltOiAnUG9seScsXG4gICAgdGV4SUQ6IDYsXG4gICAgcG9pbnRzOiBleHRyUG9pbnRzLm1hcChmdW5jdGlvbihpKSB7XG4gICAgICByZXR1cm4geyB4OiBpLngsIHk6IGkueSArIGgsIHo6IGkueiB9XG4gICAgfSlcbiAgfSk7XG5cbiAgcmV0dXJuIGZhY2FkZXM7XG5cbn0pO1xuXG5zaGcuZGVmaW5lKCdGTF9Sb29mdG9wJywgbnVsbCwgZnVuY3Rpb24oKSB7XG5cbiAgdmFyIGV4dHJQb2ludHMgPSBbXSwgaCA9IHRoaXMuaGVpZ2h0O1xuXG4gIGZvcih2YXIgaSA9IDAsIEkgPSB0aGlzLnBvaW50cy5sZW5ndGg7IGkgPCBJOyBpKyspIHtcbiAgICB2YXIgcDAgPSB0aGlzLnBvaW50c1tpXSwgcDEgPSB0aGlzLnBvaW50c1soaSArIDEpICUgSV0sXG4gICAgICAgIGFuZ2xlID0gTWF0aC5hdGFuMihwMS56IC0gcDAueiwgcDEueCAtIHAwLngpLFxuICAgICAgICBhbmdsZXAgPSBhbmdsZSAtIE1hdGguUEkgLyAyLFxuICAgICAgICBjb3MgPSBNYXRoLmNvcyhhbmdsZSkgKyBNYXRoLmNvcyhhbmdsZXApLFxuICAgICAgICBzaW4gPSBNYXRoLnNpbihhbmdsZSkgKyBNYXRoLnNpbihhbmdsZXApO1xuXG4gICAgZXh0clBvaW50cy5wdXNoKHtcbiAgICAgIHg6IHAwLnggKyB0aGlzLnBhcmFtcy53aWR0aCAqIGNvcyxcbiAgICAgIHk6IHAwLnksIFxuICAgICAgejogcDAueiArIHRoaXMucGFyYW1zLndpZHRoICogc2luXG4gICAgfSlcbiAgfVxuXG4gIHZhciBmYWNhZGVzT3V0ID0gU0hBUEUuZXh0cnVkZUFsbCh0aGlzLnBvaW50cywgdGhpcy5oZWlnaHQsICdRdWFkJywgWzAsIDEsIDBdKSxcbiAgICAgIGZhY2FkZXNJbiAgPSBTSEFQRS5leHRydWRlQWxsKGV4dHJQb2ludHMsICB0aGlzLmhlaWdodCwgJ1F1YWQnLCBbMCwgMSwgMF0pO1xuXG4gIGZhY2FkZXNJbi5wdXNoKHtcbiAgICBzeW06ICdQb2x5JyxcbiAgICBwb2ludHM6IGV4dHJQb2ludHNcbiAgfSk7XG5cbiAgd2hpbGUoZmFjYWRlc091dC5sZW5ndGgpXG4gICAgZmFjYWRlc0luLnB1c2goZmFjYWRlc091dC5zaGlmdCgpKTtcblxuICBmYWNhZGVzSW4uZm9yRWFjaChmdW5jdGlvbihpKSB7XG4gICAgdmFyIGR4ID0gaS5wb2ludHNbM10ueCAtIGkucG9pbnRzWzBdLngsXG4gICAgICAgIGR5ID0gaS5wb2ludHNbMV0ueSAtIGkucG9pbnRzWzBdLnksXG4gICAgICAgIGR6ID0gaS5wb2ludHNbM10ueiAtIGkucG9pbnRzWzBdLno7XG4gICAgdmFyIHQgPSBoIC8gc2hnLlVWU0NBTEUsXG4gICAgICAgIHMgPSB0ICogTWF0aC5zcXJ0KGR4ICogZHggKyBkeiAqIGR6KSAvIGR5O1xuXG4gICAgaS51dnMgPSBbXG4gICAgICB7IHM6IDAsIHQ6IHQgfSxcbiAgICAgIHsgczogMCwgdDogMCB9LFxuICAgICAgeyBzOiBzLCB0OiAwIH0sXG4gICAgICB7IHM6IHMsIHQ6IHQgfVxuICAgIF07XG4gICAgaS50ZXhJRCA9IDY7XG4gIH0pO1xuXG4gIGZvcih2YXIgaSA9IDAsIEkgPSBleHRyUG9pbnRzLmxlbmd0aDsgaSA8IEk7IGkrKykge1xuICAgIHZhciBpaSA9IChpICsgMSkgJSBJLFxuICAgICAgICBwMCA9IHRoaXMucG9pbnRzW2ldLCBwMSA9IGV4dHJQb2ludHNbaV0sXG4gICAgICAgIHAyID0gZXh0clBvaW50c1tpaV0sIHAzID0gdGhpcy5wb2ludHNbaWldO1xuXG4gICAgdmFyIHBvbHkgPSB7XG4gICAgICBzeW06ICdQb2x5JyxcbiAgICAgIHBvaW50czogWyBwMCwgcDEsIHAyLCBwMCwgcDIsIHAzIF0ubWFwKGZ1bmN0aW9uKGkpIHsgcmV0dXJuIHsgeDogaS54LCB5OiBpLnkgKyBoLCB6OiBpLnogfTsgfSksXG4gICAgICB0ZXhJRDogNlxuICAgIH07XG5cbiAgICBmYWNhZGVzSW4ucHVzaChwb2x5KTtcbiAgfVxuXG4gIHJldHVybiBmYWNhZGVzSW47XG59KTtcblxuc2hnLmRlZmluZSgnRmFjYWRlJywgZnVuY3Rpb24oKSB7IHJldHVybiB0aGlzLnR5cGUgPT09ICdPbmVEb29yJyB9LCBmdW5jdGlvbigpIHtcblxuICB2YXIgZHggPSB0aGlzLnBvaW50c1szXS54IC0gdGhpcy5wb2ludHNbMF0ueCxcbiAgICAgIGR5ID0gdGhpcy5wb2ludHNbMV0ueSAtIHRoaXMucG9pbnRzWzBdLnksXG4gICAgICBkeiA9IHRoaXMucG9pbnRzWzNdLnogLSB0aGlzLnBvaW50c1swXS56LFxuICAgICAgdCAgPSBkeSAvIHNoZy5VVlNDQUxFLFxuICAgICAgcyAgPSB0ICogTWF0aC5zcXJ0KGR4ICogZHggKyBkeiAqIGR6KSAvIGR5O1xuXG4gIHRoaXMudXZzID0gW1xuICAgIHsgczogMCwgdDogdCB9LFxuICAgIHsgczogMCwgdDogMCB9LFxuICAgIHsgczogcywgdDogMCB9LFxuICAgIHsgczogcywgdDogdCB9XG4gIF07XG5cbiAgdmFyIHF1YWRzID0gU0hBUEUuZml0KCd4JywgdGhpcywgJ1dpbmRvdycsIDEpO1xuXG4gIC8vcXVhZHNbIH5+KHF1YWRzLmxlbmd0aCAvIDIpIF0uc3ltID0gJ0Rvb3InO1xuICBxdWFkcy5zcGxpY2UoTWF0aC5mbG9vcihxdWFkcy5sZW5ndGggLyAyKSwgMSk7XG4gIFxuICBmb3IodmFyIGkgPSAwLCBJID0gcXVhZHMubGVuZ3RoOyBpIDwgSTsgaSsrKVxuICAgIHF1YWRzW2ldLm5vcm1hbCA9IHRoaXMubm9ybWFsO1xuXG4gIHJldHVybiBxdWFkcztcblxufSk7XG5cbnNoZy5kZWZpbmUoJ0ZhY2FkZScsIG51bGwsIGZ1bmN0aW9uKCkge1xuXG4gIHZhciBkeCA9IHRoaXMucG9pbnRzWzNdLnggLSB0aGlzLnBvaW50c1swXS54LFxuICAgICAgZHkgPSB0aGlzLnBvaW50c1sxXS55IC0gdGhpcy5wb2ludHNbMF0ueSxcbiAgICAgIGR6ID0gdGhpcy5wb2ludHNbM10ueiAtIHRoaXMucG9pbnRzWzBdLnosXG4gICAgICB0ICA9IGR5IC8gc2hnLlVWU0NBTEUsXG4gICAgICBzICA9IHQgKiBNYXRoLnNxcnQoZHggKiBkeCArIGR6ICogZHopIC8gZHk7XG5cbiAgdGhpcy51dnMgPSBbXG4gICAgeyBzOiAwLCB0OiB0IH0sXG4gICAgeyBzOiAwLCB0OiAwIH0sXG4gICAgeyBzOiBzLCB0OiAwIH0sXG4gICAgeyBzOiBzLCB0OiB0IH1cbiAgXTtcblxuICB2YXIgcXVhZHMgPSBTSEFQRS5maXQoJ3gnLCB0aGlzLCAnV2luZG93JywgMSk7XG5cbiAgLy9xdWFkc1sgTWF0aC5yb3VuZChxdWFkcy5sZW5ndGggLyAyKSBdLnN5bSA9ICdEb29yJztcbiAgXG4gIGZvcih2YXIgaSA9IDAsIEkgPSBxdWFkcy5sZW5ndGg7IGkgPCBJOyBpKyspXG4gICAgcXVhZHNbaV0ubm9ybWFsID0gdGhpcy5ub3JtYWw7XG5cbiAgcmV0dXJuIHF1YWRzO1xuXG59KTtcblxuc2hnLmRlZmluZSgnV2luZG93JywgbnVsbCwgZnVuY3Rpb24oKSB7XG4gIFxuICB2YXIgaHNwID0gU0hBUEUuc3BsaXQodGhpcywgWyAuMywgLjQsIC4zIF0sIFsxXSwgJ1F1YWQnKSxcbiAgICAgIHZzcCA9IFNIQVBFLnNwbGl0KGhzcFsxXSwgWzFdLCBbLjE1LCAuNywgLjE1XSwgJ1F1YWQnKSxcbiAgICAgIHdpbmRvd1BhbmUgPSB2c3BbMV07XG5cbiAgdmFyIHdwdXZzID0gd2luZG93UGFuZS51dnM7XG4gIHdpbmRvd1BhbmUudXZzID0gbnVsbDtcbiAgd2luZG93UGFuZS50ZXhJRCA9IDQ7XG5cbiAgaHNwWzBdLnRleElEID0gaHNwWzJdLnRleElEID0gdnNwWzBdLnRleElEID0gdnNwWzJdLnRleElEID0gNjtcblxuICB2YXIgcmV0ID0gWyBoc3BbMF0sIGhzcFsyXSwgdnNwWzBdLCB2c3BbMl0gXTtcblxuICB2YXIgbm9ybSA9IEdlb20udHJpVG9Ob3JtYWwoW1xuICAgIHdpbmRvd1BhbmUucG9pbnRzWzBdLngsIHdpbmRvd1BhbmUucG9pbnRzWzBdLnksIHdpbmRvd1BhbmUucG9pbnRzWzBdLnosIFxuICAgIHdpbmRvd1BhbmUucG9pbnRzWzFdLngsIHdpbmRvd1BhbmUucG9pbnRzWzFdLnksIHdpbmRvd1BhbmUucG9pbnRzWzFdLnosIFxuICAgIHdpbmRvd1BhbmUucG9pbnRzWzJdLngsIHdpbmRvd1BhbmUucG9pbnRzWzJdLnksIHdpbmRvd1BhbmUucG9pbnRzWzJdLnpcbiAgXSk7XG5cbiAgdmFyIGJvcmRlcnMgPSBTSEFQRS5leHRydWRlQWxsKHdpbmRvd1BhbmUucG9pbnRzLCAtLjAwNSwgJ1F1YWQnLCBub3JtKTtcbiAgdmFyIG5YID0gbm9ybVswXSxcbiAgICAgIG5ZID0gbm9ybVsxXSxcbiAgICAgIG5aID0gbm9ybVsyXTtcbiAgXG4gIG5YICo9IC4wMDU7XG4gIG5ZICo9IC4wMDU7XG4gIG5aICo9IC4wMDU7XG5cbiAgZm9yKHZhciBpID0gMCwgSSA9IHdpbmRvd1BhbmUucG9pbnRzLmxlbmd0aDsgaSA8IEk7IGkrKykge1xuICAgIHZhciBwID0gd2luZG93UGFuZS5wb2ludHNbaV07XG4gICAgcC54IC09IG5YO1xuICAgIHAueSAtPSBuWTtcbiAgICBwLnogLT0gblo7XG4gIH1cblxuICBmb3IodmFyIGkgPSAwLCBJID0gYm9yZGVycy5sZW5ndGg7IGkgPCBJOyBpKyspIHtcbiAgICBib3JkZXJzW2ldLnRleElEID0gMztcbiAgICByZXQucHVzaChib3JkZXJzW2ldKTtcbiAgfVxuICByZXQucHVzaCh3aW5kb3dQYW5lKTtcblxuICByZXR1cm4gcmV0O1xuXG59KTtcblxuc2hnLmRlZmluZSgnUXVhZCcsIG51bGwsIChmdW5jdGlvbigpIHtcblxuICB2YXIgZGVmYXVsdFVWUyA9IFsgXG4gICAgeyBzOiAwLCB0OiAxIH0sIFxuICAgIHsgczogMCwgdDogMCB9LCBcbiAgICB7IHM6IDEsIHQ6IDAgfSwgXG4gICAgeyBzOiAxLCB0OiAxIH0gXG4gIF07XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgIFxuICAgIHZhciB2ZXJ0aWNlcywgbm9ybWFscyA9IFtdLCB1dnMsXG4gICAgICAgIG5vcm1hbCwgdGV4SUQsXG4gICAgICAgIHUwLCB1MSwgdTIsIHUzLFxuICAgICAgICBwMCwgcDEsIHAyLCBwMywgcHMgPSB0aGlzLnBvaW50cztcblxuICAgIHAwID0gcHNbMF0sIHAxID0gcHNbMV0sIHAyID0gcHNbMl0sIHAzID0gcHNbM107XG5cbiAgICB2ZXJ0aWNlcyA9IFtcbiAgICAgIHAwLngsIHAwLnksIHAwLnosIHAxLngsIHAxLnksIHAxLnosIHAyLngsIHAyLnksIHAyLnosXG4gICAgICBwMC54LCBwMC55LCBwMC56LCBwMi54LCBwMi55LCBwMi56LCBwMy54LCBwMy55LCBwMy56XG4gICAgXTtcblxuICAgIG5vcm1hbCA9IHRoaXMubm9ybWFsIHx8IEdlb20udHJpVG9Ob3JtYWwodmVydGljZXMpO1xuICAgIGZvcih2YXIgaSA9IDA7IGkgPCA2OyBpKyspXG4gICAgICBub3JtYWxzLnB1c2gobm9ybWFsWzBdLCBub3JtYWxbMV0sIG5vcm1hbFsyXSk7XG5cbiAgICB1dnMgPSB0aGlzLnV2cyB8fCBkZWZhdWx0VVZTO1xuICAgIHUwID0gdXZzWzBdLCB1MSA9IHV2c1sxXSwgdTIgPSB1dnNbMl0sIHUzID0gdXZzWzNdO1xuICAgIHRleElEID0gdGhpcy50ZXhJRCB8fCAwO1xuXG4gICAgdXZzID0gW1xuICAgICAgdTAucywgdTAudCwgdGV4SUQsIHUxLnMsIHUxLnQsIHRleElELCB1Mi5zLCB1Mi50LCB0ZXhJRCxcbiAgICAgIHUwLnMsIHUwLnQsIHRleElELCB1Mi5zLCB1Mi50LCB0ZXhJRCwgdTMucywgdTMudCwgdGV4SURcbiAgICBdO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN5bTogU2hhcGVHcmFtbWFyLlRFUk1JTkFMLFxuICAgICAgdmVydGljZXM6IHZlcnRpY2VzLFxuICAgICAgbm9ybWFsczogbm9ybWFscyxcbiAgICAgIHV2czogdXZzXG4gICAgfVxuXG4gIH1cblxufSgpKSk7XG5cbnNoZy5kZWZpbmUoJ1BvbHknLCBudWxsLCBmdW5jdGlvbigpIHtcbiAgdmFyIHJpbmdzID0gdGhpcy5wb2ludHMubWFwKGZ1bmN0aW9uKGkpIHtcbiAgICByZXR1cm4gW2kueCwgaS56XTtcbiAgfSksIHkgPSB0aGlzLnBvaW50c1swXS55O1xuXG4gIHZhciB0cml2ZXJ0cyA9IGVhcmN1dChbcmluZ3NdKSxcbiAgICAgIHZlcnRpY2VzID0gdHJpdmVydHMucmVkdWNlKGZ1bmN0aW9uKG8sIGkpIHtcbiAgICAgICAgby5wdXNoKGlbMF0sIHksIGlbMV0pO1xuICAgICAgICByZXR1cm4gbztcbiAgICAgIH0sIFtdKSxcbiAgICAgIG5vcm1hbCA9IHRoaXMubm9ybWFsIHx8IEdlb20udHJpVG9Ob3JtYWwodmVydGljZXMpLFxuICAgICAgbm9ybWFscyA9IFtdLCB1dnMgPSBbXTtcblxuICB2YXIgbWluWCwgbWluWiwgbWF4WCwgbWF4WiwgZHgsIGR6LCBwO1xuXG4gIG1pblggPSBtaW5aID0gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuICBtYXhYID0gbWF4WiA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcblxuICBmb3IodmFyIGkgPSAwLCBJID0gdGhpcy5wb2ludHMubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgcCA9IHRoaXMucG9pbnRzW2ldO1xuICAgIGlmKG1pblggPiBwLngpIG1pblggPSBwLng7XG4gICAgaWYobWF4WCA8IHAueCkgbWF4WCA9IHAueDtcbiAgICBpZihtaW5aID4gcC56KSBtaW5aID0gcC56O1xuICAgIGlmKG1heFogPCBwLnopIG1heFogPSBwLno7XG4gIH1cblxuICBkeCA9IG1heFggLSBtaW5YO1xuICBkeiA9IG1heFogLSBtaW5aO1xuXG4gIGZvcih2YXIgaSA9IDAsIEkgPSB2ZXJ0aWNlcy5sZW5ndGg7IGkgPCBJOyBpICs9IDMpIHtcbiAgICB2YXIgeCA9IHZlcnRpY2VzW2ldLCB6ID0gdmVydGljZXNbaSArIDJdO1xuICAgIHV2cy5wdXNoKCAoeCAtIG1pblgpIC8gZHgsICh6IC0gbWluWikgLyBkeiwgdGhpcy50ZXhJRCApO1xuICAgIG5vcm1hbHMucHVzaChub3JtYWxbMF0sIG5vcm1hbFsxXSwgbm9ybWFsWzJdKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgc3ltOiBTaGFwZUdyYW1tYXIuVEVSTUlOQUwsXG4gICAgdmVydGljZXM6IHZlcnRpY2VzLFxuICAgIG5vcm1hbHM6IG5vcm1hbHMsXG4gICAgdXZzOiB1dnNcbiAgfVxuXG59KTtcblxudmFyIGF2YWlsQ29sb3JzID0gW1xuICBbIC44OCwgLjg4LCAuODggXSxcbiAgWyAuNjYsIC42NiwgLjY2IF0sXG4gIFsgMSwgICAuOTcsIC44MyBdLFxuICBbIC42OCwgLjUzLCAuNDYgXVxuXTtcblxuc2hnLlVWU0NBTEUgPSAuMTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIHNoZzogc2hnLFxuICBjcmVhdGU6IGZ1bmN0aW9uKGxvdCkge1xuICAgIC8vY29udGV4dC5ybmcuc2VlZCgxMCk7XG5cbiAgICB2YXIgZHggPSBsb3Qud2lkdGggLyAyLCBkeSA9IGxvdC5kZXB0aCAvIDIsXG4gICAgICAgIHgwID0gbG90LnggLSBkeCwgeDEgPSBsb3QueCArIGR4LFxuICAgICAgICB5MCA9IGxvdC55IC0gZHksIHkxID0gbG90LnkgKyBkeSxcbiAgICAgICAgcmF0aW8gPSBNYXRoLm1heChkeCAvIGR5LCBkeSAvIGR4KTtcbiAgIHZhciBwdHMgPSBbXTtcblxuICAgIGlmKHJhdGlvIDwgMS4zICYmIHJuZy5yYW5kb20oKSA8IC4zKSB7XG4gICAgICBmb3IodmFyIGkgPSAwOyBpIDwgODsgaSsrKVxuICAgICAgICBwdHMucHVzaCh7IHggOiBsb3QueCArIGR4ICogTWF0aC5jb3MoLWkgKiBNYXRoLlBJIC8gNCksIHk6IDAsIHo6IGxvdC55ICsgZHkgKiBNYXRoLnNpbigtaSAqIE1hdGguUEkgLyA0KSB9KTsgXG4gICAgfSBlbHNlIHtcbiAgICAgIHB0cy5wdXNoKFxuICAgICAgICB7IHg6IHgwLCB5OiAwLCB6OiB5MCB9LFxuICAgICAgICB7IHg6IHgwLCB5OiAwLCB6OiB5MSB9LFxuICAgICAgICB7IHg6IHgxLCB5OiAwLCB6OiB5MSB9LFxuICAgICAgICB7IHg6IHgxLCB5OiAwLCB6OiB5MCB9XG4gICAgICApO1xuICAgIH1cblxuICAgIHZhciBmbG9vckxheW91dCA9IFtcbiAgICAgIHsgdHlwZTogJ0ZMX0duZEZsb29yJywgaGVpZ2h0OiAuMSwgdGlsZXM6ICdPbmVEb29yJyB9LFxuICAgICAgeyB0eXBlOiAnRkxfTGVkZ2UnLCAgICBoZWlnaHQ6IC4wMjUsIHdpZHRoOiAuMDEyNSB9XG4gICAgXTtcblxuICAgIGZvcih2YXIgaSA9IDAsIEkgPSA0ICsgfn4ocm5nLnJhbmRvbSgpICogMTApOyBpIDwgSTsgaSsrKVxuICAgICAgZmxvb3JMYXlvdXQucHVzaChcbiAgICAgICAgeyB0eXBlOiAnRkxfRmxvb3InLCAgaGVpZ2h0OiAuMSwgd2luZG93czogJ0RvdWJsZScgfVxuICAgICAgKTtcbiAgICBmbG9vckxheW91dC5wdXNoKFxuICAgICAgeyB0eXBlOiAnRkxfTGVkZ2UnLCAgICBoZWlnaHQ6IC4wMjUsIHdpZHRoOiAuMDAzMTI1IH0sXG4gICAgICB7IHR5cGU6ICdGTF9GbG9vcicsICAgIGhlaWdodDogLjE1LCB3aW5kb3dzOiAnU2luZ2xlJyB9LFxuICAgICAgeyB0eXBlOiAnRkxfUm9vZnRvcCcsICBoZWlnaHQ6IC4wMjUsIHdpZHRoOiAuMDA2MjUgfVxuICAgICk7XG5cbiAgICB2YXIgYXhpb20gPSB7XG4gICAgICBzeW06ICdCdWlsZGluZycsXG4gICAgICBmbG9vcnNMYXlvdXQ6IGZsb29yTGF5b3V0LFxuICAgICAgcG9pbnRzOiBwdHNcbiAgICB9O1xuXG4gICAgdmFyIGNvbG9yID0gYXZhaWxDb2xvcnNbIH5+KHJuZy5yYW5kb20oKSAqIGF2YWlsQ29sb3JzLmxlbmd0aCkgXTtcblxuICAgIHZhciByZXQgPSBzaGcucnVuKGF4aW9tKTtcbiAgICByZXR1cm4geyBnZW9tOiByZXQsIGNvbG9yOiBjb2xvciB9O1xuICB9LFxuICBnZXRHZW9tOiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gY29udGV4dDtcbiAgfVxuXG59XG4iLCJ2YXIgUFJORyAgPSBuZXcgKHJlcXVpcmUoJy4vUFJORycpKSxcbiAgICBHZW9tICA9IHJlcXVpcmUoJy4vLi4vbGliL0dlb20nKSxcbiAgICBSb2FkcyA9IHJlcXVpcmUoJy4vUm9hZHMuanMnKSxcbiAgICBCbG9jayA9IHJlcXVpcmUoJy4vQmxvY2suanMnKSxcbiAgICBTaGFwZUdyYW1tYXIgPSByZXF1aXJlKCcuLi9saWIvU2hhcGVHcmFtbWFyLmpzJyk7XG5cbnZhciB0cmF2ZXJzZSA9IChmdW5jdGlvbigpIHtcblxuICB2YXIgcGkyID0gTWF0aC5QSSAqIDI7XG5cbiAgcmV0dXJuIGZ1bmN0aW9uKGVkZ2VBLCBlZGdlQiwgcm9hZHMsIGZhY2UpIHtcbiAgICB2YXIgZWRnZURpciA9IE1hdGguYXRhbjIoLSBlZGdlQi55ICsgZWRnZUEueSwgZWRnZUIueCAtIGVkZ2VBLngpLFxuICAgICAgICBuZXh0RGlyLCBuZXh0VnR4LCBpb2wsXG4gICAgICAgIHJpZ2h0bW9zdCA9IHsgdGg6IE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgdmVydGV4OiBudWxsIH07XG4gICAgICAgIFxuICAgIGlmKCEoJ3RyYXZlcnNlZCcgaW4gZWRnZUEpKVxuICAgICAgZWRnZUEudHJhdmVyc2VkID0gW107XG4gICAgaWYoISgndHJhdmVyc2VkJyBpbiBlZGdlQikpXG4gICAgICBlZGdlQi50cmF2ZXJzZWQgPSBbXTtcblxuICAgIGVkZ2VBLnRyYXZlcnNlZC5wdXNoKGVkZ2VCKTtcblxuICAgIGZvcih2YXIgaSA9IDA7IGkgPCBlZGdlQi5jb25ucy5sZW5ndGg7IGkrKykge1xuICAgICAgbmV4dFZ0eCA9IGVkZ2VCLmNvbm5zW2ldO1xuXG4gICAgICBpZihuZXh0VnR4ID09PSBlZGdlQSB8fCBlZGdlQi50cmF2ZXJzZWQuaW5kZXhPZihuZXh0VnR4KSAhPT0gLTEgfHwgKGZhY2UgJiYgbmV4dFZ0eCAhPT0gZmFjZVswXSAmJiBmYWNlLmluZGV4T2YobmV4dFZ0eCkgIT09IC0xKSlcbiAgICAgICAgY29udGludWU7XG5cbiAgICAgIG5leHREaXIgPSBNYXRoLmF0YW4yKC0gbmV4dFZ0eC55ICsgZWRnZUIueSwgbmV4dFZ0eC54IC0gZWRnZUIueCkgLSBlZGdlRGlyO1xuICAgICAgaWYobmV4dERpciA+IE1hdGguUEkpXG4gICAgICAgIG5leHREaXIgLT0gcGkyO1xuICAgICAgZWxzZSBpZihuZXh0RGlyIDwgLSBNYXRoLlBJKVxuICAgICAgICBuZXh0RGlyICs9IHBpMjtcbiAgICAgIGlmKG5leHREaXIgPCByaWdodG1vc3QudGgpIHtcbiAgICAgICAgcmlnaHRtb3N0LnRoID0gbmV4dERpcjtcbiAgICAgICAgcmlnaHRtb3N0LnZlcnRleCA9IGVkZ2VCLmNvbm5zW2ldO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmKHJpZ2h0bW9zdC52ZXJ0ZXggPT09IG51bGwpXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGlmKGZhY2UpXG4gICAgICBmYWNlLnB1c2goZWRnZUIpO1xuXG4gICAgaWYoZmFjZSAmJiByaWdodG1vc3QudmVydGV4ID09PSBmYWNlWzBdKSB7XG4gICAgICBpb2wgPSBHZW9tLmlzT3ZlcmxhcHBpbmcoZmFjZSwgcm9hZHMpO1xuXG4gICAgICBpZihpb2wpXG4gICAgICAgIHJldHVybiBudWxsO1xuXG4gICAgICBlZGdlQi50cmF2ZXJzZWQucHVzaChmYWNlWzBdKTtcblxuICAgICAgcmV0dXJuIGZhY2U7XG4gICAgfVxuXG4gICAgZmFjZSA9IHRyYXZlcnNlKGVkZ2VCLCByaWdodG1vc3QudmVydGV4LCByb2FkcywgZmFjZSB8fCBbIGVkZ2VBLCBlZGdlQiBdKTtcbiAgICBpZihmYWNlID09PSBudWxsKSB7XG4gICAgICBlZGdlQi50cmF2ZXJzZWQuc3BsaWNlKGVkZ2VCLnRyYXZlcnNlZC5pbmRleE9mKHJpZ2h0bW9zdC52ZXJ0ZXgpLCAxKTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFjZSB8fCBudWxsO1xuICB9XG5cbn0oKSk7XG5cbnZhciBDaXR5ID0gZnVuY3Rpb24oc2VlZCkge1xuICBQUk5HLnNlZWQoc2VlZCk7XG5cbiAgdmFyIHBvbHlzID0gW107XG5cbiAgdGhpcy5yb2FkcyA9IFJvYWRzKCk7XG4gIC8vY29uc29sZS5sb2codGhpcy5yb2FkcylcbiAgdGhpcy5ibG9ja3MgPSBbXTtcblxuICBmb3IodmFyIGkgPSAwOyBpIDwgdGhpcy5yb2Fkcy5sZW5ndGg7IGkrKykge1xuICAgIGZvcih2YXIgaiA9IDA7IGogPCB0aGlzLnJvYWRzW2ldLmNvbm5zLmxlbmd0aDsgaisrKSB7XG4gICAgICBpZighKCd0cmF2ZXJzZWQnIGluIHRoaXMucm9hZHNbaV0pKVxuICAgICAgICB0aGlzLnJvYWRzW2ldLnRyYXZlcnNlZCA9IFtdO1xuICAgICAgLy90aGlzLnJvYWRzW2ldLnRyYXZlcnNlZFtqXSA9IHRydWU7XG4gICAgICB2YXIgcG9seSA9IHRyYXZlcnNlKHRoaXMucm9hZHNbaV0sIHRoaXMucm9hZHNbaV0uY29ubnNbal0sIHRoaXMucm9hZHMpO1xuICAgICAgaWYocG9seSA9PT0gbnVsbCB8fCBHZW9tLmlzUG9seUluKHBvbHksIHBvbHlzKSlcbiAgICAgICAgY29udGludWU7XG4gICAgICBcbiAgICAgIHBvbHlzLnB1c2gocG9seSk7XG4gICAgICB0aGlzLmJsb2Nrcy5wdXNoKG5ldyBCbG9jayhwb2x5LCBQUk5HLnJhbmRvbSgpICogNjU1MzYpKTtcbiAgICB9XG4gIH1cblxuICB0aGlzLnJvYWRzLmZvckVhY2goZnVuY3Rpb24ocikge1xuICAgIHIudHJhdmVyc2VkID0gW107XG4gIH0pO1xuXG4gIHZhciByb2FkUXVhZHMgPSBbXTtcblxuICB0aGlzLnJvYWRzLmZvckVhY2goZnVuY3Rpb24ocikge1xuICAgIHIuY29ubnMuZm9yRWFjaChmdW5jdGlvbihyMSkge1xuICAgICAgaWYocjEudHJhdmVyc2VkLmluZGV4T2YocikgIT09IC0xKVxuICAgICAgICByZXR1cm47XG4gICAgICByb2FkUXVhZHMucHVzaChbciwgcjFdKTtcbiAgICAgIHIudHJhdmVyc2VkLnB1c2gocjEpO1xuICAgICAgcjEudHJhdmVyc2VkLnB1c2gocik7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHRoaXMucm9hZFF1YWRzID0gcm9hZFF1YWRzO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENpdHk7XG4iLCIvKipcbiAqIFBSTkcuanNcbiAqXG4gKiBUT0RPIGltcGxlbWVudCBNZXJzZW5uZSB0d2lzdGVyLlxuICovXG5cbnZhciBNZXJzZW5uZVR3aXN0ZXIgPSByZXF1aXJlKCdtZXJzZW5uZXR3aXN0ZXInKTtcblxudmFyIFBSTkcgPSBmdW5jdGlvbihzZWVkKSB7XG4gIGlmKHNlZWQgIT09IHVuZGVmaW5lZClcbiAgICB0aGlzLnNlZWQoc2VlZCk7XG4gIGVsc2VcbiAgICB0aGlzLm10ID0gbmV3IE1lcnNlbm5lVHdpc3RlcigpO1xufVxuXG5QUk5HLnByb3RvdHlwZS5zZWVkID0gZnVuY3Rpb24oc2VlZCkge1xuICB0aGlzLm10ID0gbmV3IE1lcnNlbm5lVHdpc3RlcihzZWVkKTtcbn1cblxuUFJORy5wcm90b3R5cGUucmFuZG9tID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLm10LnJhbmRvbSgpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFBSTkc7XG4iLCIvKipcbiAqIFJvYWRzLmpzXG4gKiBcbiAqIFN0dWIgLSBnZW5lcmF0ZXMgY2l0eSByb2FkcyBhcyBhbiB1bmRpcmVjdGVkIGdyYXBoLCByZXByZXNlbnRlZFxuICogdmlhIGFuIGFycmF5IG9mIG5vZGVzIHdpdGggb3V0Z29pbmcgYW5kIGluY29taW5nIGxpbmtzIHRvIG90aGVyXG4gKiByb2Fkcy5cbiAqXG4gKiBUT0RPIFxuICogLSBHZW5lcmF0aXZlL3NlYXJjaCBiYXNlZC9sLXN5c3RlbSBhcHByb2FjaGVzLiBSaWdodCBub3cgb25seSBhXG4gKiAgIHJhbmRvbWx5IGRpc3BsYWNlZCBzcXVhcmUgZ3JpZCBpcyBnZW5lcmF0ZWQuXG4gKiAtIFJhbmRvbSBzZWVkaW5nXG4gKi9cblxudmFyIFBSTkcgPSByZXF1aXJlKCcuL1BSTkcnKTtcblxudmFyIHNpZGUgPSA4LCBxID0gMCwgYW1wID0gMjtcbiAgICBcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24oc2VlZCkge1xuXG4gIHZhciBnID0gW10sIHJuZyA9IG5ldyBQUk5HKHNlZWQpO1xuXG4gIGZvcih2YXIgeSA9IDA7IHkgPCBzaWRlOyB5KyspIGZvcih2YXIgeCA9IDA7IHggPCBzaWRlOyB4KyspIHtcbiAgICB2YXIgcCA9IGdbeSAqIHNpZGUgKyB4XSA9IHsgXG4gICAgICB4OiBhbXAgKiB4ICsgcSAqIHJuZy5yYW5kb20oKSwgXG4gICAgICB5OiBhbXAgKiB5ICsgcSAqIHJuZy5yYW5kb20oKSwgXG4gICAgICBjb25uczogW10gXG4gICAgfTtcbiAgICBpZih4ID4gMCkge1xuICAgICAgcC5jb25ucy5wdXNoKGdbeSAqIHNpZGUgKyB4IC0gMV0pO1xuICAgICAgZ1t5ICogc2lkZSArIHggLSAxXS5jb25ucy5wdXNoKHApO1xuICAgIH1cbiAgICBpZih5ID4gMCkge1xuICAgICAgcC5jb25ucy5wdXNoKGdbKHkgLSAxKSAqIHNpZGUgKyB4XSk7XG4gICAgICBnWyh5IC0gMSkgKiBzaWRlICsgeF0uY29ubnMucHVzaChwKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZztcblxufVxuIiwidmFyIFNoYXBlR3JhbW1hciA9IHJlcXVpcmUoJy4vLi4vbGliL1NoYXBlR3JhbW1hcicpLFxuICAgIFNIQVBFICAgICAgICA9IHJlcXVpcmUoJy4uL2xpYi9TSEFQRS5qcycpLFxuICAgIGVhcmN1dCAgICAgICA9IHJlcXVpcmUoJ2VhcmN1dCcpLFxuICAgIEdlb20gICAgICAgICA9IHJlcXVpcmUoJy4vLi4vbGliL0dlb20nKSxcbiAgICBQUk5HICAgICAgICAgPSByZXF1aXJlKCcuL1BSTkcnKTtcblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gIGF1Z21lbnQ6IGZ1bmN0aW9uKHNoZykge1xuICBcbiAgICBzaGcuZGVmaW5lKCdTdGFpcmNhc2UnLCBudWxsLCBudWxsLCBudWxsLCBmdW5jdGlvbigpIHtcbiAgICAgIHZhciBzdGFpckhlaWdodFRvdCA9ICh0aGlzLnN0YWlySGVpZ2h0ICsgdGhpcy5zdGFpclNwYWNlKSxcbiAgICAgICAgICBzdGFpckNvdW50ID0gTWF0aC5hYnModGhpcy5oZWlnaHQgLyBzdGFpckhlaWdodFRvdCksXG4gICAgICAgICAgc3RhaXJQb3NtICA9IE1hdGguYWJzKHRoaXMud2lkdGggLyBzdGFpckNvdW50KSxcbiAgICAgICAgICBzdGFpcnMgPSBbXTtcblxuICAgICAgZm9yKHZhciBpID0gMDsgaSA8PSBzdGFpckNvdW50OyBpKyspIHtcbiAgICAgICAgc3RhaXJzLnB1c2goe1xuICAgICAgICAgIHN5bTogJ1N0YWlyJyxcbiAgICAgICAgICB4OiB0aGlzLnggKyBzdGFpclBvc20gKiBpLFxuICAgICAgICAgIHk6IHRoaXMueSArIHN0YWlySGVpZ2h0VG90ICogaSxcbiAgICAgICAgICB6OiB0aGlzLnosXG4gICAgICAgICAgaGVpZ2h0OiB0aGlzLnN0YWlySGVpZ2h0LFxuICAgICAgICAgIHdpZHRoOiBzdGFpclBvc20sXG4gICAgICAgICAgZGVwdGg6IHRoaXMuc3RhaXJEZXB0aFxuICAgICAgICB9KTtcbiAgICAgIH1cblxuICAgICAgc3RhaXJzLnB1c2goe1xuICAgICAgICBzeW06ICdUUXVhZCcsXG4gICAgICAgIHgwOiB0aGlzLnggLSBzdGFpclBvc20gLyAyLCB5MDogdGhpcy55LCB6MDogdGhpcy56IC0gdGhpcy5zdGFpckRlcHRoIC8gMixcbiAgICAgICAgeDE6IHRoaXMueCAtIHN0YWlyUG9zbSAvIDIgKyB0aGlzLndpZHRoLCB5MTogdGhpcy55ICsgdGhpcy5oZWlnaHQsIHoxOiB0aGlzLnogLSB0aGlzLnN0YWlyRGVwdGggLyAyLFxuICAgICAgICB4MjogdGhpcy54ICsgc3RhaXJQb3NtIC8gMiArIHRoaXMud2lkdGgsIHkyOiB0aGlzLnkgKyB0aGlzLmhlaWdodCwgejI6IHRoaXMueiAtIHRoaXMuc3RhaXJEZXB0aCAvIDIsXG4gICAgICAgIHgzOiB0aGlzLnggKyBzdGFpclBvc20gLyAyLCB5MzogdGhpcy55LCB6MzogdGhpcy56IC0gdGhpcy5zdGFpckRlcHRoIC8gMlxuICAgICAgfSwge1xuICAgICAgICBzeW06ICdUUXVhZCcsXG4gICAgICAgIHgwOiB0aGlzLnggLSBzdGFpclBvc20gLyAyLCB5MDogdGhpcy55LCB6MDogdGhpcy56ICsgdGhpcy5zdGFpckRlcHRoIC8gMixcbiAgICAgICAgeDE6IHRoaXMueCAtIHN0YWlyUG9zbSAvIDIgKyB0aGlzLndpZHRoLCB5MTogdGhpcy55ICsgdGhpcy5oZWlnaHQsIHoxOiB0aGlzLnogKyB0aGlzLnN0YWlyRGVwdGggLyAyLFxuICAgICAgICB4MjogdGhpcy54ICsgc3RhaXJQb3NtIC8gMiArIHRoaXMud2lkdGgsIHkyOiB0aGlzLnkgKyB0aGlzLmhlaWdodCwgejI6IHRoaXMueiArIHRoaXMuc3RhaXJEZXB0aCAvIDIsXG4gICAgICAgIHgzOiB0aGlzLnggKyBzdGFpclBvc20gLyAyLCB5MzogdGhpcy55LCB6MzogdGhpcy56ICsgdGhpcy5zdGFpckRlcHRoIC8gMlxuICAgICAgfSlcblxuICAgICAgcmV0dXJuIHN0YWlycztcbiAgICB9KTtcblxuICAgIHNoZy5kZWZpbmUoJ1N0YWlyJywgbnVsbCwgbnVsbCwgbnVsbCwgZnVuY3Rpb24oKSB7XG5cbiAgICAgIHZhciBkeCA9IHRoaXMud2lkdGggLyAyLFxuICAgICAgICAgIGR5ID0gdGhpcy5oZWlnaHQgLyAyLFxuICAgICAgICAgIGR6ID0gdGhpcy5kZXB0aCAvIDI7XG5cbiAgICAgIHZhciByZXQgPSBbe1xuICAgICAgICAgIHN5bTogJ1RRdWFkJyxcbiAgICAgICAgICB4MDogdGhpcy54IC0gZHgsIHkwOiB0aGlzLnkgLSBkeSwgejA6IHRoaXMueiAtIGR6LFxuICAgICAgICAgIHgxOiB0aGlzLnggLSBkeCwgeTE6IHRoaXMueSAtIGR5LCB6MTogdGhpcy56ICsgZHosXG4gICAgICAgICAgeDI6IHRoaXMueCArIGR4LCB5MjogdGhpcy55IC0gZHksIHoyOiB0aGlzLnogKyBkeixcbiAgICAgICAgICB4MzogdGhpcy54ICsgZHgsIHkzOiB0aGlzLnkgLSBkeSwgejM6IHRoaXMueiAtIGR6XG4gICAgICAgIH0sIHtcbiAgICAgICAgICBzeW06ICdUUXVhZCcsXG4gICAgICAgICAgeDA6IHRoaXMueCAtIGR4LCB5MDogdGhpcy55ICsgZHksIHowOiB0aGlzLnogLSBkeixcbiAgICAgICAgICB4MTogdGhpcy54IC0gZHgsIHkxOiB0aGlzLnkgKyBkeSwgejE6IHRoaXMueiArIGR6LFxuICAgICAgICAgIHgyOiB0aGlzLnggKyBkeCwgeTI6IHRoaXMueSArIGR5LCB6MjogdGhpcy56ICsgZHosXG4gICAgICAgICAgeDM6IHRoaXMueCArIGR4LCB5MzogdGhpcy55ICsgZHksIHozOiB0aGlzLnogLSBkelxuICAgICAgICB9LFxuICAgICAgXTtcblxuICAgICAgcmV0LnB1c2guYXBwbHkocmV0LCBTSEFQRS5leHRydWRlQWxsKFtcbiAgICAgICAgeyB4OiByZXRbMF0ueDAsIHk6IHJldFswXS55MCwgejogcmV0WzBdLnowIH0sXG4gICAgICAgIHsgeDogcmV0WzBdLngxLCB5OiByZXRbMF0ueTEsIHo6IHJldFswXS56MSB9LFxuICAgICAgICB7IHg6IHJldFswXS54MiwgeTogcmV0WzBdLnkyLCB6OiByZXRbMF0uejIgfSxcbiAgICAgICAgeyB4OiByZXRbMF0ueDMsIHk6IHJldFswXS55MywgejogcmV0WzBdLnozIH1cbiAgICAgIF0sIHRoaXMuaGVpZ2h0LCAnVFF1YWQnKSk7XG5cbiAgICAgIHJldHVybiByZXQ7XG4gICAgfSk7XG5cbiAgfVxufVxuIiwidmFyIGdsTWF0cml4ID0gcmVxdWlyZSgnZ2wtbWF0cml4JyksXG4gICAgdmVjMyA9IGdsTWF0cml4LnZlYzM7XG5cbnZhciBHZW9tID0ge1xuICAvLyBodHRwOi8vd3d3LmVjc2UucnBpLmVkdS9Ib21lcGFnZXMvd3JmL1Jlc2VhcmNoL1Nob3J0X05vdGVzL3BucG9seS5odG1sXG4gIHBucG9seTogZnVuY3Rpb24ocG9seSwgeCwgeSkge1xuICAgIHZhciBuID0gcG9seS5sZW5ndGgsIGksIGosIGMgPSBmYWxzZSwgYSwgYjtcblxuICAgIGZvcihpID0gMCwgaiA9IG4gLSAxOyBpIDwgbjsgaiA9IGkrKykge1xuICAgICAgYSA9IHBvbHlbaV07XG4gICAgICBiID0gcG9seVtqXTtcbiAgICAgIGlmKCAoYS55ID4geSkgIT09IChiLnkgPiB5KSAmJlxuICAgICAgICAgICh4IDwgKGIueCAtIGEueCkgKiAoeSAtIGEueSkgLyAoYi55IC0gYS55KSArIGEueCkgKVxuICAgICAgICBjID0gIWM7XG4gICAgfVxuICAgIHJldHVybiBjO1xuICB9LFxuICBpc092ZXJsYXBwaW5nOiBmdW5jdGlvbihwb2x5LCB2ZXJ0aWNlcykge1xuICAgIGZvcih2YXIgaSA9IHZlcnRpY2VzLmxlbmd0aCAtIDE7IGktLTspIHtcbiAgICAgIGlmKEdlb20ucG5wb2x5KHBvbHksIHZlcnRpY2VzW2ldLngsIHZlcnRpY2VzW2ldLnkpICYmIHBvbHkuaW5kZXhPZih2ZXJ0aWNlc1tpXSkgPT09IC0xKVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9LFxuICBpc1BvbHlJbjogZnVuY3Rpb24ocG9seSwgcG9seXMpIHtcbiAgICBmb3IodmFyIGkgPSBwb2x5cy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKVxuICAgICAgaWYoR2VvbS5pc0VxdWFsUG9seShwb2x5LCBwb2x5c1tpXSkpXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfSxcbiAgaXNFcXVhbFBvbHk6IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICBpZihhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcblxuICAgIGZvcih2YXIgaSA9IGEubGVuZ3RoIC0gMTsgaS0tOylcbiAgICAgIGlmKGIuaW5kZXhPZihhW2ldKSA9PT0gLTEpXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSxcbiAgaW5zZXRQb2x5Z29uOiBmdW5jdGlvbihwb2x5LCBkaXN0KSB7XG4gICAgdmFyIGEsIGIsIGMsIG91dCA9IFtdO1xuXG4gICAgYiA9IHBvbHlbIHBvbHkubGVuZ3RoIC0gMSBdO1xuXG4gICAgZm9yKHZhciBpID0gMDsgaSA8IHBvbHkubGVuZ3RoIC0gMTsgaSsrKSB7XG4gICAgICBhID0gYjtcbiAgICAgIGIgPSBwb2x5WyBpIF07XG4gICAgICBjID0gcG9seVsgaSArIDEgXTtcbiAgICAgIG91dC5wdXNoKEdlb20uaW5zZXRDb3JuZXIoYSwgYiwgYywgZGlzdCkpO1xuICAgIH1cbiAgICBvdXQucHVzaChHZW9tLmluc2V0Q29ybmVyKGIsIGMsIHBvbHlbIDAgXSwgZGlzdCkpO1xuXG4gICAgcmV0dXJuIG91dDtcbiAgfSxcbiAgLy8gYSAgICAgIHByZXZpb3VzIHBvaW50XG4gIC8vIGIgICAgICBjdXJyZW50IHBvaW50XG4gIC8vIGMgICAgICBuZXh0IHBvaW50XG4gIC8vIGRpc3QgICBkaXN0YW5jZVxuICBpbnNldENvcm5lcjogZnVuY3Rpb24oYSwgYiwgYywgZGlzdCkge1xuICAgIHZhciBkeDEgPSBiLnggLSBhLngsIGR5MSA9IGEueSAtIGIueSxcbiAgICAgICAgZHgyID0gYy54IC0gYi54LCBkeTIgPSBiLnkgLSBjLnksXG4gICAgICAgIGRpc3QxID0gTWF0aC5zcXJ0KGR4MSAqIGR4MSArIGR5MSAqIGR5MSksXG4gICAgICAgIGRpc3QyID0gTWF0aC5zcXJ0KGR4MiAqIGR4MiArIGR5MiAqIGR5MiksXG4gICAgICAgIGluc1gxLCBpbnNYMiwgaW5zWTEsIGluc1kyLCBpbnNwLFxuICAgICAgICBiMSA9IHsgeDogYi54LCB5OiBiLnkgfSxcbiAgICAgICAgYjIgPSB7IHg6IGIueCwgeTogYi55IH07XG5cbiAgICBpZihkaXN0MSA9PSAwIHx8IGRpc3QyID09IDApXG4gICAgICByZXR1cm4gbnVsbDtcblxuICAgIGluc1gxID0gZHkxIC8gZGlzdDEgKiBkaXN0O1xuICAgIGluc1kxID0gZHgxIC8gZGlzdDEgKiBkaXN0O1xuICAgIGluc1gyID0gZHkyIC8gZGlzdDIgKiBkaXN0O1xuICAgIGluc1kyID0gZHgyIC8gZGlzdDIgKiBkaXN0O1xuXG4gICAgYjEueCArPSBpbnNYMTsgYjEueSArPSBpbnNZMTtcbiAgICBiMi54ICs9IGluc1gyOyBiMi55ICs9IGluc1kyO1xuXG4gICAgaWYoYjEueCA9PT0gYjIueCAmJiBiMS55ID09PSBiMi55KVxuICAgICAgcmV0dXJuIGIxO1xuXG4gICAgcmV0dXJuIEdlb20ubGluZUludGVyc2VjdGlvbihcbiAgICAgICAgICAgICB7IHg6IGEueCArIGluc1gxLCB5OiBhLnkgKyBpbnNZMSB9LCBiMSxcbiAgICAgICAgICAgICBiMiwgeyB4OiBjLnggKyBpbnNYMiwgeTogYy55ICsgaW5zWTIgfVxuICAgICAgICAgICApO1xuICB9LFxuICAvLyBodHRwOi8vYWxpZW5yeWRlcmZsZXguY29tL2ludGVyc2VjdC9cbiAgbGluZUludGVyc2VjdGlvbjogZnVuY3Rpb24oQTEsIEEyLCBCMSwgQjIpIHtcblxuICAgIHZhciBkaXN0LCBjb3NfLCBzaW5fLCBueCwgcCxcbiAgICAgICAgYTEgPSB7IHg6IEExLngsIHk6IEExLnkgfSxcbiAgICAgICAgYTIgPSB7IHg6IEEyLngsIHk6IEEyLnkgfSxcbiAgICAgICAgYjEgPSB7IHg6IEIxLngsIHk6IEIxLnkgfSxcbiAgICAgICAgYjIgPSB7IHg6IEIyLngsIHk6IEIyLnkgfTtcblxuICAgIC8vIFRyYW5zbGF0ZSBieSAtYTFcbiAgICBhMi54IC09IGExLng7IGIxLnggLT0gYTEueDsgYjIueCAtPSBhMS54O1xuICAgIGEyLnkgLT0gYTEueTsgYjEueSAtPSBhMS55OyBiMi55IC09IGExLnk7XG4gICAgXG4gICAgZGlzdCA9IE1hdGguc3FydChhMi54ICogYTIueCArIGEyLnkgKiBhMi55KTtcblxuICAgIC8vIFJvdGF0ZSBzbyBhMiBsaWVzIG9uIHRoZSBwb3NpdGl2ZSB4IGF4aXNcbiAgICBjb3NfID0gYTIueCAvIGRpc3Q7XG4gICAgc2luXyA9IGEyLnkgLyBkaXN0O1xuXG4gICAgbnggICA9ICAgYjEueCAqIGNvc18gKyBiMS55ICogc2luXztcbiAgICBiMS55ID0gLSBiMS54ICogc2luXyArIGIxLnkgKiBjb3NfOyBiMS54ID0gbng7IFxuICAgIG54ICAgPSAgIGIyLnggKiBjb3NfICsgYjIueSAqIHNpbl87XG4gICAgYjIueSA9IC0gYjIueCAqIHNpbl8gKyBiMi55ICogY29zXzsgYjIueCA9IG54OyBcblxuICAgIC8vIFBhcmFsbGVsIGxpbmVzXG4gICAgaWYoYjEueSA9PSBiMi55KVxuICAgICAgcmV0dXJuIG51bGw7XG5cbiAgICBwID0gYjIueCArIChiMS54IC0gYjIueCkgKiBiMi55IC8gKGIyLnkgLSBiMS55KTtcblxuICAgIHJldHVybiB7IHg6IGExLnggKyBwICogY29zXywgeTogYTEueSArIHAgKiBzaW5fIH07XG4gIH0sXG4gIHRyaVRvTm9ybWFsOiBmdW5jdGlvbihwb2ludHMpIHtcbiAgICAvKnZhciB2QSA9IHZlYzMuZnJvbVZhbHVlcyh2ZWMzLCBwb2ludHNbM10sIHBvaW50c1s0XSwgcG9pbnRzWzVdKSxcbiAgICAgICAgdkIgPSB2ZWMzLmZyb21WYWx1ZXModmVjMywgcG9pbnRzWzBdLCBwb2ludHNbMV0sIHBvaW50c1syXSksXG4gICAgICAgIHZDID0gdmVjMy5mcm9tVmFsdWVzKHZlYzMsIHBvaW50c1s2XSwgcG9pbnRzWzddLCBwb2ludHNbOF0pLFxuICAgICAgICBub3JtID0gdmVjMy5jcmVhdGUoKTtcbiAgICB2ZWMzLnN1Yih2QiwgdkIsIHZBKTtcbiAgICB2ZWMzLnN1Yih2QywgdkMsIHZBKTtcbiAgICB2ZWMzLmNyb3NzKG5vcm0sIHZCLCB2Qyk7XG4gICAgdmVjMy5ub3JtYWxpemUobm9ybSwgbm9ybSk7XG4gICAgcmV0dXJuIG5vcm07Ki9cblxuICAgIC8qdmFyIHZBID0gdmVjMy5jcmVhdGUoKSwgdkIgPSB2ZWMzLmNyZWF0ZSgpO1xuICAgIHZlYzMuc2V0KHZBLCBwb2ludHNbMF0gLSBwb2ludHNbM10sIHBvaW50c1sxXSAtIHBvaW50c1s0XSwgcG9pbnRzWzJdIC0gcG9pbnRzWzVdKTtcbiAgICB2ZWMzLnNldCh2QiwgcG9pbnRzWzZdIC0gcG9pbnRzWzNdLCBwb2ludHNbN10gLSBwb2ludHNbNF0sIHBvaW50c1s4XSAtIHBvaW50c1s1XSk7XG4gICAgdmVjMy5jcm9zcyh2QSwgdkEsIHZCKTtcbiAgICB2ZWMzLm5vcm1hbGl6ZSh2QSwgdkEpO1xuICAgIHJldHVybiB2QTsqL1xuICAgIHZhciBhMSA9IHBvaW50c1swXSAtIHBvaW50c1szXSwgYTIgPSBwb2ludHNbMV0gLSBwb2ludHNbNF0sIGEzID0gcG9pbnRzWzJdIC0gcG9pbnRzWzVdLFxuICAgICAgICBiMSA9IHBvaW50c1s2XSAtIHBvaW50c1szXSwgYjIgPSBwb2ludHNbN10gLSBwb2ludHNbNF0sIGIzID0gcG9pbnRzWzhdIC0gcG9pbnRzWzVdO1xuXG4gICAgdmFyIG5YID0gYTIgKiBiMyAtIGEzICogYjIsXG4gICAgICAgIG5ZID0gYTEgKiBiMyAtIGEzICogYjEsXG4gICAgICAgIG5aID0gYTEgKiBiMiAtIGEyICogYjEsXG4gICAgICAgIHJsZW4gPSAxIC8gTWF0aC5zcXJ0KG5YICogblggKyBuWSAqIG5ZICsgblogKiBuWik7XG4gICAgXG4gICAgblggKj0gcmxlbjtcbiAgICBuWSAqPSBybGVuO1xuICAgIG5aICo9IHJsZW47XG5cbiAgICByZXR1cm4gWyBuWCwgblksIG5aIF07XG5cbiAgfVxuXG59XG5cbm1vZHVsZS5leHBvcnRzID0gR2VvbTtcbiIsInZhciBDb250ZXh0ID0gcmVxdWlyZSgnLi8uLi9Db250ZXh0Jyk7XG5cbnZhciBkaWN0ID0ge1xufTtcblxudmFyIGxvZyA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3VsJyk7XG5sb2cuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xubG9nLnN0eWxlLnRvcCA9ICc3cmVtJztcbmxvZy5zdHlsZS5sZWZ0ID0gJzFyZW0nO1xubG9nLnN0eWxlLmNvbG9yID0gJyM0NDQnO1xubG9nLnN0eWxlLmZvbnQgPSAnMTBweCBcIlVidW50dSBNb25vXCIsIG1vbm9zcGFjZSc7XG5sb2cuc3R5bGUubGluZUhlaWdodCA9ICcxLjVlbSc7XG5sb2cuc3R5bGUubGlzdFN0eWxlVHlwZSA9ICdub25lJztcblxuQ29udGV4dC5jYW52YXMucGFyZW50Tm9kZS5hcHBlbmRDaGlsZChsb2cpO1xuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgcHJvZ3Jlc3M6IGZ1bmN0aW9uKGlkLCBwZXJjZW50KSB7XG4gICAgaWYoIShpZCBpbiBkaWN0KSkge1xuICAgICAgdmFyIGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgIGxvZy5hcHBlbmRDaGlsZChsaSk7XG4gICAgICBkaWN0W2lkXSA9IHsgZm5zOiBbXSwgbGk6IGxpLCB2YWx1ZTogMCB9O1xuICAgIH1cblxuICAgIGRpY3RbaWRdLnZhbHVlID0gcGVyY2VudDtcblxuICAgIGlmKHBlcmNlbnQgPj0gMSkge1xuICAgICAgZGljdFtpZF0uZm5zLmZvckVhY2goZnVuY3Rpb24oaSkge1xuICAgICAgICBpKCk7XG4gICAgICB9KTtcbiAgICB9XG4gIH0sXG4gIHN1YnNjcmliZTogZnVuY3Rpb24oaWQsIGZuKSB7XG4gICAgaWYoIShpZCBpbiBkaWN0KSkge1xuICAgICAgdmFyIGxpID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnbGknKTtcbiAgICAgIGxvZy5hcHBlbmRDaGlsZChsaSk7XG4gICAgICBkaWN0W2lkXSA9IHsgZm5zOiBbXSwgbGk6IGxpLCB2YWx1ZTogMCB9O1xuICAgIH1cblxuICAgIGRpY3RbaWRdLmZucy5wdXNoKGZuKTtcbiAgXG4gIH0sXG4gIHJlbmRlcjogZnVuY3Rpb24oKSB7XG4gICAgdmFyIHN0ciA9ICcnLCBsaTtcbiAgICBmb3IoaSBpbiBkaWN0KSB7XG4gICAgICB2YXIgcGN0ID0gcGFyc2VJbnQoZGljdFtpXS52YWx1ZSAqIDEwMCksIHNwID0gJycgKyBwY3Q7XG4gICAgICB3aGlsZShzcC5sZW5ndGggPCA0KSBzcCA9ICdfJyArIHNwO1xuICAgICAgc3AgPSBzcC5yZXBsYWNlKC9fL2csICcmbmJzcDsnKTtcbiAgICAgIGRpY3RbaV0ubGkuaW5uZXJIVE1MID0gJyZuYnNwOycgKyBpICsgJzogJyArIHNwICsgXCIlJm5ic3A7XFxuXCI7XG4gICAgICB2YXIgYSA9ICdsaW5lYXItZ3JhZGllbnQoOTBkZWcsICMwZjAsICMwZjAgJyArIHBjdCArICclLCAjMGIwICcgKyBwY3QgKyAnJSknO1xuICAgICAgZGljdFtpXS5saS5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSBhO1xuXG4gICAgfVxuICB9XG59XG4iLCJ2YXIgZ2xNYXRyaXggPSByZXF1aXJlKCdnbC1tYXRyaXgnKSxcbiAgICBDb250ZXh0ICA9IHJlcXVpcmUoJy4vLi4vQ29udGV4dCcpLFxuICAgIGdsICAgICAgID0gQ29udGV4dC5nbDtcblxudmFyIE1lc2ggPSBmdW5jdGlvbih2ZXJ0aWNlcywgbm9ybWFscywgdXZzLCBleHRyYSkge1xuICB0aGlzLnZCdWYgPSBnbC5jcmVhdGVCdWZmZXIoKTtcbiAgdGhpcy5uQnVmID0gZ2wuY3JlYXRlQnVmZmVyKCk7XG4gIHRoaXMudUJ1ZiA9IGdsLmNyZWF0ZUJ1ZmZlcigpO1xuICB0aGlzLmVCdWYgPSBnbC5jcmVhdGVCdWZmZXIoKTtcblxuICB0aGlzLmNvdW50ID0gdmVydGljZXMubGVuZ3RoIC8gMztcblxuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy52QnVmKTtcbiAgZ2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIG5ldyBGbG9hdDMyQXJyYXkodmVydGljZXMpLCBnbC5TVEFUSUNfRFJBVyk7XG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCB0aGlzLm5CdWYpO1xuICBnbC5idWZmZXJEYXRhKGdsLkFSUkFZX0JVRkZFUiwgbmV3IEZsb2F0MzJBcnJheShub3JtYWxzKSwgZ2wuU1RBVElDX0RSQVcpO1xuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy51QnVmKTtcbiAgZ2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIG5ldyBGbG9hdDMyQXJyYXkodXZzKSwgZ2wuU1RBVElDX0RSQVcpO1xuICBnbC5iaW5kQnVmZmVyKGdsLkFSUkFZX0JVRkZFUiwgdGhpcy5lQnVmKTtcbiAgZ2wuYnVmZmVyRGF0YShnbC5BUlJBWV9CVUZGRVIsIG5ldyBGbG9hdDMyQXJyYXkoZXh0cmEpLCBnbC5TVEFUSUNfRFJBVyk7XG4gIGdsLmJpbmRCdWZmZXIoZ2wuQVJSQVlfQlVGRkVSLCBudWxsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBNZXNoO1xuIiwidmFyIFF1YWRUcmVlID0gZnVuY3Rpb24oeCwgeSwgdywgbGltaXQpIHtcblxuICB0aGlzLm53ID0gdGhpcy5zdyA9IHRoaXMubmUgPSB0aGlzLnNlID0gbnVsbDtcblxuICB0aGlzLnggPSB4O1xuICB0aGlzLnkgPSB5O1xuICB0aGlzLncgPSB3O1xuICB0aGlzLmxpbWl0ID0gbGltaXQ7XG5cbiAgdGhpcy5wb2ludHMgPSBbXTtcbn07XG5cblF1YWRUcmVlLnByb3RvdHlwZS5jb250YWlucyA9IGZ1bmN0aW9uKGVsKSB7XG4gIHJldHVybiAoTWF0aC5hYnMoZWwueCAtIHRoaXMueCkgPCB0aGlzLncgJiYgTWF0aC5hYnMoZWwueSAtIHRoaXMueSkgPCB0aGlzLncpO1xufVxuXG5RdWFkVHJlZS5wcm90b3R5cGUuaW5zZXJ0ID0gZnVuY3Rpb24oZWwpIHtcbiAgaWYoIXRoaXMuY29udGFpbnMoZWwpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZih0aGlzLnBvaW50cy5sZW5ndGggPCB0aGlzLmxpbWl0KSB7XG4gICAgdGhpcy5wb2ludHMucHVzaChlbCk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBpZih0aGlzLm53ID09PSBudWxsKVxuICAgIHRoaXMuc3ViZGl2aWRlKCk7XG5cbiAgcmV0dXJuIHRoaXMubncuaW5zZXJ0KGVsKSB8fFxuICAgICAgICAgdGhpcy5uZS5pbnNlcnQoZWwpIHx8XG4gICAgICAgICB0aGlzLnN3Lmluc2VydChlbCkgfHxcbiAgICAgICAgIHRoaXMuc2UuaW5zZXJ0KGVsKTtcbn1cblxuUXVhZFRyZWUucHJvdG90eXBlLnN1YmRpdmlkZSA9IGZ1bmN0aW9uKCkge1xuICB2YXIgeCA9IHRoaXMueCwgeSA9IHRoaXMueSwgdyA9IHRoaXMudyAvIDI7XG4gIHRoaXMubncgPSBuZXcgUXVhZFRyZWUoeCAtIHcsIHkgLSB3LCB3LCB0aGlzLmxpbWl0KTtcbiAgdGhpcy5zdyA9IG5ldyBRdWFkVHJlZSh4IC0gdywgeSArIHcsIHcsIHRoaXMubGltaXQpO1xuICB0aGlzLm5lID0gbmV3IFF1YWRUcmVlKHggKyB3LCB5IC0gdywgdywgdGhpcy5saW1pdCk7XG4gIHRoaXMuc2UgPSBuZXcgUXVhZFRyZWUoeCArIHcsIHkgKyB3LCB3LCB0aGlzLmxpbWl0KTtcbn1cblxuUXVhZFRyZWUucHJvdG90eXBlLmludGVyc2VjdCA9IGZ1bmN0aW9uKHgsIHksIHcpIHtcbiAgcmV0dXJuIE1hdGguYWJzKHRoaXMueCAtIHgpIDwgdGhpcy53ICsgdyAmJlxuICAgICAgICAgTWF0aC5hYnModGhpcy55IC0geSkgPCB0aGlzLncgKyB3O1xufVxuXG5RdWFkVHJlZS5wcm90b3R5cGUucXVlcnkgPSBmdW5jdGlvbih4LCB5LCB3KSB7XG4gIHZhciBwdHMgPSBbXSwgY3B0cyA9IFtdLCB0cCA9IHRoaXMucG9pbnRzO1xuXG4gIGlmKCF0aGlzLmludGVyc2VjdCh4LCB5LCB3KSkge1xuICAgIHJldHVybiBwdHM7XG4gIH1cblxuICBmb3IodmFyIGkgPSAwLCBJID0gdHAubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgaWYocG9pbnRJblJhbmdlKHRwW2ldLCB4LCB5LCB3KSlcbiAgICAgIHB0cy5wdXNoKHRwW2ldKTtcbiAgfVxuXG4gIGlmKHRoaXMubncgPT09IG51bGwpXG4gICAgcmV0dXJuIHB0cztcblxuICBjcHRzID0gdGhpcy5udy5xdWVyeSh4LCB5LCB3KTtcbiAgZm9yKHZhciBpID0gMCwgSSA9IGNwdHMubGVuZ3RoOyBpIDwgSTsgaSsrKVxuICAgIHB0cy5wdXNoKGNwdHNbaV0pO1xuXG4gIGNwdHMgPSB0aGlzLm5lLnF1ZXJ5KHgsIHksIHcpO1xuICBmb3IodmFyIGkgPSAwLCBJID0gY3B0cy5sZW5ndGg7IGkgPCBJOyBpKyspXG4gICAgcHRzLnB1c2goY3B0c1tpXSk7XG5cbiAgY3B0cyA9IHRoaXMuc3cucXVlcnkoeCwgeSwgdyk7XG4gIGZvcih2YXIgaSA9IDAsIEkgPSBjcHRzLmxlbmd0aDsgaSA8IEk7IGkrKylcbiAgICBwdHMucHVzaChjcHRzW2ldKTtcblxuICBjcHRzID0gdGhpcy5zZS5xdWVyeSh4LCB5LCB3KTtcbiAgZm9yKHZhciBpID0gMCwgSSA9IGNwdHMubGVuZ3RoOyBpIDwgSTsgaSsrKVxuICAgIHB0cy5wdXNoKGNwdHNbaV0pO1xuXG4gIHJldHVybiBwdHM7XG59XG5cbnZhciBwb2ludEluUmFuZ2UgPSBmdW5jdGlvbihlbCwgeCwgeSwgdykge1xuICByZXR1cm4gTWF0aC5hYnMoZWwueCAtIHgpIDwgdyAmJiBNYXRoLmFicyhlbC55IC0geSkgPCB3O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBRdWFkVHJlZTtcbiIsIi8qXG4gKiBHZW5lcmFsIHJ1bGU6IG9ubHkgcmVjdGFuZ2xlcyBhbGxvd2VkLlxuICogcDEgcDJcbiAqIHAwIHAzXG4gKi9cbnZhciBTSEFQRSA9IHtcbiAgLy8gSW5wdXQ6ICBzZWdtZW50IGVuZHMsIGV4dHJ1c2lvbiBoZWlnaHQsIG5vcm1hbFxuICAvLyBPdXRwdXQ6IHF1YWRcbiAgZXh0cnVkZTogZnVuY3Rpb24oc3ltYm9sLCBhLCBiLCBsZW4sIG5vcm0pIHtcblxuICAgIHZhciBuWCA9IDAsIG5ZID0gbGVuLCBuWiA9IDA7XG5cbiAgICBpZihub3JtICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIG5YID0gbm9ybVswXSAqIGxlbjsgXG4gICAgICBuWSA9IG5vcm1bMV0gKiBsZW47XG4gICAgICBuWiA9IG5vcm1bMl0gKiBsZW47XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN5bTogc3ltYm9sLFxuICAgICAgcG9pbnRzOiBbXG4gICAgICAgIHsgeDogYS54LCAgICAgIHk6IGEueSwgICAgICB6OiBhLnogfSxcbiAgICAgICAgeyB4OiBhLnggKyBuWCwgeTogYS55ICsgblksIHo6IGEueiArIG5aIH0sXG4gICAgICAgIHsgeDogYi54ICsgblgsIHk6IGIueSArIG5ZLCB6OiBiLnogKyBuWiB9LFxuICAgICAgICB7IHg6IGIueCwgICAgICB5OiBiLnksICAgICAgejogYi56IH1cbiAgICAgIF1cbiAgICB9O1xuICB9LFxuICBcbiAgLy8gSW5wdXQ6ICBsaXN0IG9mIHBvaW50cywgc3ltYm9sc1xuICAvLyBPdXRwdXQ6IFtxdWFkXVxuICBleHRydWRlQWxsOiBmdW5jdGlvbihwYXRoLCBsZW4sIHN5bWJvbHMsIG5vcm0pIHtcbiAgICB2YXIgb3V0ID0gW107XG4gICAgZm9yKHZhciBpID0gMCwgbiA9IHBhdGgubGVuZ3RoOyBpIDwgbjsgKytpKSB7XG4gICAgICB2YXIgY3VyID0gcGF0aFtpXSwgbmV4dCA9IHBhdGhbKGkgKyAxKSAlIG5dO1xuICAgICAgb3V0LnB1c2goU0hBUEUuZXh0cnVkZShzeW1ib2xzIGluc3RhbmNlb2YgQXJyYXkgPyBzeW1ib2xzW2ldIDogc3ltYm9scywgY3VyLCBuZXh0LCBsZW4sIG5vcm0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbiAgfSxcblxuICAvLyBJbnB1dDogIHF1YWQsIGxpc3Qgb2Ygc3BsaXRzIChtdXN0IHN1bSB0byAxIGluIGVhY2ggZGlyZWN0aW9uKVxuICAvLyBPdXRwdXQ6IFtxdWFkXVxuICAvLyBTcGxpdCBmcm9tIHRvcCB0byBib3R0b21cbiAgc3BsaXQ6IGZ1bmN0aW9uKHF1YWQsIHhTcGxpdHMsIHlTcGxpdHMsIHN5bWJvbHMpIHtcbiAgICB2YXIgb3V0ID0gW10sIHN5bUkgPSAwLCBzaW9hID0gc3ltYm9scyBpbnN0YW5jZW9mIEFycmF5LFxuICAgICAgICBxcCA9IHF1YWQucG9pbnRzLCBxdSA9IHF1YWQudXZzLFxuICAgICAgICBwMCA9IHFwWzBdLCBwMSA9IHFwWzFdLCBwMiA9IHFwWzJdLCBwMyA9IHFwWzNdLFxuICAgICAgICB4MCA9IHAwLngsIHgxID0gcDEueCwgeDIgPSBwMi54LCB4MyA9IHAzLngsXG4gICAgICAgIHkwID0gcDAueSwgeTEgPSBwMS55LCB5MiA9IHAyLnksIHkzID0gcDMueSxcbiAgICAgICAgejAgPSBwMC56LCB6MSA9IHAxLnosIHoyID0gcDIueiwgejMgPSBwMy56LFxuICAgICAgICBkcyA9IDEsIGR0ID0gMSwgbXMgPSAwLCBtdCA9IDA7XG5cbiAgICBpZihxdSBpbnN0YW5jZW9mIEFycmF5KVxuICAgICAgZHMgPSBxdVszXS5zIC0gcXVbMF0ucywgZHQgPSBxdVsxXS50IC0gcXVbMF0udCxcbiAgICAgIG1zID0gcXVbMF0ucywgbXQgPSBxdVsxXS50O1xuXG4gICAgdmFyIGFjY1kgPSAwO1xuICAgIGZvcih2YXIgeSA9IDAsIFkgPSB5U3BsaXRzLmxlbmd0aDsgeSA8IFk7ICsreSkge1xuICAgICAgdmFyIGFjY1ggPSAwLCBhY2NZWSA9IGFjY1kgKyB5U3BsaXRzW3ldO1xuICAgICAgZm9yKHZhciB4ID0gMCwgWCA9IHhTcGxpdHMubGVuZ3RoOyB4IDwgWDsgKyt4KSB7XG4gICAgICAgIHZhciBhY2NYWCA9IGFjY1ggKyB4U3BsaXRzW3hdLCBcbiAgICAgICAgICAgIHhhID0gU0hBUEUubGVycCh4MCwgeDMsIGFjY1gpLFxuICAgICAgICAgICAgeGIgPSBTSEFQRS5sZXJwKHgwLCB4MywgYWNjWFgpLFxuICAgICAgICAgICAgeWEgPSBTSEFQRS5sZXJwKHkwLCB5MSwgYWNjWSksXG4gICAgICAgICAgICB5YiA9IFNIQVBFLmxlcnAoeTAsIHkxLCBhY2NZWSksXG4gICAgICAgICAgICB6YSA9IFNIQVBFLmxlcnAoejAsIHozLCBhY2NYKSxcbiAgICAgICAgICAgIHpiID0gU0hBUEUubGVycCh6MCwgejMsIGFjY1hYKTtcblxuICAgICAgICBvdXQucHVzaCh7XG4gICAgICAgICAgc3ltOiBzaW9hID8gc3ltYm9sc1tzeW1JKytdIDogc3ltYm9scyxcbiAgICAgICAgICBwb2ludHM6IFtcbiAgICAgICAgICAgIHsgeDogeGEsIHk6IHlhLCB6OiB6YSB9LFxuICAgICAgICAgICAgeyB4OiB4YSwgeTogeWIsIHo6IHphIH0sXG4gICAgICAgICAgICB7IHg6IHhiLCB5OiB5YiwgejogemIgfSxcbiAgICAgICAgICAgIHsgeDogeGIsIHk6IHlhLCB6OiB6YiB9XG4gICAgICAgICAgXSxcbiAgICAgICAgICB1dnM6IFtcbiAgICAgICAgICAgIHsgczogbXMgKyBkcyAqIGFjY1gsICB0OiBtdCArIGR0ICogYWNjWSB9LFxuICAgICAgICAgICAgeyBzOiBtcyArIGRzICogYWNjWCwgIHQ6IG10ICsgZHQgKiBhY2NZWSB9LFxuICAgICAgICAgICAgeyBzOiBtcyArIGRzICogYWNjWFgsIHQ6IG10ICsgZHQgKiBhY2NZWSB9LFxuICAgICAgICAgICAgeyBzOiBtcyArIGRzICogYWNjWFgsIHQ6IG10ICsgZHQgKiBhY2NZIH0sXG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgICBhY2NYID0gYWNjWFg7XG4gICAgICB9XG4gICAgICBhY2NZID0gYWNjWVk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbiAgfSxcblxuICBzcGxpdFhaOiBmdW5jdGlvbihxdWFkLCB4U3BsaXRzLCB6U3BsaXRzLCBzeW1ib2xzKSB7XG4gICAgdmFyIG91dCA9IFtdLCBzeW1JID0gMCxcbiAgICAgICAgcXAgPSBxdWFkLnBvaW50cyxcbiAgICAgICAgcDAgPSBxcFswXSwgcDEgPSBxcFsxXSwgcDIgPSBxcFsyXSwgcDMgPSBxcFszXSxcbiAgICAgICAgeDAgPSBwMC54LCB4MSA9IHAxLngsIHgyID0gcDIueCwgeDMgPSBwMy54LFxuICAgICAgICB5MCA9IHAwLnksIHkxID0gcDEueSwgeTIgPSBwMi55LCB5MyA9IHAzLnksXG4gICAgICAgIHowID0gcDAueiwgejEgPSBwMS56LCB6MiA9IHAyLnosIHozID0gcDMuejtcblxuICAgIHZhciBhY2NaID0gMDtcbiAgICBmb3IodmFyIHogPSAwLCBaID0gelNwbGl0cy5sZW5ndGg7IHogPCBaOyArK3opIHtcbiAgICAgIHZhciBhY2NYID0gMDtcbiAgICAgIGZvcih2YXIgeCA9IDAsIFggPSB4U3BsaXRzLmxlbmd0aDsgeCA8IFg7ICsreCkge1xuICAgICAgICB2YXIgeGEgPSBTSEFQRS5sZXJwKHgwLCB4MywgYWNjWCksXG4gICAgICAgICAgICB4YiA9IFNIQVBFLmxlcnAoeDAsIHgzLCBhY2NYICsgeFNwbGl0c1t4XSksXG4gICAgICAgICAgICB5YSA9IFNIQVBFLmxlcnAoeTAsIHkxLCBhY2NYKSxcbiAgICAgICAgICAgIHliID0gU0hBUEUubGVycCh5MCwgeTEsIGFjY1ggKyB4U3BsaXRzW3hdKSxcbiAgICAgICAgICAgIHphID0gU0hBUEUubGVycCh6MCwgejEsIGFjY1opLFxuICAgICAgICAgICAgemIgPSBTSEFQRS5sZXJwKHowLCB6MSwgYWNjWiArIHpTcGxpdHNbel0pO1xuXG4gICAgICAgIG91dC5wdXNoKHtcbiAgICAgICAgICBzeW06IHN5bWJvbHMgaW5zdGFuY2VvZiBBcnJheT8gc3ltYm9sc1tzeW1JKytdIDogc3ltYm9scyxcbiAgICAgICAgICBwb2ludHM6IFtcbiAgICAgICAgICAgIHsgeDogeGEsIHk6IHlhLCB6OiB6YSB9LFxuICAgICAgICAgICAgeyB4OiB4YSwgeTogeWEsIHo6IHpiIH0sXG4gICAgICAgICAgICB7IHg6IHhiLCB5OiB5YiwgejogemIgfSxcbiAgICAgICAgICAgIHsgeDogeGIsIHk6IHliLCB6OiB6YSB9XG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgICBhY2NYICs9IHhTcGxpdHNbeF07XG4gICAgICB9XG4gICAgICBhY2NaICs9IHpTcGxpdHNbel07XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbiAgfSxcblxuICBzcGxpdFpYOiBmdW5jdGlvbihxdWFkLCB4U3BsaXRzLCB6U3BsaXRzLCBzeW1ib2xzKSB7XG4gICAgdmFyIG91dCA9IFtdLCBzeW1JID0gMCxcbiAgICAgICAgcXAgPSBxdWFkLnBvaW50cyxcbiAgICAgICAgcDAgPSBxcFswXSwgcDEgPSBxcFsxXSwgcDIgPSBxcFsyXSwgcDMgPSBxcFszXSxcbiAgICAgICAgeDAgPSBwMC54LCB4MSA9IHAxLngsIHgyID0gcDIueCwgeDMgPSBwMy54LFxuICAgICAgICB5MCA9IHAwLnksIHkxID0gcDEueSwgeTIgPSBwMi55LCB5MyA9IHAzLnksXG4gICAgICAgIHowID0gcDAueiwgejEgPSBwMS56LCB6MiA9IHAyLnosIHozID0gcDMuejtcblxuICAgIHZhciBhY2NaID0gMDtcbiAgICBmb3IodmFyIHogPSAwLCBaID0gelNwbGl0cy5sZW5ndGg7IHogPCBaOyArK3opIHtcbiAgICAgIHZhciBhY2NYID0gMDtcbiAgICAgIGZvcih2YXIgeCA9IDAsIFggPSB4U3BsaXRzLmxlbmd0aDsgeCA8IFg7ICsreCkge1xuICAgICAgICB2YXIgeGEgPSBTSEFQRS5sZXJwKHgwLCB4MSwgYWNjWCksXG4gICAgICAgICAgICB4YiA9IFNIQVBFLmxlcnAoeDAsIHgxLCBhY2NYICsgeFNwbGl0c1t4XSksXG4gICAgICAgICAgICB5YSA9IFNIQVBFLmxlcnAoeTAsIHkxLCBhY2NYKSxcbiAgICAgICAgICAgIHliID0gU0hBUEUubGVycCh5MCwgeTEsIGFjY1ggKyB4U3BsaXRzW3hdKSxcbiAgICAgICAgICAgIHphID0gU0hBUEUubGVycCh6MCwgejMsIGFjY1opLFxuICAgICAgICAgICAgemIgPSBTSEFQRS5sZXJwKHowLCB6MywgYWNjWiArIHpTcGxpdHNbel0pO1xuXG4gICAgICAgIG91dC5wdXNoKHtcbiAgICAgICAgICBzeW06IHN5bWJvbHMgaW5zdGFuY2VvZiBBcnJheT8gc3ltYm9sc1tzeW1JKytdIDogc3ltYm9scyxcbiAgICAgICAgICBwb2ludHM6IFtcbiAgICAgICAgICAgIHsgeDogeGEsIHk6IHlhLCB6OiB6YSB9LFxuICAgICAgICAgICAgeyB4OiB4YSwgeTogeWEsIHo6IHpiIH0sXG4gICAgICAgICAgICB7IHg6IHhiLCB5OiB5YiwgejogemIgfSxcbiAgICAgICAgICAgIHsgeDogeGIsIHk6IHliLCB6OiB6YSB9XG4gICAgICAgICAgXVxuICAgICAgICB9KVxuICAgICAgICBhY2NYICs9IHhTcGxpdHNbeF07XG4gICAgICB9XG4gICAgICBhY2NaICs9IHpTcGxpdHNbel07XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dDtcbiAgfSxcblxuICAvLyBJbnB1dDogYXhpcywgcXVhZCwgc3ltYm9sXG4gIC8vIE91dHB1dDogW3F1YWRdXG4gIGZpdDogZnVuY3Rpb24oYXhpcywgcXVhZCwgc3ltYm9sLCByYXRpbykge1xuXG4gICAgcmF0aW8gPSByYXRpbyB8fCAxO1xuXG4gICAgdmFyIHFwID0gcXVhZC5wb2ludHMsXG4gICAgICAgIHAwID0gcXBbMF0sIHAxID0gcXBbMV0sIHAyID0gcXBbMl0sIHAzID0gcXBbM10sXG4gICAgICAgIHgwID0gcDAueCwgeDEgPSBwMS54LCB4MiA9IHAyLngsIHgzID0gcDMueCxcbiAgICAgICAgeTAgPSBwMC55LCB5MSA9IHAxLnksIHkyID0gcDIueSwgeTMgPSBwMy55LFxuICAgICAgICB6MCA9IHAwLnosIHoxID0gcDEueiwgejIgPSBwMi56LCB6MyA9IHAzLnosXG4gICAgICAgIGR4ID0geDMgLSB4MCwgZHkgPSB5MSAtIHkwLCBkeiA9IHozIC0gejAsIGR6ZHkgPSB6MSAtIHowO1xuXG4gICAgaWYoYXhpcyA9PT0gJ3gnKSB7XG4gICAgICB2YXIgaCA9IGR5LFxuICAgICAgICAgIHcgPSByYXRpbyAqIGgsXG4gICAgICAgICAgd0F2YWlsID0gTWF0aC5zcXJ0KCBkeCAqIGR4ICsgZHogKiBkeiApLFxuICAgICAgICAgIGNvdW50ID0gTWF0aC5yb3VuZCh3QXZhaWwgLyB3KSxcbiAgICAgICAgICBzcGxpdHMgPSBbXTtcblxuICAgICAgdyA9IHdBdmFpbCAvIGNvdW50OyAvLyBDb3JyZWN0IHdpZHRoXG5cbiAgICAgIGNvdW50ID0gTWF0aC5tYXgoMSwgTWF0aC5hYnMoY291bnQpKTtcbiAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBjb3VudDsgaSsrKVxuICAgICAgICBzcGxpdHMucHVzaCgxIC8gY291bnQpO1xuXG4gICAgICByZXR1cm4gU0hBUEUuc3BsaXQocXVhZCwgc3BsaXRzLCBbMV0sIHN5bWJvbCk7XG4gICAgfSBlbHNlIGlmKGF4aXMgPT09ICd5Jykge1xuICAgICAgdmFyIHcgPSB4MyAtIHgwLFxuICAgICAgICAgIGggPSB3IC8gcmF0aW8sXG4gICAgICAgICAgaEF2YWlsID0gTWF0aC5zcXJ0KCBkeSAqIGR5ICsgZHpkeSAqIGR6ZHkgKSxcbiAgICAgICAgICBjb3VudCA9IE1hdGgucm91bmQoaEF2YWlsIC8gaCksXG4gICAgICAgICAgc3BsaXRzID0gW107XG5cbiAgICAgIGggPSBoQXZhaWwgLyBjb3VudDsgLy8gQ29ycmVjdCB3aWR0aFxuXG4gICAgICBmb3IodmFyIGkgPSAwOyBpIDwgY291bnQ7IGkrKylcbiAgICAgICAgc3BsaXRzLnB1c2goMSAvIGNvdW50KTtcblxuICAgICAgcmV0dXJuIFNIQVBFLnNwbGl0KHF1YWQsIHNwbGl0cywgWzFdLCBzeW1ib2wpO1xuICAgIH1cbiAgfSxcblxuICBsZXJwOiBmdW5jdGlvbihhLCBiLCB0KSB7XG4gICAgcmV0dXJuIGEgKiAoMSAtIHQpICsgYiAqIHQ7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU0hBUEU7XG4iLCJ2YXIgR2VvbSA9IHJlcXVpcmUoJy4vR2VvbScpLFxuICAgIFNIQVBFID0gcmVxdWlyZSgnLi9TSEFQRS5qcycpLFxuICAgIGdsTWF0cml4ID0gcmVxdWlyZSgnZ2wtbWF0cml4JyksXG4gICAgZWFyY3V0ID0gcmVxdWlyZSgnZWFyY3V0JyksXG4gICAgdmVjMyA9IGdsTWF0cml4LnZlYzMsXG4gICAgbWF0NCA9IGdsTWF0cml4Lm1hdDQ7XG5cbnZhciBfID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMucnVsZXMgPSBbXTtcbn07XG5cbl8ucHJvdG90eXBlLmRlZmluZSA9IGZ1bmN0aW9uKGxocywgY29uZCwgcmhzKSB7XG4gIHRoaXMucnVsZXMucHVzaCh7XG4gICAgbGhzOiBsaHMsXG4gICAgY29uZDogY29uZCxcbiAgICByaHM6IHJoc1xuICB9KTtcbn07XG5cbl8ucHJvdG90eXBlLnJ1biA9IGZ1bmN0aW9uKHN0YXRlKSB7XG4gIFxuICB2YXIgb3V0cHV0ID0gW10sIHJ1bGVzID0gdGhpcy5ydWxlcywgbm9udGVybWluYWxzID0gMDtcblxuICBzdGF0ZSA9IChzdGF0ZSBpbnN0YW5jZW9mIEFycmF5PyBzdGF0ZSA6IFtzdGF0ZV0pO1xuXG4gIHdoaWxlKHN0YXRlLmxlbmd0aCkge1xuXG4gICAgdmFyIGxocyA9IHN0YXRlLnNoaWZ0KCk7XG5cbiAgICBpZihsaHMuc3ltID09PSBfLlRFUk1JTkFMKSB7XG4gICAgICBvdXRwdXQucHVzaChsaHMpO1xuICAgIH0gZWxzZSBmb3IodmFyIGkgPSAwLCBJID0gcnVsZXMubGVuZ3RoOyBpIDwgSTsgaSsrKSB7XG4gICAgICBcbiAgICAgIHZhciBydWxlID0gcnVsZXNbaV07XG4gICAgICBpZihsaHMuc3ltID09PSBydWxlLmxocyAmJiBcbiAgICAgICAgKHJ1bGUuY29uZCA9PT0gbnVsbCB8fCBydWxlLmNvbmQuY2FsbChsaHMpKSkge1xuICAgICAgICBcbiAgICAgICAgdmFyIHJldCA9IHJ1bGUucmhzLmNhbGwobGhzKTtcbiAgICAgICAgcmV0ID0gKHJldCBpbnN0YW5jZW9mIEFycmF5PyByZXQgOiBbcmV0XSk7XG5cbiAgICAgICAgZm9yKHZhciBqID0gMCwgSiA9IHJldC5sZW5ndGg7IGogPCBKOyBqKyspIHtcbiAgICAgICAgICBvdXRwdXQucHVzaChyZXRbal0pO1xuICAgICAgICAgICsrbm9udGVybWluYWxzO1xuICAgICAgICB9XG5cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIChub250ZXJtaW5hbHMgPiAwID8gdGhpcy5ydW4ob3V0cHV0KSA6IG91dHB1dCk7XG59XG5cbl8uVEVSTUlOQUwgPSAnVEVSTUlOQUwnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IF87XG4iLCJtb2R1bGUuZXhwb3J0cyA9IHtcbiAgaHNsMnJnYjogZnVuY3Rpb24oaCwgcywgbCkge1xuXG4gICAgdmFyIHIsIGcsIGIsIG0sIGMsIHhcblxuICAgIGlmICghaXNGaW5pdGUoaCkpIGggPSAwXG4gICAgaWYgKCFpc0Zpbml0ZShzKSkgcyA9IDBcbiAgICBpZiAoIWlzRmluaXRlKGwpKSBsID0gMFxuXG4gICAgaCAvPSA2MFxuICAgIGlmIChoIDwgMCkgaCA9IDYgLSAoLWggJSA2KVxuICAgIGggJT0gNlxuXG4gICAgcyA9IE1hdGgubWF4KDAsIE1hdGgubWluKDEsIHMgLyAxMDApKVxuICAgIGwgPSBNYXRoLm1heCgwLCBNYXRoLm1pbigxLCBsIC8gMTAwKSlcblxuICAgIGMgPSAoMSAtIE1hdGguYWJzKCgyICogbCkgLSAxKSkgKiBzXG4gICAgeCA9IGMgKiAoMSAtIE1hdGguYWJzKChoICUgMikgLSAxKSlcblxuICAgIGlmIChoIDwgMSkge1xuICAgICAgICByID0gY1xuICAgICAgICBnID0geFxuICAgICAgICBiID0gMFxuICAgIH0gZWxzZSBpZiAoaCA8IDIpIHtcbiAgICAgICAgciA9IHhcbiAgICAgICAgZyA9IGNcbiAgICAgICAgYiA9IDBcbiAgICB9IGVsc2UgaWYgKGggPCAzKSB7XG4gICAgICAgIHIgPSAwXG4gICAgICAgIGcgPSBjXG4gICAgICAgIGIgPSB4XG4gICAgfSBlbHNlIGlmIChoIDwgNCkge1xuICAgICAgICByID0gMFxuICAgICAgICBnID0geFxuICAgICAgICBiID0gY1xuICAgIH0gZWxzZSBpZiAoaCA8IDUpIHtcbiAgICAgICAgciA9IHhcbiAgICAgICAgZyA9IDBcbiAgICAgICAgYiA9IGNcbiAgICB9IGVsc2Uge1xuICAgICAgICByID0gY1xuICAgICAgICBnID0gMFxuICAgICAgICBiID0geFxuICAgIH1cblxuICAgIG0gPSBsIC0gYyAvIDJcbiAgICByID0gTWF0aC5yb3VuZCgociArIG0pICogMjU1KVxuICAgIGcgPSBNYXRoLnJvdW5kKChnICsgbSkgKiAyNTUpXG4gICAgYiA9IE1hdGgucm91bmQoKGIgKyBtKSAqIDI1NSlcblxuICAgIHJldHVybiB7IHI6IHIsIGc6IGcsIGI6IGIgfVxuXG4gIH1cbn1cbiIsInZhciBnbE1hdHJpeCA9IHJlcXVpcmUoJ2dsLW1hdHJpeCcpLFxuICAgIENvbnRleHQgID0gcmVxdWlyZSgnLi9Db250ZXh0JyksXG4gICAgY2FudmFzICAgPSBDb250ZXh0LmNhbnZhcyxcbiAgICBnbCAgICAgICA9IENvbnRleHQuZ2wsXG4gICAgUmVuZGVyZXIgPSByZXF1aXJlKCcuL1JlbmRlcmVyLmpzJyksXG4gICAgTG9hZGVyICAgPSByZXF1aXJlKCcuL2xpYi9Mb2FkZXInKSxcbiAgICBDaXR5ICAgICA9IHJlcXVpcmUoJy4vZ2VuZXJhdG9ycy9DaXR5LmpzJyksXG4gICAgU3RhdHMgICAgPSByZXF1aXJlKCdzdGF0cy1qcycpLFxuICAgIG1haW5TY2VuZSA9IHJlcXVpcmUoJy4vc2NlbmVzL01haW5TY2VuZS5qcycpO1xuXG52YXIgc3RhdHMgPSBuZXcgU3RhdHMoKTtcbnN0YXRzLnNldE1vZGUoMCk7XG5cbnN0YXRzLmRvbUVsZW1lbnQuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuc3RhdHMuZG9tRWxlbWVudC5zdHlsZS5yaWdodCA9ICcxcmVtJztcbnN0YXRzLmRvbUVsZW1lbnQuc3R5bGUudG9wID0gJzFyZW0nO1xuXG5jYW52YXMucGFyZW50Tm9kZS5hcHBlbmRDaGlsZChzdGF0cy5kb21FbGVtZW50KTtcblxudmFyIGxvYWRpbmdTdGF0dXMgPSAwO1xudmFyIHQwID0gTmFOO1xuXG5Mb2FkZXIuc3Vic2NyaWJlKCdCbG9ja3MnLCBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJ0xvYWRpbmcgY29tcGxldGUnKTtcbiAgbG9hZGluZ1N0YXR1cyA9IDE7XG4gIHQwID0gTmFOO1xuICBzY2VuZUxvb3AoKTtcbn0pO1xuXG5mdW5jdGlvbiBsb2FkaW5nTG9vcCgpIHtcbiAgaWYobG9hZGluZ1N0YXR1cyA9PT0gMClcbiAgICByZXF1ZXN0QW5pbWF0aW9uRnJhbWUobG9hZGluZ0xvb3ApO1xuICBMb2FkZXIucmVuZGVyKCk7XG59XG5cblxuZnVuY3Rpb24gc2NlbmVMb29wKHRzKSB7XG5cbiAgaWYoaXNOYU4oc2NlbmVMb29wLnQwKSlcbiAgICBzY2VuZUxvb3AudDAgPSB0cztcblxuICBzdGF0cy5iZWdpbigpO1xuICBSZW5kZXJlci5yZW5kZXIobWFpblNjZW5lKTtcbiAgbWFpblNjZW5lLnVwZGF0ZSh0cyAtIHNjZW5lTG9vcC50MCk7XG4gIHN0YXRzLmVuZCgpO1xuXG4gIHJlcXVlc3RBbmltYXRpb25GcmFtZShzY2VuZUxvb3ApO1xufVxuZ2wudmlld3BvcnQoMCwgMCwgQ29udGV4dC53LCBDb250ZXh0LmgpO1xuXG5sb2FkaW5nTG9vcCgpO1xuXG4iLCIndXNlIHN0cmljdCc7XG5cbm1vZHVsZS5leHBvcnRzID0gZWFyY3V0O1xuXG5mdW5jdGlvbiBlYXJjdXQocG9pbnRzLCByZXR1cm5JbmRpY2VzKSB7XG5cbiAgICB2YXIgb3V0ZXJOb2RlID0gZmlsdGVyUG9pbnRzKGxpbmtlZExpc3QocG9pbnRzWzBdLCB0cnVlKSksXG4gICAgICAgIHRyaWFuZ2xlcyA9IHJldHVybkluZGljZXMgPyB7dmVydGljZXM6IFtdLCBpbmRpY2VzOiBbXX0gOiBbXTtcblxuICAgIGlmICghb3V0ZXJOb2RlKSByZXR1cm4gdHJpYW5nbGVzO1xuXG4gICAgdmFyIG5vZGUsIG1pblgsIG1pblksIG1heFgsIG1heFksIHgsIHksIHNpemUsIGksXG4gICAgICAgIHRocmVzaG9sZCA9IDgwO1xuXG4gICAgZm9yIChpID0gMDsgdGhyZXNob2xkID49IDAgJiYgaSA8IHBvaW50cy5sZW5ndGg7IGkrKykgdGhyZXNob2xkIC09IHBvaW50c1tpXS5sZW5ndGg7XG5cbiAgICAvLyBpZiB0aGUgc2hhcGUgaXMgbm90IHRvbyBzaW1wbGUsIHdlJ2xsIHVzZSB6LW9yZGVyIGN1cnZlIGhhc2ggbGF0ZXI7IGNhbGN1bGF0ZSBwb2x5Z29uIGJib3hcbiAgICBpZiAodGhyZXNob2xkIDwgMCkge1xuICAgICAgICBub2RlID0gb3V0ZXJOb2RlLm5leHQ7XG4gICAgICAgIG1pblggPSBtYXhYID0gbm9kZS5wWzBdO1xuICAgICAgICBtaW5ZID0gbWF4WSA9IG5vZGUucFsxXTtcbiAgICAgICAgZG8ge1xuICAgICAgICAgICAgeCA9IG5vZGUucFswXTtcbiAgICAgICAgICAgIHkgPSBub2RlLnBbMV07XG4gICAgICAgICAgICBpZiAoeCA8IG1pblgpIG1pblggPSB4O1xuICAgICAgICAgICAgaWYgKHkgPCBtaW5ZKSBtaW5ZID0geTtcbiAgICAgICAgICAgIGlmICh4ID4gbWF4WCkgbWF4WCA9IHg7XG4gICAgICAgICAgICBpZiAoeSA+IG1heFkpIG1heFkgPSB5O1xuICAgICAgICAgICAgbm9kZSA9IG5vZGUubmV4dDtcbiAgICAgICAgfSB3aGlsZSAobm9kZSAhPT0gb3V0ZXJOb2RlKTtcblxuICAgICAgICAvLyBtaW5YLCBtaW5ZIGFuZCBzaXplIGFyZSBsYXRlciB1c2VkIHRvIHRyYW5zZm9ybSBjb29yZHMgaW50byBpbnRlZ2VycyBmb3Igei1vcmRlciBjYWxjdWxhdGlvblxuICAgICAgICBzaXplID0gTWF0aC5tYXgobWF4WCAtIG1pblgsIG1heFkgLSBtaW5ZKTtcbiAgICB9XG5cbiAgICBpZiAocG9pbnRzLmxlbmd0aCA+IDEpIG91dGVyTm9kZSA9IGVsaW1pbmF0ZUhvbGVzKHBvaW50cywgb3V0ZXJOb2RlKTtcblxuICAgIGVhcmN1dExpbmtlZChvdXRlck5vZGUsIHRyaWFuZ2xlcywgbWluWCwgbWluWSwgc2l6ZSk7XG5cbiAgICByZXR1cm4gdHJpYW5nbGVzO1xufVxuXG4vLyBjcmVhdGUgYSBjaXJjdWxhciBkb3VibHkgbGlua2VkIGxpc3QgZnJvbSBwb2x5Z29uIHBvaW50cyBpbiB0aGUgc3BlY2lmaWVkIHdpbmRpbmcgb3JkZXJcbmZ1bmN0aW9uIGxpbmtlZExpc3QocG9pbnRzLCBjbG9ja3dpc2UpIHtcbiAgICB2YXIgc3VtID0gMCxcbiAgICAgICAgbGVuID0gcG9pbnRzLmxlbmd0aCxcbiAgICAgICAgaSwgaiwgcDEsIHAyLCBsYXN0O1xuXG4gICAgLy8gY2FsY3VsYXRlIG9yaWdpbmFsIHdpbmRpbmcgb3JkZXIgb2YgYSBwb2x5Z29uIHJpbmdcbiAgICBmb3IgKGkgPSAwLCBqID0gbGVuIC0gMTsgaSA8IGxlbjsgaiA9IGkrKykge1xuICAgICAgICBwMSA9IHBvaW50c1tpXTtcbiAgICAgICAgcDIgPSBwb2ludHNbal07XG4gICAgICAgIHN1bSArPSAocDJbMF0gLSBwMVswXSkgKiAocDFbMV0gKyBwMlsxXSk7XG4gICAgfVxuXG4gICAgLy8gbGluayBwb2ludHMgaW50byBjaXJjdWxhciBkb3VibHktbGlua2VkIGxpc3QgaW4gdGhlIHNwZWNpZmllZCB3aW5kaW5nIG9yZGVyXG4gICAgaWYgKGNsb2Nrd2lzZSA9PT0gKHN1bSA+IDApKSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykgbGFzdCA9IGluc2VydE5vZGUocG9pbnRzW2ldLCBsYXN0KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBmb3IgKGkgPSBsZW4gLSAxOyBpID49IDA7IGktLSkgbGFzdCA9IGluc2VydE5vZGUocG9pbnRzW2ldLCBsYXN0KTtcbiAgICB9XG5cbiAgICByZXR1cm4gbGFzdDtcbn1cblxuLy8gZWxpbWluYXRlIGNvbGluZWFyIG9yIGR1cGxpY2F0ZSBwb2ludHNcbmZ1bmN0aW9uIGZpbHRlclBvaW50cyhzdGFydCwgZW5kKSB7XG4gICAgaWYgKCFlbmQpIGVuZCA9IHN0YXJ0O1xuXG4gICAgdmFyIG5vZGUgPSBzdGFydCxcbiAgICAgICAgYWdhaW47XG4gICAgZG8ge1xuICAgICAgICBhZ2FpbiA9IGZhbHNlO1xuXG4gICAgICAgIGlmIChlcXVhbHMobm9kZS5wLCBub2RlLm5leHQucCkgfHwgb3JpZW50KG5vZGUucHJldi5wLCBub2RlLnAsIG5vZGUubmV4dC5wKSA9PT0gMCkge1xuXG4gICAgICAgICAgICAvLyByZW1vdmUgbm9kZVxuICAgICAgICAgICAgbm9kZS5wcmV2Lm5leHQgPSBub2RlLm5leHQ7XG4gICAgICAgICAgICBub2RlLm5leHQucHJldiA9IG5vZGUucHJldjtcblxuICAgICAgICAgICAgaWYgKG5vZGUucHJldlopIG5vZGUucHJldloubmV4dFogPSBub2RlLm5leHRaO1xuICAgICAgICAgICAgaWYgKG5vZGUubmV4dFopIG5vZGUubmV4dFoucHJldlogPSBub2RlLnByZXZaO1xuXG4gICAgICAgICAgICBub2RlID0gZW5kID0gbm9kZS5wcmV2O1xuXG4gICAgICAgICAgICBpZiAobm9kZSA9PT0gbm9kZS5uZXh0KSByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIGFnYWluID0gdHJ1ZTtcblxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbm9kZSA9IG5vZGUubmV4dDtcbiAgICAgICAgfVxuICAgIH0gd2hpbGUgKGFnYWluIHx8IG5vZGUgIT09IGVuZCk7XG5cbiAgICByZXR1cm4gZW5kO1xufVxuXG4vLyBtYWluIGVhciBzbGljaW5nIGxvb3Agd2hpY2ggdHJpYW5ndWxhdGVzIGEgcG9seWdvbiAoZ2l2ZW4gYXMgYSBsaW5rZWQgbGlzdClcbmZ1bmN0aW9uIGVhcmN1dExpbmtlZChlYXIsIHRyaWFuZ2xlcywgbWluWCwgbWluWSwgc2l6ZSwgcGFzcykge1xuICAgIGlmICghZWFyKSByZXR1cm47XG5cbiAgICB2YXIgaW5kZXhlZCA9IHRyaWFuZ2xlcy52ZXJ0aWNlcyAhPT0gdW5kZWZpbmVkO1xuXG4gICAgLy8gaW50ZXJsaW5rIHBvbHlnb24gbm9kZXMgaW4gei1vcmRlclxuICAgIGlmICghcGFzcyAmJiBtaW5YICE9PSB1bmRlZmluZWQpIGluZGV4Q3VydmUoZWFyLCBtaW5YLCBtaW5ZLCBzaXplKTtcblxuICAgIHZhciBzdG9wID0gZWFyLFxuICAgICAgICBwcmV2LCBuZXh0O1xuXG4gICAgLy8gaXRlcmF0ZSB0aHJvdWdoIGVhcnMsIHNsaWNpbmcgdGhlbSBvbmUgYnkgb25lXG4gICAgd2hpbGUgKGVhci5wcmV2ICE9PSBlYXIubmV4dCkge1xuICAgICAgICBwcmV2ID0gZWFyLnByZXY7XG4gICAgICAgIG5leHQgPSBlYXIubmV4dDtcblxuICAgICAgICBpZiAoaXNFYXIoZWFyLCBtaW5YLCBtaW5ZLCBzaXplKSkge1xuICAgICAgICAgICAgLy8gY3V0IG9mZiB0aGUgdHJpYW5nbGVcbiAgICAgICAgICAgIGlmIChpbmRleGVkKSB7XG4gICAgICAgICAgICAgICAgYWRkSW5kZXhlZFZlcnRleCh0cmlhbmdsZXMsIHByZXYpO1xuICAgICAgICAgICAgICAgIGFkZEluZGV4ZWRWZXJ0ZXgodHJpYW5nbGVzLCBlYXIpO1xuICAgICAgICAgICAgICAgIGFkZEluZGV4ZWRWZXJ0ZXgodHJpYW5nbGVzLCBuZXh0KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdHJpYW5nbGVzLnB1c2gocHJldi5wKTtcbiAgICAgICAgICAgICAgICB0cmlhbmdsZXMucHVzaChlYXIucCk7XG4gICAgICAgICAgICAgICAgdHJpYW5nbGVzLnB1c2gobmV4dC5wKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gcmVtb3ZlIGVhciBub2RlXG4gICAgICAgICAgICBuZXh0LnByZXYgPSBwcmV2O1xuICAgICAgICAgICAgcHJldi5uZXh0ID0gbmV4dDtcblxuICAgICAgICAgICAgaWYgKGVhci5wcmV2WikgZWFyLnByZXZaLm5leHRaID0gZWFyLm5leHRaO1xuICAgICAgICAgICAgaWYgKGVhci5uZXh0WikgZWFyLm5leHRaLnByZXZaID0gZWFyLnByZXZaO1xuXG4gICAgICAgICAgICAvLyBza2lwcGluZyB0aGUgbmV4dCB2ZXJ0aWNlIGxlYWRzIHRvIGxlc3Mgc2xpdmVyIHRyaWFuZ2xlc1xuICAgICAgICAgICAgZWFyID0gbmV4dC5uZXh0O1xuICAgICAgICAgICAgc3RvcCA9IG5leHQubmV4dDtcblxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICBlYXIgPSBuZXh0O1xuXG4gICAgICAgIC8vIGlmIHdlIGxvb3BlZCB0aHJvdWdoIHRoZSB3aG9sZSByZW1haW5pbmcgcG9seWdvbiBhbmQgY2FuJ3QgZmluZCBhbnkgbW9yZSBlYXJzXG4gICAgICAgIGlmIChlYXIgPT09IHN0b3ApIHtcbiAgICAgICAgICAgIC8vIHRyeSBmaWx0ZXJpbmcgcG9pbnRzIGFuZCBzbGljaW5nIGFnYWluXG4gICAgICAgICAgICBpZiAoIXBhc3MpIHtcbiAgICAgICAgICAgICAgICBlYXJjdXRMaW5rZWQoZmlsdGVyUG9pbnRzKGVhciksIHRyaWFuZ2xlcywgbWluWCwgbWluWSwgc2l6ZSwgMSk7XG5cbiAgICAgICAgICAgIC8vIGlmIHRoaXMgZGlkbid0IHdvcmssIHRyeSBjdXJpbmcgYWxsIHNtYWxsIHNlbGYtaW50ZXJzZWN0aW9ucyBsb2NhbGx5XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHBhc3MgPT09IDEpIHtcbiAgICAgICAgICAgICAgICBlYXIgPSBjdXJlTG9jYWxJbnRlcnNlY3Rpb25zKGVhciwgdHJpYW5nbGVzKTtcbiAgICAgICAgICAgICAgICBlYXJjdXRMaW5rZWQoZWFyLCB0cmlhbmdsZXMsIG1pblgsIG1pblksIHNpemUsIDIpO1xuXG4gICAgICAgICAgICAvLyBhcyBhIGxhc3QgcmVzb3J0LCB0cnkgc3BsaXR0aW5nIHRoZSByZW1haW5pbmcgcG9seWdvbiBpbnRvIHR3b1xuICAgICAgICAgICAgfSBlbHNlIGlmIChwYXNzID09PSAyKSB7XG4gICAgICAgICAgICAgICAgc3BsaXRFYXJjdXQoZWFyLCB0cmlhbmdsZXMsIG1pblgsIG1pblksIHNpemUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZnVuY3Rpb24gYWRkSW5kZXhlZFZlcnRleCh0cmlhbmdsZXMsIG5vZGUpIHtcbiAgICBpZiAobm9kZS5zb3VyY2UpIG5vZGUgPSBub2RlLnNvdXJjZTtcblxuICAgIHZhciBpID0gbm9kZS5pbmRleDtcbiAgICBpZiAoaSA9PT0gbnVsbCkge1xuICAgICAgICB2YXIgZGltID0gbm9kZS5wLmxlbmd0aDtcbiAgICAgICAgdmFyIHZlcnRpY2VzID0gdHJpYW5nbGVzLnZlcnRpY2VzO1xuICAgICAgICBub2RlLmluZGV4ID0gaSA9IHZlcnRpY2VzLmxlbmd0aCAvIGRpbTtcblxuICAgICAgICBmb3IgKHZhciBkID0gMDsgZCA8IGRpbTsgZCsrKSB2ZXJ0aWNlcy5wdXNoKG5vZGUucFtkXSk7XG4gICAgfVxuICAgIHRyaWFuZ2xlcy5pbmRpY2VzLnB1c2goaSk7XG59XG5cbi8vIGNoZWNrIHdoZXRoZXIgYSBwb2x5Z29uIG5vZGUgZm9ybXMgYSB2YWxpZCBlYXIgd2l0aCBhZGphY2VudCBub2Rlc1xuZnVuY3Rpb24gaXNFYXIoZWFyLCBtaW5YLCBtaW5ZLCBzaXplKSB7XG5cbiAgICB2YXIgYSA9IGVhci5wcmV2LnAsXG4gICAgICAgIGIgPSBlYXIucCxcbiAgICAgICAgYyA9IGVhci5uZXh0LnAsXG5cbiAgICAgICAgYXggPSBhWzBdLCBieCA9IGJbMF0sIGN4ID0gY1swXSxcbiAgICAgICAgYXkgPSBhWzFdLCBieSA9IGJbMV0sIGN5ID0gY1sxXSxcblxuICAgICAgICBhYmQgPSBheCAqIGJ5IC0gYXkgKiBieCxcbiAgICAgICAgYWNkID0gYXggKiBjeSAtIGF5ICogY3gsXG4gICAgICAgIGNiZCA9IGN4ICogYnkgLSBjeSAqIGJ4LFxuICAgICAgICBBID0gYWJkIC0gYWNkIC0gY2JkO1xuXG4gICAgaWYgKEEgPD0gMCkgcmV0dXJuIGZhbHNlOyAvLyByZWZsZXgsIGNhbid0IGJlIGFuIGVhclxuXG4gICAgLy8gbm93IG1ha2Ugc3VyZSB3ZSBkb24ndCBoYXZlIG90aGVyIHBvaW50cyBpbnNpZGUgdGhlIHBvdGVudGlhbCBlYXI7XG4gICAgLy8gdGhlIGNvZGUgYmVsb3cgaXMgYSBiaXQgdmVyYm9zZSBhbmQgcmVwZXRpdGl2ZSBidXQgdGhpcyBpcyBkb25lIGZvciBwZXJmb3JtYW5jZVxuXG4gICAgdmFyIGNheSA9IGN5IC0gYXksXG4gICAgICAgIGFjeCA9IGF4IC0gY3gsXG4gICAgICAgIGFieSA9IGF5IC0gYnksXG4gICAgICAgIGJheCA9IGJ4IC0gYXgsXG4gICAgICAgIHAsIHB4LCBweSwgcywgdCwgaywgbm9kZTtcblxuICAgIC8vIGlmIHdlIHVzZSB6LW9yZGVyIGN1cnZlIGhhc2hpbmcsIGl0ZXJhdGUgdGhyb3VnaCB0aGUgY3VydmVcbiAgICBpZiAobWluWCAhPT0gdW5kZWZpbmVkKSB7XG5cbiAgICAgICAgLy8gdHJpYW5nbGUgYmJveDsgbWluICYgbWF4IGFyZSBjYWxjdWxhdGVkIGxpa2UgdGhpcyBmb3Igc3BlZWRcbiAgICAgICAgdmFyIG1pblRYID0gYXggPCBieCA/IChheCA8IGN4ID8gYXggOiBjeCkgOiAoYnggPCBjeCA/IGJ4IDogY3gpLFxuICAgICAgICAgICAgbWluVFkgPSBheSA8IGJ5ID8gKGF5IDwgY3kgPyBheSA6IGN5KSA6IChieSA8IGN5ID8gYnkgOiBjeSksXG4gICAgICAgICAgICBtYXhUWCA9IGF4ID4gYnggPyAoYXggPiBjeCA/IGF4IDogY3gpIDogKGJ4ID4gY3ggPyBieCA6IGN4KSxcbiAgICAgICAgICAgIG1heFRZID0gYXkgPiBieSA/IChheSA+IGN5ID8gYXkgOiBjeSkgOiAoYnkgPiBjeSA/IGJ5IDogY3kpLFxuXG4gICAgICAgICAgICAvLyB6LW9yZGVyIHJhbmdlIGZvciB0aGUgY3VycmVudCB0cmlhbmdsZSBiYm94O1xuICAgICAgICAgICAgbWluWiA9IHpPcmRlcihtaW5UWCwgbWluVFksIG1pblgsIG1pblksIHNpemUpLFxuICAgICAgICAgICAgbWF4WiA9IHpPcmRlcihtYXhUWCwgbWF4VFksIG1pblgsIG1pblksIHNpemUpO1xuXG4gICAgICAgIC8vIGZpcnN0IGxvb2sgZm9yIHBvaW50cyBpbnNpZGUgdGhlIHRyaWFuZ2xlIGluIGluY3JlYXNpbmcgei1vcmRlclxuICAgICAgICBub2RlID0gZWFyLm5leHRaO1xuXG4gICAgICAgIHdoaWxlIChub2RlICYmIG5vZGUueiA8PSBtYXhaKSB7XG4gICAgICAgICAgICBwID0gbm9kZS5wO1xuICAgICAgICAgICAgbm9kZSA9IG5vZGUubmV4dFo7XG4gICAgICAgICAgICBpZiAocCA9PT0gYSB8fCBwID09PSBjKSBjb250aW51ZTtcblxuICAgICAgICAgICAgcHggPSBwWzBdO1xuICAgICAgICAgICAgcHkgPSBwWzFdO1xuXG4gICAgICAgICAgICBzID0gY2F5ICogcHggKyBhY3ggKiBweSAtIGFjZDtcbiAgICAgICAgICAgIGlmIChzID49IDApIHtcbiAgICAgICAgICAgICAgICB0ID0gYWJ5ICogcHggKyBiYXggKiBweSArIGFiZDtcbiAgICAgICAgICAgICAgICBpZiAodCA+PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGsgPSBBIC0gcyAtIHQ7XG4gICAgICAgICAgICAgICAgICAgIGlmICgoayA+PSAwKSAmJiAoKHMgJiYgdCkgfHwgKHMgJiYgaykgfHwgKHQgJiYgaykpKSByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gdGhlbiBsb29rIGZvciBwb2ludHMgaW4gZGVjcmVhc2luZyB6LW9yZGVyXG4gICAgICAgIG5vZGUgPSBlYXIucHJldlo7XG5cbiAgICAgICAgd2hpbGUgKG5vZGUgJiYgbm9kZS56ID49IG1pblopIHtcbiAgICAgICAgICAgIHAgPSBub2RlLnA7XG4gICAgICAgICAgICBub2RlID0gbm9kZS5wcmV2WjtcbiAgICAgICAgICAgIGlmIChwID09PSBhIHx8IHAgPT09IGMpIGNvbnRpbnVlO1xuXG4gICAgICAgICAgICBweCA9IHBbMF07XG4gICAgICAgICAgICBweSA9IHBbMV07XG5cbiAgICAgICAgICAgIHMgPSBjYXkgKiBweCArIGFjeCAqIHB5IC0gYWNkO1xuICAgICAgICAgICAgaWYgKHMgPj0gMCkge1xuICAgICAgICAgICAgICAgIHQgPSBhYnkgKiBweCArIGJheCAqIHB5ICsgYWJkO1xuICAgICAgICAgICAgICAgIGlmICh0ID49IDApIHtcbiAgICAgICAgICAgICAgICAgICAgayA9IEEgLSBzIC0gdDtcbiAgICAgICAgICAgICAgICAgICAgaWYgKChrID49IDApICYmICgocyAmJiB0KSB8fCAocyAmJiBrKSB8fCAodCAmJiBrKSkpIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgIC8vIGlmIHdlIGRvbid0IHVzZSB6LW9yZGVyIGN1cnZlIGhhc2gsIHNpbXBseSBpdGVyYXRlIHRocm91Z2ggYWxsIG90aGVyIHBvaW50c1xuICAgIH0gZWxzZSB7XG4gICAgICAgIG5vZGUgPSBlYXIubmV4dC5uZXh0O1xuXG4gICAgICAgIHdoaWxlIChub2RlICE9PSBlYXIucHJldikge1xuICAgICAgICAgICAgcCA9IG5vZGUucDtcbiAgICAgICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG5cbiAgICAgICAgICAgIHB4ID0gcFswXTtcbiAgICAgICAgICAgIHB5ID0gcFsxXTtcblxuICAgICAgICAgICAgcyA9IGNheSAqIHB4ICsgYWN4ICogcHkgLSBhY2Q7XG4gICAgICAgICAgICBpZiAocyA+PSAwKSB7XG4gICAgICAgICAgICAgICAgdCA9IGFieSAqIHB4ICsgYmF4ICogcHkgKyBhYmQ7XG4gICAgICAgICAgICAgICAgaWYgKHQgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICBrID0gQSAtIHMgLSB0O1xuICAgICAgICAgICAgICAgICAgICBpZiAoKGsgPj0gMCkgJiYgKChzICYmIHQpIHx8IChzICYmIGspIHx8ICh0ICYmIGspKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xufVxuXG4vLyBnbyB0aHJvdWdoIGFsbCBwb2x5Z29uIG5vZGVzIGFuZCBjdXJlIHNtYWxsIGxvY2FsIHNlbGYtaW50ZXJzZWN0aW9uc1xuZnVuY3Rpb24gY3VyZUxvY2FsSW50ZXJzZWN0aW9ucyhzdGFydCwgdHJpYW5nbGVzKSB7XG4gICAgdmFyIGluZGV4ZWQgPSAhIXRyaWFuZ2xlcy52ZXJ0aWNlcztcblxuICAgIHZhciBub2RlID0gc3RhcnQ7XG4gICAgZG8ge1xuICAgICAgICB2YXIgYSA9IG5vZGUucHJldixcbiAgICAgICAgICAgIGIgPSBub2RlLm5leHQubmV4dDtcblxuICAgICAgICAvLyBhIHNlbGYtaW50ZXJzZWN0aW9uIHdoZXJlIGVkZ2UgKHZbaS0xXSx2W2ldKSBpbnRlcnNlY3RzICh2W2krMV0sdltpKzJdKVxuICAgICAgICBpZiAoYS5wICE9PSBiLnAgJiYgaW50ZXJzZWN0cyhhLnAsIG5vZGUucCwgbm9kZS5uZXh0LnAsIGIucCkgJiYgbG9jYWxseUluc2lkZShhLCBiKSAmJiBsb2NhbGx5SW5zaWRlKGIsIGEpKSB7XG5cbiAgICAgICAgICAgIGlmIChpbmRleGVkKSB7XG4gICAgICAgICAgICAgICAgYWRkSW5kZXhlZFZlcnRleCh0cmlhbmdsZXMsIGEpO1xuICAgICAgICAgICAgICAgIGFkZEluZGV4ZWRWZXJ0ZXgodHJpYW5nbGVzLCBub2RlKTtcbiAgICAgICAgICAgICAgICBhZGRJbmRleGVkVmVydGV4KHRyaWFuZ2xlcywgYik7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRyaWFuZ2xlcy5wdXNoKGEucCk7XG4gICAgICAgICAgICAgICAgdHJpYW5nbGVzLnB1c2gobm9kZS5wKTtcbiAgICAgICAgICAgICAgICB0cmlhbmdsZXMucHVzaChiLnApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyByZW1vdmUgdHdvIG5vZGVzIGludm9sdmVkXG4gICAgICAgICAgICBhLm5leHQgPSBiO1xuICAgICAgICAgICAgYi5wcmV2ID0gYTtcblxuICAgICAgICAgICAgdmFyIGF6ID0gbm9kZS5wcmV2WixcbiAgICAgICAgICAgICAgICBieiA9IG5vZGUubmV4dFogJiYgbm9kZS5uZXh0Wi5uZXh0WjtcblxuICAgICAgICAgICAgaWYgKGF6KSBhei5uZXh0WiA9IGJ6O1xuICAgICAgICAgICAgaWYgKGJ6KSBiei5wcmV2WiA9IGF6O1xuXG4gICAgICAgICAgICBub2RlID0gc3RhcnQgPSBiO1xuICAgICAgICB9XG4gICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG4gICAgfSB3aGlsZSAobm9kZSAhPT0gc3RhcnQpO1xuXG4gICAgcmV0dXJuIG5vZGU7XG59XG5cbi8vIHRyeSBzcGxpdHRpbmcgcG9seWdvbiBpbnRvIHR3byBhbmQgdHJpYW5ndWxhdGUgdGhlbSBpbmRlcGVuZGVudGx5XG5mdW5jdGlvbiBzcGxpdEVhcmN1dChzdGFydCwgdHJpYW5nbGVzLCBtaW5YLCBtaW5ZLCBzaXplKSB7XG4gICAgLy8gbG9vayBmb3IgYSB2YWxpZCBkaWFnb25hbCB0aGF0IGRpdmlkZXMgdGhlIHBvbHlnb24gaW50byB0d29cbiAgICB2YXIgYSA9IHN0YXJ0O1xuICAgIGRvIHtcbiAgICAgICAgdmFyIGIgPSBhLm5leHQubmV4dDtcbiAgICAgICAgd2hpbGUgKGIgIT09IGEucHJldikge1xuICAgICAgICAgICAgaWYgKGEucCAhPT0gYi5wICYmIGlzVmFsaWREaWFnb25hbChhLCBiKSkge1xuICAgICAgICAgICAgICAgIC8vIHNwbGl0IHRoZSBwb2x5Z29uIGluIHR3byBieSB0aGUgZGlhZ29uYWxcbiAgICAgICAgICAgICAgICB2YXIgYyA9IHNwbGl0UG9seWdvbihhLCBiKTtcblxuICAgICAgICAgICAgICAgIC8vIGZpbHRlciBjb2xpbmVhciBwb2ludHMgYXJvdW5kIHRoZSBjdXRzXG4gICAgICAgICAgICAgICAgYSA9IGZpbHRlclBvaW50cyhhLCBhLm5leHQpO1xuICAgICAgICAgICAgICAgIGMgPSBmaWx0ZXJQb2ludHMoYywgYy5uZXh0KTtcblxuICAgICAgICAgICAgICAgIC8vIHJ1biBlYXJjdXQgb24gZWFjaCBoYWxmXG4gICAgICAgICAgICAgICAgZWFyY3V0TGlua2VkKGEsIHRyaWFuZ2xlcywgbWluWCwgbWluWSwgc2l6ZSk7XG4gICAgICAgICAgICAgICAgZWFyY3V0TGlua2VkKGMsIHRyaWFuZ2xlcywgbWluWCwgbWluWSwgc2l6ZSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYiA9IGIubmV4dDtcbiAgICAgICAgfVxuICAgICAgICBhID0gYS5uZXh0O1xuICAgIH0gd2hpbGUgKGEgIT09IHN0YXJ0KTtcbn1cblxuLy8gbGluayBldmVyeSBob2xlIGludG8gdGhlIG91dGVyIGxvb3AsIHByb2R1Y2luZyBhIHNpbmdsZS1yaW5nIHBvbHlnb24gd2l0aG91dCBob2xlc1xuZnVuY3Rpb24gZWxpbWluYXRlSG9sZXMocG9pbnRzLCBvdXRlck5vZGUpIHtcbiAgICB2YXIgbGVuID0gcG9pbnRzLmxlbmd0aDtcblxuICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbGVuOyBpKyspIHtcbiAgICAgICAgdmFyIGxpc3QgPSBmaWx0ZXJQb2ludHMobGlua2VkTGlzdChwb2ludHNbaV0sIGZhbHNlKSk7XG4gICAgICAgIGlmIChsaXN0KSBxdWV1ZS5wdXNoKGdldExlZnRtb3N0KGxpc3QpKTtcbiAgICB9XG4gICAgcXVldWUuc29ydChjb21wYXJlWCk7XG5cbiAgICAvLyBwcm9jZXNzIGhvbGVzIGZyb20gbGVmdCB0byByaWdodFxuICAgIGZvciAoaSA9IDA7IGkgPCBxdWV1ZS5sZW5ndGg7IGkrKykge1xuICAgICAgICBlbGltaW5hdGVIb2xlKHF1ZXVlW2ldLCBvdXRlck5vZGUpO1xuICAgICAgICBvdXRlck5vZGUgPSBmaWx0ZXJQb2ludHMob3V0ZXJOb2RlLCBvdXRlck5vZGUubmV4dCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG91dGVyTm9kZTtcbn1cblxuLy8gZmluZCBhIGJyaWRnZSBiZXR3ZWVuIHZlcnRpY2VzIHRoYXQgY29ubmVjdHMgaG9sZSB3aXRoIGFuIG91dGVyIHJpbmcgYW5kIGFuZCBsaW5rIGl0XG5mdW5jdGlvbiBlbGltaW5hdGVIb2xlKGhvbGVOb2RlLCBvdXRlck5vZGUpIHtcbiAgICBvdXRlck5vZGUgPSBmaW5kSG9sZUJyaWRnZShob2xlTm9kZSwgb3V0ZXJOb2RlKTtcbiAgICBpZiAob3V0ZXJOb2RlKSB7XG4gICAgICAgIHZhciBiID0gc3BsaXRQb2x5Z29uKG91dGVyTm9kZSwgaG9sZU5vZGUpO1xuICAgICAgICBmaWx0ZXJQb2ludHMoYiwgYi5uZXh0KTtcbiAgICB9XG59XG5cbi8vIERhdmlkIEViZXJseSdzIGFsZ29yaXRobSBmb3IgZmluZGluZyBhIGJyaWRnZSBiZXR3ZWVuIGhvbGUgYW5kIG91dGVyIHBvbHlnb25cbmZ1bmN0aW9uIGZpbmRIb2xlQnJpZGdlKGhvbGVOb2RlLCBvdXRlck5vZGUpIHtcbiAgICB2YXIgbm9kZSA9IG91dGVyTm9kZSxcbiAgICAgICAgcCA9IGhvbGVOb2RlLnAsXG4gICAgICAgIHB4ID0gcFswXSxcbiAgICAgICAgcHkgPSBwWzFdLFxuICAgICAgICBxTWF4ID0gLUluZmluaXR5LFxuICAgICAgICBtTm9kZSwgYSwgYjtcblxuICAgIC8vIGZpbmQgYSBzZWdtZW50IGludGVyc2VjdGVkIGJ5IGEgcmF5IGZyb20gdGhlIGhvbGUncyBsZWZ0bW9zdCBwb2ludCB0byB0aGUgbGVmdDtcbiAgICAvLyBzZWdtZW50J3MgZW5kcG9pbnQgd2l0aCBsZXNzZXIgeCB3aWxsIGJlIHBvdGVudGlhbCBjb25uZWN0aW9uIHBvaW50XG4gICAgZG8ge1xuICAgICAgICBhID0gbm9kZS5wO1xuICAgICAgICBiID0gbm9kZS5uZXh0LnA7XG5cbiAgICAgICAgaWYgKHB5IDw9IGFbMV0gJiYgcHkgPj0gYlsxXSkge1xuICAgICAgICAgICAgdmFyIHF4ID0gYVswXSArIChweSAtIGFbMV0pICogKGJbMF0gLSBhWzBdKSAvIChiWzFdIC0gYVsxXSk7XG4gICAgICAgICAgICBpZiAocXggPD0gcHggJiYgcXggPiBxTWF4KSB7XG4gICAgICAgICAgICAgICAgcU1heCA9IHF4O1xuICAgICAgICAgICAgICAgIG1Ob2RlID0gYVswXSA8IGJbMF0gPyBub2RlIDogbm9kZS5uZXh0O1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG4gICAgfSB3aGlsZSAobm9kZSAhPT0gb3V0ZXJOb2RlKTtcblxuICAgIGlmICghbU5vZGUpIHJldHVybiBudWxsO1xuXG4gICAgLy8gbG9vayBmb3IgcG9pbnRzIHN0cmljdGx5IGluc2lkZSB0aGUgdHJpYW5nbGUgb2YgaG9sZSBwb2ludCwgc2VnbWVudCBpbnRlcnNlY3Rpb24gYW5kIGVuZHBvaW50O1xuICAgIC8vIGlmIHRoZXJlIGFyZSBubyBwb2ludHMgZm91bmQsIHdlIGhhdmUgYSB2YWxpZCBjb25uZWN0aW9uO1xuICAgIC8vIG90aGVyd2lzZSBjaG9vc2UgdGhlIHBvaW50IG9mIHRoZSBtaW5pbXVtIGFuZ2xlIHdpdGggdGhlIHJheSBhcyBjb25uZWN0aW9uIHBvaW50XG5cbiAgICB2YXIgYnggPSBtTm9kZS5wWzBdLFxuICAgICAgICBieSA9IG1Ob2RlLnBbMV0sXG4gICAgICAgIHBiZCA9IHB4ICogYnkgLSBweSAqIGJ4LFxuICAgICAgICBwY2QgPSBweCAqIHB5IC0gcHkgKiBxTWF4LFxuICAgICAgICBjcHkgPSBweSAtIHB5LFxuICAgICAgICBwY3ggPSBweCAtIHFNYXgsXG4gICAgICAgIHBieSA9IHB5IC0gYnksXG4gICAgICAgIGJweCA9IGJ4IC0gcHgsXG4gICAgICAgIEEgPSBwYmQgLSBwY2QgLSAocU1heCAqIGJ5IC0gcHkgKiBieCksXG4gICAgICAgIHNpZ24gPSBBIDw9IDAgPyAtMSA6IDEsXG4gICAgICAgIHN0b3AgPSBtTm9kZSxcbiAgICAgICAgdGFuTWluID0gSW5maW5pdHksXG4gICAgICAgIG14LCBteSwgYW14LCBzLCB0LCB0YW47XG5cbiAgICBub2RlID0gbU5vZGUubmV4dDtcblxuICAgIHdoaWxlIChub2RlICE9PSBzdG9wKSB7XG5cbiAgICAgICAgbXggPSBub2RlLnBbMF07XG4gICAgICAgIG15ID0gbm9kZS5wWzFdO1xuICAgICAgICBhbXggPSBweCAtIG14O1xuXG4gICAgICAgIGlmIChhbXggPj0gMCAmJiBteCA+PSBieCkge1xuICAgICAgICAgICAgcyA9IChjcHkgKiBteCArIHBjeCAqIG15IC0gcGNkKSAqIHNpZ247XG4gICAgICAgICAgICBpZiAocyA+PSAwKSB7XG4gICAgICAgICAgICAgICAgdCA9IChwYnkgKiBteCArIGJweCAqIG15ICsgcGJkKSAqIHNpZ247XG5cbiAgICAgICAgICAgICAgICBpZiAodCA+PSAwICYmIEEgKiBzaWduIC0gcyAtIHQgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0YW4gPSBNYXRoLmFicyhweSAtIG15KSAvIGFteDsgLy8gdGFuZ2VudGlhbFxuICAgICAgICAgICAgICAgICAgICBpZiAodGFuIDwgdGFuTWluICYmIGxvY2FsbHlJbnNpZGUobm9kZSwgaG9sZU5vZGUpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtTm9kZSA9IG5vZGU7XG4gICAgICAgICAgICAgICAgICAgICAgICB0YW5NaW4gPSB0YW47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBub2RlID0gbm9kZS5uZXh0O1xuICAgIH1cblxuICAgIHJldHVybiBtTm9kZTtcbn1cblxuLy8gaW50ZXJsaW5rIHBvbHlnb24gbm9kZXMgaW4gei1vcmRlclxuZnVuY3Rpb24gaW5kZXhDdXJ2ZShzdGFydCwgbWluWCwgbWluWSwgc2l6ZSkge1xuICAgIHZhciBub2RlID0gc3RhcnQ7XG5cbiAgICBkbyB7XG4gICAgICAgIGlmIChub2RlLnogPT09IG51bGwpIG5vZGUueiA9IHpPcmRlcihub2RlLnBbMF0sIG5vZGUucFsxXSwgbWluWCwgbWluWSwgc2l6ZSk7XG4gICAgICAgIG5vZGUucHJldlogPSBub2RlLnByZXY7XG4gICAgICAgIG5vZGUubmV4dFogPSBub2RlLm5leHQ7XG4gICAgICAgIG5vZGUgPSBub2RlLm5leHQ7XG4gICAgfSB3aGlsZSAobm9kZSAhPT0gc3RhcnQpO1xuXG4gICAgbm9kZS5wcmV2Wi5uZXh0WiA9IG51bGw7XG4gICAgbm9kZS5wcmV2WiA9IG51bGw7XG5cbiAgICBzb3J0TGlua2VkKG5vZGUpO1xufVxuXG4vLyBTaW1vbiBUYXRoYW0ncyBsaW5rZWQgbGlzdCBtZXJnZSBzb3J0IGFsZ29yaXRobVxuLy8gaHR0cDovL3d3dy5jaGlhcmsuZ3JlZW5lbmQub3JnLnVrL35zZ3RhdGhhbS9hbGdvcml0aG1zL2xpc3Rzb3J0Lmh0bWxcbmZ1bmN0aW9uIHNvcnRMaW5rZWQobGlzdCkge1xuICAgIHZhciBpLCBwLCBxLCBlLCB0YWlsLCBudW1NZXJnZXMsIHBTaXplLCBxU2l6ZSxcbiAgICAgICAgaW5TaXplID0gMTtcblxuICAgIHdoaWxlICh0cnVlKSB7XG4gICAgICAgIHAgPSBsaXN0O1xuICAgICAgICBsaXN0ID0gbnVsbDtcbiAgICAgICAgdGFpbCA9IG51bGw7XG4gICAgICAgIG51bU1lcmdlcyA9IDA7XG5cbiAgICAgICAgd2hpbGUgKHApIHtcbiAgICAgICAgICAgIG51bU1lcmdlcysrO1xuICAgICAgICAgICAgcSA9IHA7XG4gICAgICAgICAgICBwU2l6ZSA9IDA7XG4gICAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgaW5TaXplOyBpKyspIHtcbiAgICAgICAgICAgICAgICBwU2l6ZSsrO1xuICAgICAgICAgICAgICAgIHEgPSBxLm5leHRaO1xuICAgICAgICAgICAgICAgIGlmICghcSkgYnJlYWs7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHFTaXplID0gaW5TaXplO1xuXG4gICAgICAgICAgICB3aGlsZSAocFNpemUgPiAwIHx8IChxU2l6ZSA+IDAgJiYgcSkpIHtcblxuICAgICAgICAgICAgICAgIGlmIChwU2l6ZSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBlID0gcTtcbiAgICAgICAgICAgICAgICAgICAgcSA9IHEubmV4dFo7XG4gICAgICAgICAgICAgICAgICAgIHFTaXplLS07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChxU2l6ZSA9PT0gMCB8fCAhcSkge1xuICAgICAgICAgICAgICAgICAgICBlID0gcDtcbiAgICAgICAgICAgICAgICAgICAgcCA9IHAubmV4dFo7XG4gICAgICAgICAgICAgICAgICAgIHBTaXplLS07XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChwLnogPD0gcS56KSB7XG4gICAgICAgICAgICAgICAgICAgIGUgPSBwO1xuICAgICAgICAgICAgICAgICAgICBwID0gcC5uZXh0WjtcbiAgICAgICAgICAgICAgICAgICAgcFNpemUtLTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlID0gcTtcbiAgICAgICAgICAgICAgICAgICAgcSA9IHEubmV4dFo7XG4gICAgICAgICAgICAgICAgICAgIHFTaXplLS07XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgaWYgKHRhaWwpIHRhaWwubmV4dFogPSBlO1xuICAgICAgICAgICAgICAgIGVsc2UgbGlzdCA9IGU7XG5cbiAgICAgICAgICAgICAgICBlLnByZXZaID0gdGFpbDtcbiAgICAgICAgICAgICAgICB0YWlsID0gZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcCA9IHE7XG4gICAgICAgIH1cblxuICAgICAgICB0YWlsLm5leHRaID0gbnVsbDtcblxuICAgICAgICBpZiAobnVtTWVyZ2VzIDw9IDEpIHJldHVybiBsaXN0O1xuXG4gICAgICAgIGluU2l6ZSAqPSAyO1xuICAgIH1cbn1cblxuLy8gei1vcmRlciBvZiBhIHBvaW50IGdpdmVuIGNvb3JkcyBhbmQgc2l6ZSBvZiB0aGUgZGF0YSBib3VuZGluZyBib3hcbmZ1bmN0aW9uIHpPcmRlcih4LCB5LCBtaW5YLCBtaW5ZLCBzaXplKSB7XG4gICAgLy8gY29vcmRzIGFyZSB0cmFuc2Zvcm1lZCBpbnRvICgwLi4xMDAwKSBpbnRlZ2VyIHJhbmdlXG4gICAgeCA9IDEwMDAgKiAoeCAtIG1pblgpIC8gc2l6ZTtcbiAgICB4ID0gKHggfCAoeCA8PCA4KSkgJiAweDAwRkYwMEZGO1xuICAgIHggPSAoeCB8ICh4IDw8IDQpKSAmIDB4MEYwRjBGMEY7XG4gICAgeCA9ICh4IHwgKHggPDwgMikpICYgMHgzMzMzMzMzMztcbiAgICB4ID0gKHggfCAoeCA8PCAxKSkgJiAweDU1NTU1NTU1O1xuXG4gICAgeSA9IDEwMDAgKiAoeSAtIG1pblkpIC8gc2l6ZTtcbiAgICB5ID0gKHkgfCAoeSA8PCA4KSkgJiAweDAwRkYwMEZGO1xuICAgIHkgPSAoeSB8ICh5IDw8IDQpKSAmIDB4MEYwRjBGMEY7XG4gICAgeSA9ICh5IHwgKHkgPDwgMikpICYgMHgzMzMzMzMzMztcbiAgICB5ID0gKHkgfCAoeSA8PCAxKSkgJiAweDU1NTU1NTU1O1xuXG4gICAgcmV0dXJuIHggfCAoeSA8PCAxKTtcbn1cblxuLy8gZmluZCB0aGUgbGVmdG1vc3Qgbm9kZSBvZiBhIHBvbHlnb24gcmluZ1xuZnVuY3Rpb24gZ2V0TGVmdG1vc3Qoc3RhcnQpIHtcbiAgICB2YXIgbm9kZSA9IHN0YXJ0LFxuICAgICAgICBsZWZ0bW9zdCA9IHN0YXJ0O1xuICAgIGRvIHtcbiAgICAgICAgaWYgKG5vZGUucFswXSA8IGxlZnRtb3N0LnBbMF0pIGxlZnRtb3N0ID0gbm9kZTtcbiAgICAgICAgbm9kZSA9IG5vZGUubmV4dDtcbiAgICB9IHdoaWxlIChub2RlICE9PSBzdGFydCk7XG5cbiAgICByZXR1cm4gbGVmdG1vc3Q7XG59XG5cbi8vIGNoZWNrIGlmIGEgZGlhZ29uYWwgYmV0d2VlbiB0d28gcG9seWdvbiBub2RlcyBpcyB2YWxpZCAobGllcyBpbiBwb2x5Z29uIGludGVyaW9yKVxuZnVuY3Rpb24gaXNWYWxpZERpYWdvbmFsKGEsIGIpIHtcbiAgICByZXR1cm4gIWludGVyc2VjdHNQb2x5Z29uKGEsIGEucCwgYi5wKSAmJlxuICAgICAgICAgICBsb2NhbGx5SW5zaWRlKGEsIGIpICYmIGxvY2FsbHlJbnNpZGUoYiwgYSkgJiZcbiAgICAgICAgICAgbWlkZGxlSW5zaWRlKGEsIGEucCwgYi5wKTtcbn1cblxuLy8gd2luZGluZyBvcmRlciBvZiB0cmlhbmdsZSBmb3JtZWQgYnkgMyBnaXZlbiBwb2ludHNcbmZ1bmN0aW9uIG9yaWVudChwLCBxLCByKSB7XG4gICAgdmFyIG8gPSAocVsxXSAtIHBbMV0pICogKHJbMF0gLSBxWzBdKSAtIChxWzBdIC0gcFswXSkgKiAoclsxXSAtIHFbMV0pO1xuICAgIHJldHVybiBvID4gMCA/IDEgOlxuICAgICAgICAgICBvIDwgMCA/IC0xIDogMDtcbn1cblxuLy8gY2hlY2sgaWYgdHdvIHBvaW50cyBhcmUgZXF1YWxcbmZ1bmN0aW9uIGVxdWFscyhwMSwgcDIpIHtcbiAgICByZXR1cm4gcDFbMF0gPT09IHAyWzBdICYmIHAxWzFdID09PSBwMlsxXTtcbn1cblxuLy8gY2hlY2sgaWYgdHdvIHNlZ21lbnRzIGludGVyc2VjdFxuZnVuY3Rpb24gaW50ZXJzZWN0cyhwMSwgcTEsIHAyLCBxMikge1xuICAgIHJldHVybiBvcmllbnQocDEsIHExLCBwMikgIT09IG9yaWVudChwMSwgcTEsIHEyKSAmJlxuICAgICAgICAgICBvcmllbnQocDIsIHEyLCBwMSkgIT09IG9yaWVudChwMiwgcTIsIHExKTtcbn1cblxuLy8gY2hlY2sgaWYgYSBwb2x5Z29uIGRpYWdvbmFsIGludGVyc2VjdHMgYW55IHBvbHlnb24gc2VnbWVudHNcbmZ1bmN0aW9uIGludGVyc2VjdHNQb2x5Z29uKHN0YXJ0LCBhLCBiKSB7XG4gICAgdmFyIG5vZGUgPSBzdGFydDtcbiAgICBkbyB7XG4gICAgICAgIHZhciBwMSA9IG5vZGUucCxcbiAgICAgICAgICAgIHAyID0gbm9kZS5uZXh0LnA7XG5cbiAgICAgICAgaWYgKHAxICE9PSBhICYmIHAyICE9PSBhICYmIHAxICE9PSBiICYmIHAyICE9PSBiICYmIGludGVyc2VjdHMocDEsIHAyLCBhLCBiKSkgcmV0dXJuIHRydWU7XG5cbiAgICAgICAgbm9kZSA9IG5vZGUubmV4dDtcbiAgICB9IHdoaWxlIChub2RlICE9PSBzdGFydCk7XG5cbiAgICByZXR1cm4gZmFsc2U7XG59XG5cbi8vIGNoZWNrIGlmIGEgcG9seWdvbiBkaWFnb25hbCBpcyBsb2NhbGx5IGluc2lkZSB0aGUgcG9seWdvblxuZnVuY3Rpb24gbG9jYWxseUluc2lkZShhLCBiKSB7XG4gICAgcmV0dXJuIG9yaWVudChhLnByZXYucCwgYS5wLCBhLm5leHQucCkgPT09IC0xID9cbiAgICAgICAgb3JpZW50KGEucCwgYi5wLCBhLm5leHQucCkgIT09IC0xICYmIG9yaWVudChhLnAsIGEucHJldi5wLCBiLnApICE9PSAtMSA6XG4gICAgICAgIG9yaWVudChhLnAsIGIucCwgYS5wcmV2LnApID09PSAtMSB8fCBvcmllbnQoYS5wLCBhLm5leHQucCwgYi5wKSA9PT0gLTE7XG59XG5cbi8vIGNoZWNrIGlmIHRoZSBtaWRkbGUgcG9pbnQgb2YgYSBwb2x5Z29uIGRpYWdvbmFsIGlzIGluc2lkZSB0aGUgcG9seWdvblxuZnVuY3Rpb24gbWlkZGxlSW5zaWRlKHN0YXJ0LCBhLCBiKSB7XG4gICAgdmFyIG5vZGUgPSBzdGFydCxcbiAgICAgICAgaW5zaWRlID0gZmFsc2UsXG4gICAgICAgIHB4ID0gKGFbMF0gKyBiWzBdKSAvIDIsXG4gICAgICAgIHB5ID0gKGFbMV0gKyBiWzFdKSAvIDI7XG4gICAgZG8ge1xuICAgICAgICB2YXIgcDEgPSBub2RlLnAsXG4gICAgICAgICAgICBwMiA9IG5vZGUubmV4dC5wO1xuXG4gICAgICAgIGlmICgoKHAxWzFdID4gcHkpICE9PSAocDJbMV0gPiBweSkpICYmXG4gICAgICAgICAgICAocHggPCAocDJbMF0gLSBwMVswXSkgKiAocHkgLSBwMVsxXSkgLyAocDJbMV0gLSBwMVsxXSkgKyBwMVswXSkpIGluc2lkZSA9ICFpbnNpZGU7XG5cbiAgICAgICAgbm9kZSA9IG5vZGUubmV4dDtcbiAgICB9IHdoaWxlIChub2RlICE9PSBzdGFydCk7XG5cbiAgICByZXR1cm4gaW5zaWRlO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlWChhLCBiKSB7XG4gICAgcmV0dXJuIGEucFswXSAtIGIucFswXTtcbn1cblxuLy8gbGluayB0d28gcG9seWdvbiB2ZXJ0aWNlcyB3aXRoIGEgYnJpZGdlOyBpZiB0aGUgdmVydGljZXMgYmVsb25nIHRvIHRoZSBzYW1lIHJpbmcsIGl0IHNwbGl0cyBwb2x5Z29uIGludG8gdHdvO1xuLy8gaWYgb25lIGJlbG9uZ3MgdG8gdGhlIG91dGVyIHJpbmcgYW5kIGFub3RoZXIgdG8gYSBob2xlLCBpdCBtZXJnZXMgaXQgaW50byBhIHNpbmdsZSByaW5nXG5mdW5jdGlvbiBzcGxpdFBvbHlnb24oYSwgYikge1xuICAgIHZhciBhMiA9IG5ldyBOb2RlKGEucCksXG4gICAgICAgIGIyID0gbmV3IE5vZGUoYi5wKSxcbiAgICAgICAgYW4gPSBhLm5leHQsXG4gICAgICAgIGJwID0gYi5wcmV2O1xuXG4gICAgYTIuc291cmNlID0gYTtcbiAgICBiMi5zb3VyY2UgPSBiO1xuXG4gICAgYS5uZXh0ID0gYjtcbiAgICBiLnByZXYgPSBhO1xuXG4gICAgYTIubmV4dCA9IGFuO1xuICAgIGFuLnByZXYgPSBhMjtcblxuICAgIGIyLm5leHQgPSBhMjtcbiAgICBhMi5wcmV2ID0gYjI7XG5cbiAgICBicC5uZXh0ID0gYjI7XG4gICAgYjIucHJldiA9IGJwO1xuXG4gICAgcmV0dXJuIGIyO1xufVxuXG4vLyBjcmVhdGUgYSBub2RlIGFuZCBvcHRpb25hbGx5IGxpbmsgaXQgd2l0aCBwcmV2aW91cyBvbmUgKGluIGEgY2lyY3VsYXIgZG91Ymx5IGxpbmtlZCBsaXN0KVxuZnVuY3Rpb24gaW5zZXJ0Tm9kZShwb2ludCwgbGFzdCkge1xuICAgIHZhciBub2RlID0gbmV3IE5vZGUocG9pbnQpO1xuXG4gICAgaWYgKCFsYXN0KSB7XG4gICAgICAgIG5vZGUucHJldiA9IG5vZGU7XG4gICAgICAgIG5vZGUubmV4dCA9IG5vZGU7XG5cbiAgICB9IGVsc2Uge1xuICAgICAgICBub2RlLm5leHQgPSBsYXN0Lm5leHQ7XG4gICAgICAgIG5vZGUucHJldiA9IGxhc3Q7XG4gICAgICAgIGxhc3QubmV4dC5wcmV2ID0gbm9kZTtcbiAgICAgICAgbGFzdC5uZXh0ID0gbm9kZTtcbiAgICB9XG4gICAgcmV0dXJuIG5vZGU7XG59XG5cbmZ1bmN0aW9uIE5vZGUocCkge1xuICAgIC8vIHZlcnRleCBjb29yZGluYXRlc1xuICAgIHRoaXMucCA9IHA7XG5cbiAgICAvLyBwcmV2aW91cyBhbmQgbmV4dCB2ZXJ0aWNlIG5vZGVzIGluIGEgcG9seWdvbiByaW5nXG4gICAgdGhpcy5wcmV2ID0gbnVsbDtcbiAgICB0aGlzLm5leHQgPSBudWxsO1xuXG4gICAgLy8gei1vcmRlciBjdXJ2ZSB2YWx1ZVxuICAgIHRoaXMueiA9IG51bGw7XG5cbiAgICAvLyBwcmV2aW91cyBhbmQgbmV4dCBub2RlcyBpbiB6LW9yZGVyXG4gICAgdGhpcy5wcmV2WiA9IG51bGw7XG4gICAgdGhpcy5uZXh0WiA9IG51bGw7XG5cbiAgICAvLyB1c2VkIGZvciBpbmRleGVkIG91dHB1dFxuICAgIHRoaXMuc291cmNlID0gbnVsbDtcbiAgICB0aGlzLmluZGV4ID0gbnVsbDtcbn1cbiIsIi8qKlxuICogQGZpbGVvdmVydmlldyBnbC1tYXRyaXggLSBIaWdoIHBlcmZvcm1hbmNlIG1hdHJpeCBhbmQgdmVjdG9yIG9wZXJhdGlvbnNcbiAqIEBhdXRob3IgQnJhbmRvbiBKb25lc1xuICogQGF1dGhvciBDb2xpbiBNYWNLZW56aWUgSVZcbiAqIEB2ZXJzaW9uIDIuMi4xXG4gKi9cblxuLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvblxuICAgIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuXG5USElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbkFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG5XQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cblxuKGZ1bmN0aW9uKF9nbG9iYWwpIHtcbiAgXCJ1c2Ugc3RyaWN0XCI7XG5cbiAgdmFyIHNoaW0gPSB7fTtcbiAgaWYgKHR5cGVvZihleHBvcnRzKSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBpZih0eXBlb2YgZGVmaW5lID09ICdmdW5jdGlvbicgJiYgdHlwZW9mIGRlZmluZS5hbWQgPT0gJ29iamVjdCcgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgc2hpbS5leHBvcnRzID0ge307XG4gICAgICBkZWZpbmUoZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiBzaGltLmV4cG9ydHM7XG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gZ2wtbWF0cml4IGxpdmVzIGluIGEgYnJvd3NlciwgZGVmaW5lIGl0cyBuYW1lc3BhY2VzIGluIGdsb2JhbFxuICAgICAgc2hpbS5leHBvcnRzID0gdHlwZW9mKHdpbmRvdykgIT09ICd1bmRlZmluZWQnID8gd2luZG93IDogX2dsb2JhbDtcbiAgICB9XG4gIH1cbiAgZWxzZSB7XG4gICAgLy8gZ2wtbWF0cml4IGxpdmVzIGluIGNvbW1vbmpzLCBkZWZpbmUgaXRzIG5hbWVzcGFjZXMgaW4gZXhwb3J0c1xuICAgIHNoaW0uZXhwb3J0cyA9IGV4cG9ydHM7XG4gIH1cblxuICAoZnVuY3Rpb24oZXhwb3J0cykge1xuICAgIC8qIENvcHlyaWdodCAoYykgMjAxMywgQnJhbmRvbiBKb25lcywgQ29saW4gTWFjS2VuemllIElWLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5SZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLFxuYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXG4gICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzXG4gICAgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gXG4gICAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cblRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbldBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cblxuaWYoIUdMTUFUX0VQU0lMT04pIHtcbiAgICB2YXIgR0xNQVRfRVBTSUxPTiA9IDAuMDAwMDAxO1xufVxuXG5pZighR0xNQVRfQVJSQVlfVFlQRSkge1xuICAgIHZhciBHTE1BVF9BUlJBWV9UWVBFID0gKHR5cGVvZiBGbG9hdDMyQXJyYXkgIT09ICd1bmRlZmluZWQnKSA/IEZsb2F0MzJBcnJheSA6IEFycmF5O1xufVxuXG5pZighR0xNQVRfUkFORE9NKSB7XG4gICAgdmFyIEdMTUFUX1JBTkRPTSA9IE1hdGgucmFuZG9tO1xufVxuXG4vKipcbiAqIEBjbGFzcyBDb21tb24gdXRpbGl0aWVzXG4gKiBAbmFtZSBnbE1hdHJpeFxuICovXG52YXIgZ2xNYXRyaXggPSB7fTtcblxuLyoqXG4gKiBTZXRzIHRoZSB0eXBlIG9mIGFycmF5IHVzZWQgd2hlbiBjcmVhdGluZyBuZXcgdmVjdG9ycyBhbmQgbWF0cmljaWVzXG4gKlxuICogQHBhcmFtIHtUeXBlfSB0eXBlIEFycmF5IHR5cGUsIHN1Y2ggYXMgRmxvYXQzMkFycmF5IG9yIEFycmF5XG4gKi9cbmdsTWF0cml4LnNldE1hdHJpeEFycmF5VHlwZSA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgICBHTE1BVF9BUlJBWV9UWVBFID0gdHlwZTtcbn1cblxuaWYodHlwZW9mKGV4cG9ydHMpICE9PSAndW5kZWZpbmVkJykge1xuICAgIGV4cG9ydHMuZ2xNYXRyaXggPSBnbE1hdHJpeDtcbn1cblxudmFyIGRlZ3JlZSA9IE1hdGguUEkgLyAxODA7XG5cbi8qKlxuKiBDb252ZXJ0IERlZ3JlZSBUbyBSYWRpYW5cbipcbiogQHBhcmFtIHtOdW1iZXJ9IEFuZ2xlIGluIERlZ3JlZXNcbiovXG5nbE1hdHJpeC50b1JhZGlhbiA9IGZ1bmN0aW9uKGEpe1xuICAgICByZXR1cm4gYSAqIGRlZ3JlZTtcbn1cbjtcbi8qIENvcHlyaWdodCAoYykgMjAxMywgQnJhbmRvbiBKb25lcywgQ29saW4gTWFjS2VuemllIElWLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5SZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLFxuYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXG4gICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzXG4gICAgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gXG4gICAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cblRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbldBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cbi8qKlxuICogQGNsYXNzIDIgRGltZW5zaW9uYWwgVmVjdG9yXG4gKiBAbmFtZSB2ZWMyXG4gKi9cblxudmFyIHZlYzIgPSB7fTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3LCBlbXB0eSB2ZWMyXG4gKlxuICogQHJldHVybnMge3ZlYzJ9IGEgbmV3IDJEIHZlY3RvclxuICovXG52ZWMyLmNyZWF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSgyKTtcbiAgICBvdXRbMF0gPSAwO1xuICAgIG91dFsxXSA9IDA7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyB2ZWMyIGluaXRpYWxpemVkIHdpdGggdmFsdWVzIGZyb20gYW4gZXhpc3RpbmcgdmVjdG9yXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHZlY3RvciB0byBjbG9uZVxuICogQHJldHVybnMge3ZlYzJ9IGEgbmV3IDJEIHZlY3RvclxuICovXG52ZWMyLmNsb25lID0gZnVuY3Rpb24oYSkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSgyKTtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyB2ZWMyIGluaXRpYWxpemVkIHdpdGggdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHJldHVybnMge3ZlYzJ9IGEgbmV3IDJEIHZlY3RvclxuICovXG52ZWMyLmZyb21WYWx1ZXMgPSBmdW5jdGlvbih4LCB5KSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDIpO1xuICAgIG91dFswXSA9IHg7XG4gICAgb3V0WzFdID0geTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3B5IHRoZSB2YWx1ZXMgZnJvbSBvbmUgdmVjMiB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgc291cmNlIHZlY3RvclxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLmNvcHkgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2V0IHRoZSBjb21wb25lbnRzIG9mIGEgdmVjMiB0byB0aGUgZ2l2ZW4gdmFsdWVzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLnNldCA9IGZ1bmN0aW9uKG91dCwgeCwgeSkge1xuICAgIG91dFswXSA9IHg7XG4gICAgb3V0WzFdID0geTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBZGRzIHR3byB2ZWMyJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIuYWRkID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSArIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSArIGJbMV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU3VidHJhY3RzIHZlY3RvciBiIGZyb20gdmVjdG9yIGFcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIuc3VidHJhY3QgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdIC0gYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdIC0gYlsxXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzIuc3VidHJhY3R9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMi5zdWIgPSB2ZWMyLnN1YnRyYWN0O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi5tdWx0aXBseSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKiBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gKiBiWzFdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMi5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMyLm11bCA9IHZlYzIubXVsdGlwbHk7XG5cbi8qKlxuICogRGl2aWRlcyB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMyfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLmRpdmlkZSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gLyBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gLyBiWzFdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMi5kaXZpZGV9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMi5kaXYgPSB2ZWMyLmRpdmlkZTtcblxuLyoqXG4gKiBSZXR1cm5zIHRoZSBtaW5pbXVtIG9mIHR3byB2ZWMyJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIubWluID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gTWF0aC5taW4oYVswXSwgYlswXSk7XG4gICAgb3V0WzFdID0gTWF0aC5taW4oYVsxXSwgYlsxXSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbWF4aW11bSBvZiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMyfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLm1heCA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IE1hdGgubWF4KGFbMF0sIGJbMF0pO1xuICAgIG91dFsxXSA9IE1hdGgubWF4KGFbMV0sIGJbMV0pO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNjYWxlcyBhIHZlYzIgYnkgYSBzY2FsYXIgbnVtYmVyXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgdmVjdG9yIHRvIHNjYWxlXG4gKiBAcGFyYW0ge051bWJlcn0gYiBhbW91bnQgdG8gc2NhbGUgdGhlIHZlY3RvciBieVxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLnNjYWxlID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAqIGI7XG4gICAgb3V0WzFdID0gYVsxXSAqIGI7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWRkcyB0d28gdmVjMidzIGFmdGVyIHNjYWxpbmcgdGhlIHNlY29uZCBvcGVyYW5kIGJ5IGEgc2NhbGFyIHZhbHVlXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMyfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHBhcmFtIHtOdW1iZXJ9IHNjYWxlIHRoZSBhbW91bnQgdG8gc2NhbGUgYiBieSBiZWZvcmUgYWRkaW5nXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIuc2NhbGVBbmRBZGQgPSBmdW5jdGlvbihvdXQsIGEsIGIsIHNjYWxlKSB7XG4gICAgb3V0WzBdID0gYVswXSArIChiWzBdICogc2NhbGUpO1xuICAgIG91dFsxXSA9IGFbMV0gKyAoYlsxXSAqIHNjYWxlKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkaXN0YW5jZSBiZXR3ZWVuIGEgYW5kIGJcbiAqL1xudmVjMi5kaXN0YW5jZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICB2YXIgeCA9IGJbMF0gLSBhWzBdLFxuICAgICAgICB5ID0gYlsxXSAtIGFbMV07XG4gICAgcmV0dXJuIE1hdGguc3FydCh4KnggKyB5KnkpO1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzIuZGlzdGFuY2V9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMi5kaXN0ID0gdmVjMi5kaXN0YW5jZTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBzcXVhcmVkIGV1Y2xpZGlhbiBkaXN0YW5jZSBiZXR3ZWVuIHR3byB2ZWMyJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IHNxdWFyZWQgZGlzdGFuY2UgYmV0d2VlbiBhIGFuZCBiXG4gKi9cbnZlYzIuc3F1YXJlZERpc3RhbmNlID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHZhciB4ID0gYlswXSAtIGFbMF0sXG4gICAgICAgIHkgPSBiWzFdIC0gYVsxXTtcbiAgICByZXR1cm4geCp4ICsgeSp5O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzIuc3F1YXJlZERpc3RhbmNlfVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzIuc3FyRGlzdCA9IHZlYzIuc3F1YXJlZERpc3RhbmNlO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGxlbmd0aCBvZiBhIHZlYzJcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGxlbmd0aCBvZiBhXG4gKi9cbnZlYzIubGVuZ3RoID0gZnVuY3Rpb24gKGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdO1xuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5KTtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMyLmxlbmd0aH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMyLmxlbiA9IHZlYzIubGVuZ3RoO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIHNxdWFyZWQgbGVuZ3RoIG9mIGEgdmVjMlxuICpcbiAqIEBwYXJhbSB7dmVjMn0gYSB2ZWN0b3IgdG8gY2FsY3VsYXRlIHNxdWFyZWQgbGVuZ3RoIG9mXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBzcXVhcmVkIGxlbmd0aCBvZiBhXG4gKi9cbnZlYzIuc3F1YXJlZExlbmd0aCA9IGZ1bmN0aW9uIChhKSB7XG4gICAgdmFyIHggPSBhWzBdLFxuICAgICAgICB5ID0gYVsxXTtcbiAgICByZXR1cm4geCp4ICsgeSp5O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzIuc3F1YXJlZExlbmd0aH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWMyLnNxckxlbiA9IHZlYzIuc3F1YXJlZExlbmd0aDtcblxuLyoqXG4gKiBOZWdhdGVzIHRoZSBjb21wb25lbnRzIG9mIGEgdmVjMlxuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdmVjdG9yIHRvIG5lZ2F0ZVxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLm5lZ2F0ZSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IC1hWzBdO1xuICAgIG91dFsxXSA9IC1hWzFdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSBhIHZlYzJcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHZlY3RvciB0byBub3JtYWxpemVcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi5ub3JtYWxpemUgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdO1xuICAgIHZhciBsZW4gPSB4KnggKyB5Knk7XG4gICAgaWYgKGxlbiA+IDApIHtcbiAgICAgICAgLy9UT0RPOiBldmFsdWF0ZSB1c2Ugb2YgZ2xtX2ludnNxcnQgaGVyZT9cbiAgICAgICAgbGVuID0gMSAvIE1hdGguc3FydChsZW4pO1xuICAgICAgICBvdXRbMF0gPSBhWzBdICogbGVuO1xuICAgICAgICBvdXRbMV0gPSBhWzFdICogbGVuO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkb3QgcHJvZHVjdCBvZiB0d28gdmVjMidzXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkb3QgcHJvZHVjdCBvZiBhIGFuZCBiXG4gKi9cbnZlYzIuZG90ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gYVswXSAqIGJbMF0gKyBhWzFdICogYlsxXTtcbn07XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIGNyb3NzIHByb2R1Y3Qgb2YgdHdvIHZlYzInc1xuICogTm90ZSB0aGF0IHRoZSBjcm9zcyBwcm9kdWN0IG11c3QgYnkgZGVmaW5pdGlvbiBwcm9kdWNlIGEgM0QgdmVjdG9yXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMyfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMyLmNyb3NzID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgdmFyIHogPSBhWzBdICogYlsxXSAtIGFbMV0gKiBiWzBdO1xuICAgIG91dFswXSA9IG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gejtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBQZXJmb3JtcyBhIGxpbmVhciBpbnRlcnBvbGF0aW9uIGJldHdlZW4gdHdvIHZlYzInc1xuICpcbiAqIEBwYXJhbSB7dmVjMn0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzJ9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjMn0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEBwYXJhbSB7TnVtYmVyfSB0IGludGVycG9sYXRpb24gYW1vdW50IGJldHdlZW4gdGhlIHR3byBpbnB1dHNcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi5sZXJwID0gZnVuY3Rpb24gKG91dCwgYSwgYiwgdCkge1xuICAgIHZhciBheCA9IGFbMF0sXG4gICAgICAgIGF5ID0gYVsxXTtcbiAgICBvdXRbMF0gPSBheCArIHQgKiAoYlswXSAtIGF4KTtcbiAgICBvdXRbMV0gPSBheSArIHQgKiAoYlsxXSAtIGF5KTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSByYW5kb20gdmVjdG9yIHdpdGggdGhlIGdpdmVuIHNjYWxlXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7TnVtYmVyfSBbc2NhbGVdIExlbmd0aCBvZiB0aGUgcmVzdWx0aW5nIHZlY3Rvci4gSWYgb21taXR0ZWQsIGEgdW5pdCB2ZWN0b3Igd2lsbCBiZSByZXR1cm5lZFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLnJhbmRvbSA9IGZ1bmN0aW9uIChvdXQsIHNjYWxlKSB7XG4gICAgc2NhbGUgPSBzY2FsZSB8fCAxLjA7XG4gICAgdmFyIHIgPSBHTE1BVF9SQU5ET00oKSAqIDIuMCAqIE1hdGguUEk7XG4gICAgb3V0WzBdID0gTWF0aC5jb3MocikgKiBzY2FsZTtcbiAgICBvdXRbMV0gPSBNYXRoLnNpbihyKSAqIHNjYWxlO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zZm9ybXMgdGhlIHZlYzIgd2l0aCBhIG1hdDJcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge21hdDJ9IG0gbWF0cml4IHRvIHRyYW5zZm9ybSB3aXRoXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIudHJhbnNmb3JtTWF0MiA9IGZ1bmN0aW9uKG91dCwgYSwgbSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV07XG4gICAgb3V0WzBdID0gbVswXSAqIHggKyBtWzJdICogeTtcbiAgICBvdXRbMV0gPSBtWzFdICogeCArIG1bM10gKiB5O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zZm9ybXMgdGhlIHZlYzIgd2l0aCBhIG1hdDJkXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHttYXQyZH0gbSBtYXRyaXggdG8gdHJhbnNmb3JtIHdpdGhcbiAqIEByZXR1cm5zIHt2ZWMyfSBvdXRcbiAqL1xudmVjMi50cmFuc2Zvcm1NYXQyZCA9IGZ1bmN0aW9uKG91dCwgYSwgbSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV07XG4gICAgb3V0WzBdID0gbVswXSAqIHggKyBtWzJdICogeSArIG1bNF07XG4gICAgb3V0WzFdID0gbVsxXSAqIHggKyBtWzNdICogeSArIG1bNV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogVHJhbnNmb3JtcyB0aGUgdmVjMiB3aXRoIGEgbWF0M1xuICogM3JkIHZlY3RvciBjb21wb25lbnQgaXMgaW1wbGljaXRseSAnMSdcbiAqXG4gKiBAcGFyYW0ge3ZlYzJ9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMyfSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge21hdDN9IG0gbWF0cml4IHRvIHRyYW5zZm9ybSB3aXRoXG4gKiBAcmV0dXJucyB7dmVjMn0gb3V0XG4gKi9cbnZlYzIudHJhbnNmb3JtTWF0MyA9IGZ1bmN0aW9uKG91dCwgYSwgbSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV07XG4gICAgb3V0WzBdID0gbVswXSAqIHggKyBtWzNdICogeSArIG1bNl07XG4gICAgb3V0WzFdID0gbVsxXSAqIHggKyBtWzRdICogeSArIG1bN107XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogVHJhbnNmb3JtcyB0aGUgdmVjMiB3aXRoIGEgbWF0NFxuICogM3JkIHZlY3RvciBjb21wb25lbnQgaXMgaW1wbGljaXRseSAnMCdcbiAqIDR0aCB2ZWN0b3IgY29tcG9uZW50IGlzIGltcGxpY2l0bHkgJzEnXG4gKlxuICogQHBhcmFtIHt2ZWMyfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjMn0gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHttYXQ0fSBtIG1hdHJpeCB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzJ9IG91dFxuICovXG52ZWMyLnRyYW5zZm9ybU1hdDQgPSBmdW5jdGlvbihvdXQsIGEsIG0pIHtcbiAgICB2YXIgeCA9IGFbMF0sIFxuICAgICAgICB5ID0gYVsxXTtcbiAgICBvdXRbMF0gPSBtWzBdICogeCArIG1bNF0gKiB5ICsgbVsxMl07XG4gICAgb3V0WzFdID0gbVsxXSAqIHggKyBtWzVdICogeSArIG1bMTNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFBlcmZvcm0gc29tZSBvcGVyYXRpb24gb3ZlciBhbiBhcnJheSBvZiB2ZWMycy5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBhIHRoZSBhcnJheSBvZiB2ZWN0b3JzIHRvIGl0ZXJhdGUgb3ZlclxuICogQHBhcmFtIHtOdW1iZXJ9IHN0cmlkZSBOdW1iZXIgb2YgZWxlbWVudHMgYmV0d2VlbiB0aGUgc3RhcnQgb2YgZWFjaCB2ZWMyLiBJZiAwIGFzc3VtZXMgdGlnaHRseSBwYWNrZWRcbiAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgTnVtYmVyIG9mIGVsZW1lbnRzIHRvIHNraXAgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgYXJyYXlcbiAqIEBwYXJhbSB7TnVtYmVyfSBjb3VudCBOdW1iZXIgb2YgdmVjMnMgdG8gaXRlcmF0ZSBvdmVyLiBJZiAwIGl0ZXJhdGVzIG92ZXIgZW50aXJlIGFycmF5XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmbiBGdW5jdGlvbiB0byBjYWxsIGZvciBlYWNoIHZlY3RvciBpbiB0aGUgYXJyYXlcbiAqIEBwYXJhbSB7T2JqZWN0fSBbYXJnXSBhZGRpdGlvbmFsIGFyZ3VtZW50IHRvIHBhc3MgdG8gZm5cbiAqIEByZXR1cm5zIHtBcnJheX0gYVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzIuZm9yRWFjaCA9IChmdW5jdGlvbigpIHtcbiAgICB2YXIgdmVjID0gdmVjMi5jcmVhdGUoKTtcblxuICAgIHJldHVybiBmdW5jdGlvbihhLCBzdHJpZGUsIG9mZnNldCwgY291bnQsIGZuLCBhcmcpIHtcbiAgICAgICAgdmFyIGksIGw7XG4gICAgICAgIGlmKCFzdHJpZGUpIHtcbiAgICAgICAgICAgIHN0cmlkZSA9IDI7XG4gICAgICAgIH1cblxuICAgICAgICBpZighb2Zmc2V0KSB7XG4gICAgICAgICAgICBvZmZzZXQgPSAwO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZihjb3VudCkge1xuICAgICAgICAgICAgbCA9IE1hdGgubWluKChjb3VudCAqIHN0cmlkZSkgKyBvZmZzZXQsIGEubGVuZ3RoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGwgPSBhLmxlbmd0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcihpID0gb2Zmc2V0OyBpIDwgbDsgaSArPSBzdHJpZGUpIHtcbiAgICAgICAgICAgIHZlY1swXSA9IGFbaV07IHZlY1sxXSA9IGFbaSsxXTtcbiAgICAgICAgICAgIGZuKHZlYywgdmVjLCBhcmcpO1xuICAgICAgICAgICAgYVtpXSA9IHZlY1swXTsgYVtpKzFdID0gdmVjWzFdO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICByZXR1cm4gYTtcbiAgICB9O1xufSkoKTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgdmVjdG9yXG4gKlxuICogQHBhcmFtIHt2ZWMyfSB2ZWMgdmVjdG9yIHRvIHJlcHJlc2VudCBhcyBhIHN0cmluZ1xuICogQHJldHVybnMge1N0cmluZ30gc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIHRoZSB2ZWN0b3JcbiAqL1xudmVjMi5zdHIgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiAndmVjMignICsgYVswXSArICcsICcgKyBhWzFdICsgJyknO1xufTtcblxuaWYodHlwZW9mKGV4cG9ydHMpICE9PSAndW5kZWZpbmVkJykge1xuICAgIGV4cG9ydHMudmVjMiA9IHZlYzI7XG59XG47XG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMsIEJyYW5kb24gSm9uZXMsIENvbGluIE1hY0tlbnppZSBJVi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cblxuUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0IG1vZGlmaWNhdGlvbixcbmFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblxuICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpc1xuICAgIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSxcbiAgICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIFxuICAgIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuXG5USElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbkFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG5XQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIFxuRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBIT0xERVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1JcbkFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OXG5BTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcblNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLiAqL1xuXG4vKipcbiAqIEBjbGFzcyAzIERpbWVuc2lvbmFsIFZlY3RvclxuICogQG5hbWUgdmVjM1xuICovXG5cbnZhciB2ZWMzID0ge307XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldywgZW1wdHkgdmVjM1xuICpcbiAqIEByZXR1cm5zIHt2ZWMzfSBhIG5ldyAzRCB2ZWN0b3JcbiAqL1xudmVjMy5jcmVhdGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoMyk7XG4gICAgb3V0WzBdID0gMDtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyB2ZWMzIGluaXRpYWxpemVkIHdpdGggdmFsdWVzIGZyb20gYW4gZXhpc3RpbmcgdmVjdG9yXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBhIHZlY3RvciB0byBjbG9uZVxuICogQHJldHVybnMge3ZlYzN9IGEgbmV3IDNEIHZlY3RvclxuICovXG52ZWMzLmNsb25lID0gZnVuY3Rpb24oYSkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSgzKTtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHZlYzMgaW5pdGlhbGl6ZWQgd2l0aCB0aGUgZ2l2ZW4gdmFsdWVzXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IHggWCBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB5IFkgY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geiBaIGNvbXBvbmVudFxuICogQHJldHVybnMge3ZlYzN9IGEgbmV3IDNEIHZlY3RvclxuICovXG52ZWMzLmZyb21WYWx1ZXMgPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDMpO1xuICAgIG91dFswXSA9IHg7XG4gICAgb3V0WzFdID0geTtcbiAgICBvdXRbMl0gPSB6O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSB2ZWMzIHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBzb3VyY2UgdmVjdG9yXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMuY29weSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgY29tcG9uZW50cyBvZiBhIHZlYzMgdG8gdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge051bWJlcn0geCBYIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHkgWSBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB6IFogY29tcG9uZW50XG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMuc2V0ID0gZnVuY3Rpb24ob3V0LCB4LCB5LCB6KSB7XG4gICAgb3V0WzBdID0geDtcbiAgICBvdXRbMV0gPSB5O1xuICAgIG91dFsyXSA9IHo7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWRkcyB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLmFkZCA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKyBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gKyBiWzFdO1xuICAgIG91dFsyXSA9IGFbMl0gKyBiWzJdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFN1YnRyYWN0cyB2ZWN0b3IgYiBmcm9tIHZlY3RvciBhXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLnN1YnRyYWN0ID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAtIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSAtIGJbMV07XG4gICAgb3V0WzJdID0gYVsyXSAtIGJbMl07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMzLnN1YnRyYWN0fVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzMuc3ViID0gdmVjMy5zdWJ0cmFjdDtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMubXVsdGlwbHkgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdICogYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdICogYlsxXTtcbiAgICBvdXRbMl0gPSBhWzJdICogYlsyXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzMubXVsdGlwbHl9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5tdWwgPSB2ZWMzLm11bHRpcGx5O1xuXG4vKipcbiAqIERpdmlkZXMgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5kaXZpZGUgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdIC8gYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdIC8gYlsxXTtcbiAgICBvdXRbMl0gPSBhWzJdIC8gYlsyXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzMuZGl2aWRlfVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzMuZGl2ID0gdmVjMy5kaXZpZGU7XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbWluaW11bSBvZiB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLm1pbiA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IE1hdGgubWluKGFbMF0sIGJbMF0pO1xuICAgIG91dFsxXSA9IE1hdGgubWluKGFbMV0sIGJbMV0pO1xuICAgIG91dFsyXSA9IE1hdGgubWluKGFbMl0sIGJbMl0pO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG1heGltdW0gb2YgdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5tYXggPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBNYXRoLm1heChhWzBdLCBiWzBdKTtcbiAgICBvdXRbMV0gPSBNYXRoLm1heChhWzFdLCBiWzFdKTtcbiAgICBvdXRbMl0gPSBNYXRoLm1heChhWzJdLCBiWzJdKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTY2FsZXMgYSB2ZWMzIGJ5IGEgc2NhbGFyIG51bWJlclxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIHZlY3RvciB0byBzY2FsZVxuICogQHBhcmFtIHtOdW1iZXJ9IGIgYW1vdW50IHRvIHNjYWxlIHRoZSB2ZWN0b3IgYnlcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5zY2FsZSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKiBiO1xuICAgIG91dFsxXSA9IGFbMV0gKiBiO1xuICAgIG91dFsyXSA9IGFbMl0gKiBiO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFkZHMgdHdvIHZlYzMncyBhZnRlciBzY2FsaW5nIHRoZSBzZWNvbmQgb3BlcmFuZCBieSBhIHNjYWxhciB2YWx1ZVxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEBwYXJhbSB7TnVtYmVyfSBzY2FsZSB0aGUgYW1vdW50IHRvIHNjYWxlIGIgYnkgYmVmb3JlIGFkZGluZ1xuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLnNjYWxlQW5kQWRkID0gZnVuY3Rpb24ob3V0LCBhLCBiLCBzY2FsZSkge1xuICAgIG91dFswXSA9IGFbMF0gKyAoYlswXSAqIHNjYWxlKTtcbiAgICBvdXRbMV0gPSBhWzFdICsgKGJbMV0gKiBzY2FsZSk7XG4gICAgb3V0WzJdID0gYVsyXSArIChiWzJdICogc2NhbGUpO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGV1Y2xpZGlhbiBkaXN0YW5jZSBiZXR3ZWVuIHR3byB2ZWMzJ3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRpc3RhbmNlIGJldHdlZW4gYSBhbmQgYlxuICovXG52ZWMzLmRpc3RhbmNlID0gZnVuY3Rpb24oYSwgYikge1xuICAgIHZhciB4ID0gYlswXSAtIGFbMF0sXG4gICAgICAgIHkgPSBiWzFdIC0gYVsxXSxcbiAgICAgICAgeiA9IGJbMl0gLSBhWzJdO1xuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5ICsgeip6KTtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWMzLmRpc3RhbmNlfVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzMuZGlzdCA9IHZlYzMuZGlzdGFuY2U7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgc3F1YXJlZCBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBzcXVhcmVkIGRpc3RhbmNlIGJldHdlZW4gYSBhbmQgYlxuICovXG52ZWMzLnNxdWFyZWREaXN0YW5jZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICB2YXIgeCA9IGJbMF0gLSBhWzBdLFxuICAgICAgICB5ID0gYlsxXSAtIGFbMV0sXG4gICAgICAgIHogPSBiWzJdIC0gYVsyXTtcbiAgICByZXR1cm4geCp4ICsgeSp5ICsgeip6O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzMuc3F1YXJlZERpc3RhbmNlfVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzMuc3FyRGlzdCA9IHZlYzMuc3F1YXJlZERpc3RhbmNlO1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGxlbmd0aCBvZiBhIHZlYzNcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGxlbmd0aCBvZiBhXG4gKi9cbnZlYzMubGVuZ3RoID0gZnVuY3Rpb24gKGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdLFxuICAgICAgICB6ID0gYVsyXTtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KHgqeCArIHkqeSArIHoqeik7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMy5sZW5ndGh9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjMy5sZW4gPSB2ZWMzLmxlbmd0aDtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBzcXVhcmVkIGxlbmd0aCBvZiBhIHZlYzNcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBzcXVhcmVkIGxlbmd0aCBvZlxuICogQHJldHVybnMge051bWJlcn0gc3F1YXJlZCBsZW5ndGggb2YgYVxuICovXG52ZWMzLnNxdWFyZWRMZW5ndGggPSBmdW5jdGlvbiAoYSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV0sXG4gICAgICAgIHogPSBhWzJdO1xuICAgIHJldHVybiB4KnggKyB5KnkgKyB6Kno7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjMy5zcXVhcmVkTGVuZ3RofVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzMuc3FyTGVuID0gdmVjMy5zcXVhcmVkTGVuZ3RoO1xuXG4vKipcbiAqIE5lZ2F0ZXMgdGhlIGNvbXBvbmVudHMgb2YgYSB2ZWMzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB2ZWN0b3IgdG8gbmVnYXRlXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMubmVnYXRlID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gLWFbMF07XG4gICAgb3V0WzFdID0gLWFbMV07XG4gICAgb3V0WzJdID0gLWFbMl07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogTm9ybWFsaXplIGEgdmVjM1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdmVjdG9yIHRvIG5vcm1hbGl6ZVxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLm5vcm1hbGl6ZSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV0sXG4gICAgICAgIHogPSBhWzJdO1xuICAgIHZhciBsZW4gPSB4KnggKyB5KnkgKyB6Kno7XG4gICAgaWYgKGxlbiA+IDApIHtcbiAgICAgICAgLy9UT0RPOiBldmFsdWF0ZSB1c2Ugb2YgZ2xtX2ludnNxcnQgaGVyZT9cbiAgICAgICAgbGVuID0gMSAvIE1hdGguc3FydChsZW4pO1xuICAgICAgICBvdXRbMF0gPSBhWzBdICogbGVuO1xuICAgICAgICBvdXRbMV0gPSBhWzFdICogbGVuO1xuICAgICAgICBvdXRbMl0gPSBhWzJdICogbGVuO1xuICAgIH1cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkb3QgcHJvZHVjdCBvZiB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzN9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkb3QgcHJvZHVjdCBvZiBhIGFuZCBiXG4gKi9cbnZlYzMuZG90ID0gZnVuY3Rpb24gKGEsIGIpIHtcbiAgICByZXR1cm4gYVswXSAqIGJbMF0gKyBhWzFdICogYlsxXSArIGFbMl0gKiBiWzJdO1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgY3Jvc3MgcHJvZHVjdCBvZiB0d28gdmVjMydzXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLmNyb3NzID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgdmFyIGF4ID0gYVswXSwgYXkgPSBhWzFdLCBheiA9IGFbMl0sXG4gICAgICAgIGJ4ID0gYlswXSwgYnkgPSBiWzFdLCBieiA9IGJbMl07XG5cbiAgICBvdXRbMF0gPSBheSAqIGJ6IC0gYXogKiBieTtcbiAgICBvdXRbMV0gPSBheiAqIGJ4IC0gYXggKiBiejtcbiAgICBvdXRbMl0gPSBheCAqIGJ5IC0gYXkgKiBieDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBQZXJmb3JtcyBhIGxpbmVhciBpbnRlcnBvbGF0aW9uIGJldHdlZW4gdHdvIHZlYzMnc1xuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjM30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEBwYXJhbSB7TnVtYmVyfSB0IGludGVycG9sYXRpb24gYW1vdW50IGJldHdlZW4gdGhlIHR3byBpbnB1dHNcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy5sZXJwID0gZnVuY3Rpb24gKG91dCwgYSwgYiwgdCkge1xuICAgIHZhciBheCA9IGFbMF0sXG4gICAgICAgIGF5ID0gYVsxXSxcbiAgICAgICAgYXogPSBhWzJdO1xuICAgIG91dFswXSA9IGF4ICsgdCAqIChiWzBdIC0gYXgpO1xuICAgIG91dFsxXSA9IGF5ICsgdCAqIChiWzFdIC0gYXkpO1xuICAgIG91dFsyXSA9IGF6ICsgdCAqIChiWzJdIC0gYXopO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHJhbmRvbSB2ZWN0b3Igd2l0aCB0aGUgZ2l2ZW4gc2NhbGVcbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHtOdW1iZXJ9IFtzY2FsZV0gTGVuZ3RoIG9mIHRoZSByZXN1bHRpbmcgdmVjdG9yLiBJZiBvbW1pdHRlZCwgYSB1bml0IHZlY3RvciB3aWxsIGJlIHJldHVybmVkXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMucmFuZG9tID0gZnVuY3Rpb24gKG91dCwgc2NhbGUpIHtcbiAgICBzY2FsZSA9IHNjYWxlIHx8IDEuMDtcblxuICAgIHZhciByID0gR0xNQVRfUkFORE9NKCkgKiAyLjAgKiBNYXRoLlBJO1xuICAgIHZhciB6ID0gKEdMTUFUX1JBTkRPTSgpICogMi4wKSAtIDEuMDtcbiAgICB2YXIgelNjYWxlID0gTWF0aC5zcXJ0KDEuMC16KnopICogc2NhbGU7XG5cbiAgICBvdXRbMF0gPSBNYXRoLmNvcyhyKSAqIHpTY2FsZTtcbiAgICBvdXRbMV0gPSBNYXRoLnNpbihyKSAqIHpTY2FsZTtcbiAgICBvdXRbMl0gPSB6ICogc2NhbGU7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogVHJhbnNmb3JtcyB0aGUgdmVjMyB3aXRoIGEgbWF0NC5cbiAqIDR0aCB2ZWN0b3IgY29tcG9uZW50IGlzIGltcGxpY2l0bHkgJzEnXG4gKlxuICogQHBhcmFtIHt2ZWMzfSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjM30gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHttYXQ0fSBtIG1hdHJpeCB0byB0cmFuc2Zvcm0gd2l0aFxuICogQHJldHVybnMge3ZlYzN9IG91dFxuICovXG52ZWMzLnRyYW5zZm9ybU1hdDQgPSBmdW5jdGlvbihvdXQsIGEsIG0pIHtcbiAgICB2YXIgeCA9IGFbMF0sIHkgPSBhWzFdLCB6ID0gYVsyXTtcbiAgICBvdXRbMF0gPSBtWzBdICogeCArIG1bNF0gKiB5ICsgbVs4XSAqIHogKyBtWzEyXTtcbiAgICBvdXRbMV0gPSBtWzFdICogeCArIG1bNV0gKiB5ICsgbVs5XSAqIHogKyBtWzEzXTtcbiAgICBvdXRbMl0gPSBtWzJdICogeCArIG1bNl0gKiB5ICsgbVsxMF0gKiB6ICsgbVsxNF07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogVHJhbnNmb3JtcyB0aGUgdmVjMyB3aXRoIGEgbWF0My5cbiAqXG4gKiBAcGFyYW0ge3ZlYzN9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge21hdDR9IG0gdGhlIDN4MyBtYXRyaXggdG8gdHJhbnNmb3JtIHdpdGhcbiAqIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiAqL1xudmVjMy50cmFuc2Zvcm1NYXQzID0gZnVuY3Rpb24ob3V0LCBhLCBtKSB7XG4gICAgdmFyIHggPSBhWzBdLCB5ID0gYVsxXSwgeiA9IGFbMl07XG4gICAgb3V0WzBdID0geCAqIG1bMF0gKyB5ICogbVszXSArIHogKiBtWzZdO1xuICAgIG91dFsxXSA9IHggKiBtWzFdICsgeSAqIG1bNF0gKyB6ICogbVs3XTtcbiAgICBvdXRbMl0gPSB4ICogbVsyXSArIHkgKiBtWzVdICsgeiAqIG1bOF07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogVHJhbnNmb3JtcyB0aGUgdmVjMyB3aXRoIGEgcXVhdFxuICpcbiAqIEBwYXJhbSB7dmVjM30gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzN9IGEgdGhlIHZlY3RvciB0byB0cmFuc2Zvcm1cbiAqIEBwYXJhbSB7cXVhdH0gcSBxdWF0ZXJuaW9uIHRvIHRyYW5zZm9ybSB3aXRoXG4gKiBAcmV0dXJucyB7dmVjM30gb3V0XG4gKi9cbnZlYzMudHJhbnNmb3JtUXVhdCA9IGZ1bmN0aW9uKG91dCwgYSwgcSkge1xuICAgIC8vIGJlbmNobWFya3M6IGh0dHA6Ly9qc3BlcmYuY29tL3F1YXRlcm5pb24tdHJhbnNmb3JtLXZlYzMtaW1wbGVtZW50YXRpb25zXG5cbiAgICB2YXIgeCA9IGFbMF0sIHkgPSBhWzFdLCB6ID0gYVsyXSxcbiAgICAgICAgcXggPSBxWzBdLCBxeSA9IHFbMV0sIHF6ID0gcVsyXSwgcXcgPSBxWzNdLFxuXG4gICAgICAgIC8vIGNhbGN1bGF0ZSBxdWF0ICogdmVjXG4gICAgICAgIGl4ID0gcXcgKiB4ICsgcXkgKiB6IC0gcXogKiB5LFxuICAgICAgICBpeSA9IHF3ICogeSArIHF6ICogeCAtIHF4ICogeixcbiAgICAgICAgaXogPSBxdyAqIHogKyBxeCAqIHkgLSBxeSAqIHgsXG4gICAgICAgIGl3ID0gLXF4ICogeCAtIHF5ICogeSAtIHF6ICogejtcblxuICAgIC8vIGNhbGN1bGF0ZSByZXN1bHQgKiBpbnZlcnNlIHF1YXRcbiAgICBvdXRbMF0gPSBpeCAqIHF3ICsgaXcgKiAtcXggKyBpeSAqIC1xeiAtIGl6ICogLXF5O1xuICAgIG91dFsxXSA9IGl5ICogcXcgKyBpdyAqIC1xeSArIGl6ICogLXF4IC0gaXggKiAtcXo7XG4gICAgb3V0WzJdID0gaXogKiBxdyArIGl3ICogLXF6ICsgaXggKiAtcXkgLSBpeSAqIC1xeDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLypcbiogUm90YXRlIGEgM0QgdmVjdG9yIGFyb3VuZCB0aGUgeC1heGlzXG4qIEBwYXJhbSB7dmVjM30gb3V0IFRoZSByZWNlaXZpbmcgdmVjM1xuKiBAcGFyYW0ge3ZlYzN9IGEgVGhlIHZlYzMgcG9pbnQgdG8gcm90YXRlXG4qIEBwYXJhbSB7dmVjM30gYiBUaGUgb3JpZ2luIG9mIHRoZSByb3RhdGlvblxuKiBAcGFyYW0ge051bWJlcn0gYyBUaGUgYW5nbGUgb2Ygcm90YXRpb25cbiogQHJldHVybnMge3ZlYzN9IG91dFxuKi9cbnZlYzMucm90YXRlWCA9IGZ1bmN0aW9uKG91dCwgYSwgYiwgYyl7XG4gICB2YXIgcCA9IFtdLCByPVtdO1xuXHQgIC8vVHJhbnNsYXRlIHBvaW50IHRvIHRoZSBvcmlnaW5cblx0ICBwWzBdID0gYVswXSAtIGJbMF07XG5cdCAgcFsxXSA9IGFbMV0gLSBiWzFdO1xuICBcdHBbMl0gPSBhWzJdIC0gYlsyXTtcblxuXHQgIC8vcGVyZm9ybSByb3RhdGlvblxuXHQgIHJbMF0gPSBwWzBdO1xuXHQgIHJbMV0gPSBwWzFdKk1hdGguY29zKGMpIC0gcFsyXSpNYXRoLnNpbihjKTtcblx0ICByWzJdID0gcFsxXSpNYXRoLnNpbihjKSArIHBbMl0qTWF0aC5jb3MoYyk7XG5cblx0ICAvL3RyYW5zbGF0ZSB0byBjb3JyZWN0IHBvc2l0aW9uXG5cdCAgb3V0WzBdID0gclswXSArIGJbMF07XG5cdCAgb3V0WzFdID0gclsxXSArIGJbMV07XG5cdCAgb3V0WzJdID0gclsyXSArIGJbMl07XG5cbiAgXHRyZXR1cm4gb3V0O1xufTtcblxuLypcbiogUm90YXRlIGEgM0QgdmVjdG9yIGFyb3VuZCB0aGUgeS1heGlzXG4qIEBwYXJhbSB7dmVjM30gb3V0IFRoZSByZWNlaXZpbmcgdmVjM1xuKiBAcGFyYW0ge3ZlYzN9IGEgVGhlIHZlYzMgcG9pbnQgdG8gcm90YXRlXG4qIEBwYXJhbSB7dmVjM30gYiBUaGUgb3JpZ2luIG9mIHRoZSByb3RhdGlvblxuKiBAcGFyYW0ge051bWJlcn0gYyBUaGUgYW5nbGUgb2Ygcm90YXRpb25cbiogQHJldHVybnMge3ZlYzN9IG91dFxuKi9cbnZlYzMucm90YXRlWSA9IGZ1bmN0aW9uKG91dCwgYSwgYiwgYyl7XG4gIFx0dmFyIHAgPSBbXSwgcj1bXTtcbiAgXHQvL1RyYW5zbGF0ZSBwb2ludCB0byB0aGUgb3JpZ2luXG4gIFx0cFswXSA9IGFbMF0gLSBiWzBdO1xuICBcdHBbMV0gPSBhWzFdIC0gYlsxXTtcbiAgXHRwWzJdID0gYVsyXSAtIGJbMl07XG4gIFxuICBcdC8vcGVyZm9ybSByb3RhdGlvblxuICBcdHJbMF0gPSBwWzJdKk1hdGguc2luKGMpICsgcFswXSpNYXRoLmNvcyhjKTtcbiAgXHRyWzFdID0gcFsxXTtcbiAgXHRyWzJdID0gcFsyXSpNYXRoLmNvcyhjKSAtIHBbMF0qTWF0aC5zaW4oYyk7XG4gIFxuICBcdC8vdHJhbnNsYXRlIHRvIGNvcnJlY3QgcG9zaXRpb25cbiAgXHRvdXRbMF0gPSByWzBdICsgYlswXTtcbiAgXHRvdXRbMV0gPSByWzFdICsgYlsxXTtcbiAgXHRvdXRbMl0gPSByWzJdICsgYlsyXTtcbiAgXG4gIFx0cmV0dXJuIG91dDtcbn07XG5cbi8qXG4qIFJvdGF0ZSBhIDNEIHZlY3RvciBhcm91bmQgdGhlIHotYXhpc1xuKiBAcGFyYW0ge3ZlYzN9IG91dCBUaGUgcmVjZWl2aW5nIHZlYzNcbiogQHBhcmFtIHt2ZWMzfSBhIFRoZSB2ZWMzIHBvaW50IHRvIHJvdGF0ZVxuKiBAcGFyYW0ge3ZlYzN9IGIgVGhlIG9yaWdpbiBvZiB0aGUgcm90YXRpb25cbiogQHBhcmFtIHtOdW1iZXJ9IGMgVGhlIGFuZ2xlIG9mIHJvdGF0aW9uXG4qIEByZXR1cm5zIHt2ZWMzfSBvdXRcbiovXG52ZWMzLnJvdGF0ZVogPSBmdW5jdGlvbihvdXQsIGEsIGIsIGMpe1xuICBcdHZhciBwID0gW10sIHI9W107XG4gIFx0Ly9UcmFuc2xhdGUgcG9pbnQgdG8gdGhlIG9yaWdpblxuICBcdHBbMF0gPSBhWzBdIC0gYlswXTtcbiAgXHRwWzFdID0gYVsxXSAtIGJbMV07XG4gIFx0cFsyXSA9IGFbMl0gLSBiWzJdO1xuICBcbiAgXHQvL3BlcmZvcm0gcm90YXRpb25cbiAgXHRyWzBdID0gcFswXSpNYXRoLmNvcyhjKSAtIHBbMV0qTWF0aC5zaW4oYyk7XG4gIFx0clsxXSA9IHBbMF0qTWF0aC5zaW4oYykgKyBwWzFdKk1hdGguY29zKGMpO1xuICBcdHJbMl0gPSBwWzJdO1xuICBcbiAgXHQvL3RyYW5zbGF0ZSB0byBjb3JyZWN0IHBvc2l0aW9uXG4gIFx0b3V0WzBdID0gclswXSArIGJbMF07XG4gIFx0b3V0WzFdID0gclsxXSArIGJbMV07XG4gIFx0b3V0WzJdID0gclsyXSArIGJbMl07XG4gIFxuICBcdHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFBlcmZvcm0gc29tZSBvcGVyYXRpb24gb3ZlciBhbiBhcnJheSBvZiB2ZWMzcy5cbiAqXG4gKiBAcGFyYW0ge0FycmF5fSBhIHRoZSBhcnJheSBvZiB2ZWN0b3JzIHRvIGl0ZXJhdGUgb3ZlclxuICogQHBhcmFtIHtOdW1iZXJ9IHN0cmlkZSBOdW1iZXIgb2YgZWxlbWVudHMgYmV0d2VlbiB0aGUgc3RhcnQgb2YgZWFjaCB2ZWMzLiBJZiAwIGFzc3VtZXMgdGlnaHRseSBwYWNrZWRcbiAqIEBwYXJhbSB7TnVtYmVyfSBvZmZzZXQgTnVtYmVyIG9mIGVsZW1lbnRzIHRvIHNraXAgYXQgdGhlIGJlZ2lubmluZyBvZiB0aGUgYXJyYXlcbiAqIEBwYXJhbSB7TnVtYmVyfSBjb3VudCBOdW1iZXIgb2YgdmVjM3MgdG8gaXRlcmF0ZSBvdmVyLiBJZiAwIGl0ZXJhdGVzIG92ZXIgZW50aXJlIGFycmF5XG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBmbiBGdW5jdGlvbiB0byBjYWxsIGZvciBlYWNoIHZlY3RvciBpbiB0aGUgYXJyYXlcbiAqIEBwYXJhbSB7T2JqZWN0fSBbYXJnXSBhZGRpdGlvbmFsIGFyZ3VtZW50IHRvIHBhc3MgdG8gZm5cbiAqIEByZXR1cm5zIHtBcnJheX0gYVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzMuZm9yRWFjaCA9IChmdW5jdGlvbigpIHtcbiAgICB2YXIgdmVjID0gdmVjMy5jcmVhdGUoKTtcblxuICAgIHJldHVybiBmdW5jdGlvbihhLCBzdHJpZGUsIG9mZnNldCwgY291bnQsIGZuLCBhcmcpIHtcbiAgICAgICAgdmFyIGksIGw7XG4gICAgICAgIGlmKCFzdHJpZGUpIHtcbiAgICAgICAgICAgIHN0cmlkZSA9IDM7XG4gICAgICAgIH1cblxuICAgICAgICBpZighb2Zmc2V0KSB7XG4gICAgICAgICAgICBvZmZzZXQgPSAwO1xuICAgICAgICB9XG4gICAgICAgIFxuICAgICAgICBpZihjb3VudCkge1xuICAgICAgICAgICAgbCA9IE1hdGgubWluKChjb3VudCAqIHN0cmlkZSkgKyBvZmZzZXQsIGEubGVuZ3RoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGwgPSBhLmxlbmd0aDtcbiAgICAgICAgfVxuXG4gICAgICAgIGZvcihpID0gb2Zmc2V0OyBpIDwgbDsgaSArPSBzdHJpZGUpIHtcbiAgICAgICAgICAgIHZlY1swXSA9IGFbaV07IHZlY1sxXSA9IGFbaSsxXTsgdmVjWzJdID0gYVtpKzJdO1xuICAgICAgICAgICAgZm4odmVjLCB2ZWMsIGFyZyk7XG4gICAgICAgICAgICBhW2ldID0gdmVjWzBdOyBhW2krMV0gPSB2ZWNbMV07IGFbaSsyXSA9IHZlY1syXTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgfTtcbn0pKCk7XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7dmVjM30gdmVjIHZlY3RvciB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgdmVjdG9yXG4gKi9cbnZlYzMuc3RyID0gZnVuY3Rpb24gKGEpIHtcbiAgICByZXR1cm4gJ3ZlYzMoJyArIGFbMF0gKyAnLCAnICsgYVsxXSArICcsICcgKyBhWzJdICsgJyknO1xufTtcblxuaWYodHlwZW9mKGV4cG9ydHMpICE9PSAndW5kZWZpbmVkJykge1xuICAgIGV4cG9ydHMudmVjMyA9IHZlYzM7XG59XG47XG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMsIEJyYW5kb24gSm9uZXMsIENvbGluIE1hY0tlbnppZSBJVi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cblxuUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0IG1vZGlmaWNhdGlvbixcbmFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblxuICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpc1xuICAgIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSxcbiAgICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIFxuICAgIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuXG5USElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbkFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG5XQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIFxuRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBIT0xERVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1JcbkFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OXG5BTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcblNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLiAqL1xuXG4vKipcbiAqIEBjbGFzcyA0IERpbWVuc2lvbmFsIFZlY3RvclxuICogQG5hbWUgdmVjNFxuICovXG5cbnZhciB2ZWM0ID0ge307XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldywgZW1wdHkgdmVjNFxuICpcbiAqIEByZXR1cm5zIHt2ZWM0fSBhIG5ldyA0RCB2ZWN0b3JcbiAqL1xudmVjNC5jcmVhdGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNCk7XG4gICAgb3V0WzBdID0gMDtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHZlYzQgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyB2ZWN0b3JcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdmVjdG9yIHRvIGNsb25lXG4gKiBAcmV0dXJucyB7dmVjNH0gYSBuZXcgNEQgdmVjdG9yXG4gKi9cbnZlYzQuY2xvbmUgPSBmdW5jdGlvbihhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDQpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyB2ZWM0IGluaXRpYWxpemVkIHdpdGggdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHogWiBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB3IFcgY29tcG9uZW50XG4gKiBAcmV0dXJucyB7dmVjNH0gYSBuZXcgNEQgdmVjdG9yXG4gKi9cbnZlYzQuZnJvbVZhbHVlcyA9IGZ1bmN0aW9uKHgsIHksIHosIHcpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNCk7XG4gICAgb3V0WzBdID0geDtcbiAgICBvdXRbMV0gPSB5O1xuICAgIG91dFsyXSA9IHo7XG4gICAgb3V0WzNdID0gdztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3B5IHRoZSB2YWx1ZXMgZnJvbSBvbmUgdmVjNCB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgc291cmNlIHZlY3RvclxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LmNvcHkgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICBvdXRbM10gPSBhWzNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNldCB0aGUgY29tcG9uZW50cyBvZiBhIHZlYzQgdG8gdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7dmVjNH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge051bWJlcn0geCBYIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHkgWSBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB6IFogY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0gdyBXIGNvbXBvbmVudFxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LnNldCA9IGZ1bmN0aW9uKG91dCwgeCwgeSwgeiwgdykge1xuICAgIG91dFswXSA9IHg7XG4gICAgb3V0WzFdID0geTtcbiAgICBvdXRbMl0gPSB6O1xuICAgIG91dFszXSA9IHc7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWRkcyB0d28gdmVjNCdzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWM0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LmFkZCA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKyBiWzBdO1xuICAgIG91dFsxXSA9IGFbMV0gKyBiWzFdO1xuICAgIG91dFsyXSA9IGFbMl0gKyBiWzJdO1xuICAgIG91dFszXSA9IGFbM10gKyBiWzNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFN1YnRyYWN0cyB2ZWN0b3IgYiBmcm9tIHZlY3RvciBhXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWM0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LnN1YnRyYWN0ID0gZnVuY3Rpb24ob3V0LCBhLCBiKSB7XG4gICAgb3V0WzBdID0gYVswXSAtIGJbMF07XG4gICAgb3V0WzFdID0gYVsxXSAtIGJbMV07XG4gICAgb3V0WzJdID0gYVsyXSAtIGJbMl07XG4gICAgb3V0WzNdID0gYVszXSAtIGJbM107XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWM0LnN1YnRyYWN0fVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzQuc3ViID0gdmVjNC5zdWJ0cmFjdDtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byB2ZWM0J3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQubXVsdGlwbHkgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdICogYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdICogYlsxXTtcbiAgICBvdXRbMl0gPSBhWzJdICogYlsyXTtcbiAgICBvdXRbM10gPSBhWzNdICogYlszXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzQubXVsdGlwbHl9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjNC5tdWwgPSB2ZWM0Lm11bHRpcGx5O1xuXG4vKipcbiAqIERpdmlkZXMgdHdvIHZlYzQnc1xuICpcbiAqIEBwYXJhbSB7dmVjNH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjNH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWM0fSBvdXRcbiAqL1xudmVjNC5kaXZpZGUgPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBhWzBdIC8gYlswXTtcbiAgICBvdXRbMV0gPSBhWzFdIC8gYlsxXTtcbiAgICBvdXRbMl0gPSBhWzJdIC8gYlsyXTtcbiAgICBvdXRbM10gPSBhWzNdIC8gYlszXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzQuZGl2aWRlfVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzQuZGl2ID0gdmVjNC5kaXZpZGU7XG5cbi8qKlxuICogUmV0dXJucyB0aGUgbWluaW11bSBvZiB0d28gdmVjNCdzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHt2ZWM0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0Lm1pbiA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IE1hdGgubWluKGFbMF0sIGJbMF0pO1xuICAgIG91dFsxXSA9IE1hdGgubWluKGFbMV0sIGJbMV0pO1xuICAgIG91dFsyXSA9IE1hdGgubWluKGFbMl0sIGJbMl0pO1xuICAgIG91dFszXSA9IE1hdGgubWluKGFbM10sIGJbM10pO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJldHVybnMgdGhlIG1heGltdW0gb2YgdHdvIHZlYzQnc1xuICpcbiAqIEBwYXJhbSB7dmVjNH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjNH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHt2ZWM0fSBvdXRcbiAqL1xudmVjNC5tYXggPSBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICBvdXRbMF0gPSBNYXRoLm1heChhWzBdLCBiWzBdKTtcbiAgICBvdXRbMV0gPSBNYXRoLm1heChhWzFdLCBiWzFdKTtcbiAgICBvdXRbMl0gPSBNYXRoLm1heChhWzJdLCBiWzJdKTtcbiAgICBvdXRbM10gPSBNYXRoLm1heChhWzNdLCBiWzNdKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTY2FsZXMgYSB2ZWM0IGJ5IGEgc2NhbGFyIG51bWJlclxuICpcbiAqIEBwYXJhbSB7dmVjNH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdGhlIHZlY3RvciB0byBzY2FsZVxuICogQHBhcmFtIHtOdW1iZXJ9IGIgYW1vdW50IHRvIHNjYWxlIHRoZSB2ZWN0b3IgYnlcbiAqIEByZXR1cm5zIHt2ZWM0fSBvdXRcbiAqL1xudmVjNC5zY2FsZSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIG91dFswXSA9IGFbMF0gKiBiO1xuICAgIG91dFsxXSA9IGFbMV0gKiBiO1xuICAgIG91dFsyXSA9IGFbMl0gKiBiO1xuICAgIG91dFszXSA9IGFbM10gKiBiO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFkZHMgdHdvIHZlYzQncyBhZnRlciBzY2FsaW5nIHRoZSBzZWNvbmQgb3BlcmFuZCBieSBhIHNjYWxhciB2YWx1ZVxuICpcbiAqIEBwYXJhbSB7dmVjNH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjNH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEBwYXJhbSB7TnVtYmVyfSBzY2FsZSB0aGUgYW1vdW50IHRvIHNjYWxlIGIgYnkgYmVmb3JlIGFkZGluZ1xuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0LnNjYWxlQW5kQWRkID0gZnVuY3Rpb24ob3V0LCBhLCBiLCBzY2FsZSkge1xuICAgIG91dFswXSA9IGFbMF0gKyAoYlswXSAqIHNjYWxlKTtcbiAgICBvdXRbMV0gPSBhWzFdICsgKGJbMV0gKiBzY2FsZSk7XG4gICAgb3V0WzJdID0gYVsyXSArIChiWzJdICogc2NhbGUpO1xuICAgIG91dFszXSA9IGFbM10gKyAoYlszXSAqIHNjYWxlKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjNCdzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkaXN0YW5jZSBiZXR3ZWVuIGEgYW5kIGJcbiAqL1xudmVjNC5kaXN0YW5jZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICB2YXIgeCA9IGJbMF0gLSBhWzBdLFxuICAgICAgICB5ID0gYlsxXSAtIGFbMV0sXG4gICAgICAgIHogPSBiWzJdIC0gYVsyXSxcbiAgICAgICAgdyA9IGJbM10gLSBhWzNdO1xuICAgIHJldHVybiBNYXRoLnNxcnQoeCp4ICsgeSp5ICsgeip6ICsgdyp3KTtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayB2ZWM0LmRpc3RhbmNlfVxuICogQGZ1bmN0aW9uXG4gKi9cbnZlYzQuZGlzdCA9IHZlYzQuZGlzdGFuY2U7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgc3F1YXJlZCBldWNsaWRpYW4gZGlzdGFuY2UgYmV0d2VlbiB0d28gdmVjNCdzXG4gKlxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBzcXVhcmVkIGRpc3RhbmNlIGJldHdlZW4gYSBhbmQgYlxuICovXG52ZWM0LnNxdWFyZWREaXN0YW5jZSA9IGZ1bmN0aW9uKGEsIGIpIHtcbiAgICB2YXIgeCA9IGJbMF0gLSBhWzBdLFxuICAgICAgICB5ID0gYlsxXSAtIGFbMV0sXG4gICAgICAgIHogPSBiWzJdIC0gYVsyXSxcbiAgICAgICAgdyA9IGJbM10gLSBhWzNdO1xuICAgIHJldHVybiB4KnggKyB5KnkgKyB6KnogKyB3Knc7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjNC5zcXVhcmVkRGlzdGFuY2V9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjNC5zcXJEaXN0ID0gdmVjNC5zcXVhcmVkRGlzdGFuY2U7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgbGVuZ3RoIG9mIGEgdmVjNFxuICpcbiAqIEBwYXJhbSB7dmVjNH0gYSB2ZWN0b3IgdG8gY2FsY3VsYXRlIGxlbmd0aCBvZlxuICogQHJldHVybnMge051bWJlcn0gbGVuZ3RoIG9mIGFcbiAqL1xudmVjNC5sZW5ndGggPSBmdW5jdGlvbiAoYSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV0sXG4gICAgICAgIHogPSBhWzJdLFxuICAgICAgICB3ID0gYVszXTtcbiAgICByZXR1cm4gTWF0aC5zcXJ0KHgqeCArIHkqeSArIHoqeiArIHcqdyk7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgdmVjNC5sZW5ndGh9XG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjNC5sZW4gPSB2ZWM0Lmxlbmd0aDtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBzcXVhcmVkIGxlbmd0aCBvZiBhIHZlYzRcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBzcXVhcmVkIGxlbmd0aCBvZlxuICogQHJldHVybnMge051bWJlcn0gc3F1YXJlZCBsZW5ndGggb2YgYVxuICovXG52ZWM0LnNxdWFyZWRMZW5ndGggPSBmdW5jdGlvbiAoYSkge1xuICAgIHZhciB4ID0gYVswXSxcbiAgICAgICAgeSA9IGFbMV0sXG4gICAgICAgIHogPSBhWzJdLFxuICAgICAgICB3ID0gYVszXTtcbiAgICByZXR1cm4geCp4ICsgeSp5ICsgeip6ICsgdyp3O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHZlYzQuc3F1YXJlZExlbmd0aH1cbiAqIEBmdW5jdGlvblxuICovXG52ZWM0LnNxckxlbiA9IHZlYzQuc3F1YXJlZExlbmd0aDtcblxuLyoqXG4gKiBOZWdhdGVzIHRoZSBjb21wb25lbnRzIG9mIGEgdmVjNFxuICpcbiAqIEBwYXJhbSB7dmVjNH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdmVjdG9yIHRvIG5lZ2F0ZVxuICogQHJldHVybnMge3ZlYzR9IG91dFxuICovXG52ZWM0Lm5lZ2F0ZSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IC1hWzBdO1xuICAgIG91dFsxXSA9IC1hWzFdO1xuICAgIG91dFsyXSA9IC1hWzJdO1xuICAgIG91dFszXSA9IC1hWzNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIE5vcm1hbGl6ZSBhIHZlYzRcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHZlY3RvciB0byBub3JtYWxpemVcbiAqIEByZXR1cm5zIHt2ZWM0fSBvdXRcbiAqL1xudmVjNC5ub3JtYWxpemUgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sXG4gICAgICAgIHkgPSBhWzFdLFxuICAgICAgICB6ID0gYVsyXSxcbiAgICAgICAgdyA9IGFbM107XG4gICAgdmFyIGxlbiA9IHgqeCArIHkqeSArIHoqeiArIHcqdztcbiAgICBpZiAobGVuID4gMCkge1xuICAgICAgICBsZW4gPSAxIC8gTWF0aC5zcXJ0KGxlbik7XG4gICAgICAgIG91dFswXSA9IGFbMF0gKiBsZW47XG4gICAgICAgIG91dFsxXSA9IGFbMV0gKiBsZW47XG4gICAgICAgIG91dFsyXSA9IGFbMl0gKiBsZW47XG4gICAgICAgIG91dFszXSA9IGFbM10gKiBsZW47XG4gICAgfVxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGRvdCBwcm9kdWN0IG9mIHR3byB2ZWM0J3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7dmVjNH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRvdCBwcm9kdWN0IG9mIGEgYW5kIGJcbiAqL1xudmVjNC5kb3QgPSBmdW5jdGlvbiAoYSwgYikge1xuICAgIHJldHVybiBhWzBdICogYlswXSArIGFbMV0gKiBiWzFdICsgYVsyXSAqIGJbMl0gKyBhWzNdICogYlszXTtcbn07XG5cbi8qKlxuICogUGVyZm9ybXMgYSBsaW5lYXIgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byB2ZWM0J3NcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge3ZlYzR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcGFyYW0ge051bWJlcn0gdCBpbnRlcnBvbGF0aW9uIGFtb3VudCBiZXR3ZWVuIHRoZSB0d28gaW5wdXRzXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQubGVycCA9IGZ1bmN0aW9uIChvdXQsIGEsIGIsIHQpIHtcbiAgICB2YXIgYXggPSBhWzBdLFxuICAgICAgICBheSA9IGFbMV0sXG4gICAgICAgIGF6ID0gYVsyXSxcbiAgICAgICAgYXcgPSBhWzNdO1xuICAgIG91dFswXSA9IGF4ICsgdCAqIChiWzBdIC0gYXgpO1xuICAgIG91dFsxXSA9IGF5ICsgdCAqIChiWzFdIC0gYXkpO1xuICAgIG91dFsyXSA9IGF6ICsgdCAqIChiWzJdIC0gYXopO1xuICAgIG91dFszXSA9IGF3ICsgdCAqIChiWzNdIC0gYXcpO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHJhbmRvbSB2ZWN0b3Igd2l0aCB0aGUgZ2l2ZW4gc2NhbGVcbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHtOdW1iZXJ9IFtzY2FsZV0gTGVuZ3RoIG9mIHRoZSByZXN1bHRpbmcgdmVjdG9yLiBJZiBvbW1pdHRlZCwgYSB1bml0IHZlY3RvciB3aWxsIGJlIHJldHVybmVkXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQucmFuZG9tID0gZnVuY3Rpb24gKG91dCwgc2NhbGUpIHtcbiAgICBzY2FsZSA9IHNjYWxlIHx8IDEuMDtcblxuICAgIC8vVE9ETzogVGhpcyBpcyBhIHByZXR0eSBhd2Z1bCB3YXkgb2YgZG9pbmcgdGhpcy4gRmluZCBzb21ldGhpbmcgYmV0dGVyLlxuICAgIG91dFswXSA9IEdMTUFUX1JBTkRPTSgpO1xuICAgIG91dFsxXSA9IEdMTUFUX1JBTkRPTSgpO1xuICAgIG91dFsyXSA9IEdMTUFUX1JBTkRPTSgpO1xuICAgIG91dFszXSA9IEdMTUFUX1JBTkRPTSgpO1xuICAgIHZlYzQubm9ybWFsaXplKG91dCwgb3V0KTtcbiAgICB2ZWM0LnNjYWxlKG91dCwgb3V0LCBzY2FsZSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogVHJhbnNmb3JtcyB0aGUgdmVjNCB3aXRoIGEgbWF0NC5cbiAqXG4gKiBAcGFyYW0ge3ZlYzR9IG91dCB0aGUgcmVjZWl2aW5nIHZlY3RvclxuICogQHBhcmFtIHt2ZWM0fSBhIHRoZSB2ZWN0b3IgdG8gdHJhbnNmb3JtXG4gKiBAcGFyYW0ge21hdDR9IG0gbWF0cml4IHRvIHRyYW5zZm9ybSB3aXRoXG4gKiBAcmV0dXJucyB7dmVjNH0gb3V0XG4gKi9cbnZlYzQudHJhbnNmb3JtTWF0NCA9IGZ1bmN0aW9uKG91dCwgYSwgbSkge1xuICAgIHZhciB4ID0gYVswXSwgeSA9IGFbMV0sIHogPSBhWzJdLCB3ID0gYVszXTtcbiAgICBvdXRbMF0gPSBtWzBdICogeCArIG1bNF0gKiB5ICsgbVs4XSAqIHogKyBtWzEyXSAqIHc7XG4gICAgb3V0WzFdID0gbVsxXSAqIHggKyBtWzVdICogeSArIG1bOV0gKiB6ICsgbVsxM10gKiB3O1xuICAgIG91dFsyXSA9IG1bMl0gKiB4ICsgbVs2XSAqIHkgKyBtWzEwXSAqIHogKyBtWzE0XSAqIHc7XG4gICAgb3V0WzNdID0gbVszXSAqIHggKyBtWzddICogeSArIG1bMTFdICogeiArIG1bMTVdICogdztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2Zvcm1zIHRoZSB2ZWM0IHdpdGggYSBxdWF0XG4gKlxuICogQHBhcmFtIHt2ZWM0fSBvdXQgdGhlIHJlY2VpdmluZyB2ZWN0b3JcbiAqIEBwYXJhbSB7dmVjNH0gYSB0aGUgdmVjdG9yIHRvIHRyYW5zZm9ybVxuICogQHBhcmFtIHtxdWF0fSBxIHF1YXRlcm5pb24gdG8gdHJhbnNmb3JtIHdpdGhcbiAqIEByZXR1cm5zIHt2ZWM0fSBvdXRcbiAqL1xudmVjNC50cmFuc2Zvcm1RdWF0ID0gZnVuY3Rpb24ob3V0LCBhLCBxKSB7XG4gICAgdmFyIHggPSBhWzBdLCB5ID0gYVsxXSwgeiA9IGFbMl0sXG4gICAgICAgIHF4ID0gcVswXSwgcXkgPSBxWzFdLCBxeiA9IHFbMl0sIHF3ID0gcVszXSxcblxuICAgICAgICAvLyBjYWxjdWxhdGUgcXVhdCAqIHZlY1xuICAgICAgICBpeCA9IHF3ICogeCArIHF5ICogeiAtIHF6ICogeSxcbiAgICAgICAgaXkgPSBxdyAqIHkgKyBxeiAqIHggLSBxeCAqIHosXG4gICAgICAgIGl6ID0gcXcgKiB6ICsgcXggKiB5IC0gcXkgKiB4LFxuICAgICAgICBpdyA9IC1xeCAqIHggLSBxeSAqIHkgLSBxeiAqIHo7XG5cbiAgICAvLyBjYWxjdWxhdGUgcmVzdWx0ICogaW52ZXJzZSBxdWF0XG4gICAgb3V0WzBdID0gaXggKiBxdyArIGl3ICogLXF4ICsgaXkgKiAtcXogLSBpeiAqIC1xeTtcbiAgICBvdXRbMV0gPSBpeSAqIHF3ICsgaXcgKiAtcXkgKyBpeiAqIC1xeCAtIGl4ICogLXF6O1xuICAgIG91dFsyXSA9IGl6ICogcXcgKyBpdyAqIC1xeiArIGl4ICogLXF5IC0gaXkgKiAtcXg7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUGVyZm9ybSBzb21lIG9wZXJhdGlvbiBvdmVyIGFuIGFycmF5IG9mIHZlYzRzLlxuICpcbiAqIEBwYXJhbSB7QXJyYXl9IGEgdGhlIGFycmF5IG9mIHZlY3RvcnMgdG8gaXRlcmF0ZSBvdmVyXG4gKiBAcGFyYW0ge051bWJlcn0gc3RyaWRlIE51bWJlciBvZiBlbGVtZW50cyBiZXR3ZWVuIHRoZSBzdGFydCBvZiBlYWNoIHZlYzQuIElmIDAgYXNzdW1lcyB0aWdodGx5IHBhY2tlZFxuICogQHBhcmFtIHtOdW1iZXJ9IG9mZnNldCBOdW1iZXIgb2YgZWxlbWVudHMgdG8gc2tpcCBhdCB0aGUgYmVnaW5uaW5nIG9mIHRoZSBhcnJheVxuICogQHBhcmFtIHtOdW1iZXJ9IGNvdW50IE51bWJlciBvZiB2ZWMycyB0byBpdGVyYXRlIG92ZXIuIElmIDAgaXRlcmF0ZXMgb3ZlciBlbnRpcmUgYXJyYXlcbiAqIEBwYXJhbSB7RnVuY3Rpb259IGZuIEZ1bmN0aW9uIHRvIGNhbGwgZm9yIGVhY2ggdmVjdG9yIGluIHRoZSBhcnJheVxuICogQHBhcmFtIHtPYmplY3R9IFthcmddIGFkZGl0aW9uYWwgYXJndW1lbnQgdG8gcGFzcyB0byBmblxuICogQHJldHVybnMge0FycmF5fSBhXG4gKiBAZnVuY3Rpb25cbiAqL1xudmVjNC5mb3JFYWNoID0gKGZ1bmN0aW9uKCkge1xuICAgIHZhciB2ZWMgPSB2ZWM0LmNyZWF0ZSgpO1xuXG4gICAgcmV0dXJuIGZ1bmN0aW9uKGEsIHN0cmlkZSwgb2Zmc2V0LCBjb3VudCwgZm4sIGFyZykge1xuICAgICAgICB2YXIgaSwgbDtcbiAgICAgICAgaWYoIXN0cmlkZSkge1xuICAgICAgICAgICAgc3RyaWRlID0gNDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKCFvZmZzZXQpIHtcbiAgICAgICAgICAgIG9mZnNldCA9IDA7XG4gICAgICAgIH1cbiAgICAgICAgXG4gICAgICAgIGlmKGNvdW50KSB7XG4gICAgICAgICAgICBsID0gTWF0aC5taW4oKGNvdW50ICogc3RyaWRlKSArIG9mZnNldCwgYS5sZW5ndGgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbCA9IGEubGVuZ3RoO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yKGkgPSBvZmZzZXQ7IGkgPCBsOyBpICs9IHN0cmlkZSkge1xuICAgICAgICAgICAgdmVjWzBdID0gYVtpXTsgdmVjWzFdID0gYVtpKzFdOyB2ZWNbMl0gPSBhW2krMl07IHZlY1szXSA9IGFbaSszXTtcbiAgICAgICAgICAgIGZuKHZlYywgdmVjLCBhcmcpO1xuICAgICAgICAgICAgYVtpXSA9IHZlY1swXTsgYVtpKzFdID0gdmVjWzFdOyBhW2krMl0gPSB2ZWNbMl07IGFbaSszXSA9IHZlY1szXTtcbiAgICAgICAgfVxuICAgICAgICBcbiAgICAgICAgcmV0dXJuIGE7XG4gICAgfTtcbn0pKCk7XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7dmVjNH0gdmVjIHZlY3RvciB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgdmVjdG9yXG4gKi9cbnZlYzQuc3RyID0gZnVuY3Rpb24gKGEpIHtcbiAgICByZXR1cm4gJ3ZlYzQoJyArIGFbMF0gKyAnLCAnICsgYVsxXSArICcsICcgKyBhWzJdICsgJywgJyArIGFbM10gKyAnKSc7XG59O1xuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy52ZWM0ID0gdmVjNDtcbn1cbjtcbi8qIENvcHlyaWdodCAoYykgMjAxMywgQnJhbmRvbiBKb25lcywgQ29saW4gTWFjS2VuemllIElWLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5SZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLFxuYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXG4gICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzXG4gICAgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gXG4gICAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cblRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbldBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cbi8qKlxuICogQGNsYXNzIDJ4MiBNYXRyaXhcbiAqIEBuYW1lIG1hdDJcbiAqL1xuXG52YXIgbWF0MiA9IHt9O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgaWRlbnRpdHkgbWF0MlxuICpcbiAqIEByZXR1cm5zIHttYXQyfSBhIG5ldyAyeDIgbWF0cml4XG4gKi9cbm1hdDIuY3JlYXRlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDQpO1xuICAgIG91dFswXSA9IDE7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBtYXQyIGluaXRpYWxpemVkIHdpdGggdmFsdWVzIGZyb20gYW4gZXhpc3RpbmcgbWF0cml4XG4gKlxuICogQHBhcmFtIHttYXQyfSBhIG1hdHJpeCB0byBjbG9uZVxuICogQHJldHVybnMge21hdDJ9IGEgbmV3IDJ4MiBtYXRyaXhcbiAqL1xubWF0Mi5jbG9uZSA9IGZ1bmN0aW9uKGEpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNCk7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3B5IHRoZSB2YWx1ZXMgZnJvbSBvbmUgbWF0MiB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHttYXQyfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0Mn0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDJ9IG91dFxuICovXG5tYXQyLmNvcHkgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICBvdXRbM10gPSBhWzNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNldCBhIG1hdDIgdG8gdGhlIGlkZW50aXR5IG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0Mn0gb3V0XG4gKi9cbm1hdDIuaWRlbnRpdHkgPSBmdW5jdGlvbihvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zcG9zZSB0aGUgdmFsdWVzIG9mIGEgbWF0MlxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJ9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQyfSBvdXRcbiAqL1xubWF0Mi50cmFuc3Bvc2UgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICAvLyBJZiB3ZSBhcmUgdHJhbnNwb3Npbmcgb3Vyc2VsdmVzIHdlIGNhbiBza2lwIGEgZmV3IHN0ZXBzIGJ1dCBoYXZlIHRvIGNhY2hlIHNvbWUgdmFsdWVzXG4gICAgaWYgKG91dCA9PT0gYSkge1xuICAgICAgICB2YXIgYTEgPSBhWzFdO1xuICAgICAgICBvdXRbMV0gPSBhWzJdO1xuICAgICAgICBvdXRbMl0gPSBhMTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBvdXRbMF0gPSBhWzBdO1xuICAgICAgICBvdXRbMV0gPSBhWzJdO1xuICAgICAgICBvdXRbMl0gPSBhWzFdO1xuICAgICAgICBvdXRbM10gPSBhWzNdO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBJbnZlcnRzIGEgbWF0MlxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJ9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQyfSBvdXRcbiAqL1xubWF0Mi5pbnZlcnQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgYTAgPSBhWzBdLCBhMSA9IGFbMV0sIGEyID0gYVsyXSwgYTMgPSBhWzNdLFxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRcbiAgICAgICAgZGV0ID0gYTAgKiBhMyAtIGEyICogYTE7XG5cbiAgICBpZiAoIWRldCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgZGV0ID0gMS4wIC8gZGV0O1xuICAgIFxuICAgIG91dFswXSA9ICBhMyAqIGRldDtcbiAgICBvdXRbMV0gPSAtYTEgKiBkZXQ7XG4gICAgb3V0WzJdID0gLWEyICogZGV0O1xuICAgIG91dFszXSA9ICBhMCAqIGRldDtcblxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGFkanVnYXRlIG9mIGEgbWF0MlxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJ9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQyfSBvdXRcbiAqL1xubWF0Mi5hZGpvaW50ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgLy8gQ2FjaGluZyB0aGlzIHZhbHVlIGlzIG5lc3NlY2FyeSBpZiBvdXQgPT0gYVxuICAgIHZhciBhMCA9IGFbMF07XG4gICAgb3V0WzBdID0gIGFbM107XG4gICAgb3V0WzFdID0gLWFbMV07XG4gICAgb3V0WzJdID0gLWFbMl07XG4gICAgb3V0WzNdID0gIGEwO1xuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGV0ZXJtaW5hbnQgb2YgYSBtYXQyXG4gKlxuICogQHBhcmFtIHttYXQyfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkZXRlcm1pbmFudCBvZiBhXG4gKi9cbm1hdDIuZGV0ZXJtaW5hbnQgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiBhWzBdICogYVszXSAtIGFbMl0gKiBhWzFdO1xufTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byBtYXQyJ3NcbiAqXG4gKiBAcGFyYW0ge21hdDJ9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQyfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge21hdDJ9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7bWF0Mn0gb3V0XG4gKi9cbm1hdDIubXVsdGlwbHkgPSBmdW5jdGlvbiAob3V0LCBhLCBiKSB7XG4gICAgdmFyIGEwID0gYVswXSwgYTEgPSBhWzFdLCBhMiA9IGFbMl0sIGEzID0gYVszXTtcbiAgICB2YXIgYjAgPSBiWzBdLCBiMSA9IGJbMV0sIGIyID0gYlsyXSwgYjMgPSBiWzNdO1xuICAgIG91dFswXSA9IGEwICogYjAgKyBhMiAqIGIxO1xuICAgIG91dFsxXSA9IGExICogYjAgKyBhMyAqIGIxO1xuICAgIG91dFsyXSA9IGEwICogYjIgKyBhMiAqIGIzO1xuICAgIG91dFszXSA9IGExICogYjIgKyBhMyAqIGIzO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgbWF0Mi5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG5tYXQyLm11bCA9IG1hdDIubXVsdGlwbHk7XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdDIgYnkgdGhlIGdpdmVuIGFuZ2xlXG4gKlxuICogQHBhcmFtIHttYXQyfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0Mn0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQyfSBvdXRcbiAqL1xubWF0Mi5yb3RhdGUgPSBmdW5jdGlvbiAob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgYTAgPSBhWzBdLCBhMSA9IGFbMV0sIGEyID0gYVsyXSwgYTMgPSBhWzNdLFxuICAgICAgICBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCk7XG4gICAgb3V0WzBdID0gYTAgKiAgYyArIGEyICogcztcbiAgICBvdXRbMV0gPSBhMSAqICBjICsgYTMgKiBzO1xuICAgIG91dFsyXSA9IGEwICogLXMgKyBhMiAqIGM7XG4gICAgb3V0WzNdID0gYTEgKiAtcyArIGEzICogYztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTY2FsZXMgdGhlIG1hdDIgYnkgdGhlIGRpbWVuc2lvbnMgaW4gdGhlIGdpdmVuIHZlYzJcbiAqXG4gKiBAcGFyYW0ge21hdDJ9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQyfSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge3ZlYzJ9IHYgdGhlIHZlYzIgdG8gc2NhbGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDJ9IG91dFxuICoqL1xubWF0Mi5zY2FsZSA9IGZ1bmN0aW9uKG91dCwgYSwgdikge1xuICAgIHZhciBhMCA9IGFbMF0sIGExID0gYVsxXSwgYTIgPSBhWzJdLCBhMyA9IGFbM10sXG4gICAgICAgIHYwID0gdlswXSwgdjEgPSB2WzFdO1xuICAgIG91dFswXSA9IGEwICogdjA7XG4gICAgb3V0WzFdID0gYTEgKiB2MDtcbiAgICBvdXRbMl0gPSBhMiAqIHYxO1xuICAgIG91dFszXSA9IGEzICogdjE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIG1hdDJcbiAqXG4gKiBAcGFyYW0ge21hdDJ9IG1hdCBtYXRyaXggdG8gcmVwcmVzZW50IGFzIGEgc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG1hdHJpeFxuICovXG5tYXQyLnN0ciA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuICdtYXQyKCcgKyBhWzBdICsgJywgJyArIGFbMV0gKyAnLCAnICsgYVsyXSArICcsICcgKyBhWzNdICsgJyknO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIEZyb2Jlbml1cyBub3JtIG9mIGEgbWF0MlxuICpcbiAqIEBwYXJhbSB7bWF0Mn0gYSB0aGUgbWF0cml4IHRvIGNhbGN1bGF0ZSBGcm9iZW5pdXMgbm9ybSBvZlxuICogQHJldHVybnMge051bWJlcn0gRnJvYmVuaXVzIG5vcm1cbiAqL1xubWF0Mi5mcm9iID0gZnVuY3Rpb24gKGEpIHtcbiAgICByZXR1cm4oTWF0aC5zcXJ0KE1hdGgucG93KGFbMF0sIDIpICsgTWF0aC5wb3coYVsxXSwgMikgKyBNYXRoLnBvdyhhWzJdLCAyKSArIE1hdGgucG93KGFbM10sIDIpKSlcbn07XG5cbi8qKlxuICogUmV0dXJucyBMLCBEIGFuZCBVIG1hdHJpY2VzIChMb3dlciB0cmlhbmd1bGFyLCBEaWFnb25hbCBhbmQgVXBwZXIgdHJpYW5ndWxhcikgYnkgZmFjdG9yaXppbmcgdGhlIGlucHV0IG1hdHJpeFxuICogQHBhcmFtIHttYXQyfSBMIHRoZSBsb3dlciB0cmlhbmd1bGFyIG1hdHJpeCBcbiAqIEBwYXJhbSB7bWF0Mn0gRCB0aGUgZGlhZ29uYWwgbWF0cml4IFxuICogQHBhcmFtIHttYXQyfSBVIHRoZSB1cHBlciB0cmlhbmd1bGFyIG1hdHJpeCBcbiAqIEBwYXJhbSB7bWF0Mn0gYSB0aGUgaW5wdXQgbWF0cml4IHRvIGZhY3Rvcml6ZVxuICovXG5cbm1hdDIuTERVID0gZnVuY3Rpb24gKEwsIEQsIFUsIGEpIHsgXG4gICAgTFsyXSA9IGFbMl0vYVswXTsgXG4gICAgVVswXSA9IGFbMF07IFxuICAgIFVbMV0gPSBhWzFdOyBcbiAgICBVWzNdID0gYVszXSAtIExbMl0gKiBVWzFdOyBcbiAgICByZXR1cm4gW0wsIEQsIFVdOyAgICAgICBcbn07IFxuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy5tYXQyID0gbWF0Mjtcbn1cbjtcbi8qIENvcHlyaWdodCAoYykgMjAxMywgQnJhbmRvbiBKb25lcywgQ29saW4gTWFjS2VuemllIElWLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuXG5SZWRpc3RyaWJ1dGlvbiBhbmQgdXNlIGluIHNvdXJjZSBhbmQgYmluYXJ5IGZvcm1zLCB3aXRoIG9yIHdpdGhvdXQgbW9kaWZpY2F0aW9uLFxuYXJlIHBlcm1pdHRlZCBwcm92aWRlZCB0aGF0IHRoZSBmb2xsb3dpbmcgY29uZGl0aW9ucyBhcmUgbWV0OlxuXG4gICogUmVkaXN0cmlidXRpb25zIG9mIHNvdXJjZSBjb2RlIG11c3QgcmV0YWluIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLCB0aGlzXG4gICAgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIuXG4gICogUmVkaXN0cmlidXRpb25zIGluIGJpbmFyeSBmb3JtIG11c3QgcmVwcm9kdWNlIHRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlLFxuICAgIHRoaXMgbGlzdCBvZiBjb25kaXRpb25zIGFuZCB0aGUgZm9sbG93aW5nIGRpc2NsYWltZXIgaW4gdGhlIGRvY3VtZW50YXRpb24gXG4gICAgYW5kL29yIG90aGVyIG1hdGVyaWFscyBwcm92aWRlZCB3aXRoIHRoZSBkaXN0cmlidXRpb24uXG5cblRISVMgU09GVFdBUkUgSVMgUFJPVklERUQgQlkgVEhFIENPUFlSSUdIVCBIT0xERVJTIEFORCBDT05UUklCVVRPUlMgXCJBUyBJU1wiIEFORFxuQU5ZIEVYUFJFU1MgT1IgSU1QTElFRCBXQVJSQU5USUVTLCBJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgVEhFIElNUExJRURcbldBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZIEFORCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBUkUgXG5ESVNDTEFJTUVELiBJTiBOTyBFVkVOVCBTSEFMTCBUSEUgQ09QWVJJR0hUIEhPTERFUiBPUiBDT05UUklCVVRPUlMgQkUgTElBQkxFIEZPUlxuQU5ZIERJUkVDVCwgSU5ESVJFQ1QsIElOQ0lERU5UQUwsIFNQRUNJQUwsIEVYRU1QTEFSWSwgT1IgQ09OU0VRVUVOVElBTCBEQU1BR0VTXG4oSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFBST0NVUkVNRU5UIE9GIFNVQlNUSVRVVEUgR09PRFMgT1IgU0VSVklDRVM7XG5MT1NTIE9GIFVTRSwgREFUQSwgT1IgUFJPRklUUzsgT1IgQlVTSU5FU1MgSU5URVJSVVBUSU9OKSBIT1dFVkVSIENBVVNFRCBBTkQgT05cbkFOWSBUSEVPUlkgT0YgTElBQklMSVRZLCBXSEVUSEVSIElOIENPTlRSQUNULCBTVFJJQ1QgTElBQklMSVRZLCBPUiBUT1JUXG4oSU5DTFVESU5HIE5FR0xJR0VOQ0UgT1IgT1RIRVJXSVNFKSBBUklTSU5HIElOIEFOWSBXQVkgT1VUIE9GIFRIRSBVU0UgT0YgVEhJU1xuU09GVFdBUkUsIEVWRU4gSUYgQURWSVNFRCBPRiBUSEUgUE9TU0lCSUxJVFkgT0YgU1VDSCBEQU1BR0UuICovXG5cbi8qKlxuICogQGNsYXNzIDJ4MyBNYXRyaXhcbiAqIEBuYW1lIG1hdDJkXG4gKiBcbiAqIEBkZXNjcmlwdGlvbiBcbiAqIEEgbWF0MmQgY29udGFpbnMgc2l4IGVsZW1lbnRzIGRlZmluZWQgYXM6XG4gKiA8cHJlPlxuICogW2EsIGMsIHR4LFxuICogIGIsIGQsIHR5XVxuICogPC9wcmU+XG4gKiBUaGlzIGlzIGEgc2hvcnQgZm9ybSBmb3IgdGhlIDN4MyBtYXRyaXg6XG4gKiA8cHJlPlxuICogW2EsIGMsIHR4LFxuICogIGIsIGQsIHR5LFxuICogIDAsIDAsIDFdXG4gKiA8L3ByZT5cbiAqIFRoZSBsYXN0IHJvdyBpcyBpZ25vcmVkIHNvIHRoZSBhcnJheSBpcyBzaG9ydGVyIGFuZCBvcGVyYXRpb25zIGFyZSBmYXN0ZXIuXG4gKi9cblxudmFyIG1hdDJkID0ge307XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBpZGVudGl0eSBtYXQyZFxuICpcbiAqIEByZXR1cm5zIHttYXQyZH0gYSBuZXcgMngzIG1hdHJpeFxuICovXG5tYXQyZC5jcmVhdGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNik7XG4gICAgb3V0WzBdID0gMTtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMTtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IDA7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBtYXQyZCBpbml0aWFsaXplZCB3aXRoIHZhbHVlcyBmcm9tIGFuIGV4aXN0aW5nIG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0MmR9IGEgbWF0cml4IHRvIGNsb25lXG4gKiBAcmV0dXJucyB7bWF0MmR9IGEgbmV3IDJ4MyBtYXRyaXhcbiAqL1xubWF0MmQuY2xvbmUgPSBmdW5jdGlvbihhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDYpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSBtYXQyZCB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHttYXQyZH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJkfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0MmR9IG91dFxuICovXG5tYXQyZC5jb3B5ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2V0IGEgbWF0MmQgdG8gdGhlIGlkZW50aXR5IG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0MmR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHJldHVybnMge21hdDJkfSBvdXRcbiAqL1xubWF0MmQuaWRlbnRpdHkgPSBmdW5jdGlvbihvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAxO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gMDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBJbnZlcnRzIGEgbWF0MmRcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0MmR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQyZH0gb3V0XG4gKi9cbm1hdDJkLmludmVydCA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIHZhciBhYSA9IGFbMF0sIGFiID0gYVsxXSwgYWMgPSBhWzJdLCBhZCA9IGFbM10sXG4gICAgICAgIGF0eCA9IGFbNF0sIGF0eSA9IGFbNV07XG5cbiAgICB2YXIgZGV0ID0gYWEgKiBhZCAtIGFiICogYWM7XG4gICAgaWYoIWRldCl7XG4gICAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBkZXQgPSAxLjAgLyBkZXQ7XG5cbiAgICBvdXRbMF0gPSBhZCAqIGRldDtcbiAgICBvdXRbMV0gPSAtYWIgKiBkZXQ7XG4gICAgb3V0WzJdID0gLWFjICogZGV0O1xuICAgIG91dFszXSA9IGFhICogZGV0O1xuICAgIG91dFs0XSA9IChhYyAqIGF0eSAtIGFkICogYXR4KSAqIGRldDtcbiAgICBvdXRbNV0gPSAoYWIgKiBhdHggLSBhYSAqIGF0eSkgKiBkZXQ7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGV0ZXJtaW5hbnQgb2YgYSBtYXQyZFxuICpcbiAqIEBwYXJhbSB7bWF0MmR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRldGVybWluYW50IG9mIGFcbiAqL1xubWF0MmQuZGV0ZXJtaW5hbnQgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybiBhWzBdICogYVszXSAtIGFbMV0gKiBhWzJdO1xufTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byBtYXQyZCdzXG4gKlxuICogQHBhcmFtIHttYXQyZH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJkfSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge21hdDJkfSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge21hdDJkfSBvdXRcbiAqL1xubWF0MmQubXVsdGlwbHkgPSBmdW5jdGlvbiAob3V0LCBhLCBiKSB7XG4gICAgdmFyIGEwID0gYVswXSwgYTEgPSBhWzFdLCBhMiA9IGFbMl0sIGEzID0gYVszXSwgYTQgPSBhWzRdLCBhNSA9IGFbNV0sXG4gICAgICAgIGIwID0gYlswXSwgYjEgPSBiWzFdLCBiMiA9IGJbMl0sIGIzID0gYlszXSwgYjQgPSBiWzRdLCBiNSA9IGJbNV07XG4gICAgb3V0WzBdID0gYTAgKiBiMCArIGEyICogYjE7XG4gICAgb3V0WzFdID0gYTEgKiBiMCArIGEzICogYjE7XG4gICAgb3V0WzJdID0gYTAgKiBiMiArIGEyICogYjM7XG4gICAgb3V0WzNdID0gYTEgKiBiMiArIGEzICogYjM7XG4gICAgb3V0WzRdID0gYTAgKiBiNCArIGEyICogYjUgKyBhNDtcbiAgICBvdXRbNV0gPSBhMSAqIGI0ICsgYTMgKiBiNSArIGE1O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgbWF0MmQubXVsdGlwbHl9XG4gKiBAZnVuY3Rpb25cbiAqL1xubWF0MmQubXVsID0gbWF0MmQubXVsdGlwbHk7XG5cblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0MmQgYnkgdGhlIGdpdmVuIGFuZ2xlXG4gKlxuICogQHBhcmFtIHttYXQyZH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDJkfSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDJkfSBvdXRcbiAqL1xubWF0MmQucm90YXRlID0gZnVuY3Rpb24gKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIGEwID0gYVswXSwgYTEgPSBhWzFdLCBhMiA9IGFbMl0sIGEzID0gYVszXSwgYTQgPSBhWzRdLCBhNSA9IGFbNV0sXG4gICAgICAgIHMgPSBNYXRoLnNpbihyYWQpLFxuICAgICAgICBjID0gTWF0aC5jb3MocmFkKTtcbiAgICBvdXRbMF0gPSBhMCAqICBjICsgYTIgKiBzO1xuICAgIG91dFsxXSA9IGExICogIGMgKyBhMyAqIHM7XG4gICAgb3V0WzJdID0gYTAgKiAtcyArIGEyICogYztcbiAgICBvdXRbM10gPSBhMSAqIC1zICsgYTMgKiBjO1xuICAgIG91dFs0XSA9IGE0O1xuICAgIG91dFs1XSA9IGE1O1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNjYWxlcyB0aGUgbWF0MmQgYnkgdGhlIGRpbWVuc2lvbnMgaW4gdGhlIGdpdmVuIHZlYzJcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0MmR9IGEgdGhlIG1hdHJpeCB0byB0cmFuc2xhdGVcbiAqIEBwYXJhbSB7dmVjMn0gdiB0aGUgdmVjMiB0byBzY2FsZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0MmR9IG91dFxuICoqL1xubWF0MmQuc2NhbGUgPSBmdW5jdGlvbihvdXQsIGEsIHYpIHtcbiAgICB2YXIgYTAgPSBhWzBdLCBhMSA9IGFbMV0sIGEyID0gYVsyXSwgYTMgPSBhWzNdLCBhNCA9IGFbNF0sIGE1ID0gYVs1XSxcbiAgICAgICAgdjAgPSB2WzBdLCB2MSA9IHZbMV07XG4gICAgb3V0WzBdID0gYTAgKiB2MDtcbiAgICBvdXRbMV0gPSBhMSAqIHYwO1xuICAgIG91dFsyXSA9IGEyICogdjE7XG4gICAgb3V0WzNdID0gYTMgKiB2MTtcbiAgICBvdXRbNF0gPSBhNDtcbiAgICBvdXRbNV0gPSBhNTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc2xhdGVzIHRoZSBtYXQyZCBieSB0aGUgZGltZW5zaW9ucyBpbiB0aGUgZ2l2ZW4gdmVjMlxuICpcbiAqIEBwYXJhbSB7bWF0MmR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQyZH0gYSB0aGUgbWF0cml4IHRvIHRyYW5zbGF0ZVxuICogQHBhcmFtIHt2ZWMyfSB2IHRoZSB2ZWMyIHRvIHRyYW5zbGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0MmR9IG91dFxuICoqL1xubWF0MmQudHJhbnNsYXRlID0gZnVuY3Rpb24ob3V0LCBhLCB2KSB7XG4gICAgdmFyIGEwID0gYVswXSwgYTEgPSBhWzFdLCBhMiA9IGFbMl0sIGEzID0gYVszXSwgYTQgPSBhWzRdLCBhNSA9IGFbNV0sXG4gICAgICAgIHYwID0gdlswXSwgdjEgPSB2WzFdO1xuICAgIG91dFswXSA9IGEwO1xuICAgIG91dFsxXSA9IGExO1xuICAgIG91dFsyXSA9IGEyO1xuICAgIG91dFszXSA9IGEzO1xuICAgIG91dFs0XSA9IGEwICogdjAgKyBhMiAqIHYxICsgYTQ7XG4gICAgb3V0WzVdID0gYTEgKiB2MCArIGEzICogdjEgKyBhNTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgbWF0MmRcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBhIG1hdHJpeCB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgbWF0cml4XG4gKi9cbm1hdDJkLnN0ciA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuICdtYXQyZCgnICsgYVswXSArICcsICcgKyBhWzFdICsgJywgJyArIGFbMl0gKyAnLCAnICsgXG4gICAgICAgICAgICAgICAgICAgIGFbM10gKyAnLCAnICsgYVs0XSArICcsICcgKyBhWzVdICsgJyknO1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIEZyb2Jlbml1cyBub3JtIG9mIGEgbWF0MmRcbiAqXG4gKiBAcGFyYW0ge21hdDJkfSBhIHRoZSBtYXRyaXggdG8gY2FsY3VsYXRlIEZyb2Jlbml1cyBub3JtIG9mXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBGcm9iZW5pdXMgbm9ybVxuICovXG5tYXQyZC5mcm9iID0gZnVuY3Rpb24gKGEpIHsgXG4gICAgcmV0dXJuKE1hdGguc3FydChNYXRoLnBvdyhhWzBdLCAyKSArIE1hdGgucG93KGFbMV0sIDIpICsgTWF0aC5wb3coYVsyXSwgMikgKyBNYXRoLnBvdyhhWzNdLCAyKSArIE1hdGgucG93KGFbNF0sIDIpICsgTWF0aC5wb3coYVs1XSwgMikgKyAxKSlcbn07IFxuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy5tYXQyZCA9IG1hdDJkO1xufVxuO1xuLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBcbiAgICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cblxuVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG5BTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBcbkRJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SXG5BTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbihJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbkxPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTlxuQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbihJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG5TT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS4gKi9cblxuLyoqXG4gKiBAY2xhc3MgM3gzIE1hdHJpeFxuICogQG5hbWUgbWF0M1xuICovXG5cbnZhciBtYXQzID0ge307XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBpZGVudGl0eSBtYXQzXG4gKlxuICogQHJldHVybnMge21hdDN9IGEgbmV3IDN4MyBtYXRyaXhcbiAqL1xubWF0My5jcmVhdGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoOSk7XG4gICAgb3V0WzBdID0gMTtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAxO1xuICAgIG91dFs1XSA9IDA7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ29waWVzIHRoZSB1cHBlci1sZWZ0IDN4MyB2YWx1ZXMgaW50byB0aGUgZ2l2ZW4gbWF0My5cbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIDN4MyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSAgIHRoZSBzb3VyY2UgNHg0IG1hdHJpeFxuICogQHJldHVybnMge21hdDN9IG91dFxuICovXG5tYXQzLmZyb21NYXQ0ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVs0XTtcbiAgICBvdXRbNF0gPSBhWzVdO1xuICAgIG91dFs1XSA9IGFbNl07XG4gICAgb3V0WzZdID0gYVs4XTtcbiAgICBvdXRbN10gPSBhWzldO1xuICAgIG91dFs4XSA9IGFbMTBdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENyZWF0ZXMgYSBuZXcgbWF0MyBpbml0aWFsaXplZCB3aXRoIHZhbHVlcyBmcm9tIGFuIGV4aXN0aW5nIG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0M30gYSBtYXRyaXggdG8gY2xvbmVcbiAqIEByZXR1cm5zIHttYXQzfSBhIG5ldyAzeDMgbWF0cml4XG4gKi9cbm1hdDMuY2xvbmUgPSBmdW5jdGlvbihhKSB7XG4gICAgdmFyIG91dCA9IG5ldyBHTE1BVF9BUlJBWV9UWVBFKDkpO1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENvcHkgdGhlIHZhbHVlcyBmcm9tIG9uZSBtYXQzIHRvIGFub3RoZXJcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuY29weSA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIG91dFswXSA9IGFbMF07XG4gICAgb3V0WzFdID0gYVsxXTtcbiAgICBvdXRbMl0gPSBhWzJdO1xuICAgIG91dFszXSA9IGFbM107XG4gICAgb3V0WzRdID0gYVs0XTtcbiAgICBvdXRbNV0gPSBhWzVdO1xuICAgIG91dFs2XSA9IGFbNl07XG4gICAgb3V0WzddID0gYVs3XTtcbiAgICBvdXRbOF0gPSBhWzhdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNldCBhIG1hdDMgdG8gdGhlIGlkZW50aXR5IG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuaWRlbnRpdHkgPSBmdW5jdGlvbihvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDE7XG4gICAgb3V0WzVdID0gMDtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBUcmFuc3Bvc2UgdGhlIHZhbHVlcyBvZiBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMudHJhbnNwb3NlID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgLy8gSWYgd2UgYXJlIHRyYW5zcG9zaW5nIG91cnNlbHZlcyB3ZSBjYW4gc2tpcCBhIGZldyBzdGVwcyBidXQgaGF2ZSB0byBjYWNoZSBzb21lIHZhbHVlc1xuICAgIGlmIChvdXQgPT09IGEpIHtcbiAgICAgICAgdmFyIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGExMiA9IGFbNV07XG4gICAgICAgIG91dFsxXSA9IGFbM107XG4gICAgICAgIG91dFsyXSA9IGFbNl07XG4gICAgICAgIG91dFszXSA9IGEwMTtcbiAgICAgICAgb3V0WzVdID0gYVs3XTtcbiAgICAgICAgb3V0WzZdID0gYTAyO1xuICAgICAgICBvdXRbN10gPSBhMTI7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgb3V0WzBdID0gYVswXTtcbiAgICAgICAgb3V0WzFdID0gYVszXTtcbiAgICAgICAgb3V0WzJdID0gYVs2XTtcbiAgICAgICAgb3V0WzNdID0gYVsxXTtcbiAgICAgICAgb3V0WzRdID0gYVs0XTtcbiAgICAgICAgb3V0WzVdID0gYVs3XTtcbiAgICAgICAgb3V0WzZdID0gYVsyXTtcbiAgICAgICAgb3V0WzddID0gYVs1XTtcbiAgICAgICAgb3V0WzhdID0gYVs4XTtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogSW52ZXJ0cyBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuaW52ZXJ0ID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sXG4gICAgICAgIGExMCA9IGFbM10sIGExMSA9IGFbNF0sIGExMiA9IGFbNV0sXG4gICAgICAgIGEyMCA9IGFbNl0sIGEyMSA9IGFbN10sIGEyMiA9IGFbOF0sXG5cbiAgICAgICAgYjAxID0gYTIyICogYTExIC0gYTEyICogYTIxLFxuICAgICAgICBiMTEgPSAtYTIyICogYTEwICsgYTEyICogYTIwLFxuICAgICAgICBiMjEgPSBhMjEgKiBhMTAgLSBhMTEgKiBhMjAsXG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBkZXRlcm1pbmFudFxuICAgICAgICBkZXQgPSBhMDAgKiBiMDEgKyBhMDEgKiBiMTEgKyBhMDIgKiBiMjE7XG5cbiAgICBpZiAoIWRldCkgeyBcbiAgICAgICAgcmV0dXJuIG51bGw7IFxuICAgIH1cbiAgICBkZXQgPSAxLjAgLyBkZXQ7XG5cbiAgICBvdXRbMF0gPSBiMDEgKiBkZXQ7XG4gICAgb3V0WzFdID0gKC1hMjIgKiBhMDEgKyBhMDIgKiBhMjEpICogZGV0O1xuICAgIG91dFsyXSA9IChhMTIgKiBhMDEgLSBhMDIgKiBhMTEpICogZGV0O1xuICAgIG91dFszXSA9IGIxMSAqIGRldDtcbiAgICBvdXRbNF0gPSAoYTIyICogYTAwIC0gYTAyICogYTIwKSAqIGRldDtcbiAgICBvdXRbNV0gPSAoLWExMiAqIGEwMCArIGEwMiAqIGExMCkgKiBkZXQ7XG4gICAgb3V0WzZdID0gYjIxICogZGV0O1xuICAgIG91dFs3XSA9ICgtYTIxICogYTAwICsgYTAxICogYTIwKSAqIGRldDtcbiAgICBvdXRbOF0gPSAoYTExICogYTAwIC0gYTAxICogYTEwKSAqIGRldDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBhZGp1Z2F0ZSBvZiBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMuYWRqb2ludCA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLFxuICAgICAgICBhMTAgPSBhWzNdLCBhMTEgPSBhWzRdLCBhMTIgPSBhWzVdLFxuICAgICAgICBhMjAgPSBhWzZdLCBhMjEgPSBhWzddLCBhMjIgPSBhWzhdO1xuXG4gICAgb3V0WzBdID0gKGExMSAqIGEyMiAtIGExMiAqIGEyMSk7XG4gICAgb3V0WzFdID0gKGEwMiAqIGEyMSAtIGEwMSAqIGEyMik7XG4gICAgb3V0WzJdID0gKGEwMSAqIGExMiAtIGEwMiAqIGExMSk7XG4gICAgb3V0WzNdID0gKGExMiAqIGEyMCAtIGExMCAqIGEyMik7XG4gICAgb3V0WzRdID0gKGEwMCAqIGEyMiAtIGEwMiAqIGEyMCk7XG4gICAgb3V0WzVdID0gKGEwMiAqIGExMCAtIGEwMCAqIGExMik7XG4gICAgb3V0WzZdID0gKGExMCAqIGEyMSAtIGExMSAqIGEyMCk7XG4gICAgb3V0WzddID0gKGEwMSAqIGEyMCAtIGEwMCAqIGEyMSk7XG4gICAgb3V0WzhdID0gKGEwMCAqIGExMSAtIGEwMSAqIGExMCk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZGV0ZXJtaW5hbnQgb2YgYSBtYXQzXG4gKlxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7TnVtYmVyfSBkZXRlcm1pbmFudCBvZiBhXG4gKi9cbm1hdDMuZGV0ZXJtaW5hbnQgPSBmdW5jdGlvbiAoYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLFxuICAgICAgICBhMTAgPSBhWzNdLCBhMTEgPSBhWzRdLCBhMTIgPSBhWzVdLFxuICAgICAgICBhMjAgPSBhWzZdLCBhMjEgPSBhWzddLCBhMjIgPSBhWzhdO1xuXG4gICAgcmV0dXJuIGEwMCAqIChhMjIgKiBhMTEgLSBhMTIgKiBhMjEpICsgYTAxICogKC1hMjIgKiBhMTAgKyBhMTIgKiBhMjApICsgYTAyICogKGEyMSAqIGExMCAtIGExMSAqIGEyMCk7XG59O1xuXG4vKipcbiAqIE11bHRpcGxpZXMgdHdvIG1hdDMnc1xuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7bWF0M30gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My5tdWx0aXBseSA9IGZ1bmN0aW9uIChvdXQsIGEsIGIpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSxcbiAgICAgICAgYTEwID0gYVszXSwgYTExID0gYVs0XSwgYTEyID0gYVs1XSxcbiAgICAgICAgYTIwID0gYVs2XSwgYTIxID0gYVs3XSwgYTIyID0gYVs4XSxcblxuICAgICAgICBiMDAgPSBiWzBdLCBiMDEgPSBiWzFdLCBiMDIgPSBiWzJdLFxuICAgICAgICBiMTAgPSBiWzNdLCBiMTEgPSBiWzRdLCBiMTIgPSBiWzVdLFxuICAgICAgICBiMjAgPSBiWzZdLCBiMjEgPSBiWzddLCBiMjIgPSBiWzhdO1xuXG4gICAgb3V0WzBdID0gYjAwICogYTAwICsgYjAxICogYTEwICsgYjAyICogYTIwO1xuICAgIG91dFsxXSA9IGIwMCAqIGEwMSArIGIwMSAqIGExMSArIGIwMiAqIGEyMTtcbiAgICBvdXRbMl0gPSBiMDAgKiBhMDIgKyBiMDEgKiBhMTIgKyBiMDIgKiBhMjI7XG5cbiAgICBvdXRbM10gPSBiMTAgKiBhMDAgKyBiMTEgKiBhMTAgKyBiMTIgKiBhMjA7XG4gICAgb3V0WzRdID0gYjEwICogYTAxICsgYjExICogYTExICsgYjEyICogYTIxO1xuICAgIG91dFs1XSA9IGIxMCAqIGEwMiArIGIxMSAqIGExMiArIGIxMiAqIGEyMjtcblxuICAgIG91dFs2XSA9IGIyMCAqIGEwMCArIGIyMSAqIGExMCArIGIyMiAqIGEyMDtcbiAgICBvdXRbN10gPSBiMjAgKiBhMDEgKyBiMjEgKiBhMTEgKyBiMjIgKiBhMjE7XG4gICAgb3V0WzhdID0gYjIwICogYTAyICsgYjIxICogYTEyICsgYjIyICogYTIyO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEFsaWFzIGZvciB7QGxpbmsgbWF0My5tdWx0aXBseX1cbiAqIEBmdW5jdGlvblxuICovXG5tYXQzLm11bCA9IG1hdDMubXVsdGlwbHk7XG5cbi8qKlxuICogVHJhbnNsYXRlIGEgbWF0MyBieSB0aGUgZ2l2ZW4gdmVjdG9yXG4gKlxuICogQHBhcmFtIHttYXQzfSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0M30gYSB0aGUgbWF0cml4IHRvIHRyYW5zbGF0ZVxuICogQHBhcmFtIHt2ZWMyfSB2IHZlY3RvciB0byB0cmFuc2xhdGUgYnlcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqL1xubWF0My50cmFuc2xhdGUgPSBmdW5jdGlvbihvdXQsIGEsIHYpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSxcbiAgICAgICAgYTEwID0gYVszXSwgYTExID0gYVs0XSwgYTEyID0gYVs1XSxcbiAgICAgICAgYTIwID0gYVs2XSwgYTIxID0gYVs3XSwgYTIyID0gYVs4XSxcbiAgICAgICAgeCA9IHZbMF0sIHkgPSB2WzFdO1xuXG4gICAgb3V0WzBdID0gYTAwO1xuICAgIG91dFsxXSA9IGEwMTtcbiAgICBvdXRbMl0gPSBhMDI7XG5cbiAgICBvdXRbM10gPSBhMTA7XG4gICAgb3V0WzRdID0gYTExO1xuICAgIG91dFs1XSA9IGExMjtcblxuICAgIG91dFs2XSA9IHggKiBhMDAgKyB5ICogYTEwICsgYTIwO1xuICAgIG91dFs3XSA9IHggKiBhMDEgKyB5ICogYTExICsgYTIxO1xuICAgIG91dFs4XSA9IHggKiBhMDIgKyB5ICogYTEyICsgYTIyO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXQzIGJ5IHRoZSBnaXZlbiBhbmdsZVxuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKi9cbm1hdDMucm90YXRlID0gZnVuY3Rpb24gKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sXG4gICAgICAgIGExMCA9IGFbM10sIGExMSA9IGFbNF0sIGExMiA9IGFbNV0sXG4gICAgICAgIGEyMCA9IGFbNl0sIGEyMSA9IGFbN10sIGEyMiA9IGFbOF0sXG5cbiAgICAgICAgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpO1xuXG4gICAgb3V0WzBdID0gYyAqIGEwMCArIHMgKiBhMTA7XG4gICAgb3V0WzFdID0gYyAqIGEwMSArIHMgKiBhMTE7XG4gICAgb3V0WzJdID0gYyAqIGEwMiArIHMgKiBhMTI7XG5cbiAgICBvdXRbM10gPSBjICogYTEwIC0gcyAqIGEwMDtcbiAgICBvdXRbNF0gPSBjICogYTExIC0gcyAqIGEwMTtcbiAgICBvdXRbNV0gPSBjICogYTEyIC0gcyAqIGEwMjtcblxuICAgIG91dFs2XSA9IGEyMDtcbiAgICBvdXRbN10gPSBhMjE7XG4gICAgb3V0WzhdID0gYTIyO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNjYWxlcyB0aGUgbWF0MyBieSB0aGUgZGltZW5zaW9ucyBpbiB0aGUgZ2l2ZW4gdmVjMlxuICpcbiAqIEBwYXJhbSB7bWF0M30gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDN9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7dmVjMn0gdiB0aGUgdmVjMiB0byBzY2FsZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0M30gb3V0XG4gKiovXG5tYXQzLnNjYWxlID0gZnVuY3Rpb24ob3V0LCBhLCB2KSB7XG4gICAgdmFyIHggPSB2WzBdLCB5ID0gdlsxXTtcblxuICAgIG91dFswXSA9IHggKiBhWzBdO1xuICAgIG91dFsxXSA9IHggKiBhWzFdO1xuICAgIG91dFsyXSA9IHggKiBhWzJdO1xuXG4gICAgb3V0WzNdID0geSAqIGFbM107XG4gICAgb3V0WzRdID0geSAqIGFbNF07XG4gICAgb3V0WzVdID0geSAqIGFbNV07XG5cbiAgICBvdXRbNl0gPSBhWzZdO1xuICAgIG91dFs3XSA9IGFbN107XG4gICAgb3V0WzhdID0gYVs4XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3BpZXMgdGhlIHZhbHVlcyBmcm9tIGEgbWF0MmQgaW50byBhIG1hdDNcbiAqXG4gKiBAcGFyYW0ge21hdDN9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQyZH0gYSB0aGUgbWF0cml4IHRvIGNvcHlcbiAqIEByZXR1cm5zIHttYXQzfSBvdXRcbiAqKi9cbm1hdDMuZnJvbU1hdDJkID0gZnVuY3Rpb24ob3V0LCBhKSB7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IDA7XG5cbiAgICBvdXRbM10gPSBhWzJdO1xuICAgIG91dFs0XSA9IGFbM107XG4gICAgb3V0WzVdID0gMDtcblxuICAgIG91dFs2XSA9IGFbNF07XG4gICAgb3V0WzddID0gYVs1XTtcbiAgICBvdXRbOF0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiogQ2FsY3VsYXRlcyBhIDN4MyBtYXRyaXggZnJvbSB0aGUgZ2l2ZW4gcXVhdGVybmlvblxuKlxuKiBAcGFyYW0ge21hdDN9IG91dCBtYXQzIHJlY2VpdmluZyBvcGVyYXRpb24gcmVzdWx0XG4qIEBwYXJhbSB7cXVhdH0gcSBRdWF0ZXJuaW9uIHRvIGNyZWF0ZSBtYXRyaXggZnJvbVxuKlxuKiBAcmV0dXJucyB7bWF0M30gb3V0XG4qL1xubWF0My5mcm9tUXVhdCA9IGZ1bmN0aW9uIChvdXQsIHEpIHtcbiAgICB2YXIgeCA9IHFbMF0sIHkgPSBxWzFdLCB6ID0gcVsyXSwgdyA9IHFbM10sXG4gICAgICAgIHgyID0geCArIHgsXG4gICAgICAgIHkyID0geSArIHksXG4gICAgICAgIHoyID0geiArIHosXG5cbiAgICAgICAgeHggPSB4ICogeDIsXG4gICAgICAgIHl4ID0geSAqIHgyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgenggPSB6ICogeDIsXG4gICAgICAgIHp5ID0geiAqIHkyLFxuICAgICAgICB6eiA9IHogKiB6MixcbiAgICAgICAgd3ggPSB3ICogeDIsXG4gICAgICAgIHd5ID0gdyAqIHkyLFxuICAgICAgICB3eiA9IHcgKiB6MjtcblxuICAgIG91dFswXSA9IDEgLSB5eSAtIHp6O1xuICAgIG91dFszXSA9IHl4IC0gd3o7XG4gICAgb3V0WzZdID0genggKyB3eTtcblxuICAgIG91dFsxXSA9IHl4ICsgd3o7XG4gICAgb3V0WzRdID0gMSAtIHh4IC0geno7XG4gICAgb3V0WzddID0genkgLSB3eDtcblxuICAgIG91dFsyXSA9IHp4IC0gd3k7XG4gICAgb3V0WzVdID0genkgKyB3eDtcbiAgICBvdXRbOF0gPSAxIC0geHggLSB5eTtcblxuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiogQ2FsY3VsYXRlcyBhIDN4MyBub3JtYWwgbWF0cml4ICh0cmFuc3Bvc2UgaW52ZXJzZSkgZnJvbSB0aGUgNHg0IG1hdHJpeFxuKlxuKiBAcGFyYW0ge21hdDN9IG91dCBtYXQzIHJlY2VpdmluZyBvcGVyYXRpb24gcmVzdWx0XG4qIEBwYXJhbSB7bWF0NH0gYSBNYXQ0IHRvIGRlcml2ZSB0aGUgbm9ybWFsIG1hdHJpeCBmcm9tXG4qXG4qIEByZXR1cm5zIHttYXQzfSBvdXRcbiovXG5tYXQzLm5vcm1hbEZyb21NYXQ0ID0gZnVuY3Rpb24gKG91dCwgYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdLFxuXG4gICAgICAgIGIwMCA9IGEwMCAqIGExMSAtIGEwMSAqIGExMCxcbiAgICAgICAgYjAxID0gYTAwICogYTEyIC0gYTAyICogYTEwLFxuICAgICAgICBiMDIgPSBhMDAgKiBhMTMgLSBhMDMgKiBhMTAsXG4gICAgICAgIGIwMyA9IGEwMSAqIGExMiAtIGEwMiAqIGExMSxcbiAgICAgICAgYjA0ID0gYTAxICogYTEzIC0gYTAzICogYTExLFxuICAgICAgICBiMDUgPSBhMDIgKiBhMTMgLSBhMDMgKiBhMTIsXG4gICAgICAgIGIwNiA9IGEyMCAqIGEzMSAtIGEyMSAqIGEzMCxcbiAgICAgICAgYjA3ID0gYTIwICogYTMyIC0gYTIyICogYTMwLFxuICAgICAgICBiMDggPSBhMjAgKiBhMzMgLSBhMjMgKiBhMzAsXG4gICAgICAgIGIwOSA9IGEyMSAqIGEzMiAtIGEyMiAqIGEzMSxcbiAgICAgICAgYjEwID0gYTIxICogYTMzIC0gYTIzICogYTMxLFxuICAgICAgICBiMTEgPSBhMjIgKiBhMzMgLSBhMjMgKiBhMzIsXG5cbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBkZXRlcm1pbmFudFxuICAgICAgICBkZXQgPSBiMDAgKiBiMTEgLSBiMDEgKiBiMTAgKyBiMDIgKiBiMDkgKyBiMDMgKiBiMDggLSBiMDQgKiBiMDcgKyBiMDUgKiBiMDY7XG5cbiAgICBpZiAoIWRldCkgeyBcbiAgICAgICAgcmV0dXJuIG51bGw7IFxuICAgIH1cbiAgICBkZXQgPSAxLjAgLyBkZXQ7XG5cbiAgICBvdXRbMF0gPSAoYTExICogYjExIC0gYTEyICogYjEwICsgYTEzICogYjA5KSAqIGRldDtcbiAgICBvdXRbMV0gPSAoYTEyICogYjA4IC0gYTEwICogYjExIC0gYTEzICogYjA3KSAqIGRldDtcbiAgICBvdXRbMl0gPSAoYTEwICogYjEwIC0gYTExICogYjA4ICsgYTEzICogYjA2KSAqIGRldDtcblxuICAgIG91dFszXSA9IChhMDIgKiBiMTAgLSBhMDEgKiBiMTEgLSBhMDMgKiBiMDkpICogZGV0O1xuICAgIG91dFs0XSA9IChhMDAgKiBiMTEgLSBhMDIgKiBiMDggKyBhMDMgKiBiMDcpICogZGV0O1xuICAgIG91dFs1XSA9IChhMDEgKiBiMDggLSBhMDAgKiBiMTAgLSBhMDMgKiBiMDYpICogZGV0O1xuXG4gICAgb3V0WzZdID0gKGEzMSAqIGIwNSAtIGEzMiAqIGIwNCArIGEzMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzddID0gKGEzMiAqIGIwMiAtIGEzMCAqIGIwNSAtIGEzMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzhdID0gKGEzMCAqIGIwNCAtIGEzMSAqIGIwMiArIGEzMyAqIGIwMCkgKiBkZXQ7XG5cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSZXR1cm5zIGEgc3RyaW5nIHJlcHJlc2VudGF0aW9uIG9mIGEgbWF0M1xuICpcbiAqIEBwYXJhbSB7bWF0M30gbWF0IG1hdHJpeCB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgbWF0cml4XG4gKi9cbm1hdDMuc3RyID0gZnVuY3Rpb24gKGEpIHtcbiAgICByZXR1cm4gJ21hdDMoJyArIGFbMF0gKyAnLCAnICsgYVsxXSArICcsICcgKyBhWzJdICsgJywgJyArIFxuICAgICAgICAgICAgICAgICAgICBhWzNdICsgJywgJyArIGFbNF0gKyAnLCAnICsgYVs1XSArICcsICcgKyBcbiAgICAgICAgICAgICAgICAgICAgYVs2XSArICcsICcgKyBhWzddICsgJywgJyArIGFbOF0gKyAnKSc7XG59O1xuXG4vKipcbiAqIFJldHVybnMgRnJvYmVuaXVzIG5vcm0gb2YgYSBtYXQzXG4gKlxuICogQHBhcmFtIHttYXQzfSBhIHRoZSBtYXRyaXggdG8gY2FsY3VsYXRlIEZyb2Jlbml1cyBub3JtIG9mXG4gKiBAcmV0dXJucyB7TnVtYmVyfSBGcm9iZW5pdXMgbm9ybVxuICovXG5tYXQzLmZyb2IgPSBmdW5jdGlvbiAoYSkge1xuICAgIHJldHVybihNYXRoLnNxcnQoTWF0aC5wb3coYVswXSwgMikgKyBNYXRoLnBvdyhhWzFdLCAyKSArIE1hdGgucG93KGFbMl0sIDIpICsgTWF0aC5wb3coYVszXSwgMikgKyBNYXRoLnBvdyhhWzRdLCAyKSArIE1hdGgucG93KGFbNV0sIDIpICsgTWF0aC5wb3coYVs2XSwgMikgKyBNYXRoLnBvdyhhWzddLCAyKSArIE1hdGgucG93KGFbOF0sIDIpKSlcbn07XG5cblxuaWYodHlwZW9mKGV4cG9ydHMpICE9PSAndW5kZWZpbmVkJykge1xuICAgIGV4cG9ydHMubWF0MyA9IG1hdDM7XG59XG47XG4vKiBDb3B5cmlnaHQgKGMpIDIwMTMsIEJyYW5kb24gSm9uZXMsIENvbGluIE1hY0tlbnppZSBJVi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cblxuUmVkaXN0cmlidXRpb24gYW5kIHVzZSBpbiBzb3VyY2UgYW5kIGJpbmFyeSBmb3Jtcywgd2l0aCBvciB3aXRob3V0IG1vZGlmaWNhdGlvbixcbmFyZSBwZXJtaXR0ZWQgcHJvdmlkZWQgdGhhdCB0aGUgZm9sbG93aW5nIGNvbmRpdGlvbnMgYXJlIG1ldDpcblxuICAqIFJlZGlzdHJpYnV0aW9ucyBvZiBzb3VyY2UgY29kZSBtdXN0IHJldGFpbiB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSwgdGhpc1xuICAgIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyLlxuICAqIFJlZGlzdHJpYnV0aW9ucyBpbiBiaW5hcnkgZm9ybSBtdXN0IHJlcHJvZHVjZSB0aGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSxcbiAgICB0aGlzIGxpc3Qgb2YgY29uZGl0aW9ucyBhbmQgdGhlIGZvbGxvd2luZyBkaXNjbGFpbWVyIGluIHRoZSBkb2N1bWVudGF0aW9uIFxuICAgIGFuZC9vciBvdGhlciBtYXRlcmlhbHMgcHJvdmlkZWQgd2l0aCB0aGUgZGlzdHJpYnV0aW9uLlxuXG5USElTIFNPRlRXQVJFIElTIFBST1ZJREVEIEJZIFRIRSBDT1BZUklHSFQgSE9MREVSUyBBTkQgQ09OVFJJQlVUT1JTIFwiQVMgSVNcIiBBTkRcbkFOWSBFWFBSRVNTIE9SIElNUExJRUQgV0FSUkFOVElFUywgSU5DTFVESU5HLCBCVVQgTk9UIExJTUlURUQgVE8sIFRIRSBJTVBMSUVEXG5XQVJSQU5USUVTIE9GIE1FUkNIQU5UQUJJTElUWSBBTkQgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQVJFIFxuRElTQ0xBSU1FRC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFIENPUFlSSUdIVCBIT0xERVIgT1IgQ09OVFJJQlVUT1JTIEJFIExJQUJMRSBGT1JcbkFOWSBESVJFQ1QsIElORElSRUNULCBJTkNJREVOVEFMLCBTUEVDSUFMLCBFWEVNUExBUlksIE9SIENPTlNFUVVFTlRJQUwgREFNQUdFU1xuKElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBQUk9DVVJFTUVOVCBPRiBTVUJTVElUVVRFIEdPT0RTIE9SIFNFUlZJQ0VTO1xuTE9TUyBPRiBVU0UsIERBVEEsIE9SIFBST0ZJVFM7IE9SIEJVU0lORVNTIElOVEVSUlVQVElPTikgSE9XRVZFUiBDQVVTRUQgQU5EIE9OXG5BTlkgVEhFT1JZIE9GIExJQUJJTElUWSwgV0hFVEhFUiBJTiBDT05UUkFDVCwgU1RSSUNUIExJQUJJTElUWSwgT1IgVE9SVFxuKElOQ0xVRElORyBORUdMSUdFTkNFIE9SIE9USEVSV0lTRSkgQVJJU0lORyBJTiBBTlkgV0FZIE9VVCBPRiBUSEUgVVNFIE9GIFRISVNcblNPRlRXQVJFLCBFVkVOIElGIEFEVklTRUQgT0YgVEhFIFBPU1NJQklMSVRZIE9GIFNVQ0ggREFNQUdFLiAqL1xuXG4vKipcbiAqIEBjbGFzcyA0eDQgTWF0cml4XG4gKiBAbmFtZSBtYXQ0XG4gKi9cblxudmFyIG1hdDQgPSB7fTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGlkZW50aXR5IG1hdDRcbiAqXG4gKiBAcmV0dXJucyB7bWF0NH0gYSBuZXcgNHg0IG1hdHJpeFxuICovXG5tYXQ0LmNyZWF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSgxNik7XG4gICAgb3V0WzBdID0gMTtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IDE7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IDA7XG4gICAgb3V0WzldID0gMDtcbiAgICBvdXRbMTBdID0gMTtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gMDtcbiAgICBvdXRbMTVdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IG1hdDQgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyBtYXRyaXhcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgbWF0cml4IHRvIGNsb25lXG4gKiBAcmV0dXJucyB7bWF0NH0gYSBuZXcgNHg0IG1hdHJpeFxuICovXG5tYXQ0LmNsb25lID0gZnVuY3Rpb24oYSkge1xuICAgIHZhciBvdXQgPSBuZXcgR0xNQVRfQVJSQVlfVFlQRSgxNik7XG4gICAgb3V0WzBdID0gYVswXTtcbiAgICBvdXRbMV0gPSBhWzFdO1xuICAgIG91dFsyXSA9IGFbMl07XG4gICAgb3V0WzNdID0gYVszXTtcbiAgICBvdXRbNF0gPSBhWzRdO1xuICAgIG91dFs1XSA9IGFbNV07XG4gICAgb3V0WzZdID0gYVs2XTtcbiAgICBvdXRbN10gPSBhWzddO1xuICAgIG91dFs4XSA9IGFbOF07XG4gICAgb3V0WzldID0gYVs5XTtcbiAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgb3V0WzExXSA9IGFbMTFdO1xuICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICBvdXRbMTNdID0gYVsxM107XG4gICAgb3V0WzE0XSA9IGFbMTRdO1xuICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDb3B5IHRoZSB2YWx1ZXMgZnJvbSBvbmUgbWF0NCB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgc291cmNlIG1hdHJpeFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LmNvcHkgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSBhWzBdO1xuICAgIG91dFsxXSA9IGFbMV07XG4gICAgb3V0WzJdID0gYVsyXTtcbiAgICBvdXRbM10gPSBhWzNdO1xuICAgIG91dFs0XSA9IGFbNF07XG4gICAgb3V0WzVdID0gYVs1XTtcbiAgICBvdXRbNl0gPSBhWzZdO1xuICAgIG91dFs3XSA9IGFbN107XG4gICAgb3V0WzhdID0gYVs4XTtcbiAgICBvdXRbOV0gPSBhWzldO1xuICAgIG91dFsxMF0gPSBhWzEwXTtcbiAgICBvdXRbMTFdID0gYVsxMV07XG4gICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFNldCBhIG1hdDQgdG8gdGhlIGlkZW50aXR5IG1hdHJpeFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQuaWRlbnRpdHkgPSBmdW5jdGlvbihvdXQpIHtcbiAgICBvdXRbMF0gPSAxO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gMTtcbiAgICBvdXRbNl0gPSAwO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0gMDtcbiAgICBvdXRbOV0gPSAwO1xuICAgIG91dFsxMF0gPSAxO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAwO1xuICAgIG91dFsxNV0gPSAxO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFRyYW5zcG9zZSB0aGUgdmFsdWVzIG9mIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC50cmFuc3Bvc2UgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICAvLyBJZiB3ZSBhcmUgdHJhbnNwb3Npbmcgb3Vyc2VsdmVzIHdlIGNhbiBza2lwIGEgZmV3IHN0ZXBzIGJ1dCBoYXZlIHRvIGNhY2hlIHNvbWUgdmFsdWVzXG4gICAgaWYgKG91dCA9PT0gYSkge1xuICAgICAgICB2YXIgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgICAgIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgICAgICBhMjMgPSBhWzExXTtcblxuICAgICAgICBvdXRbMV0gPSBhWzRdO1xuICAgICAgICBvdXRbMl0gPSBhWzhdO1xuICAgICAgICBvdXRbM10gPSBhWzEyXTtcbiAgICAgICAgb3V0WzRdID0gYTAxO1xuICAgICAgICBvdXRbNl0gPSBhWzldO1xuICAgICAgICBvdXRbN10gPSBhWzEzXTtcbiAgICAgICAgb3V0WzhdID0gYTAyO1xuICAgICAgICBvdXRbOV0gPSBhMTI7XG4gICAgICAgIG91dFsxMV0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzEyXSA9IGEwMztcbiAgICAgICAgb3V0WzEzXSA9IGExMztcbiAgICAgICAgb3V0WzE0XSA9IGEyMztcbiAgICB9IGVsc2Uge1xuICAgICAgICBvdXRbMF0gPSBhWzBdO1xuICAgICAgICBvdXRbMV0gPSBhWzRdO1xuICAgICAgICBvdXRbMl0gPSBhWzhdO1xuICAgICAgICBvdXRbM10gPSBhWzEyXTtcbiAgICAgICAgb3V0WzRdID0gYVsxXTtcbiAgICAgICAgb3V0WzVdID0gYVs1XTtcbiAgICAgICAgb3V0WzZdID0gYVs5XTtcbiAgICAgICAgb3V0WzddID0gYVsxM107XG4gICAgICAgIG91dFs4XSA9IGFbMl07XG4gICAgICAgIG91dFs5XSA9IGFbNl07XG4gICAgICAgIG91dFsxMF0gPSBhWzEwXTtcbiAgICAgICAgb3V0WzExXSA9IGFbMTRdO1xuICAgICAgICBvdXRbMTJdID0gYVszXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbN107XG4gICAgICAgIG91dFsxNF0gPSBhWzExXTtcbiAgICAgICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIH1cbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBJbnZlcnRzIGEgbWF0NFxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5pbnZlcnQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgYTAwID0gYVswXSwgYTAxID0gYVsxXSwgYTAyID0gYVsyXSwgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSwgYTExID0gYVs1XSwgYTEyID0gYVs2XSwgYTEzID0gYVs3XSxcbiAgICAgICAgYTIwID0gYVs4XSwgYTIxID0gYVs5XSwgYTIyID0gYVsxMF0sIGEyMyA9IGFbMTFdLFxuICAgICAgICBhMzAgPSBhWzEyXSwgYTMxID0gYVsxM10sIGEzMiA9IGFbMTRdLCBhMzMgPSBhWzE1XSxcblxuICAgICAgICBiMDAgPSBhMDAgKiBhMTEgLSBhMDEgKiBhMTAsXG4gICAgICAgIGIwMSA9IGEwMCAqIGExMiAtIGEwMiAqIGExMCxcbiAgICAgICAgYjAyID0gYTAwICogYTEzIC0gYTAzICogYTEwLFxuICAgICAgICBiMDMgPSBhMDEgKiBhMTIgLSBhMDIgKiBhMTEsXG4gICAgICAgIGIwNCA9IGEwMSAqIGExMyAtIGEwMyAqIGExMSxcbiAgICAgICAgYjA1ID0gYTAyICogYTEzIC0gYTAzICogYTEyLFxuICAgICAgICBiMDYgPSBhMjAgKiBhMzEgLSBhMjEgKiBhMzAsXG4gICAgICAgIGIwNyA9IGEyMCAqIGEzMiAtIGEyMiAqIGEzMCxcbiAgICAgICAgYjA4ID0gYTIwICogYTMzIC0gYTIzICogYTMwLFxuICAgICAgICBiMDkgPSBhMjEgKiBhMzIgLSBhMjIgKiBhMzEsXG4gICAgICAgIGIxMCA9IGEyMSAqIGEzMyAtIGEyMyAqIGEzMSxcbiAgICAgICAgYjExID0gYTIyICogYTMzIC0gYTIzICogYTMyLFxuXG4gICAgICAgIC8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRcbiAgICAgICAgZGV0ID0gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xuXG4gICAgaWYgKCFkZXQpIHsgXG4gICAgICAgIHJldHVybiBudWxsOyBcbiAgICB9XG4gICAgZGV0ID0gMS4wIC8gZGV0O1xuXG4gICAgb3V0WzBdID0gKGExMSAqIGIxMSAtIGExMiAqIGIxMCArIGExMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzFdID0gKGEwMiAqIGIxMCAtIGEwMSAqIGIxMSAtIGEwMyAqIGIwOSkgKiBkZXQ7XG4gICAgb3V0WzJdID0gKGEzMSAqIGIwNSAtIGEzMiAqIGIwNCArIGEzMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzNdID0gKGEyMiAqIGIwNCAtIGEyMSAqIGIwNSAtIGEyMyAqIGIwMykgKiBkZXQ7XG4gICAgb3V0WzRdID0gKGExMiAqIGIwOCAtIGExMCAqIGIxMSAtIGExMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzVdID0gKGEwMCAqIGIxMSAtIGEwMiAqIGIwOCArIGEwMyAqIGIwNykgKiBkZXQ7XG4gICAgb3V0WzZdID0gKGEzMiAqIGIwMiAtIGEzMCAqIGIwNSAtIGEzMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzddID0gKGEyMCAqIGIwNSAtIGEyMiAqIGIwMiArIGEyMyAqIGIwMSkgKiBkZXQ7XG4gICAgb3V0WzhdID0gKGExMCAqIGIxMCAtIGExMSAqIGIwOCArIGExMyAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzldID0gKGEwMSAqIGIwOCAtIGEwMCAqIGIxMCAtIGEwMyAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzEwXSA9IChhMzAgKiBiMDQgLSBhMzEgKiBiMDIgKyBhMzMgKiBiMDApICogZGV0O1xuICAgIG91dFsxMV0gPSAoYTIxICogYjAyIC0gYTIwICogYjA0IC0gYTIzICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTJdID0gKGExMSAqIGIwNyAtIGExMCAqIGIwOSAtIGExMiAqIGIwNikgKiBkZXQ7XG4gICAgb3V0WzEzXSA9IChhMDAgKiBiMDkgLSBhMDEgKiBiMDcgKyBhMDIgKiBiMDYpICogZGV0O1xuICAgIG91dFsxNF0gPSAoYTMxICogYjAxIC0gYTMwICogYjAzIC0gYTMyICogYjAwKSAqIGRldDtcbiAgICBvdXRbMTVdID0gKGEyMCAqIGIwMyAtIGEyMSAqIGIwMSArIGEyMiAqIGIwMCkgKiBkZXQ7XG5cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBhZGp1Z2F0ZSBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBzb3VyY2UgbWF0cml4XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQuYWRqb2ludCA9IGZ1bmN0aW9uKG91dCwgYSkge1xuICAgIHZhciBhMDAgPSBhWzBdLCBhMDEgPSBhWzFdLCBhMDIgPSBhWzJdLCBhMDMgPSBhWzNdLFxuICAgICAgICBhMTAgPSBhWzRdLCBhMTEgPSBhWzVdLCBhMTIgPSBhWzZdLCBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLCBhMjEgPSBhWzldLCBhMjIgPSBhWzEwXSwgYTIzID0gYVsxMV0sXG4gICAgICAgIGEzMCA9IGFbMTJdLCBhMzEgPSBhWzEzXSwgYTMyID0gYVsxNF0sIGEzMyA9IGFbMTVdO1xuXG4gICAgb3V0WzBdICA9ICAoYTExICogKGEyMiAqIGEzMyAtIGEyMyAqIGEzMikgLSBhMjEgKiAoYTEyICogYTMzIC0gYTEzICogYTMyKSArIGEzMSAqIChhMTIgKiBhMjMgLSBhMTMgKiBhMjIpKTtcbiAgICBvdXRbMV0gID0gLShhMDEgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMSAqIChhMDIgKiBhMzMgLSBhMDMgKiBhMzIpICsgYTMxICogKGEwMiAqIGEyMyAtIGEwMyAqIGEyMikpO1xuICAgIG91dFsyXSAgPSAgKGEwMSAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpIC0gYTExICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzEgKiAoYTAyICogYTEzIC0gYTAzICogYTEyKSk7XG4gICAgb3V0WzNdICA9IC0oYTAxICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikgLSBhMTEgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSArIGEyMSAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbNF0gID0gLShhMTAgKiAoYTIyICogYTMzIC0gYTIzICogYTMyKSAtIGEyMCAqIChhMTIgKiBhMzMgLSBhMTMgKiBhMzIpICsgYTMwICogKGExMiAqIGEyMyAtIGExMyAqIGEyMikpO1xuICAgIG91dFs1XSAgPSAgKGEwMCAqIChhMjIgKiBhMzMgLSBhMjMgKiBhMzIpIC0gYTIwICogKGEwMiAqIGEzMyAtIGEwMyAqIGEzMikgKyBhMzAgKiAoYTAyICogYTIzIC0gYTAzICogYTIyKSk7XG4gICAgb3V0WzZdICA9IC0oYTAwICogKGExMiAqIGEzMyAtIGExMyAqIGEzMikgLSBhMTAgKiAoYTAyICogYTMzIC0gYTAzICogYTMyKSArIGEzMCAqIChhMDIgKiBhMTMgLSBhMDMgKiBhMTIpKTtcbiAgICBvdXRbN10gID0gIChhMDAgKiAoYTEyICogYTIzIC0gYTEzICogYTIyKSAtIGExMCAqIChhMDIgKiBhMjMgLSBhMDMgKiBhMjIpICsgYTIwICogKGEwMiAqIGExMyAtIGEwMyAqIGExMikpO1xuICAgIG91dFs4XSAgPSAgKGExMCAqIChhMjEgKiBhMzMgLSBhMjMgKiBhMzEpIC0gYTIwICogKGExMSAqIGEzMyAtIGExMyAqIGEzMSkgKyBhMzAgKiAoYTExICogYTIzIC0gYTEzICogYTIxKSk7XG4gICAgb3V0WzldICA9IC0oYTAwICogKGEyMSAqIGEzMyAtIGEyMyAqIGEzMSkgLSBhMjAgKiAoYTAxICogYTMzIC0gYTAzICogYTMxKSArIGEzMCAqIChhMDEgKiBhMjMgLSBhMDMgKiBhMjEpKTtcbiAgICBvdXRbMTBdID0gIChhMDAgKiAoYTExICogYTMzIC0gYTEzICogYTMxKSAtIGExMCAqIChhMDEgKiBhMzMgLSBhMDMgKiBhMzEpICsgYTMwICogKGEwMSAqIGExMyAtIGEwMyAqIGExMSkpO1xuICAgIG91dFsxMV0gPSAtKGEwMCAqIChhMTEgKiBhMjMgLSBhMTMgKiBhMjEpIC0gYTEwICogKGEwMSAqIGEyMyAtIGEwMyAqIGEyMSkgKyBhMjAgKiAoYTAxICogYTEzIC0gYTAzICogYTExKSk7XG4gICAgb3V0WzEyXSA9IC0oYTEwICogKGEyMSAqIGEzMiAtIGEyMiAqIGEzMSkgLSBhMjAgKiAoYTExICogYTMyIC0gYTEyICogYTMxKSArIGEzMCAqIChhMTEgKiBhMjIgLSBhMTIgKiBhMjEpKTtcbiAgICBvdXRbMTNdID0gIChhMDAgKiAoYTIxICogYTMyIC0gYTIyICogYTMxKSAtIGEyMCAqIChhMDEgKiBhMzIgLSBhMDIgKiBhMzEpICsgYTMwICogKGEwMSAqIGEyMiAtIGEwMiAqIGEyMSkpO1xuICAgIG91dFsxNF0gPSAtKGEwMCAqIChhMTEgKiBhMzIgLSBhMTIgKiBhMzEpIC0gYTEwICogKGEwMSAqIGEzMiAtIGEwMiAqIGEzMSkgKyBhMzAgKiAoYTAxICogYTEyIC0gYTAyICogYTExKSk7XG4gICAgb3V0WzE1XSA9ICAoYTAwICogKGExMSAqIGEyMiAtIGExMiAqIGEyMSkgLSBhMTAgKiAoYTAxICogYTIyIC0gYTAyICogYTIxKSArIGEyMCAqIChhMDEgKiBhMTIgLSBhMDIgKiBhMTEpKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBkZXRlcm1pbmFudCBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIHNvdXJjZSBtYXRyaXhcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGRldGVybWluYW50IG9mIGFcbiAqL1xubWF0NC5kZXRlcm1pbmFudCA9IGZ1bmN0aW9uIChhKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sIGExMSA9IGFbNV0sIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sIGEyMSA9IGFbOV0sIGEyMiA9IGFbMTBdLCBhMjMgPSBhWzExXSxcbiAgICAgICAgYTMwID0gYVsxMl0sIGEzMSA9IGFbMTNdLCBhMzIgPSBhWzE0XSwgYTMzID0gYVsxNV0sXG5cbiAgICAgICAgYjAwID0gYTAwICogYTExIC0gYTAxICogYTEwLFxuICAgICAgICBiMDEgPSBhMDAgKiBhMTIgLSBhMDIgKiBhMTAsXG4gICAgICAgIGIwMiA9IGEwMCAqIGExMyAtIGEwMyAqIGExMCxcbiAgICAgICAgYjAzID0gYTAxICogYTEyIC0gYTAyICogYTExLFxuICAgICAgICBiMDQgPSBhMDEgKiBhMTMgLSBhMDMgKiBhMTEsXG4gICAgICAgIGIwNSA9IGEwMiAqIGExMyAtIGEwMyAqIGExMixcbiAgICAgICAgYjA2ID0gYTIwICogYTMxIC0gYTIxICogYTMwLFxuICAgICAgICBiMDcgPSBhMjAgKiBhMzIgLSBhMjIgKiBhMzAsXG4gICAgICAgIGIwOCA9IGEyMCAqIGEzMyAtIGEyMyAqIGEzMCxcbiAgICAgICAgYjA5ID0gYTIxICogYTMyIC0gYTIyICogYTMxLFxuICAgICAgICBiMTAgPSBhMjEgKiBhMzMgLSBhMjMgKiBhMzEsXG4gICAgICAgIGIxMSA9IGEyMiAqIGEzMyAtIGEyMyAqIGEzMjtcblxuICAgIC8vIENhbGN1bGF0ZSB0aGUgZGV0ZXJtaW5hbnRcbiAgICByZXR1cm4gYjAwICogYjExIC0gYjAxICogYjEwICsgYjAyICogYjA5ICsgYjAzICogYjA4IC0gYjA0ICogYjA3ICsgYjA1ICogYjA2O1xufTtcblxuLyoqXG4gKiBNdWx0aXBsaWVzIHR3byBtYXQ0J3NcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBmaXJzdCBvcGVyYW5kXG4gKiBAcGFyYW0ge21hdDR9IGIgdGhlIHNlY29uZCBvcGVyYW5kXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQubXVsdGlwbHkgPSBmdW5jdGlvbiAob3V0LCBhLCBiKSB7XG4gICAgdmFyIGEwMCA9IGFbMF0sIGEwMSA9IGFbMV0sIGEwMiA9IGFbMl0sIGEwMyA9IGFbM10sXG4gICAgICAgIGExMCA9IGFbNF0sIGExMSA9IGFbNV0sIGExMiA9IGFbNl0sIGExMyA9IGFbN10sXG4gICAgICAgIGEyMCA9IGFbOF0sIGEyMSA9IGFbOV0sIGEyMiA9IGFbMTBdLCBhMjMgPSBhWzExXSxcbiAgICAgICAgYTMwID0gYVsxMl0sIGEzMSA9IGFbMTNdLCBhMzIgPSBhWzE0XSwgYTMzID0gYVsxNV07XG5cbiAgICAvLyBDYWNoZSBvbmx5IHRoZSBjdXJyZW50IGxpbmUgb2YgdGhlIHNlY29uZCBtYXRyaXhcbiAgICB2YXIgYjAgID0gYlswXSwgYjEgPSBiWzFdLCBiMiA9IGJbMl0sIGIzID0gYlszXTsgIFxuICAgIG91dFswXSA9IGIwKmEwMCArIGIxKmExMCArIGIyKmEyMCArIGIzKmEzMDtcbiAgICBvdXRbMV0gPSBiMCphMDEgKyBiMSphMTEgKyBiMiphMjEgKyBiMyphMzE7XG4gICAgb3V0WzJdID0gYjAqYTAyICsgYjEqYTEyICsgYjIqYTIyICsgYjMqYTMyO1xuICAgIG91dFszXSA9IGIwKmEwMyArIGIxKmExMyArIGIyKmEyMyArIGIzKmEzMztcblxuICAgIGIwID0gYls0XTsgYjEgPSBiWzVdOyBiMiA9IGJbNl07IGIzID0gYls3XTtcbiAgICBvdXRbNF0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzVdID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFs2XSA9IGIwKmEwMiArIGIxKmExMiArIGIyKmEyMiArIGIzKmEzMjtcbiAgICBvdXRbN10gPSBiMCphMDMgKyBiMSphMTMgKyBiMiphMjMgKyBiMyphMzM7XG5cbiAgICBiMCA9IGJbOF07IGIxID0gYls5XTsgYjIgPSBiWzEwXTsgYjMgPSBiWzExXTtcbiAgICBvdXRbOF0gPSBiMCphMDAgKyBiMSphMTAgKyBiMiphMjAgKyBiMyphMzA7XG4gICAgb3V0WzldID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFsxMF0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzExXSA9IGIwKmEwMyArIGIxKmExMyArIGIyKmEyMyArIGIzKmEzMztcblxuICAgIGIwID0gYlsxMl07IGIxID0gYlsxM107IGIyID0gYlsxNF07IGIzID0gYlsxNV07XG4gICAgb3V0WzEyXSA9IGIwKmEwMCArIGIxKmExMCArIGIyKmEyMCArIGIzKmEzMDtcbiAgICBvdXRbMTNdID0gYjAqYTAxICsgYjEqYTExICsgYjIqYTIxICsgYjMqYTMxO1xuICAgIG91dFsxNF0gPSBiMCphMDIgKyBiMSphMTIgKyBiMiphMjIgKyBiMyphMzI7XG4gICAgb3V0WzE1XSA9IGIwKmEwMyArIGIxKmExMyArIGIyKmEyMyArIGIzKmEzMztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIG1hdDQubXVsdGlwbHl9XG4gKiBAZnVuY3Rpb25cbiAqL1xubWF0NC5tdWwgPSBtYXQ0Lm11bHRpcGx5O1xuXG4vKipcbiAqIFRyYW5zbGF0ZSBhIG1hdDQgYnkgdGhlIGdpdmVuIHZlY3RvclxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byB0cmFuc2xhdGVcbiAqIEBwYXJhbSB7dmVjM30gdiB2ZWN0b3IgdG8gdHJhbnNsYXRlIGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQudHJhbnNsYXRlID0gZnVuY3Rpb24gKG91dCwgYSwgdikge1xuICAgIHZhciB4ID0gdlswXSwgeSA9IHZbMV0sIHogPSB2WzJdLFxuICAgICAgICBhMDAsIGEwMSwgYTAyLCBhMDMsXG4gICAgICAgIGExMCwgYTExLCBhMTIsIGExMyxcbiAgICAgICAgYTIwLCBhMjEsIGEyMiwgYTIzO1xuXG4gICAgaWYgKGEgPT09IG91dCkge1xuICAgICAgICBvdXRbMTJdID0gYVswXSAqIHggKyBhWzRdICogeSArIGFbOF0gKiB6ICsgYVsxMl07XG4gICAgICAgIG91dFsxM10gPSBhWzFdICogeCArIGFbNV0gKiB5ICsgYVs5XSAqIHogKyBhWzEzXTtcbiAgICAgICAgb3V0WzE0XSA9IGFbMl0gKiB4ICsgYVs2XSAqIHkgKyBhWzEwXSAqIHogKyBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGFbM10gKiB4ICsgYVs3XSAqIHkgKyBhWzExXSAqIHogKyBhWzE1XTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBhMDAgPSBhWzBdOyBhMDEgPSBhWzFdOyBhMDIgPSBhWzJdOyBhMDMgPSBhWzNdO1xuICAgICAgICBhMTAgPSBhWzRdOyBhMTEgPSBhWzVdOyBhMTIgPSBhWzZdOyBhMTMgPSBhWzddO1xuICAgICAgICBhMjAgPSBhWzhdOyBhMjEgPSBhWzldOyBhMjIgPSBhWzEwXTsgYTIzID0gYVsxMV07XG5cbiAgICAgICAgb3V0WzBdID0gYTAwOyBvdXRbMV0gPSBhMDE7IG91dFsyXSA9IGEwMjsgb3V0WzNdID0gYTAzO1xuICAgICAgICBvdXRbNF0gPSBhMTA7IG91dFs1XSA9IGExMTsgb3V0WzZdID0gYTEyOyBvdXRbN10gPSBhMTM7XG4gICAgICAgIG91dFs4XSA9IGEyMDsgb3V0WzldID0gYTIxOyBvdXRbMTBdID0gYTIyOyBvdXRbMTFdID0gYTIzO1xuXG4gICAgICAgIG91dFsxMl0gPSBhMDAgKiB4ICsgYTEwICogeSArIGEyMCAqIHogKyBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGEwMSAqIHggKyBhMTEgKiB5ICsgYTIxICogeiArIGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYTAyICogeCArIGExMiAqIHkgKyBhMjIgKiB6ICsgYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhMDMgKiB4ICsgYTEzICogeSArIGEyMyAqIHogKyBhWzE1XTtcbiAgICB9XG5cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTY2FsZXMgdGhlIG1hdDQgYnkgdGhlIGRpbWVuc2lvbnMgaW4gdGhlIGdpdmVuIHZlYzNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gc2NhbGVcbiAqIEBwYXJhbSB7dmVjM30gdiB0aGUgdmVjMyB0byBzY2FsZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKiovXG5tYXQ0LnNjYWxlID0gZnVuY3Rpb24ob3V0LCBhLCB2KSB7XG4gICAgdmFyIHggPSB2WzBdLCB5ID0gdlsxXSwgeiA9IHZbMl07XG5cbiAgICBvdXRbMF0gPSBhWzBdICogeDtcbiAgICBvdXRbMV0gPSBhWzFdICogeDtcbiAgICBvdXRbMl0gPSBhWzJdICogeDtcbiAgICBvdXRbM10gPSBhWzNdICogeDtcbiAgICBvdXRbNF0gPSBhWzRdICogeTtcbiAgICBvdXRbNV0gPSBhWzVdICogeTtcbiAgICBvdXRbNl0gPSBhWzZdICogeTtcbiAgICBvdXRbN10gPSBhWzddICogeTtcbiAgICBvdXRbOF0gPSBhWzhdICogejtcbiAgICBvdXRbOV0gPSBhWzldICogejtcbiAgICBvdXRbMTBdID0gYVsxMF0gKiB6O1xuICAgIG91dFsxMV0gPSBhWzExXSAqIHo7XG4gICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgIG91dFsxM10gPSBhWzEzXTtcbiAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXQ0IGJ5IHRoZSBnaXZlbiBhbmdsZVxuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcGFyYW0ge3ZlYzN9IGF4aXMgdGhlIGF4aXMgdG8gcm90YXRlIGFyb3VuZFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LnJvdGF0ZSA9IGZ1bmN0aW9uIChvdXQsIGEsIHJhZCwgYXhpcykge1xuICAgIHZhciB4ID0gYXhpc1swXSwgeSA9IGF4aXNbMV0sIHogPSBheGlzWzJdLFxuICAgICAgICBsZW4gPSBNYXRoLnNxcnQoeCAqIHggKyB5ICogeSArIHogKiB6KSxcbiAgICAgICAgcywgYywgdCxcbiAgICAgICAgYTAwLCBhMDEsIGEwMiwgYTAzLFxuICAgICAgICBhMTAsIGExMSwgYTEyLCBhMTMsXG4gICAgICAgIGEyMCwgYTIxLCBhMjIsIGEyMyxcbiAgICAgICAgYjAwLCBiMDEsIGIwMixcbiAgICAgICAgYjEwLCBiMTEsIGIxMixcbiAgICAgICAgYjIwLCBiMjEsIGIyMjtcblxuICAgIGlmIChNYXRoLmFicyhsZW4pIDwgR0xNQVRfRVBTSUxPTikgeyByZXR1cm4gbnVsbDsgfVxuICAgIFxuICAgIGxlbiA9IDEgLyBsZW47XG4gICAgeCAqPSBsZW47XG4gICAgeSAqPSBsZW47XG4gICAgeiAqPSBsZW47XG5cbiAgICBzID0gTWF0aC5zaW4ocmFkKTtcbiAgICBjID0gTWF0aC5jb3MocmFkKTtcbiAgICB0ID0gMSAtIGM7XG5cbiAgICBhMDAgPSBhWzBdOyBhMDEgPSBhWzFdOyBhMDIgPSBhWzJdOyBhMDMgPSBhWzNdO1xuICAgIGExMCA9IGFbNF07IGExMSA9IGFbNV07IGExMiA9IGFbNl07IGExMyA9IGFbN107XG4gICAgYTIwID0gYVs4XTsgYTIxID0gYVs5XTsgYTIyID0gYVsxMF07IGEyMyA9IGFbMTFdO1xuXG4gICAgLy8gQ29uc3RydWN0IHRoZSBlbGVtZW50cyBvZiB0aGUgcm90YXRpb24gbWF0cml4XG4gICAgYjAwID0geCAqIHggKiB0ICsgYzsgYjAxID0geSAqIHggKiB0ICsgeiAqIHM7IGIwMiA9IHogKiB4ICogdCAtIHkgKiBzO1xuICAgIGIxMCA9IHggKiB5ICogdCAtIHogKiBzOyBiMTEgPSB5ICogeSAqIHQgKyBjOyBiMTIgPSB6ICogeSAqIHQgKyB4ICogcztcbiAgICBiMjAgPSB4ICogeiAqIHQgKyB5ICogczsgYjIxID0geSAqIHogKiB0IC0geCAqIHM7IGIyMiA9IHogKiB6ICogdCArIGM7XG5cbiAgICAvLyBQZXJmb3JtIHJvdGF0aW9uLXNwZWNpZmljIG1hdHJpeCBtdWx0aXBsaWNhdGlvblxuICAgIG91dFswXSA9IGEwMCAqIGIwMCArIGExMCAqIGIwMSArIGEyMCAqIGIwMjtcbiAgICBvdXRbMV0gPSBhMDEgKiBiMDAgKyBhMTEgKiBiMDEgKyBhMjEgKiBiMDI7XG4gICAgb3V0WzJdID0gYTAyICogYjAwICsgYTEyICogYjAxICsgYTIyICogYjAyO1xuICAgIG91dFszXSA9IGEwMyAqIGIwMCArIGExMyAqIGIwMSArIGEyMyAqIGIwMjtcbiAgICBvdXRbNF0gPSBhMDAgKiBiMTAgKyBhMTAgKiBiMTEgKyBhMjAgKiBiMTI7XG4gICAgb3V0WzVdID0gYTAxICogYjEwICsgYTExICogYjExICsgYTIxICogYjEyO1xuICAgIG91dFs2XSA9IGEwMiAqIGIxMCArIGExMiAqIGIxMSArIGEyMiAqIGIxMjtcbiAgICBvdXRbN10gPSBhMDMgKiBiMTAgKyBhMTMgKiBiMTEgKyBhMjMgKiBiMTI7XG4gICAgb3V0WzhdID0gYTAwICogYjIwICsgYTEwICogYjIxICsgYTIwICogYjIyO1xuICAgIG91dFs5XSA9IGEwMSAqIGIyMCArIGExMSAqIGIyMSArIGEyMSAqIGIyMjtcbiAgICBvdXRbMTBdID0gYTAyICogYjIwICsgYTEyICogYjIxICsgYTIyICogYjIyO1xuICAgIG91dFsxMV0gPSBhMDMgKiBiMjAgKyBhMTMgKiBiMjEgKyBhMjMgKiBiMjI7XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIGxhc3Qgcm93XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUm90YXRlcyBhIG1hdHJpeCBieSB0aGUgZ2l2ZW4gYW5nbGUgYXJvdW5kIHRoZSBYIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCB0aGUgcmVjZWl2aW5nIG1hdHJpeFxuICogQHBhcmFtIHttYXQ0fSBhIHRoZSBtYXRyaXggdG8gcm90YXRlXG4gKiBAcGFyYW0ge051bWJlcn0gcmFkIHRoZSBhbmdsZSB0byByb3RhdGUgdGhlIG1hdHJpeCBieVxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LnJvdGF0ZVggPSBmdW5jdGlvbiAob3V0LCBhLCByYWQpIHtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCksXG4gICAgICAgIGMgPSBNYXRoLmNvcyhyYWQpLFxuICAgICAgICBhMTAgPSBhWzRdLFxuICAgICAgICBhMTEgPSBhWzVdLFxuICAgICAgICBhMTIgPSBhWzZdLFxuICAgICAgICBhMTMgPSBhWzddLFxuICAgICAgICBhMjAgPSBhWzhdLFxuICAgICAgICBhMjEgPSBhWzldLFxuICAgICAgICBhMjIgPSBhWzEwXSxcbiAgICAgICAgYTIzID0gYVsxMV07XG5cbiAgICBpZiAoYSAhPT0gb3V0KSB7IC8vIElmIHRoZSBzb3VyY2UgYW5kIGRlc3RpbmF0aW9uIGRpZmZlciwgY29weSB0aGUgdW5jaGFuZ2VkIHJvd3NcbiAgICAgICAgb3V0WzBdICA9IGFbMF07XG4gICAgICAgIG91dFsxXSAgPSBhWzFdO1xuICAgICAgICBvdXRbMl0gID0gYVsyXTtcbiAgICAgICAgb3V0WzNdICA9IGFbM107XG4gICAgICAgIG91dFsxMl0gPSBhWzEyXTtcbiAgICAgICAgb3V0WzEzXSA9IGFbMTNdO1xuICAgICAgICBvdXRbMTRdID0gYVsxNF07XG4gICAgICAgIG91dFsxNV0gPSBhWzE1XTtcbiAgICB9XG5cbiAgICAvLyBQZXJmb3JtIGF4aXMtc3BlY2lmaWMgbWF0cml4IG11bHRpcGxpY2F0aW9uXG4gICAgb3V0WzRdID0gYTEwICogYyArIGEyMCAqIHM7XG4gICAgb3V0WzVdID0gYTExICogYyArIGEyMSAqIHM7XG4gICAgb3V0WzZdID0gYTEyICogYyArIGEyMiAqIHM7XG4gICAgb3V0WzddID0gYTEzICogYyArIGEyMyAqIHM7XG4gICAgb3V0WzhdID0gYTIwICogYyAtIGExMCAqIHM7XG4gICAgb3V0WzldID0gYTIxICogYyAtIGExMSAqIHM7XG4gICAgb3V0WzEwXSA9IGEyMiAqIGMgLSBhMTIgKiBzO1xuICAgIG91dFsxMV0gPSBhMjMgKiBjIC0gYTEzICogcztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgbWF0cml4IGJ5IHRoZSBnaXZlbiBhbmdsZSBhcm91bmQgdGhlIFkgYXhpc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IHRoZSByZWNlaXZpbmcgbWF0cml4XG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byByb3RhdGVcbiAqIEBwYXJhbSB7TnVtYmVyfSByYWQgdGhlIGFuZ2xlIHRvIHJvdGF0ZSB0aGUgbWF0cml4IGJ5XG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQucm90YXRlWSA9IGZ1bmN0aW9uIChvdXQsIGEsIHJhZCkge1xuICAgIHZhciBzID0gTWF0aC5zaW4ocmFkKSxcbiAgICAgICAgYyA9IE1hdGguY29zKHJhZCksXG4gICAgICAgIGEwMCA9IGFbMF0sXG4gICAgICAgIGEwMSA9IGFbMV0sXG4gICAgICAgIGEwMiA9IGFbMl0sXG4gICAgICAgIGEwMyA9IGFbM10sXG4gICAgICAgIGEyMCA9IGFbOF0sXG4gICAgICAgIGEyMSA9IGFbOV0sXG4gICAgICAgIGEyMiA9IGFbMTBdLFxuICAgICAgICBhMjMgPSBhWzExXTtcblxuICAgIGlmIChhICE9PSBvdXQpIHsgLy8gSWYgdGhlIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gZGlmZmVyLCBjb3B5IHRoZSB1bmNoYW5nZWQgcm93c1xuICAgICAgICBvdXRbNF0gID0gYVs0XTtcbiAgICAgICAgb3V0WzVdICA9IGFbNV07XG4gICAgICAgIG91dFs2XSAgPSBhWzZdO1xuICAgICAgICBvdXRbN10gID0gYVs3XTtcbiAgICAgICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIH1cblxuICAgIC8vIFBlcmZvcm0gYXhpcy1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbMF0gPSBhMDAgKiBjIC0gYTIwICogcztcbiAgICBvdXRbMV0gPSBhMDEgKiBjIC0gYTIxICogcztcbiAgICBvdXRbMl0gPSBhMDIgKiBjIC0gYTIyICogcztcbiAgICBvdXRbM10gPSBhMDMgKiBjIC0gYTIzICogcztcbiAgICBvdXRbOF0gPSBhMDAgKiBzICsgYTIwICogYztcbiAgICBvdXRbOV0gPSBhMDEgKiBzICsgYTIxICogYztcbiAgICBvdXRbMTBdID0gYTAyICogcyArIGEyMiAqIGM7XG4gICAgb3V0WzExXSA9IGEwMyAqIHMgKyBhMjMgKiBjO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIFJvdGF0ZXMgYSBtYXRyaXggYnkgdGhlIGdpdmVuIGFuZ2xlIGFyb3VuZCB0aGUgWiBheGlzXG4gKlxuICogQHBhcmFtIHttYXQ0fSBvdXQgdGhlIHJlY2VpdmluZyBtYXRyaXhcbiAqIEBwYXJhbSB7bWF0NH0gYSB0aGUgbWF0cml4IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgdG8gcm90YXRlIHRoZSBtYXRyaXggYnlcbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5yb3RhdGVaID0gZnVuY3Rpb24gKG91dCwgYSwgcmFkKSB7XG4gICAgdmFyIHMgPSBNYXRoLnNpbihyYWQpLFxuICAgICAgICBjID0gTWF0aC5jb3MocmFkKSxcbiAgICAgICAgYTAwID0gYVswXSxcbiAgICAgICAgYTAxID0gYVsxXSxcbiAgICAgICAgYTAyID0gYVsyXSxcbiAgICAgICAgYTAzID0gYVszXSxcbiAgICAgICAgYTEwID0gYVs0XSxcbiAgICAgICAgYTExID0gYVs1XSxcbiAgICAgICAgYTEyID0gYVs2XSxcbiAgICAgICAgYTEzID0gYVs3XTtcblxuICAgIGlmIChhICE9PSBvdXQpIHsgLy8gSWYgdGhlIHNvdXJjZSBhbmQgZGVzdGluYXRpb24gZGlmZmVyLCBjb3B5IHRoZSB1bmNoYW5nZWQgbGFzdCByb3dcbiAgICAgICAgb3V0WzhdICA9IGFbOF07XG4gICAgICAgIG91dFs5XSAgPSBhWzldO1xuICAgICAgICBvdXRbMTBdID0gYVsxMF07XG4gICAgICAgIG91dFsxMV0gPSBhWzExXTtcbiAgICAgICAgb3V0WzEyXSA9IGFbMTJdO1xuICAgICAgICBvdXRbMTNdID0gYVsxM107XG4gICAgICAgIG91dFsxNF0gPSBhWzE0XTtcbiAgICAgICAgb3V0WzE1XSA9IGFbMTVdO1xuICAgIH1cblxuICAgIC8vIFBlcmZvcm0gYXhpcy1zcGVjaWZpYyBtYXRyaXggbXVsdGlwbGljYXRpb25cbiAgICBvdXRbMF0gPSBhMDAgKiBjICsgYTEwICogcztcbiAgICBvdXRbMV0gPSBhMDEgKiBjICsgYTExICogcztcbiAgICBvdXRbMl0gPSBhMDIgKiBjICsgYTEyICogcztcbiAgICBvdXRbM10gPSBhMDMgKiBjICsgYTEzICogcztcbiAgICBvdXRbNF0gPSBhMTAgKiBjIC0gYTAwICogcztcbiAgICBvdXRbNV0gPSBhMTEgKiBjIC0gYTAxICogcztcbiAgICBvdXRbNl0gPSBhMTIgKiBjIC0gYTAyICogcztcbiAgICBvdXRbN10gPSBhMTMgKiBjIC0gYTAzICogcztcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbWF0cml4IGZyb20gYSBxdWF0ZXJuaW9uIHJvdGF0aW9uIGFuZCB2ZWN0b3IgdHJhbnNsYXRpb25cbiAqIFRoaXMgaXMgZXF1aXZhbGVudCB0byAoYnV0IG11Y2ggZmFzdGVyIHRoYW4pOlxuICpcbiAqICAgICBtYXQ0LmlkZW50aXR5KGRlc3QpO1xuICogICAgIG1hdDQudHJhbnNsYXRlKGRlc3QsIHZlYyk7XG4gKiAgICAgdmFyIHF1YXRNYXQgPSBtYXQ0LmNyZWF0ZSgpO1xuICogICAgIHF1YXQ0LnRvTWF0NChxdWF0LCBxdWF0TWF0KTtcbiAqICAgICBtYXQ0Lm11bHRpcGx5KGRlc3QsIHF1YXRNYXQpO1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiAqIEBwYXJhbSB7cXVhdDR9IHEgUm90YXRpb24gcXVhdGVybmlvblxuICogQHBhcmFtIHt2ZWMzfSB2IFRyYW5zbGF0aW9uIHZlY3RvclxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0LmZyb21Sb3RhdGlvblRyYW5zbGF0aW9uID0gZnVuY3Rpb24gKG91dCwgcSwgdikge1xuICAgIC8vIFF1YXRlcm5pb24gbWF0aFxuICAgIHZhciB4ID0gcVswXSwgeSA9IHFbMV0sIHogPSBxWzJdLCB3ID0gcVszXSxcbiAgICAgICAgeDIgPSB4ICsgeCxcbiAgICAgICAgeTIgPSB5ICsgeSxcbiAgICAgICAgejIgPSB6ICsgeixcblxuICAgICAgICB4eCA9IHggKiB4MixcbiAgICAgICAgeHkgPSB4ICogeTIsXG4gICAgICAgIHh6ID0geCAqIHoyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgeXogPSB5ICogejIsXG4gICAgICAgIHp6ID0geiAqIHoyLFxuICAgICAgICB3eCA9IHcgKiB4MixcbiAgICAgICAgd3kgPSB3ICogeTIsXG4gICAgICAgIHd6ID0gdyAqIHoyO1xuXG4gICAgb3V0WzBdID0gMSAtICh5eSArIHp6KTtcbiAgICBvdXRbMV0gPSB4eSArIHd6O1xuICAgIG91dFsyXSA9IHh6IC0gd3k7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSB4eSAtIHd6O1xuICAgIG91dFs1XSA9IDEgLSAoeHggKyB6eik7XG4gICAgb3V0WzZdID0geXogKyB3eDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IHh6ICsgd3k7XG4gICAgb3V0WzldID0geXogLSB3eDtcbiAgICBvdXRbMTBdID0gMSAtICh4eCArIHl5KTtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gdlswXTtcbiAgICBvdXRbMTNdID0gdlsxXTtcbiAgICBvdXRbMTRdID0gdlsyXTtcbiAgICBvdXRbMTVdID0gMTtcbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTtcblxubWF0NC5mcm9tUXVhdCA9IGZ1bmN0aW9uIChvdXQsIHEpIHtcbiAgICB2YXIgeCA9IHFbMF0sIHkgPSBxWzFdLCB6ID0gcVsyXSwgdyA9IHFbM10sXG4gICAgICAgIHgyID0geCArIHgsXG4gICAgICAgIHkyID0geSArIHksXG4gICAgICAgIHoyID0geiArIHosXG5cbiAgICAgICAgeHggPSB4ICogeDIsXG4gICAgICAgIHl4ID0geSAqIHgyLFxuICAgICAgICB5eSA9IHkgKiB5MixcbiAgICAgICAgenggPSB6ICogeDIsXG4gICAgICAgIHp5ID0geiAqIHkyLFxuICAgICAgICB6eiA9IHogKiB6MixcbiAgICAgICAgd3ggPSB3ICogeDIsXG4gICAgICAgIHd5ID0gdyAqIHkyLFxuICAgICAgICB3eiA9IHcgKiB6MjtcblxuICAgIG91dFswXSA9IDEgLSB5eSAtIHp6O1xuICAgIG91dFsxXSA9IHl4ICsgd3o7XG4gICAgb3V0WzJdID0genggLSB3eTtcbiAgICBvdXRbM10gPSAwO1xuXG4gICAgb3V0WzRdID0geXggLSB3ejtcbiAgICBvdXRbNV0gPSAxIC0geHggLSB6ejtcbiAgICBvdXRbNl0gPSB6eSArIHd4O1xuICAgIG91dFs3XSA9IDA7XG5cbiAgICBvdXRbOF0gPSB6eCArIHd5O1xuICAgIG91dFs5XSA9IHp5IC0gd3g7XG4gICAgb3V0WzEwXSA9IDEgLSB4eCAtIHl5O1xuICAgIG91dFsxMV0gPSAwO1xuXG4gICAgb3V0WzEyXSA9IDA7XG4gICAgb3V0WzEzXSA9IDA7XG4gICAgb3V0WzE0XSA9IDA7XG4gICAgb3V0WzE1XSA9IDE7XG5cbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSBmcnVzdHVtIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge051bWJlcn0gbGVmdCBMZWZ0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gcmlnaHQgUmlnaHQgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7TnVtYmVyfSBib3R0b20gQm90dG9tIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge051bWJlcn0gdG9wIFRvcCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IG5lYXIgTmVhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtOdW1iZXJ9IGZhciBGYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5mcnVzdHVtID0gZnVuY3Rpb24gKG91dCwgbGVmdCwgcmlnaHQsIGJvdHRvbSwgdG9wLCBuZWFyLCBmYXIpIHtcbiAgICB2YXIgcmwgPSAxIC8gKHJpZ2h0IC0gbGVmdCksXG4gICAgICAgIHRiID0gMSAvICh0b3AgLSBib3R0b20pLFxuICAgICAgICBuZiA9IDEgLyAobmVhciAtIGZhcik7XG4gICAgb3V0WzBdID0gKG5lYXIgKiAyKSAqIHJsO1xuICAgIG91dFsxXSA9IDA7XG4gICAgb3V0WzJdID0gMDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IDA7XG4gICAgb3V0WzVdID0gKG5lYXIgKiAyKSAqIHRiO1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAocmlnaHQgKyBsZWZ0KSAqIHJsO1xuICAgIG91dFs5XSA9ICh0b3AgKyBib3R0b20pICogdGI7XG4gICAgb3V0WzEwXSA9IChmYXIgKyBuZWFyKSAqIG5mO1xuICAgIG91dFsxMV0gPSAtMTtcbiAgICBvdXRbMTJdID0gMDtcbiAgICBvdXRbMTNdID0gMDtcbiAgICBvdXRbMTRdID0gKGZhciAqIG5lYXIgKiAyKSAqIG5mO1xuICAgIG91dFsxNV0gPSAwO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIEdlbmVyYXRlcyBhIHBlcnNwZWN0aXZlIHByb2plY3Rpb24gbWF0cml4IHdpdGggdGhlIGdpdmVuIGJvdW5kc1xuICpcbiAqIEBwYXJhbSB7bWF0NH0gb3V0IG1hdDQgZnJ1c3R1bSBtYXRyaXggd2lsbCBiZSB3cml0dGVuIGludG9cbiAqIEBwYXJhbSB7bnVtYmVyfSBmb3Z5IFZlcnRpY2FsIGZpZWxkIG9mIHZpZXcgaW4gcmFkaWFuc1xuICogQHBhcmFtIHtudW1iZXJ9IGFzcGVjdCBBc3BlY3QgcmF0aW8uIHR5cGljYWxseSB2aWV3cG9ydCB3aWR0aC9oZWlnaHRcbiAqIEBwYXJhbSB7bnVtYmVyfSBuZWFyIE5lYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBmYXIgRmFyIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcmV0dXJucyB7bWF0NH0gb3V0XG4gKi9cbm1hdDQucGVyc3BlY3RpdmUgPSBmdW5jdGlvbiAob3V0LCBmb3Z5LCBhc3BlY3QsIG5lYXIsIGZhcikge1xuICAgIHZhciBmID0gMS4wIC8gTWF0aC50YW4oZm92eSAvIDIpLFxuICAgICAgICBuZiA9IDEgLyAobmVhciAtIGZhcik7XG4gICAgb3V0WzBdID0gZiAvIGFzcGVjdDtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMDtcbiAgICBvdXRbNF0gPSAwO1xuICAgIG91dFs1XSA9IGY7XG4gICAgb3V0WzZdID0gMDtcbiAgICBvdXRbN10gPSAwO1xuICAgIG91dFs4XSA9IDA7XG4gICAgb3V0WzldID0gMDtcbiAgICBvdXRbMTBdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzExXSA9IC0xO1xuICAgIG91dFsxMl0gPSAwO1xuICAgIG91dFsxM10gPSAwO1xuICAgIG91dFsxNF0gPSAoMiAqIGZhciAqIG5lYXIpICogbmY7XG4gICAgb3V0WzE1XSA9IDA7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgb3J0aG9nb25hbCBwcm9qZWN0aW9uIG1hdHJpeCB3aXRoIHRoZSBnaXZlbiBib3VuZHNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge251bWJlcn0gbGVmdCBMZWZ0IGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gcmlnaHQgUmlnaHQgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEBwYXJhbSB7bnVtYmVyfSBib3R0b20gQm90dG9tIGJvdW5kIG9mIHRoZSBmcnVzdHVtXG4gKiBAcGFyYW0ge251bWJlcn0gdG9wIFRvcCBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IG5lYXIgTmVhciBib3VuZCBvZiB0aGUgZnJ1c3R1bVxuICogQHBhcmFtIHtudW1iZXJ9IGZhciBGYXIgYm91bmQgb2YgdGhlIGZydXN0dW1cbiAqIEByZXR1cm5zIHttYXQ0fSBvdXRcbiAqL1xubWF0NC5vcnRobyA9IGZ1bmN0aW9uIChvdXQsIGxlZnQsIHJpZ2h0LCBib3R0b20sIHRvcCwgbmVhciwgZmFyKSB7XG4gICAgdmFyIGxyID0gMSAvIChsZWZ0IC0gcmlnaHQpLFxuICAgICAgICBidCA9IDEgLyAoYm90dG9tIC0gdG9wKSxcbiAgICAgICAgbmYgPSAxIC8gKG5lYXIgLSBmYXIpO1xuICAgIG91dFswXSA9IC0yICogbHI7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDA7XG4gICAgb3V0WzRdID0gMDtcbiAgICBvdXRbNV0gPSAtMiAqIGJ0O1xuICAgIG91dFs2XSA9IDA7XG4gICAgb3V0WzddID0gMDtcbiAgICBvdXRbOF0gPSAwO1xuICAgIG91dFs5XSA9IDA7XG4gICAgb3V0WzEwXSA9IDIgKiBuZjtcbiAgICBvdXRbMTFdID0gMDtcbiAgICBvdXRbMTJdID0gKGxlZnQgKyByaWdodCkgKiBscjtcbiAgICBvdXRbMTNdID0gKHRvcCArIGJvdHRvbSkgKiBidDtcbiAgICBvdXRbMTRdID0gKGZhciArIG5lYXIpICogbmY7XG4gICAgb3V0WzE1XSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogR2VuZXJhdGVzIGEgbG9vay1hdCBtYXRyaXggd2l0aCB0aGUgZ2l2ZW4gZXllIHBvc2l0aW9uLCBmb2NhbCBwb2ludCwgYW5kIHVwIGF4aXNcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG91dCBtYXQ0IGZydXN0dW0gbWF0cml4IHdpbGwgYmUgd3JpdHRlbiBpbnRvXG4gKiBAcGFyYW0ge3ZlYzN9IGV5ZSBQb3NpdGlvbiBvZiB0aGUgdmlld2VyXG4gKiBAcGFyYW0ge3ZlYzN9IGNlbnRlciBQb2ludCB0aGUgdmlld2VyIGlzIGxvb2tpbmcgYXRcbiAqIEBwYXJhbSB7dmVjM30gdXAgdmVjMyBwb2ludGluZyB1cFxuICogQHJldHVybnMge21hdDR9IG91dFxuICovXG5tYXQ0Lmxvb2tBdCA9IGZ1bmN0aW9uIChvdXQsIGV5ZSwgY2VudGVyLCB1cCkge1xuICAgIHZhciB4MCwgeDEsIHgyLCB5MCwgeTEsIHkyLCB6MCwgejEsIHoyLCBsZW4sXG4gICAgICAgIGV5ZXggPSBleWVbMF0sXG4gICAgICAgIGV5ZXkgPSBleWVbMV0sXG4gICAgICAgIGV5ZXogPSBleWVbMl0sXG4gICAgICAgIHVweCA9IHVwWzBdLFxuICAgICAgICB1cHkgPSB1cFsxXSxcbiAgICAgICAgdXB6ID0gdXBbMl0sXG4gICAgICAgIGNlbnRlcnggPSBjZW50ZXJbMF0sXG4gICAgICAgIGNlbnRlcnkgPSBjZW50ZXJbMV0sXG4gICAgICAgIGNlbnRlcnogPSBjZW50ZXJbMl07XG5cbiAgICBpZiAoTWF0aC5hYnMoZXlleCAtIGNlbnRlcngpIDwgR0xNQVRfRVBTSUxPTiAmJlxuICAgICAgICBNYXRoLmFicyhleWV5IC0gY2VudGVyeSkgPCBHTE1BVF9FUFNJTE9OICYmXG4gICAgICAgIE1hdGguYWJzKGV5ZXogLSBjZW50ZXJ6KSA8IEdMTUFUX0VQU0lMT04pIHtcbiAgICAgICAgcmV0dXJuIG1hdDQuaWRlbnRpdHkob3V0KTtcbiAgICB9XG5cbiAgICB6MCA9IGV5ZXggLSBjZW50ZXJ4O1xuICAgIHoxID0gZXlleSAtIGNlbnRlcnk7XG4gICAgejIgPSBleWV6IC0gY2VudGVyejtcblxuICAgIGxlbiA9IDEgLyBNYXRoLnNxcnQoejAgKiB6MCArIHoxICogejEgKyB6MiAqIHoyKTtcbiAgICB6MCAqPSBsZW47XG4gICAgejEgKj0gbGVuO1xuICAgIHoyICo9IGxlbjtcblxuICAgIHgwID0gdXB5ICogejIgLSB1cHogKiB6MTtcbiAgICB4MSA9IHVweiAqIHowIC0gdXB4ICogejI7XG4gICAgeDIgPSB1cHggKiB6MSAtIHVweSAqIHowO1xuICAgIGxlbiA9IE1hdGguc3FydCh4MCAqIHgwICsgeDEgKiB4MSArIHgyICogeDIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHgwID0gMDtcbiAgICAgICAgeDEgPSAwO1xuICAgICAgICB4MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeDAgKj0gbGVuO1xuICAgICAgICB4MSAqPSBsZW47XG4gICAgICAgIHgyICo9IGxlbjtcbiAgICB9XG5cbiAgICB5MCA9IHoxICogeDIgLSB6MiAqIHgxO1xuICAgIHkxID0gejIgKiB4MCAtIHowICogeDI7XG4gICAgeTIgPSB6MCAqIHgxIC0gejEgKiB4MDtcblxuICAgIGxlbiA9IE1hdGguc3FydCh5MCAqIHkwICsgeTEgKiB5MSArIHkyICogeTIpO1xuICAgIGlmICghbGVuKSB7XG4gICAgICAgIHkwID0gMDtcbiAgICAgICAgeTEgPSAwO1xuICAgICAgICB5MiA9IDA7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgbGVuID0gMSAvIGxlbjtcbiAgICAgICAgeTAgKj0gbGVuO1xuICAgICAgICB5MSAqPSBsZW47XG4gICAgICAgIHkyICo9IGxlbjtcbiAgICB9XG5cbiAgICBvdXRbMF0gPSB4MDtcbiAgICBvdXRbMV0gPSB5MDtcbiAgICBvdXRbMl0gPSB6MDtcbiAgICBvdXRbM10gPSAwO1xuICAgIG91dFs0XSA9IHgxO1xuICAgIG91dFs1XSA9IHkxO1xuICAgIG91dFs2XSA9IHoxO1xuICAgIG91dFs3XSA9IDA7XG4gICAgb3V0WzhdID0geDI7XG4gICAgb3V0WzldID0geTI7XG4gICAgb3V0WzEwXSA9IHoyO1xuICAgIG91dFsxMV0gPSAwO1xuICAgIG91dFsxMl0gPSAtKHgwICogZXlleCArIHgxICogZXlleSArIHgyICogZXlleik7XG4gICAgb3V0WzEzXSA9IC0oeTAgKiBleWV4ICsgeTEgKiBleWV5ICsgeTIgKiBleWV6KTtcbiAgICBvdXRbMTRdID0gLSh6MCAqIGV5ZXggKyB6MSAqIGV5ZXkgKyB6MiAqIGV5ZXopO1xuICAgIG91dFsxNV0gPSAxO1xuXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IG1hdCBtYXRyaXggdG8gcmVwcmVzZW50IGFzIGEgc3RyaW5nXG4gKiBAcmV0dXJucyB7U3RyaW5nfSBzdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG1hdHJpeFxuICovXG5tYXQ0LnN0ciA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuICdtYXQ0KCcgKyBhWzBdICsgJywgJyArIGFbMV0gKyAnLCAnICsgYVsyXSArICcsICcgKyBhWzNdICsgJywgJyArXG4gICAgICAgICAgICAgICAgICAgIGFbNF0gKyAnLCAnICsgYVs1XSArICcsICcgKyBhWzZdICsgJywgJyArIGFbN10gKyAnLCAnICtcbiAgICAgICAgICAgICAgICAgICAgYVs4XSArICcsICcgKyBhWzldICsgJywgJyArIGFbMTBdICsgJywgJyArIGFbMTFdICsgJywgJyArIFxuICAgICAgICAgICAgICAgICAgICBhWzEyXSArICcsICcgKyBhWzEzXSArICcsICcgKyBhWzE0XSArICcsICcgKyBhWzE1XSArICcpJztcbn07XG5cbi8qKlxuICogUmV0dXJucyBGcm9iZW5pdXMgbm9ybSBvZiBhIG1hdDRcbiAqXG4gKiBAcGFyYW0ge21hdDR9IGEgdGhlIG1hdHJpeCB0byBjYWxjdWxhdGUgRnJvYmVuaXVzIG5vcm0gb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IEZyb2Jlbml1cyBub3JtXG4gKi9cbm1hdDQuZnJvYiA9IGZ1bmN0aW9uIChhKSB7XG4gICAgcmV0dXJuKE1hdGguc3FydChNYXRoLnBvdyhhWzBdLCAyKSArIE1hdGgucG93KGFbMV0sIDIpICsgTWF0aC5wb3coYVsyXSwgMikgKyBNYXRoLnBvdyhhWzNdLCAyKSArIE1hdGgucG93KGFbNF0sIDIpICsgTWF0aC5wb3coYVs1XSwgMikgKyBNYXRoLnBvdyhhWzZdLCAyKSArIE1hdGgucG93KGFbNl0sIDIpICsgTWF0aC5wb3coYVs3XSwgMikgKyBNYXRoLnBvdyhhWzhdLCAyKSArIE1hdGgucG93KGFbOV0sIDIpICsgTWF0aC5wb3coYVsxMF0sIDIpICsgTWF0aC5wb3coYVsxMV0sIDIpICsgTWF0aC5wb3coYVsxMl0sIDIpICsgTWF0aC5wb3coYVsxM10sIDIpICsgTWF0aC5wb3coYVsxNF0sIDIpICsgTWF0aC5wb3coYVsxNV0sIDIpICkpXG59O1xuXG5cbmlmKHR5cGVvZihleHBvcnRzKSAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBleHBvcnRzLm1hdDQgPSBtYXQ0O1xufVxuO1xuLyogQ29weXJpZ2h0IChjKSAyMDEzLCBCcmFuZG9uIEpvbmVzLCBDb2xpbiBNYWNLZW56aWUgSVYuIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG5cblJlZGlzdHJpYnV0aW9uIGFuZCB1c2UgaW4gc291cmNlIGFuZCBiaW5hcnkgZm9ybXMsIHdpdGggb3Igd2l0aG91dCBtb2RpZmljYXRpb24sXG5hcmUgcGVybWl0dGVkIHByb3ZpZGVkIHRoYXQgdGhlIGZvbGxvd2luZyBjb25kaXRpb25zIGFyZSBtZXQ6XG5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgb2Ygc291cmNlIGNvZGUgbXVzdCByZXRhaW4gdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsIHRoaXNcbiAgICBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lci5cbiAgKiBSZWRpc3RyaWJ1dGlvbnMgaW4gYmluYXJ5IGZvcm0gbXVzdCByZXByb2R1Y2UgdGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UsXG4gICAgdGhpcyBsaXN0IG9mIGNvbmRpdGlvbnMgYW5kIHRoZSBmb2xsb3dpbmcgZGlzY2xhaW1lciBpbiB0aGUgZG9jdW1lbnRhdGlvbiBcbiAgICBhbmQvb3Igb3RoZXIgbWF0ZXJpYWxzIHByb3ZpZGVkIHdpdGggdGhlIGRpc3RyaWJ1dGlvbi5cblxuVEhJUyBTT0ZUV0FSRSBJUyBQUk9WSURFRCBCWSBUSEUgQ09QWVJJR0hUIEhPTERFUlMgQU5EIENPTlRSSUJVVE9SUyBcIkFTIElTXCIgQU5EXG5BTlkgRVhQUkVTUyBPUiBJTVBMSUVEIFdBUlJBTlRJRVMsIElOQ0xVRElORywgQlVUIE5PVCBMSU1JVEVEIFRPLCBUSEUgSU1QTElFRFxuV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFkgQU5EIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFSRSBcbkRJU0NMQUlNRUQuIElOIE5PIEVWRU5UIFNIQUxMIFRIRSBDT1BZUklHSFQgSE9MREVSIE9SIENPTlRSSUJVVE9SUyBCRSBMSUFCTEUgRk9SXG5BTlkgRElSRUNULCBJTkRJUkVDVCwgSU5DSURFTlRBTCwgU1BFQ0lBTCwgRVhFTVBMQVJZLCBPUiBDT05TRVFVRU5USUFMIERBTUFHRVNcbihJTkNMVURJTkcsIEJVVCBOT1QgTElNSVRFRCBUTywgUFJPQ1VSRU1FTlQgT0YgU1VCU1RJVFVURSBHT09EUyBPUiBTRVJWSUNFUztcbkxPU1MgT0YgVVNFLCBEQVRBLCBPUiBQUk9GSVRTOyBPUiBCVVNJTkVTUyBJTlRFUlJVUFRJT04pIEhPV0VWRVIgQ0FVU0VEIEFORCBPTlxuQU5ZIFRIRU9SWSBPRiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQ09OVFJBQ1QsIFNUUklDVCBMSUFCSUxJVFksIE9SIFRPUlRcbihJTkNMVURJTkcgTkVHTElHRU5DRSBPUiBPVEhFUldJU0UpIEFSSVNJTkcgSU4gQU5ZIFdBWSBPVVQgT0YgVEhFIFVTRSBPRiBUSElTXG5TT0ZUV0FSRSwgRVZFTiBJRiBBRFZJU0VEIE9GIFRIRSBQT1NTSUJJTElUWSBPRiBTVUNIIERBTUFHRS4gKi9cblxuLyoqXG4gKiBAY2xhc3MgUXVhdGVybmlvblxuICogQG5hbWUgcXVhdFxuICovXG5cbnZhciBxdWF0ID0ge307XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBpZGVudGl0eSBxdWF0XG4gKlxuICogQHJldHVybnMge3F1YXR9IGEgbmV3IHF1YXRlcm5pb25cbiAqL1xucXVhdC5jcmVhdGUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgb3V0ID0gbmV3IEdMTUFUX0FSUkFZX1RZUEUoNCk7XG4gICAgb3V0WzBdID0gMDtcbiAgICBvdXRbMV0gPSAwO1xuICAgIG91dFsyXSA9IDA7XG4gICAgb3V0WzNdID0gMTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBTZXRzIGEgcXVhdGVybmlvbiB0byByZXByZXNlbnQgdGhlIHNob3J0ZXN0IHJvdGF0aW9uIGZyb20gb25lXG4gKiB2ZWN0b3IgdG8gYW5vdGhlci5cbiAqXG4gKiBCb3RoIHZlY3RvcnMgYXJlIGFzc3VtZWQgdG8gYmUgdW5pdCBsZW5ndGguXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uLlxuICogQHBhcmFtIHt2ZWMzfSBhIHRoZSBpbml0aWFsIHZlY3RvclxuICogQHBhcmFtIHt2ZWMzfSBiIHRoZSBkZXN0aW5hdGlvbiB2ZWN0b3JcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5yb3RhdGlvblRvID0gKGZ1bmN0aW9uKCkge1xuICAgIHZhciB0bXB2ZWMzID0gdmVjMy5jcmVhdGUoKTtcbiAgICB2YXIgeFVuaXRWZWMzID0gdmVjMy5mcm9tVmFsdWVzKDEsMCwwKTtcbiAgICB2YXIgeVVuaXRWZWMzID0gdmVjMy5mcm9tVmFsdWVzKDAsMSwwKTtcblxuICAgIHJldHVybiBmdW5jdGlvbihvdXQsIGEsIGIpIHtcbiAgICAgICAgdmFyIGRvdCA9IHZlYzMuZG90KGEsIGIpO1xuICAgICAgICBpZiAoZG90IDwgLTAuOTk5OTk5KSB7XG4gICAgICAgICAgICB2ZWMzLmNyb3NzKHRtcHZlYzMsIHhVbml0VmVjMywgYSk7XG4gICAgICAgICAgICBpZiAodmVjMy5sZW5ndGgodG1wdmVjMykgPCAwLjAwMDAwMSlcbiAgICAgICAgICAgICAgICB2ZWMzLmNyb3NzKHRtcHZlYzMsIHlVbml0VmVjMywgYSk7XG4gICAgICAgICAgICB2ZWMzLm5vcm1hbGl6ZSh0bXB2ZWMzLCB0bXB2ZWMzKTtcbiAgICAgICAgICAgIHF1YXQuc2V0QXhpc0FuZ2xlKG91dCwgdG1wdmVjMywgTWF0aC5QSSk7XG4gICAgICAgICAgICByZXR1cm4gb3V0O1xuICAgICAgICB9IGVsc2UgaWYgKGRvdCA+IDAuOTk5OTk5KSB7XG4gICAgICAgICAgICBvdXRbMF0gPSAwO1xuICAgICAgICAgICAgb3V0WzFdID0gMDtcbiAgICAgICAgICAgIG91dFsyXSA9IDA7XG4gICAgICAgICAgICBvdXRbM10gPSAxO1xuICAgICAgICAgICAgcmV0dXJuIG91dDtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZlYzMuY3Jvc3ModG1wdmVjMywgYSwgYik7XG4gICAgICAgICAgICBvdXRbMF0gPSB0bXB2ZWMzWzBdO1xuICAgICAgICAgICAgb3V0WzFdID0gdG1wdmVjM1sxXTtcbiAgICAgICAgICAgIG91dFsyXSA9IHRtcHZlYzNbMl07XG4gICAgICAgICAgICBvdXRbM10gPSAxICsgZG90O1xuICAgICAgICAgICAgcmV0dXJuIHF1YXQubm9ybWFsaXplKG91dCwgb3V0KTtcbiAgICAgICAgfVxuICAgIH07XG59KSgpO1xuXG4vKipcbiAqIFNldHMgdGhlIHNwZWNpZmllZCBxdWF0ZXJuaW9uIHdpdGggdmFsdWVzIGNvcnJlc3BvbmRpbmcgdG8gdGhlIGdpdmVuXG4gKiBheGVzLiBFYWNoIGF4aXMgaXMgYSB2ZWMzIGFuZCBpcyBleHBlY3RlZCB0byBiZSB1bml0IGxlbmd0aCBhbmRcbiAqIHBlcnBlbmRpY3VsYXIgdG8gYWxsIG90aGVyIHNwZWNpZmllZCBheGVzLlxuICpcbiAqIEBwYXJhbSB7dmVjM30gdmlldyAgdGhlIHZlY3RvciByZXByZXNlbnRpbmcgdGhlIHZpZXdpbmcgZGlyZWN0aW9uXG4gKiBAcGFyYW0ge3ZlYzN9IHJpZ2h0IHRoZSB2ZWN0b3IgcmVwcmVzZW50aW5nIHRoZSBsb2NhbCBcInJpZ2h0XCIgZGlyZWN0aW9uXG4gKiBAcGFyYW0ge3ZlYzN9IHVwICAgIHRoZSB2ZWN0b3IgcmVwcmVzZW50aW5nIHRoZSBsb2NhbCBcInVwXCIgZGlyZWN0aW9uXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKi9cbnF1YXQuc2V0QXhlcyA9IChmdW5jdGlvbigpIHtcbiAgICB2YXIgbWF0ciA9IG1hdDMuY3JlYXRlKCk7XG5cbiAgICByZXR1cm4gZnVuY3Rpb24ob3V0LCB2aWV3LCByaWdodCwgdXApIHtcbiAgICAgICAgbWF0clswXSA9IHJpZ2h0WzBdO1xuICAgICAgICBtYXRyWzNdID0gcmlnaHRbMV07XG4gICAgICAgIG1hdHJbNl0gPSByaWdodFsyXTtcblxuICAgICAgICBtYXRyWzFdID0gdXBbMF07XG4gICAgICAgIG1hdHJbNF0gPSB1cFsxXTtcbiAgICAgICAgbWF0cls3XSA9IHVwWzJdO1xuXG4gICAgICAgIG1hdHJbMl0gPSAtdmlld1swXTtcbiAgICAgICAgbWF0cls1XSA9IC12aWV3WzFdO1xuICAgICAgICBtYXRyWzhdID0gLXZpZXdbMl07XG5cbiAgICAgICAgcmV0dXJuIHF1YXQubm9ybWFsaXplKG91dCwgcXVhdC5mcm9tTWF0MyhvdXQsIG1hdHIpKTtcbiAgICB9O1xufSkoKTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IHF1YXQgaW5pdGlhbGl6ZWQgd2l0aCB2YWx1ZXMgZnJvbSBhbiBleGlzdGluZyBxdWF0ZXJuaW9uXG4gKlxuICogQHBhcmFtIHtxdWF0fSBhIHF1YXRlcm5pb24gdG8gY2xvbmVcbiAqIEByZXR1cm5zIHtxdWF0fSBhIG5ldyBxdWF0ZXJuaW9uXG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5jbG9uZSA9IHZlYzQuY2xvbmU7XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBxdWF0IGluaXRpYWxpemVkIHdpdGggdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSB4IFggY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geSBZIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHogWiBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB3IFcgY29tcG9uZW50XG4gKiBAcmV0dXJucyB7cXVhdH0gYSBuZXcgcXVhdGVybmlvblxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQuZnJvbVZhbHVlcyA9IHZlYzQuZnJvbVZhbHVlcztcblxuLyoqXG4gKiBDb3B5IHRoZSB2YWx1ZXMgZnJvbSBvbmUgcXVhdCB0byBhbm90aGVyXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgdGhlIHNvdXJjZSBxdWF0ZXJuaW9uXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5jb3B5ID0gdmVjNC5jb3B5O1xuXG4vKipcbiAqIFNldCB0aGUgY29tcG9uZW50cyBvZiBhIHF1YXQgdG8gdGhlIGdpdmVuIHZhbHVlc1xuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgcXVhdGVybmlvblxuICogQHBhcmFtIHtOdW1iZXJ9IHggWCBjb21wb25lbnRcbiAqIEBwYXJhbSB7TnVtYmVyfSB5IFkgY29tcG9uZW50XG4gKiBAcGFyYW0ge051bWJlcn0geiBaIGNvbXBvbmVudFxuICogQHBhcmFtIHtOdW1iZXJ9IHcgVyBjb21wb25lbnRcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqIEBmdW5jdGlvblxuICovXG5xdWF0LnNldCA9IHZlYzQuc2V0O1xuXG4vKipcbiAqIFNldCBhIHF1YXQgdG8gdGhlIGlkZW50aXR5IHF1YXRlcm5pb25cbiAqXG4gKiBAcGFyYW0ge3F1YXR9IG91dCB0aGUgcmVjZWl2aW5nIHF1YXRlcm5pb25cbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5pZGVudGl0eSA9IGZ1bmN0aW9uKG91dCkge1xuICAgIG91dFswXSA9IDA7XG4gICAgb3V0WzFdID0gMDtcbiAgICBvdXRbMl0gPSAwO1xuICAgIG91dFszXSA9IDE7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogU2V0cyBhIHF1YXQgZnJvbSB0aGUgZ2l2ZW4gYW5nbGUgYW5kIHJvdGF0aW9uIGF4aXMsXG4gKiB0aGVuIHJldHVybnMgaXQuXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3ZlYzN9IGF4aXMgdGhlIGF4aXMgYXJvdW5kIHdoaWNoIHRvIHJvdGF0ZVxuICogQHBhcmFtIHtOdW1iZXJ9IHJhZCB0aGUgYW5nbGUgaW4gcmFkaWFuc1xuICogQHJldHVybnMge3F1YXR9IG91dFxuICoqL1xucXVhdC5zZXRBeGlzQW5nbGUgPSBmdW5jdGlvbihvdXQsIGF4aXMsIHJhZCkge1xuICAgIHJhZCA9IHJhZCAqIDAuNTtcbiAgICB2YXIgcyA9IE1hdGguc2luKHJhZCk7XG4gICAgb3V0WzBdID0gcyAqIGF4aXNbMF07XG4gICAgb3V0WzFdID0gcyAqIGF4aXNbMV07XG4gICAgb3V0WzJdID0gcyAqIGF4aXNbMl07XG4gICAgb3V0WzNdID0gTWF0aC5jb3MocmFkKTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBBZGRzIHR3byBxdWF0J3NcbiAqXG4gKiBAcGFyYW0ge3F1YXR9IG91dCB0aGUgcmVjZWl2aW5nIHF1YXRlcm5pb25cbiAqIEBwYXJhbSB7cXVhdH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHtxdWF0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge3F1YXR9IG91dFxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQuYWRkID0gdmVjNC5hZGQ7XG5cbi8qKlxuICogTXVsdGlwbGllcyB0d28gcXVhdCdzXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7cXVhdH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5tdWx0aXBseSA9IGZ1bmN0aW9uKG91dCwgYSwgYikge1xuICAgIHZhciBheCA9IGFbMF0sIGF5ID0gYVsxXSwgYXogPSBhWzJdLCBhdyA9IGFbM10sXG4gICAgICAgIGJ4ID0gYlswXSwgYnkgPSBiWzFdLCBieiA9IGJbMl0sIGJ3ID0gYlszXTtcblxuICAgIG91dFswXSA9IGF4ICogYncgKyBhdyAqIGJ4ICsgYXkgKiBieiAtIGF6ICogYnk7XG4gICAgb3V0WzFdID0gYXkgKiBidyArIGF3ICogYnkgKyBheiAqIGJ4IC0gYXggKiBiejtcbiAgICBvdXRbMl0gPSBheiAqIGJ3ICsgYXcgKiBieiArIGF4ICogYnkgLSBheSAqIGJ4O1xuICAgIG91dFszXSA9IGF3ICogYncgLSBheCAqIGJ4IC0gYXkgKiBieSAtIGF6ICogYno7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayBxdWF0Lm11bHRpcGx5fVxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQubXVsID0gcXVhdC5tdWx0aXBseTtcblxuLyoqXG4gKiBTY2FsZXMgYSBxdWF0IGJ5IGEgc2NhbGFyIG51bWJlclxuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgdmVjdG9yXG4gKiBAcGFyYW0ge3F1YXR9IGEgdGhlIHZlY3RvciB0byBzY2FsZVxuICogQHBhcmFtIHtOdW1iZXJ9IGIgYW1vdW50IHRvIHNjYWxlIHRoZSB2ZWN0b3IgYnlcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqIEBmdW5jdGlvblxuICovXG5xdWF0LnNjYWxlID0gdmVjNC5zY2FsZTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgcXVhdGVybmlvbiBieSB0aGUgZ2l2ZW4gYW5nbGUgYWJvdXQgdGhlIFggYXhpc1xuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHF1YXQgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiAqIEBwYXJhbSB7cXVhdH0gYSBxdWF0IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtudW1iZXJ9IHJhZCBhbmdsZSAoaW4gcmFkaWFucykgdG8gcm90YXRlXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKi9cbnF1YXQucm90YXRlWCA9IGZ1bmN0aW9uIChvdXQsIGEsIHJhZCkge1xuICAgIHJhZCAqPSAwLjU7IFxuXG4gICAgdmFyIGF4ID0gYVswXSwgYXkgPSBhWzFdLCBheiA9IGFbMl0sIGF3ID0gYVszXSxcbiAgICAgICAgYnggPSBNYXRoLnNpbihyYWQpLCBidyA9IE1hdGguY29zKHJhZCk7XG5cbiAgICBvdXRbMF0gPSBheCAqIGJ3ICsgYXcgKiBieDtcbiAgICBvdXRbMV0gPSBheSAqIGJ3ICsgYXogKiBieDtcbiAgICBvdXRbMl0gPSBheiAqIGJ3IC0gYXkgKiBieDtcbiAgICBvdXRbM10gPSBhdyAqIGJ3IC0gYXggKiBieDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgcXVhdGVybmlvbiBieSB0aGUgZ2l2ZW4gYW5nbGUgYWJvdXQgdGhlIFkgYXhpc1xuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHF1YXQgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiAqIEBwYXJhbSB7cXVhdH0gYSBxdWF0IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtudW1iZXJ9IHJhZCBhbmdsZSAoaW4gcmFkaWFucykgdG8gcm90YXRlXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKi9cbnF1YXQucm90YXRlWSA9IGZ1bmN0aW9uIChvdXQsIGEsIHJhZCkge1xuICAgIHJhZCAqPSAwLjU7IFxuXG4gICAgdmFyIGF4ID0gYVswXSwgYXkgPSBhWzFdLCBheiA9IGFbMl0sIGF3ID0gYVszXSxcbiAgICAgICAgYnkgPSBNYXRoLnNpbihyYWQpLCBidyA9IE1hdGguY29zKHJhZCk7XG5cbiAgICBvdXRbMF0gPSBheCAqIGJ3IC0gYXogKiBieTtcbiAgICBvdXRbMV0gPSBheSAqIGJ3ICsgYXcgKiBieTtcbiAgICBvdXRbMl0gPSBheiAqIGJ3ICsgYXggKiBieTtcbiAgICBvdXRbM10gPSBhdyAqIGJ3IC0gYXkgKiBieTtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBSb3RhdGVzIGEgcXVhdGVybmlvbiBieSB0aGUgZ2l2ZW4gYW5nbGUgYWJvdXQgdGhlIFogYXhpc1xuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHF1YXQgcmVjZWl2aW5nIG9wZXJhdGlvbiByZXN1bHRcbiAqIEBwYXJhbSB7cXVhdH0gYSBxdWF0IHRvIHJvdGF0ZVxuICogQHBhcmFtIHtudW1iZXJ9IHJhZCBhbmdsZSAoaW4gcmFkaWFucykgdG8gcm90YXRlXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKi9cbnF1YXQucm90YXRlWiA9IGZ1bmN0aW9uIChvdXQsIGEsIHJhZCkge1xuICAgIHJhZCAqPSAwLjU7IFxuXG4gICAgdmFyIGF4ID0gYVswXSwgYXkgPSBhWzFdLCBheiA9IGFbMl0sIGF3ID0gYVszXSxcbiAgICAgICAgYnogPSBNYXRoLnNpbihyYWQpLCBidyA9IE1hdGguY29zKHJhZCk7XG5cbiAgICBvdXRbMF0gPSBheCAqIGJ3ICsgYXkgKiBiejtcbiAgICBvdXRbMV0gPSBheSAqIGJ3IC0gYXggKiBiejtcbiAgICBvdXRbMl0gPSBheiAqIGJ3ICsgYXcgKiBiejtcbiAgICBvdXRbM10gPSBhdyAqIGJ3IC0gYXogKiBiejtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBXIGNvbXBvbmVudCBvZiBhIHF1YXQgZnJvbSB0aGUgWCwgWSwgYW5kIFogY29tcG9uZW50cy5cbiAqIEFzc3VtZXMgdGhhdCBxdWF0ZXJuaW9uIGlzIDEgdW5pdCBpbiBsZW5ndGguXG4gKiBBbnkgZXhpc3RpbmcgVyBjb21wb25lbnQgd2lsbCBiZSBpZ25vcmVkLlxuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgcXVhdGVybmlvblxuICogQHBhcmFtIHtxdWF0fSBhIHF1YXQgdG8gY2FsY3VsYXRlIFcgY29tcG9uZW50IG9mXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKi9cbnF1YXQuY2FsY3VsYXRlVyA9IGZ1bmN0aW9uIChvdXQsIGEpIHtcbiAgICB2YXIgeCA9IGFbMF0sIHkgPSBhWzFdLCB6ID0gYVsyXTtcblxuICAgIG91dFswXSA9IHg7XG4gICAgb3V0WzFdID0geTtcbiAgICBvdXRbMl0gPSB6O1xuICAgIG91dFszXSA9IC1NYXRoLnNxcnQoTWF0aC5hYnMoMS4wIC0geCAqIHggLSB5ICogeSAtIHogKiB6KSk7XG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgZG90IHByb2R1Y3Qgb2YgdHdvIHF1YXQnc1xuICpcbiAqIEBwYXJhbSB7cXVhdH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHtxdWF0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHJldHVybnMge051bWJlcn0gZG90IHByb2R1Y3Qgb2YgYSBhbmQgYlxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQuZG90ID0gdmVjNC5kb3Q7XG5cbi8qKlxuICogUGVyZm9ybXMgYSBsaW5lYXIgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byBxdWF0J3NcbiAqXG4gKiBAcGFyYW0ge3F1YXR9IG91dCB0aGUgcmVjZWl2aW5nIHF1YXRlcm5pb25cbiAqIEBwYXJhbSB7cXVhdH0gYSB0aGUgZmlyc3Qgb3BlcmFuZFxuICogQHBhcmFtIHtxdWF0fSBiIHRoZSBzZWNvbmQgb3BlcmFuZFxuICogQHBhcmFtIHtOdW1iZXJ9IHQgaW50ZXJwb2xhdGlvbiBhbW91bnQgYmV0d2VlbiB0aGUgdHdvIGlucHV0c1xuICogQHJldHVybnMge3F1YXR9IG91dFxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQubGVycCA9IHZlYzQubGVycDtcblxuLyoqXG4gKiBQZXJmb3JtcyBhIHNwaGVyaWNhbCBsaW5lYXIgaW50ZXJwb2xhdGlvbiBiZXR3ZWVuIHR3byBxdWF0XG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge3F1YXR9IGEgdGhlIGZpcnN0IG9wZXJhbmRcbiAqIEBwYXJhbSB7cXVhdH0gYiB0aGUgc2Vjb25kIG9wZXJhbmRcbiAqIEBwYXJhbSB7TnVtYmVyfSB0IGludGVycG9sYXRpb24gYW1vdW50IGJldHdlZW4gdGhlIHR3byBpbnB1dHNcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5zbGVycCA9IGZ1bmN0aW9uIChvdXQsIGEsIGIsIHQpIHtcbiAgICAvLyBiZW5jaG1hcmtzOlxuICAgIC8vICAgIGh0dHA6Ly9qc3BlcmYuY29tL3F1YXRlcm5pb24tc2xlcnAtaW1wbGVtZW50YXRpb25zXG5cbiAgICB2YXIgYXggPSBhWzBdLCBheSA9IGFbMV0sIGF6ID0gYVsyXSwgYXcgPSBhWzNdLFxuICAgICAgICBieCA9IGJbMF0sIGJ5ID0gYlsxXSwgYnogPSBiWzJdLCBidyA9IGJbM107XG5cbiAgICB2YXIgICAgICAgIG9tZWdhLCBjb3NvbSwgc2lub20sIHNjYWxlMCwgc2NhbGUxO1xuXG4gICAgLy8gY2FsYyBjb3NpbmVcbiAgICBjb3NvbSA9IGF4ICogYnggKyBheSAqIGJ5ICsgYXogKiBieiArIGF3ICogYnc7XG4gICAgLy8gYWRqdXN0IHNpZ25zIChpZiBuZWNlc3NhcnkpXG4gICAgaWYgKCBjb3NvbSA8IDAuMCApIHtcbiAgICAgICAgY29zb20gPSAtY29zb207XG4gICAgICAgIGJ4ID0gLSBieDtcbiAgICAgICAgYnkgPSAtIGJ5O1xuICAgICAgICBieiA9IC0gYno7XG4gICAgICAgIGJ3ID0gLSBidztcbiAgICB9XG4gICAgLy8gY2FsY3VsYXRlIGNvZWZmaWNpZW50c1xuICAgIGlmICggKDEuMCAtIGNvc29tKSA+IDAuMDAwMDAxICkge1xuICAgICAgICAvLyBzdGFuZGFyZCBjYXNlIChzbGVycClcbiAgICAgICAgb21lZ2EgID0gTWF0aC5hY29zKGNvc29tKTtcbiAgICAgICAgc2lub20gID0gTWF0aC5zaW4ob21lZ2EpO1xuICAgICAgICBzY2FsZTAgPSBNYXRoLnNpbigoMS4wIC0gdCkgKiBvbWVnYSkgLyBzaW5vbTtcbiAgICAgICAgc2NhbGUxID0gTWF0aC5zaW4odCAqIG9tZWdhKSAvIHNpbm9tO1xuICAgIH0gZWxzZSB7ICAgICAgICBcbiAgICAgICAgLy8gXCJmcm9tXCIgYW5kIFwidG9cIiBxdWF0ZXJuaW9ucyBhcmUgdmVyeSBjbG9zZSBcbiAgICAgICAgLy8gIC4uLiBzbyB3ZSBjYW4gZG8gYSBsaW5lYXIgaW50ZXJwb2xhdGlvblxuICAgICAgICBzY2FsZTAgPSAxLjAgLSB0O1xuICAgICAgICBzY2FsZTEgPSB0O1xuICAgIH1cbiAgICAvLyBjYWxjdWxhdGUgZmluYWwgdmFsdWVzXG4gICAgb3V0WzBdID0gc2NhbGUwICogYXggKyBzY2FsZTEgKiBieDtcbiAgICBvdXRbMV0gPSBzY2FsZTAgKiBheSArIHNjYWxlMSAqIGJ5O1xuICAgIG91dFsyXSA9IHNjYWxlMCAqIGF6ICsgc2NhbGUxICogYno7XG4gICAgb3V0WzNdID0gc2NhbGUwICogYXcgKyBzY2FsZTEgKiBidztcbiAgICBcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBpbnZlcnNlIG9mIGEgcXVhdFxuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgcXVhdGVybmlvblxuICogQHBhcmFtIHtxdWF0fSBhIHF1YXQgdG8gY2FsY3VsYXRlIGludmVyc2Ugb2ZcbiAqIEByZXR1cm5zIHtxdWF0fSBvdXRcbiAqL1xucXVhdC5pbnZlcnQgPSBmdW5jdGlvbihvdXQsIGEpIHtcbiAgICB2YXIgYTAgPSBhWzBdLCBhMSA9IGFbMV0sIGEyID0gYVsyXSwgYTMgPSBhWzNdLFxuICAgICAgICBkb3QgPSBhMCphMCArIGExKmExICsgYTIqYTIgKyBhMyphMyxcbiAgICAgICAgaW52RG90ID0gZG90ID8gMS4wL2RvdCA6IDA7XG4gICAgXG4gICAgLy8gVE9ETzogV291bGQgYmUgZmFzdGVyIHRvIHJldHVybiBbMCwwLDAsMF0gaW1tZWRpYXRlbHkgaWYgZG90ID09IDBcblxuICAgIG91dFswXSA9IC1hMCppbnZEb3Q7XG4gICAgb3V0WzFdID0gLWExKmludkRvdDtcbiAgICBvdXRbMl0gPSAtYTIqaW52RG90O1xuICAgIG91dFszXSA9IGEzKmludkRvdDtcbiAgICByZXR1cm4gb3V0O1xufTtcblxuLyoqXG4gKiBDYWxjdWxhdGVzIHRoZSBjb25qdWdhdGUgb2YgYSBxdWF0XG4gKiBJZiB0aGUgcXVhdGVybmlvbiBpcyBub3JtYWxpemVkLCB0aGlzIGZ1bmN0aW9uIGlzIGZhc3RlciB0aGFuIHF1YXQuaW52ZXJzZSBhbmQgcHJvZHVjZXMgdGhlIHNhbWUgcmVzdWx0LlxuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgcXVhdGVybmlvblxuICogQHBhcmFtIHtxdWF0fSBhIHF1YXQgdG8gY2FsY3VsYXRlIGNvbmp1Z2F0ZSBvZlxuICogQHJldHVybnMge3F1YXR9IG91dFxuICovXG5xdWF0LmNvbmp1Z2F0ZSA9IGZ1bmN0aW9uIChvdXQsIGEpIHtcbiAgICBvdXRbMF0gPSAtYVswXTtcbiAgICBvdXRbMV0gPSAtYVsxXTtcbiAgICBvdXRbMl0gPSAtYVsyXTtcbiAgICBvdXRbM10gPSBhWzNdO1xuICAgIHJldHVybiBvdXQ7XG59O1xuXG4vKipcbiAqIENhbGN1bGF0ZXMgdGhlIGxlbmd0aCBvZiBhIHF1YXRcbiAqXG4gKiBAcGFyYW0ge3F1YXR9IGEgdmVjdG9yIHRvIGNhbGN1bGF0ZSBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IGxlbmd0aCBvZiBhXG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5sZW5ndGggPSB2ZWM0Lmxlbmd0aDtcblxuLyoqXG4gKiBBbGlhcyBmb3Ige0BsaW5rIHF1YXQubGVuZ3RofVxuICogQGZ1bmN0aW9uXG4gKi9cbnF1YXQubGVuID0gcXVhdC5sZW5ndGg7XG5cbi8qKlxuICogQ2FsY3VsYXRlcyB0aGUgc3F1YXJlZCBsZW5ndGggb2YgYSBxdWF0XG4gKlxuICogQHBhcmFtIHtxdWF0fSBhIHZlY3RvciB0byBjYWxjdWxhdGUgc3F1YXJlZCBsZW5ndGggb2ZcbiAqIEByZXR1cm5zIHtOdW1iZXJ9IHNxdWFyZWQgbGVuZ3RoIG9mIGFcbiAqIEBmdW5jdGlvblxuICovXG5xdWF0LnNxdWFyZWRMZW5ndGggPSB2ZWM0LnNxdWFyZWRMZW5ndGg7XG5cbi8qKlxuICogQWxpYXMgZm9yIHtAbGluayBxdWF0LnNxdWFyZWRMZW5ndGh9XG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5zcXJMZW4gPSBxdWF0LnNxdWFyZWRMZW5ndGg7XG5cbi8qKlxuICogTm9ybWFsaXplIGEgcXVhdFxuICpcbiAqIEBwYXJhbSB7cXVhdH0gb3V0IHRoZSByZWNlaXZpbmcgcXVhdGVybmlvblxuICogQHBhcmFtIHtxdWF0fSBhIHF1YXRlcm5pb24gdG8gbm9ybWFsaXplXG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5ub3JtYWxpemUgPSB2ZWM0Lm5vcm1hbGl6ZTtcblxuLyoqXG4gKiBDcmVhdGVzIGEgcXVhdGVybmlvbiBmcm9tIHRoZSBnaXZlbiAzeDMgcm90YXRpb24gbWF0cml4LlxuICpcbiAqIE5PVEU6IFRoZSByZXN1bHRhbnQgcXVhdGVybmlvbiBpcyBub3Qgbm9ybWFsaXplZCwgc28geW91IHNob3VsZCBiZSBzdXJlXG4gKiB0byByZW5vcm1hbGl6ZSB0aGUgcXVhdGVybmlvbiB5b3Vyc2VsZiB3aGVyZSBuZWNlc3NhcnkuXG4gKlxuICogQHBhcmFtIHtxdWF0fSBvdXQgdGhlIHJlY2VpdmluZyBxdWF0ZXJuaW9uXG4gKiBAcGFyYW0ge21hdDN9IG0gcm90YXRpb24gbWF0cml4XG4gKiBAcmV0dXJucyB7cXVhdH0gb3V0XG4gKiBAZnVuY3Rpb25cbiAqL1xucXVhdC5mcm9tTWF0MyA9IGZ1bmN0aW9uKG91dCwgbSkge1xuICAgIC8vIEFsZ29yaXRobSBpbiBLZW4gU2hvZW1ha2UncyBhcnRpY2xlIGluIDE5ODcgU0lHR1JBUEggY291cnNlIG5vdGVzXG4gICAgLy8gYXJ0aWNsZSBcIlF1YXRlcm5pb24gQ2FsY3VsdXMgYW5kIEZhc3QgQW5pbWF0aW9uXCIuXG4gICAgdmFyIGZUcmFjZSA9IG1bMF0gKyBtWzRdICsgbVs4XTtcbiAgICB2YXIgZlJvb3Q7XG5cbiAgICBpZiAoIGZUcmFjZSA+IDAuMCApIHtcbiAgICAgICAgLy8gfHd8ID4gMS8yLCBtYXkgYXMgd2VsbCBjaG9vc2UgdyA+IDEvMlxuICAgICAgICBmUm9vdCA9IE1hdGguc3FydChmVHJhY2UgKyAxLjApOyAgLy8gMndcbiAgICAgICAgb3V0WzNdID0gMC41ICogZlJvb3Q7XG4gICAgICAgIGZSb290ID0gMC41L2ZSb290OyAgLy8gMS8oNHcpXG4gICAgICAgIG91dFswXSA9IChtWzddLW1bNV0pKmZSb290O1xuICAgICAgICBvdXRbMV0gPSAobVsyXS1tWzZdKSpmUm9vdDtcbiAgICAgICAgb3V0WzJdID0gKG1bM10tbVsxXSkqZlJvb3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gfHd8IDw9IDEvMlxuICAgICAgICB2YXIgaSA9IDA7XG4gICAgICAgIGlmICggbVs0XSA+IG1bMF0gKVxuICAgICAgICAgIGkgPSAxO1xuICAgICAgICBpZiAoIG1bOF0gPiBtW2kqMytpXSApXG4gICAgICAgICAgaSA9IDI7XG4gICAgICAgIHZhciBqID0gKGkrMSklMztcbiAgICAgICAgdmFyIGsgPSAoaSsyKSUzO1xuICAgICAgICBcbiAgICAgICAgZlJvb3QgPSBNYXRoLnNxcnQobVtpKjMraV0tbVtqKjMral0tbVtrKjMra10gKyAxLjApO1xuICAgICAgICBvdXRbaV0gPSAwLjUgKiBmUm9vdDtcbiAgICAgICAgZlJvb3QgPSAwLjUgLyBmUm9vdDtcbiAgICAgICAgb3V0WzNdID0gKG1bayozK2pdIC0gbVtqKjMra10pICogZlJvb3Q7XG4gICAgICAgIG91dFtqXSA9IChtW2oqMytpXSArIG1baSozK2pdKSAqIGZSb290O1xuICAgICAgICBvdXRba10gPSAobVtrKjMraV0gKyBtW2kqMytrXSkgKiBmUm9vdDtcbiAgICB9XG4gICAgXG4gICAgcmV0dXJuIG91dDtcbn07XG5cbi8qKlxuICogUmV0dXJucyBhIHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiBhIHF1YXRlbmlvblxuICpcbiAqIEBwYXJhbSB7cXVhdH0gdmVjIHZlY3RvciB0byByZXByZXNlbnQgYXMgYSBzdHJpbmdcbiAqIEByZXR1cm5zIHtTdHJpbmd9IHN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgdmVjdG9yXG4gKi9cbnF1YXQuc3RyID0gZnVuY3Rpb24gKGEpIHtcbiAgICByZXR1cm4gJ3F1YXQoJyArIGFbMF0gKyAnLCAnICsgYVsxXSArICcsICcgKyBhWzJdICsgJywgJyArIGFbM10gKyAnKSc7XG59O1xuXG5pZih0eXBlb2YoZXhwb3J0cykgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgZXhwb3J0cy5xdWF0ID0gcXVhdDtcbn1cbjtcblxuXG5cblxuXG5cblxuXG5cblxuXG5cblxuICB9KShzaGltLmV4cG9ydHMpO1xufSkodGhpcyk7XG4iLCIoZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcbiAgICAndXNlIHN0cmljdCc7XG5cbiAgICBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIG1vZHVsZS5leHBvcnRzID0gZmFjdG9yeSgpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIGRlZmluZShmYWN0b3J5KTtcbiAgICB9IGVsc2Uge1xuICAgICAgICByb290Lk1lcnNlbm5lVHdpc3RlciA9IGZhY3RvcnkoKTtcbiAgICB9XG59KHRoaXMsIGZ1bmN0aW9uICgpIHtcbiAgICAvKipcbiAgICAgKiBBIHN0YW5kYWxvbmUsIHB1cmUgSmF2YVNjcmlwdCBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgTWVyc2VubmUgVHdpc3RlciBwc2V1ZG8gcmFuZG9tIG51bWJlciBnZW5lcmF0b3IuIENvbXBhdGlibGVcbiAgICAgKiB3aXRoIE5vZGUuanMsIHJlcXVpcmVqcyBhbmQgYnJvd3NlciBlbnZpcm9ubWVudHMuIFBhY2thZ2VzIGFyZSBhdmFpbGFibGUgZm9yIG5wbSwgSmFtIGFuZCBCb3dlci5cbiAgICAgKlxuICAgICAqIEBtb2R1bGUgTWVyc2VubmVUd2lzdGVyXG4gICAgICogQGF1dGhvciBSYXBoYWVsIFBpZ3VsbGEgPHBpZ3VsbGFAZm91cjY2LmNvbT5cbiAgICAgKiBAbGljZW5zZSBTZWUgdGhlIGF0dGFjaGVkIExJQ0VOU0UgZmlsZS5cbiAgICAgKiBAdmVyc2lvbiAwLjIuMVxuICAgICAqL1xuXG4gICAgLypcbiAgICAgKiBNb3N0IGNvbW1lbnRzIHdlcmUgc3RyaXBwZWQgZnJvbSB0aGUgc291cmNlLiBJZiBuZWVkZWQgeW91IGNhbiBzdGlsbCBmaW5kIHRoZW0gaW4gdGhlIG9yaWdpbmFsIEMgY29kZTpcbiAgICAgKiBodHRwOi8vd3d3Lm1hdGguc2NpLmhpcm9zaGltYS11LmFjLmpwL35tLW1hdC9NVC9NVDIwMDIvQ09ERVMvbXQxOTkzN2FyLmNcbiAgICAgKlxuICAgICAqIFRoZSBvcmlnaW5hbCBwb3J0IHRvIEphdmFTY3JpcHQsIG9uIHdoaWNoIHRoaXMgZmlsZSBpcyBiYXNlZCwgd2FzIGRvbmUgYnkgU2VhbiBNY0N1bGxvdWdoLiBJdCBjYW4gYmUgZm91bmQgYXQ6XG4gICAgICogaHR0cHM6Ly9naXN0LmdpdGh1Yi5jb20vYmFua3NlYW4vMzAwNDk0XG4gICAgICovXG4gICAgJ3VzZSBzdHJpY3QnO1xuXG4gICAgdmFyIE1BWF9JTlQgPSA0Mjk0OTY3Mjk2LjAsXG4gICAgICAgIE4gPSA2MjQsXG4gICAgICAgIE0gPSAzOTcsXG4gICAgICAgIFVQUEVSX01BU0sgPSAweDgwMDAwMDAwLFxuICAgICAgICBMT1dFUl9NQVNLID0gMHg3ZmZmZmZmZixcbiAgICAgICAgTUFUUklYX0EgPSAweDk5MDhiMGRmO1xuXG4gICAgLyoqXG4gICAgICogSW5zdGFudGlhdGVzIGEgbmV3IE1lcnNlbm5lIFR3aXN0ZXIuXG4gICAgICpcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAYWxpYXMgbW9kdWxlOk1lcnNlbm5lVHdpc3RlclxuICAgICAqIEBzaW5jZSAwLjEuMFxuICAgICAqIEBwYXJhbSB7bnVtYmVyPX0gc2VlZCBUaGUgaW5pdGlhbCBzZWVkIHZhbHVlLlxuICAgICAqL1xuICAgIHZhciBNZXJzZW5uZVR3aXN0ZXIgPSBmdW5jdGlvbiAoc2VlZCkge1xuICAgICAgICBpZiAodHlwZW9mIHNlZWQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBzZWVkID0gbmV3IERhdGUoKS5nZXRUaW1lKCk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm10ID0gbmV3IEFycmF5KE4pO1xuICAgICAgICB0aGlzLm10aSA9IE4gKyAxO1xuXG4gICAgICAgIHRoaXMuc2VlZChzZWVkKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogSW5pdGlhbGl6ZXMgdGhlIHN0YXRlIHZlY3RvciBieSB1c2luZyBvbmUgdW5zaWduZWQgMzItYml0IGludGVnZXIgXCJzZWVkXCIsIHdoaWNoIG1heSBiZSB6ZXJvLlxuICAgICAqXG4gICAgICogQHNpbmNlIDAuMS4wXG4gICAgICogQHBhcmFtIHtudW1iZXJ9IHNlZWQgVGhlIHNlZWQgdmFsdWUuXG4gICAgICovXG4gICAgTWVyc2VubmVUd2lzdGVyLnByb3RvdHlwZS5zZWVkID0gZnVuY3Rpb24gKHNlZWQpIHtcbiAgICAgICAgdmFyIHM7XG5cbiAgICAgICAgdGhpcy5tdFswXSA9IHNlZWQgPj4+IDA7XG5cbiAgICAgICAgZm9yICh0aGlzLm10aSA9IDE7IHRoaXMubXRpIDwgTjsgdGhpcy5tdGkrKykge1xuICAgICAgICAgICAgcyA9IHRoaXMubXRbdGhpcy5tdGkgLSAxXSBeICh0aGlzLm10W3RoaXMubXRpIC0gMV0gPj4+IDMwKTtcbiAgICAgICAgICAgIHRoaXMubXRbdGhpcy5tdGldID1cbiAgICAgICAgICAgICAgICAoKCgoKHMgJiAweGZmZmYwMDAwKSA+Pj4gMTYpICogMTgxMjQzMzI1MykgPDwgMTYpICsgKHMgJiAweDAwMDBmZmZmKSAqIDE4MTI0MzMyNTMpICsgdGhpcy5tdGk7XG4gICAgICAgICAgICB0aGlzLm10W3RoaXMubXRpXSA+Pj49IDA7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogSW5pdGlhbGl6ZXMgdGhlIHN0YXRlIHZlY3RvciBieSB1c2luZyBhbiBhcnJheSBrZXlbXSBvZiB1bnNpZ25lZCAzMi1iaXQgaW50ZWdlcnMgb2YgdGhlIHNwZWNpZmllZCBsZW5ndGguIElmXG4gICAgICogbGVuZ3RoIGlzIHNtYWxsZXIgdGhhbiA2MjQsIHRoZW4gZWFjaCBhcnJheSBvZiAzMi1iaXQgaW50ZWdlcnMgZ2l2ZXMgZGlzdGluY3QgaW5pdGlhbCBzdGF0ZSB2ZWN0b3IuIFRoaXMgaXNcbiAgICAgKiB1c2VmdWwgaWYgeW91IHdhbnQgYSBsYXJnZXIgc2VlZCBzcGFjZSB0aGFuIDMyLWJpdCB3b3JkLlxuICAgICAqXG4gICAgICogQHNpbmNlIDAuMS4wXG4gICAgICogQHBhcmFtIHthcnJheX0gdmVjdG9yIFRoZSBzZWVkIHZlY3Rvci5cbiAgICAgKi9cbiAgICBNZXJzZW5uZVR3aXN0ZXIucHJvdG90eXBlLnNlZWRBcnJheSA9IGZ1bmN0aW9uICh2ZWN0b3IpIHtcbiAgICAgICAgdmFyIGkgPSAxLFxuICAgICAgICAgICAgaiA9IDAsXG4gICAgICAgICAgICBrID0gTiA+IHZlY3Rvci5sZW5ndGggPyBOIDogdmVjdG9yLmxlbmd0aCxcbiAgICAgICAgICAgIHM7XG5cbiAgICAgICAgdGhpcy5zZWVkKDE5NjUwMjE4KTtcblxuICAgICAgICBmb3IgKDsgayA+IDA7IGstLSkge1xuICAgICAgICAgICAgcyA9IHRoaXMubXRbaS0xXSBeICh0aGlzLm10W2ktMV0gPj4+IDMwKTtcblxuICAgICAgICAgICAgdGhpcy5tdFtpXSA9ICh0aGlzLm10W2ldIF4gKCgoKChzICYgMHhmZmZmMDAwMCkgPj4+IDE2KSAqIDE2NjQ1MjUpIDw8IDE2KSArICgocyAmIDB4MDAwMGZmZmYpICogMTY2NDUyNSkpKSArXG4gICAgICAgICAgICAgICAgdmVjdG9yW2pdICsgajtcbiAgICAgICAgICAgIHRoaXMubXRbaV0gPj4+PSAwO1xuICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgaisrO1xuICAgICAgICAgICAgaWYgKGkgPj0gTikge1xuICAgICAgICAgICAgICAgIHRoaXMubXRbMF0gPSB0aGlzLm10W04gLSAxXTtcbiAgICAgICAgICAgICAgICBpID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChqID49IHZlY3Rvci5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBqID0gMDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoayA9IE4gLSAxOyBrOyBrLS0pIHtcbiAgICAgICAgICAgIHMgPSB0aGlzLm10W2kgLSAxXSBeICh0aGlzLm10W2kgLSAxXSA+Pj4gMzApO1xuICAgICAgICAgICAgdGhpcy5tdFtpXSA9XG4gICAgICAgICAgICAgICAgKHRoaXMubXRbaV0gXiAoKCgoKHMgJiAweGZmZmYwMDAwKSA+Pj4gMTYpICogMTU2NjA4Mzk0MSkgPDwgMTYpICsgKHMgJiAweDAwMDBmZmZmKSAqIDE1NjYwODM5NDEpKSAtIGk7XG4gICAgICAgICAgICB0aGlzLm10W2ldID4+Pj0gMDtcbiAgICAgICAgICAgIGkrKztcbiAgICAgICAgICAgIGlmIChpID49IE4pIHtcbiAgICAgICAgICAgICAgICB0aGlzLm10WzBdID0gdGhpcy5tdFtOIC0gMV07XG4gICAgICAgICAgICAgICAgaSA9IDE7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLm10WzBdID0gMHg4MDAwMDAwMDtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgcmFuZG9tIHVuc2lnbmVkIDMyLWJpdCBpbnRlZ2VyLlxuICAgICAqXG4gICAgICogQHNpbmNlIDAuMS4wXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBNZXJzZW5uZVR3aXN0ZXIucHJvdG90eXBlLmludCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHksXG4gICAgICAgICAgICBrayxcbiAgICAgICAgICAgIG1hZzAxID0gbmV3IEFycmF5KDAsIE1BVFJJWF9BKTtcblxuICAgICAgICBpZiAodGhpcy5tdGkgPj0gTikge1xuICAgICAgICAgICAgaWYgKHRoaXMubXRpID09PSBOICsgMSkge1xuICAgICAgICAgICAgICAgIHRoaXMuc2VlZCg1NDg5KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZm9yIChrayA9IDA7IGtrIDwgTiAtIE07IGtrKyspIHtcbiAgICAgICAgICAgICAgICB5ID0gKHRoaXMubXRba2tdICYgVVBQRVJfTUFTSykgfCAodGhpcy5tdFtrayArIDFdICYgTE9XRVJfTUFTSyk7XG4gICAgICAgICAgICAgICAgdGhpcy5tdFtra10gPSB0aGlzLm10W2trICsgTV0gXiAoeSA+Pj4gMSkgXiBtYWcwMVt5ICYgMV07XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGZvciAoOyBrayA8IE4gLSAxOyBraysrKSB7XG4gICAgICAgICAgICAgICAgeSA9ICh0aGlzLm10W2trXSAmIFVQUEVSX01BU0spIHwgKHRoaXMubXRba2sgKyAxXSAmIExPV0VSX01BU0spO1xuICAgICAgICAgICAgICAgIHRoaXMubXRba2tdID0gdGhpcy5tdFtrayArIChNIC0gTildIF4gKHkgPj4+IDEpIF4gbWFnMDFbeSAmIDFdO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB5ID0gKHRoaXMubXRbTiAtIDFdICYgVVBQRVJfTUFTSykgfCAodGhpcy5tdFswXSAmIExPV0VSX01BU0spO1xuICAgICAgICAgICAgdGhpcy5tdFtOIC0gMV0gPSB0aGlzLm10W00gLSAxXSBeICh5ID4+PiAxKSBeIG1hZzAxW3kgJiAxXTtcbiAgICAgICAgICAgIHRoaXMubXRpID0gMDtcbiAgICAgICAgfVxuXG4gICAgICAgIHkgPSB0aGlzLm10W3RoaXMubXRpKytdO1xuXG4gICAgICAgIHkgXj0gKHkgPj4+IDExKTtcbiAgICAgICAgeSBePSAoeSA8PCA3KSAmIDB4OWQyYzU2ODA7XG4gICAgICAgIHkgXj0gKHkgPDwgMTUpICYgMHhlZmM2MDAwMDtcbiAgICAgICAgeSBePSAoeSA+Pj4gMTgpO1xuXG4gICAgICAgIHJldHVybiB5ID4+PiAwO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSByYW5kb20gdW5zaWduZWQgMzEtYml0IGludGVnZXIuXG4gICAgICpcbiAgICAgKiBAc2luY2UgMC4xLjBcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIE1lcnNlbm5lVHdpc3Rlci5wcm90b3R5cGUuaW50MzEgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmludCgpID4+PiAxO1xuICAgIH07XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSByYW5kb20gcmVhbCBpbiB0aGUgaW50ZXJ2YWwgWzA7MV0gd2l0aCAzMi1iaXQgcmVzb2x1dGlvbi5cbiAgICAgKlxuICAgICAqIEBzaW5jZSAwLjEuMFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgTWVyc2VubmVUd2lzdGVyLnByb3RvdHlwZS5yZWFsID0gZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5pbnQoKSAqICgxLjAgLyAoTUFYX0lOVCAtIDEpKTtcbiAgICB9O1xuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGVzIGEgcmFuZG9tIHJlYWwgaW4gdGhlIGludGVydmFsIF0wOzFbIHdpdGggMzItYml0IHJlc29sdXRpb24uXG4gICAgICpcbiAgICAgKiBAc2luY2UgMC4xLjBcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIE1lcnNlbm5lVHdpc3Rlci5wcm90b3R5cGUucmVhbHggPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiAodGhpcy5pbnQoKSArIDAuNSkgKiAoMS4wIC8gTUFYX0lOVCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlcyBhIHJhbmRvbSByZWFsIGluIHRoZSBpbnRlcnZhbCBbMDsxWyB3aXRoIDMyLWJpdCByZXNvbHV0aW9uLlxuICAgICAqXG4gICAgICogQHNpbmNlIDAuMS4wXG4gICAgICogQHJldHVybnMge251bWJlcn1cbiAgICAgKi9cbiAgICBNZXJzZW5uZVR3aXN0ZXIucHJvdG90eXBlLnJuZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuaW50KCkgKiAoMS4wIC8gTUFYX0lOVCk7XG4gICAgfTtcblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlcyBhIHJhbmRvbSByZWFsIGluIHRoZSBpbnRlcnZhbCBbMDsxWyB3aXRoIDMyLWJpdCByZXNvbHV0aW9uLlxuICAgICAqXG4gICAgICogU2FtZSBhcyAucm5kKCkgbWV0aG9kIC0gZm9yIGNvbnNpc3RlbmN5IHdpdGggTWF0aC5yYW5kb20oKSBpbnRlcmZhY2UuXG4gICAgICpcbiAgICAgKiBAc2luY2UgMC4yLjBcbiAgICAgKiBAcmV0dXJucyB7bnVtYmVyfVxuICAgICAqL1xuICAgIE1lcnNlbm5lVHdpc3Rlci5wcm90b3R5cGUucmFuZG9tID0gTWVyc2VubmVUd2lzdGVyLnByb3RvdHlwZS5ybmQ7XG5cbiAgICAvKipcbiAgICAgKiBHZW5lcmF0ZXMgYSByYW5kb20gcmVhbCBpbiB0aGUgaW50ZXJ2YWwgWzA7MVsgd2l0aCA1My1iaXQgcmVzb2x1dGlvbi5cbiAgICAgKlxuICAgICAqIEBzaW5jZSAwLjEuMFxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgTWVyc2VubmVUd2lzdGVyLnByb3RvdHlwZS5ybmRIaVJlcyA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGEgPSB0aGlzLmludCgpID4+PiA1LFxuICAgICAgICAgICAgYiA9IHRoaXMuaW50KCkgPj4+IDY7XG5cbiAgICAgICAgcmV0dXJuIChhICogNjcxMDg4NjQuMCArIGIpICogKDEuMCAvIDkwMDcxOTkyNTQ3NDA5OTIuMCk7XG4gICAgfTtcblxuICAgIHZhciBpbnN0YW5jZSA9IG5ldyBNZXJzZW5uZVR3aXN0ZXIoKTtcblxuICAgIC8qKlxuICAgICAqIEEgc3RhdGljIHZlcnNpb24gb2YgW3JuZF17QGxpbmsgbW9kdWxlOk1lcnNlbm5lVHdpc3RlciNybmR9IG9uIGEgcmFuZG9tbHkgc2VlZGVkIGluc3RhbmNlLlxuICAgICAqXG4gICAgICogQHN0YXRpY1xuICAgICAqIEBmdW5jdGlvbiByYW5kb21cbiAgICAgKiBAbWVtYmVyb2YgbW9kdWxlOk1lcnNlbm5lVHdpc3RlclxuICAgICAqIEByZXR1cm5zIHtudW1iZXJ9XG4gICAgICovXG4gICAgTWVyc2VubmVUd2lzdGVyLnJhbmRvbSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIGluc3RhbmNlLnJuZCgpO1xuICAgIH07XG5cbiAgICByZXR1cm4gTWVyc2VubmVUd2lzdGVyO1xufSkpO1xuIiwiLy8gc3RhdHMuanMgLSBodHRwOi8vZ2l0aHViLmNvbS9tcmRvb2Ivc3RhdHMuanNcbnZhciBTdGF0cz1mdW5jdGlvbigpe3ZhciBsPURhdGUubm93KCksbT1sLGc9MCxuPUluZmluaXR5LG89MCxoPTAscD1JbmZpbml0eSxxPTAscj0wLHM9MCxmPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7Zi5pZD1cInN0YXRzXCI7Zi5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsZnVuY3Rpb24oYil7Yi5wcmV2ZW50RGVmYXVsdCgpO3QoKytzJTIpfSwhMSk7Zi5zdHlsZS5jc3NUZXh0PVwid2lkdGg6ODBweDtvcGFjaXR5OjAuOTtjdXJzb3I6cG9pbnRlclwiO3ZhciBhPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7YS5pZD1cImZwc1wiO2Euc3R5bGUuY3NzVGV4dD1cInBhZGRpbmc6MCAwIDNweCAzcHg7dGV4dC1hbGlnbjpsZWZ0O2JhY2tncm91bmQtY29sb3I6IzAwMlwiO2YuYXBwZW5kQ2hpbGQoYSk7dmFyIGk9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtpLmlkPVwiZnBzVGV4dFwiO2kuc3R5bGUuY3NzVGV4dD1cImNvbG9yOiMwZmY7Zm9udC1mYW1pbHk6SGVsdmV0aWNhLEFyaWFsLHNhbnMtc2VyaWY7Zm9udC1zaXplOjlweDtmb250LXdlaWdodDpib2xkO2xpbmUtaGVpZ2h0OjE1cHhcIjtcbmkuaW5uZXJIVE1MPVwiRlBTXCI7YS5hcHBlbmRDaGlsZChpKTt2YXIgYz1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO2MuaWQ9XCJmcHNHcmFwaFwiO2Muc3R5bGUuY3NzVGV4dD1cInBvc2l0aW9uOnJlbGF0aXZlO3dpZHRoOjc0cHg7aGVpZ2h0OjMwcHg7YmFja2dyb3VuZC1jb2xvcjojMGZmXCI7Zm9yKGEuYXBwZW5kQ2hpbGQoYyk7NzQ+Yy5jaGlsZHJlbi5sZW5ndGg7KXt2YXIgaj1kb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic3BhblwiKTtqLnN0eWxlLmNzc1RleHQ9XCJ3aWR0aDoxcHg7aGVpZ2h0OjMwcHg7ZmxvYXQ6bGVmdDtiYWNrZ3JvdW5kLWNvbG9yOiMxMTNcIjtjLmFwcGVuZENoaWxkKGopfXZhciBkPWRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7ZC5pZD1cIm1zXCI7ZC5zdHlsZS5jc3NUZXh0PVwicGFkZGluZzowIDAgM3B4IDNweDt0ZXh0LWFsaWduOmxlZnQ7YmFja2dyb3VuZC1jb2xvcjojMDIwO2Rpc3BsYXk6bm9uZVwiO2YuYXBwZW5kQ2hpbGQoZCk7dmFyIGs9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcbmsuaWQ9XCJtc1RleHRcIjtrLnN0eWxlLmNzc1RleHQ9XCJjb2xvcjojMGYwO2ZvbnQtZmFtaWx5OkhlbHZldGljYSxBcmlhbCxzYW5zLXNlcmlmO2ZvbnQtc2l6ZTo5cHg7Zm9udC13ZWlnaHQ6Ym9sZDtsaW5lLWhlaWdodDoxNXB4XCI7ay5pbm5lckhUTUw9XCJNU1wiO2QuYXBwZW5kQ2hpbGQoayk7dmFyIGU9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtlLmlkPVwibXNHcmFwaFwiO2Uuc3R5bGUuY3NzVGV4dD1cInBvc2l0aW9uOnJlbGF0aXZlO3dpZHRoOjc0cHg7aGVpZ2h0OjMwcHg7YmFja2dyb3VuZC1jb2xvcjojMGYwXCI7Zm9yKGQuYXBwZW5kQ2hpbGQoZSk7NzQ+ZS5jaGlsZHJlbi5sZW5ndGg7KWo9ZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNwYW5cIiksai5zdHlsZS5jc3NUZXh0PVwid2lkdGg6MXB4O2hlaWdodDozMHB4O2Zsb2F0OmxlZnQ7YmFja2dyb3VuZC1jb2xvcjojMTMxXCIsZS5hcHBlbmRDaGlsZChqKTt2YXIgdD1mdW5jdGlvbihiKXtzPWI7c3dpdGNoKHMpe2Nhc2UgMDphLnN0eWxlLmRpc3BsYXk9XG5cImJsb2NrXCI7ZC5zdHlsZS5kaXNwbGF5PVwibm9uZVwiO2JyZWFrO2Nhc2UgMTphLnN0eWxlLmRpc3BsYXk9XCJub25lXCIsZC5zdHlsZS5kaXNwbGF5PVwiYmxvY2tcIn19O3JldHVybntSRVZJU0lPTjoxMixkb21FbGVtZW50OmYsc2V0TW9kZTp0LGJlZ2luOmZ1bmN0aW9uKCl7bD1EYXRlLm5vdygpfSxlbmQ6ZnVuY3Rpb24oKXt2YXIgYj1EYXRlLm5vdygpO2c9Yi1sO249TWF0aC5taW4obixnKTtvPU1hdGgubWF4KG8sZyk7ay50ZXh0Q29udGVudD1nK1wiIE1TIChcIituK1wiLVwiK28rXCIpXCI7dmFyIGE9TWF0aC5taW4oMzAsMzAtMzAqKGcvMjAwKSk7ZS5hcHBlbmRDaGlsZChlLmZpcnN0Q2hpbGQpLnN0eWxlLmhlaWdodD1hK1wicHhcIjtyKys7Yj5tKzFFMyYmKGg9TWF0aC5yb3VuZCgxRTMqci8oYi1tKSkscD1NYXRoLm1pbihwLGgpLHE9TWF0aC5tYXgocSxoKSxpLnRleHRDb250ZW50PWgrXCIgRlBTIChcIitwK1wiLVwiK3ErXCIpXCIsYT1NYXRoLm1pbigzMCwzMC0zMCooaC8xMDApKSxjLmFwcGVuZENoaWxkKGMuZmlyc3RDaGlsZCkuc3R5bGUuaGVpZ2h0PVxuYStcInB4XCIsbT1iLHI9MCk7cmV0dXJuIGJ9LHVwZGF0ZTpmdW5jdGlvbigpe2w9dGhpcy5lbmQoKX19fTtcIm9iamVjdFwiPT09dHlwZW9mIG1vZHVsZSYmKG1vZHVsZS5leHBvcnRzPVN0YXRzKTtcbiIsInZhciBnbE1hdHJpeCA9IHJlcXVpcmUoJ2dsLW1hdHJpeCcpLFxuICAgIENvbnRleHQgID0gcmVxdWlyZSgnLi8uLi9Db250ZXh0JyksXG4gICAgTWVzaCAgICAgPSByZXF1aXJlKCcuLy4uL2xpYi9NZXNoJyksXG4gICAgR2VvbSAgICAgPSByZXF1aXJlKCcuLy4uL2xpYi9HZW9tJyksXG4gICAgUXVhZFRyZWUgPSByZXF1aXJlKCcuLy4uL2xpYi9RdWFkVHJlZScpLFxuICAgIExvYWRlciAgID0gcmVxdWlyZSgnLi8uLi9saWIvTG9hZGVyJyksXG4gICAgdmVjMyAgICAgPSBnbE1hdHJpeC52ZWMzLFxuICAgIG1hdDQgICAgID0gZ2xNYXRyaXgubWF0NCxcbiAgICBnbCAgICAgICA9IENvbnRleHQuZ2wsXG4gICAgQnVpbGRpbmdTSEcgPSByZXF1aXJlKCcuLi9nZW5lcmF0b3JzL0J1aWxkaW5nU0hHLmpzJyksXG4gICAgQ2l0eSA9IHJlcXVpcmUoJy4uL2dlbmVyYXRvcnMvQ2l0eS5qcycpO1xuXG52YXIgY29tcHV0ZUJsb2NrTWVzaCA9IGZ1bmN0aW9uKGJsb2NrLCBhdmFpbENvbG9ycykge1xuICB2YXIgdmVydGljZXMgPSBbXSxcbiAgICAgIG5vcm1hbHMgID0gW10sXG4gICAgICB1dnMgICAgICA9IFtdLFxuICAgICAgZXh0cmEgICAgPSBbXSxcbiAgICAgIGxpZ2h0cyAgID0gW10sXG4gICAgICBjb3VudCAgICA9IDA7XG5cbiAgZm9yKHZhciBqID0gMCwgbiA9IGJsb2NrLmxvdHMubGVuZ3RoOyBqIDwgbjsgaisrKSB7XG4gICAgdmFyIGxvdCwgaCwgY3gsIGN5LCB4bSwgeE0sIHltLCB5TTtcbiAgICBsb3QgPSBibG9jay5sb3RzW2pdO1xuICAgIGggPSBsb3QuaGVpZ2h0LCBsb3QgPSBsb3QucG9seTtcblxuICAgIGN4ID0gY3kgPSAwO1xuICAgIHhtID0geW0gPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG4gICAgeE0gPSB5TSA9IE51bWJlci5ORUdBVElWRV9JTkZJTklUWTtcblxuICAgIGZvcih2YXIgayA9IDAsIEsgPSBsb3QubGVuZ3RoOyBrIDwgSzsgaysrKSB7XG4gICAgICB2YXIgY3VyID0gbG90W2tdO1xuICAgICAgY3ggKz0gY3VyLng7XG4gICAgICBjeSArPSBjdXIueTtcblxuICAgICAgeG0gPSBNYXRoLm1pbih4bSwgY3VyLngpO1xuICAgICAgeE0gPSBNYXRoLm1heCh4TSwgY3VyLngpO1xuICAgICAgeW0gPSBNYXRoLm1pbih5bSwgY3VyLnkpO1xuICAgICAgeU0gPSBNYXRoLm1heCh5TSwgY3VyLnkpO1xuXG4gICAgfVxuICAgIFxuICAgIGN4IC89IGxvdC5sZW5ndGg7XG4gICAgY3kgLz0gbG90Lmxlbmd0aDtcblxuICAgIHZhciBibGRnID0gQnVpbGRpbmdTSEcuY3JlYXRlKHtcbiAgICAgIHg6IGN4LCB5OiBjeSxcbiAgICAgIHdpZHRoOiBNYXRoLmFicyh4TSAtIHhtKSAqIC45LFxuICAgICAgZGVwdGg6IE1hdGguYWJzKHlNIC0geW0pICogLjlcbiAgICB9KSwgXG4gICAgYmxkZ0dlb20gPSBibGRnLmdlb20sIFxuICAgIGNvbG9yID0gYmxkZy5jb2xvcjtcblxuICAgIGZvcih2YXIgbCA9IDAsIEwgPSBibGRnR2VvbS5sZW5ndGg7IGwgPCBMOyBsKyspIHtcblxuICAgICAgdmFyIGJnID0gYmxkZ0dlb21bbF07IC8vLnNoaWZ0KCk7XG5cbiAgICAgIGlmKGJnLnN5bSA9PT0gJ0xJR0hUJylcbiAgICAgICAgbGlnaHRzLnB1c2goYmcubGlnaHRQb3MpO1xuICAgICAgZWxzZVxuICAgICAgICBmb3IodmFyIGsgPSAwLCBLID0gYmcudmVydGljZXMubGVuZ3RoOyBrIDwgSzsgaysrKSB7XG4gICAgICAgICAgdmVydGljZXMucHVzaChiZy52ZXJ0aWNlc1trXSk7XG4gICAgICAgICAgbm9ybWFscy5wdXNoKGJnLm5vcm1hbHNba10pO1xuICAgICAgICAgIHV2cy5wdXNoKGJnLnV2c1trXSk7XG4gICAgICAgICAgZXh0cmEucHVzaChjb2xvcltrICUgM10pO1xuICAgICAgICB9XG5cbiAgICAgIGJsZGdHZW9tW2xdID0gbnVsbDtcbiAgICB9XG5cbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbWVzaDogbmV3IE1lc2godmVydGljZXMsIG5vcm1hbHMsIHV2cywgZXh0cmEpLFxuICAgIGxpZ2h0czogbGlnaHRzLFxuICAgIHg6IGJsb2NrLngsXG4gICAgeTogYmxvY2sueSxcbiAgICB3OiBibG9jay53XG4gIH07XG59XG5cbnZhciBjaXR5ID0gbmV3IENpdHkoMCksXG4gICAgZ2VvbSA9IHtcbiAgICAgIHF1YWR0cmVlOiBudWxsLFxuICAgICAgcXVhZHRyZWVMaWdodHM6IG51bGwsXG4gICAgICBmaXhlZE1lc2hlczogW11cbiAgICB9O1xuXG52YXIgbG9nID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgncHJlJyk7XG5sb2cuc3R5bGUuYmFja2dyb3VuZCA9ICd3aGl0ZSc7XG5sb2cuc3R5bGUuY29sb3IgPSAnYmxhY2snO1xubG9nLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcbmxvZy5zdHlsZS5yaWdodCA9ICcxcmVtJztcbmxvZy5zdHlsZS50b3AgPSAnN3JlbSc7XG5cbkNvbnRleHQuY2FudmFzLnBhcmVudEVsZW1lbnQuYXBwZW5kQ2hpbGQobG9nKTtcblxuKGZ1bmN0aW9uKCkge1xuICB2YXIgdmVydGljZXMgPSBbXSxcbiAgICAgIG5vcm1hbHMgID0gW10sXG4gICAgICB1dnMgICAgICA9IFtdLFxuICAgICAgZXh0cmEgICAgPSBbXSxcbiAgICAgIGNvdW50ID0gMCxcbiAgICAgIGJsb2NrLCBibG9ja3EsIGxvdCwgaCwgY29sLFxuICAgICAgbUkgPSAwLFxuICAgICAgbWVzaGVzID0gW10sXG4gICAgICBibG9ja3MgPSBbXSxcbiAgICAgIGxpZ2h0cyA9IFtdLFxuICAgICAgcXRyZWUsIHF0cmVlTDtcblxuICB2YXIgYmxvY2tzUHJvZ3Jlc3MgPSAwLCBibG9ja3NDb3VudCA9IGNpdHkuYmxvY2tzLmxlbmd0aDtcblxuICB3aGlsZShjaXR5LmJsb2Nrcy5sZW5ndGgpIHtcbiAgICBibG9jayA9IGNpdHkuYmxvY2tzLnNoaWZ0KCk7XG4gICAgc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgIHZhciBtID0gY29tcHV0ZUJsb2NrTWVzaCh0aGlzKTtcbiAgICAgIGJsb2Nrcy5wdXNoKG0pO1xuICAgICAgYmxvY2tzUHJvZ3Jlc3MrKztcbiAgICAgIExvYWRlci5wcm9ncmVzcygnQmxvY2tzJywgYmxvY2tzUHJvZ3Jlc3MgLyBibG9ja3NDb3VudCk7XG4gICAgfS5iaW5kKGJsb2NrKSwgMCk7XG4gIH1cblxuICBMb2FkZXIuc3Vic2NyaWJlKCdCbG9ja3MnLCAoZnVuY3Rpb24oZ2VvbSwgYmxvY2tzKSB7IHJldHVybiBmdW5jdGlvbigpIHtcbiAgICB2YXIgeG0sIHltLCB4TSwgeU07XG4gICAgeG0gPSB5bSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcbiAgICB4TSA9IHlNID0gTnVtYmVyLk5FR0FUSVZFX0lORklOSVRZO1xuXG4gICAgYmxvY2tzLmZvckVhY2goZnVuY3Rpb24oaSkge1xuICAgICAgeG0gPSBNYXRoLm1pbih4bSwgaS54IC0gaS53KTtcbiAgICAgIHhNID0gTWF0aC5tYXgoeE0sIGkueCArIGkudyk7XG4gICAgICB5bSA9IE1hdGgubWluKHltLCBpLnkgLSBpLncpO1xuICAgICAgeU0gPSBNYXRoLm1heCh5TSwgaS55ICsgaS53KTtcbiAgICB9KTtcblxuICAgIHZhciBxeCA9IE1hdGguYWJzKHhNIC0geG0pIC8gMixcbiAgICAgICAgcXkgPSBNYXRoLmFicyh5TSAtIHltKSAvIDI7XG5cbiAgICBxdHJlZSA9IG5ldyBRdWFkVHJlZShxeCwgcXksIE1hdGgubWF4KHF4LCBxeSksIDQpO1xuICAgIHF0cmVlTCA9IG5ldyBRdWFkVHJlZShxeCwgcXksIE1hdGgubWF4KHF4LCBxeSksIDgpO1xuXG4gICAgYmxvY2tzLmZvckVhY2goZnVuY3Rpb24oaSkge1xuICAgICAgcXRyZWUuaW5zZXJ0KGkpO1xuICAgICAgLyppLmxpZ2h0cy5mb3JFYWNoKGZ1bmN0aW9uKGkpIHtcbiAgICAgICAgcXRyZWVMLmluc2VydCh7IHg6IGkueCwgeTogaS56LCBsOiBpIH0pO1xuICAgICAgfSk7Ki9cbiAgICB9KTtcblxuICAgIGdlb20ucXVhZHRyZWUgPSBxdHJlZTtcbiAgICBnZW9tLnF1YWR0cmVlTGlnaHRzID0gcXRyZWVMO1xuXG4gICAgY29uc29sZS5sb2coZ2VvbS5xdWFkdHJlZUxpZ2h0cy5xdWVyeSg2LCA2LCAuMjUpLmxlbmd0aCk7XG5cbiAgfX0oZ2VvbSwgYmxvY2tzKSkpO1xuXG4gIHZlcnRpY2VzLnB1c2guYXBwbHkodmVydGljZXMsIFtcbiAgICAtMjAsIC0xMGUtNCwgLTIwLCAgLTIwLCAtMTBlLTQsIDIwLCAgMjAsIC0xMGUtNCwgMjAsXG4gICAgLTIwLCAtMTBlLTQsIC0yMCwgICAyMCwgLTEwZS00LCAyMCwgIDIwLCAtMTBlLTQsIC0yMFxuICBdKTtcblxuICBub3JtYWxzLnB1c2guYXBwbHkobm9ybWFscywgW1xuICAgIDAsIDEsIDAsICAwLCAxLCAwLCAgMCwgMSwgMCxcbiAgICAwLCAxLCAwLCAgMCwgMSwgMCwgIDAsIDEsIDBcbiAgXSk7XG4gIHV2cy5wdXNoLmFwcGx5KHV2cywgW1xuICAgIDAsIDAsIDMsICAwLCA0MCwgMywgIDQwLCA0MCwgMywgIFxuICAgIDAsIDAsIDMsICA0MCwgNDAsIDMsICA0MCwgMCwgM1xuICBdKTtcbiAgZXh0cmEucHVzaC5hcHBseShleHRyYSwgW1xuICAgIDAsIDAsIDAsICAwLCAwLCAwLCAgMCwgMCwgMCxcbiAgICAwLCAwLCAwLCAgMCwgMCwgMCwgIDAsIDAsIDBcbiAgXSk7XG5cbiAgdmFyIHJvYWRRdWFkcyA9IGNpdHkucm9hZFF1YWRzLnJlZHVjZSgoZnVuY3Rpb24oKSB7IFxuICAgIHZhciBOLCBVO1xuICAgIE4gPSBbXG4gICAgICAwLCAtMSwgMCwgMCwgLTEsIDAsIDAsIC0xLCAwLFxuICAgICAgMCwgLTEsIDAsIDAsIC0xLCAwLCAwLCAtMSwgMFxuICAgIF07XG4gICAgVSA9IFtcbiAgICAgIDAsIDAsIDIsICAwLCAxLCAyLCAgMSwgMSwgMiwgIFxuICAgICAgMCwgMCwgMiwgIDEsIDEsIDIsICAxLCAwLCAyXG4gICAgXTtcbiAgICByZXR1cm4gZnVuY3Rpb24ob3V0LCBpKSB7XG4gIFxuICAgICAgdmFyIGFhID0gaVswXSwgYmIgPSBpWzFdLFxuICAgICAgICAgIHNsb3BlID0gTWF0aC5hdGFuMihiYi55IC0gYWEueSwgYmIueCAtIGFhLngpICsgTWF0aC5QSSAvIDIsXG4gICAgICAgICAgZHggPSBNYXRoLmFicyguMDkgKiBNYXRoLmNvcyhzbG9wZSkpLCBcbiAgICAgICAgICBkeSA9IE1hdGguYWJzKC4wOSAqIE1hdGguc2luKHNsb3BlKSksXG4gICAgICAgICAgLy9iID0gYmIsIGEgPSBhYSxcbiAgICAgICAgICBhID0geyB4OiBhYS54ICsgZHksIHk6IGFhLnkgKyBkeCB9LFxuICAgICAgICAgIGIgPSB7IHg6IGJiLnggLSBkeSwgeTogYmIueSAtIGR4IH0sXG4gICAgICAgICAgbGVuID0gTWF0aC5zcXJ0KCBNYXRoLnBvdyhiLnkgLSBhLnksIDIpICsgTWF0aC5wb3coYi54IC0gYS54LCAyKSApO1xuXG4gICAgICB2YXIgdmVydGljZXMgPSBbXG4gICAgICAgIGEueCAtIGR4LCAwLCBhLnkgLSBkeSwgIGIueCAtIGR4LCAwLCBiLnkgLSBkeSwgIGIueCArIGR4LCAwLCBiLnkgKyBkeSxcbiAgICAgICAgYS54IC0gZHgsIDAsIGEueSAtIGR5LCAgYi54ICsgZHgsIDAsIGIueSArIGR5LCAgYS54ICsgZHgsIDAsIGEueSArIGR5XG4gICAgICBdLCB1dnMgPSBVLm1hcChmdW5jdGlvbihpLCBpZHgpIHtcbiAgICAgICAgc3dpdGNoKGlkeCAlIDMpIHtcbiAgICAgICAgICBjYXNlIDA6IHJldHVybiBpOyBicmVhaztcbiAgICAgICAgICBjYXNlIDE6IHJldHVybiBpICogbGVuOyBicmVhaztcbiAgICAgICAgICBkZWZhdWx0OiByZXR1cm4gaTtcbiAgICAgICAgfVxuICAgICAgIHJldHVybiBpO1xuICAgICAgfSk7XG5cbiAgICAgIGZvcih2YXIgayA9IDAsIEsgPSB2ZXJ0aWNlcy5sZW5ndGg7IGsgPCBLOyBrKyspIHtcbiAgICAgICAgb3V0LnZlcnRpY2VzLnB1c2godmVydGljZXNba10pO1xuICAgICAgICBvdXQubm9ybWFscy5wdXNoKE5ba10pO1xuICAgICAgICBvdXQudXZzLnB1c2godXZzW2tdKTtcbiAgICAgICAgb3V0LmV4dHJhLnB1c2goMCk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiBvdXQ7XG4gICAgfVxuICB9KCkpLCB7IHZlcnRpY2VzOiBbXSwgbm9ybWFsczogW10sIHV2czogW10sIGV4dHJhOiBbXSB9KTtcblxuICBmb3IodmFyIGsgPSAwLCBLID0gcm9hZFF1YWRzLnZlcnRpY2VzLmxlbmd0aDsgayA8IEs7IGsrKykge1xuICAgIHZlcnRpY2VzLnB1c2gocm9hZFF1YWRzLnZlcnRpY2VzW2tdKTtcbiAgICBub3JtYWxzLnB1c2gocm9hZFF1YWRzLm5vcm1hbHNba10pO1xuICAgIHV2cy5wdXNoKHJvYWRRdWFkcy51dnNba10pO1xuICAgIGV4dHJhLnB1c2gocm9hZFF1YWRzLmV4dHJhW2tdKTtcbiAgfVxuXG4gIGdlb20uZml4ZWRNZXNoZXMgPSBbbmV3IE1lc2godmVydGljZXMsIG5vcm1hbHMsIHV2cywgZXh0cmEpXTtcblxufSgpKTtcblxudmFyIHNjZW5lID0ge1xuICBtZXNoZXM6IFtdLFxuICBsaWdodHM6IFtdLFxuICBsaWdodFBvczogdmVjMy5jcmVhdGUoKSxcbiAgdmlldzogIG1hdDQuY3JlYXRlKCksXG4gIG1vZGVsOiBtYXQ0LmNyZWF0ZSgpLFxuICBjb3VudDogMFxufTtcblxuY29uc29sZS5sb2coZ2VvbSlcblxudmFyIHQgPSAwLiwgcHVzaEZuID0gZnVuY3Rpb24obywgaSkgeyBvLnB1c2goaSk7IHJldHVybiBvOyB9LFxuICAgIHggPSA2LCB5ID0gMjAsIHogPSA2LCBhbHBoYSA9IE1hdGguUEkgLyAyLCBiZXRhID0gMDtcblxudmFyIHRsZXJwID0gZnVuY3Rpb24oc3RhcnQsIGVuZCwgdHMpIHtcbiAgcmV0dXJuICh0cyAtIHN0YXJ0KSAvIChlbmQgLSBzdGFydCk7XG59XG5cbnZhciBsZXJwID0gZnVuY3Rpb24oYSwgYiwgdCkge1xuICByZXR1cm4gYSAqICgxIC0gdCkgKyBiICogdDtcbn1cblxudmFyIHBvbHlFYXNpbmcgPSBmdW5jdGlvbih4KSB7IHJldHVybiB4ICogeCAqIHggKiAoeCAqICg2ICogeCAtIDE1KSArIDEwKSB9O1xuXG52YXIgY2FsY1Bvc2l0aW9ucyA9IGZ1bmN0aW9uKHRzKSB7XG5cbiAgbG9nLnRleHRDb250ZW50ID0gcGFyc2VJbnQodHMpO1xuICBpZih0cyA8IDUwMDApIHtcbiAgICB2YXIgdCA9IHBvbHlFYXNpbmcodGxlcnAoMCwgNTAwMCwgdHMpKTtcbiAgICB5ID0gbGVycCgyMCwgLjA1LCB0KTtcbiAgfVxuXG4gIGlmKHRzID49IDQwMDAgJiYgdHMgPCA1MDAwKSB7XG4gICAgdmFyIHQgPSBwb2x5RWFzaW5nKHRsZXJwKDQwMDAsIDUwMDAsIHRzKSk7XG4gICAgYWxwaGEgPSBsZXJwKE1hdGguUEkgLyAyLCAwLCB0KTtcbiAgICBiZXRhID0gbGVycCgwLCBNYXRoLlBJLCB0KTtcbiAgfVxuXG4gIGlmKHRzID49IDQwMDAgJiYgdHMgPCAyMDAwMCkge1xuICAgIHZhciB0ID0gcG9seUVhc2luZyh0bGVycCg0MDAwLCAyMDAwMCwgdHMpKTtcbiAgICB4ID0gbGVycCg2LCAxMCwgdCk7XG4gIH1cblxuICBpZih0cyA+PSA1MDAwICYmIHRzIDwgMTk1MDApIHtcbiAgICB2YXIgdCA9IHBvbHlFYXNpbmcodGxlcnAoNTAwMCwgMjAwMDAsIHRzKSk7XG4gICAgYmV0YSA9IGxlcnAoTWF0aC5QSSwgTWF0aC5QSSAqIDMvMiwgdCk7XG4gIH1cblxuICBpZih0cyA+PSAxOTUwMCAmJiB0cyA8IDIwNTAwKSB7XG4gICAgdmFyIHQgPSBwb2x5RWFzaW5nKHRsZXJwKDE5NTAwLCAyMDUwMCwgdHMpKTtcbiAgICBhbHBoYSA9IGxlcnAoMCwgLSBNYXRoLlBJIC8gMiwgdCk7XG4gIH1cblxuICBpZih0cyA+PSAyMDAwMCAmJiB0cyA8IDIyNTAwKSB7XG4gICAgdmFyIHQgPSBwb2x5RWFzaW5nKHRsZXJwKDIwMDAwLCAyMjUwMCwgdHMpKTtcbiAgICBiZXRhID0gbGVycChNYXRoLlBJICogMyAvIDIsIE1hdGguUEksIHQpO1xuICAgIHkgPSBsZXJwKC4wNSwgMS4wNSwgdCk7XG4gICAgeiA9IGxlcnAoNiwgMCwgdCk7XG4gIH1cblxuICBpZih0cyA+PSAyMDUwMCAmJiB0cyA8IDIyNTAwKSB7XG4gICAgdmFyIHQgPSBwb2x5RWFzaW5nKHRsZXJwKDIwNTAwLCAyMjUwMCwgdHMpKTtcbiAgICBhbHBoYSA9IGxlcnAoLSBNYXRoLlBJIC8gMiwgMCwgdCk7XG4gIH1cblxuICBpZih0cyA+PSAyMjUwMCAmJiB0cyA8IDMwMDAwKSB7XG4gICAgdmFyIHQgPSBwb2x5RWFzaW5nKHRsZXJwKDIyNTAwLCAzMDAwMCwgdHMpKTtcbiAgICB6ID0gbGVycCgwLCAxNCwgdCk7XG4gIH1cblxuICBpZih0cyA+PSAzMDAwMCkge1xuICAgIHZhciB0ID0gdGxlcnAoMzAwMDAsIDQwMDAwLCB0cyk7XG4gICAgeiA9IDA7XG4gICAgYWxwaGEgPSBNYXRoLlBJIC8gODtcbiAgICB4ID0gbGVycCgxMiwgMCwgdCk7XG4gIH1cblxufVxuXG5zY2VuZS51cGRhdGUgPSBmdW5jdGlvbih0aW1lc3RhbXApIHtcblxuICBjYWxjUG9zaXRpb25zKHRpbWVzdGFtcCk7XG5cbiAgdmVjMy5zZXQoc2NlbmUubGlnaHRQb3MsIDYsLjA1LCA2KTtcbiAgbWF0NC5pZGVudGl0eShzY2VuZS52aWV3KTtcblxuICBtYXQ0LnJvdGF0ZVgoc2NlbmUudmlldywgc2NlbmUudmlldywgYWxwaGEpO1xuICBtYXQ0LnJvdGF0ZVkoc2NlbmUudmlldywgc2NlbmUudmlldywgYmV0YSk7XG4gIG1hdDQudHJhbnNsYXRlKHNjZW5lLnZpZXcsIHNjZW5lLnZpZXcsIFsgLXgsIC15LCAteiBdKTtcblxuICBzY2VuZS5tZXNoZXMgPSBnZW9tLmZpeGVkTWVzaGVzLnJlZHVjZShwdXNoRm4sIFtdKTtcblxuICBzY2VuZS5tZXNoZXMgPSBnZW9tLnF1YWR0cmVlXG4gICAgLnF1ZXJ5KHgsIHosIDQpXG4gICAgLm1hcChmdW5jdGlvbihpKSB7IHJldHVybiBpLm1lc2ggfSlcbiAgICAucmVkdWNlKHB1c2hGbiwgc2NlbmUubWVzaGVzKTtcblxuICBzY2VuZS5saWdodHMgPSBnZW9tLnF1YWR0cmVlTGlnaHRzXG4gICAgLnF1ZXJ5KHgsIHosIC41KVxuICAgIC5tYXAoZnVuY3Rpb24oaSkgeyBcbiAgICAgIHJldHVybiBbIGkubC54LCBpLmwueSwgaS5sLnogXTtcbiAgICB9KTtcblxuICB0ICs9IC4wMDE7XG5cbiAgLy9jb25zb2xlLmxvZyhzY2VuZS5tZXNoZXMucmVkdWNlKGZ1bmN0aW9uKG8sIGkpIHsgbyArPSBpLmNvdW50OyByZXR1cm4gbzsgfSwgMCkpO1xuXG59XG4vLyA4NyA2NSA4MyA2ODtcblxuLypkb2N1bWVudC5ib2R5LmFkZEV2ZW50TGlzdGVuZXIoJ2tleWRvd24nLCBmdW5jdGlvbihldnQpIHtcblxuICB2YXIgZHggPSAwLCBkeiA9IDA7XG5cbiAgc3dpdGNoKGV2dC53aGljaCkge1xuICAgIGNhc2UgODc6IGR6ID0gLS4wNDsgYnJlYWs7XG4gICAgY2FzZSA4MzogZHogPSAuMDQ7IGJyZWFrO1xuICAgIGNhc2UgNjU6IGR4ID0gLS4wNDsgYnJlYWs7XG4gICAgY2FzZSA2ODogZHggPSAuMDQ7IGJyZWFrO1xuICB9XG5cbiAgeCArPSAtTWF0aC5zaW4oYmV0YSkgKiBNYXRoLmNvcyhhbHBoYSkgKiBkejtcbiAgeSArPSBNYXRoLnNpbihhbHBoYSkgKiBkejtcbiAgeiArPSBNYXRoLmNvcyhiZXRhKSAqIE1hdGguY29zKGFscGhhKSAqIGR6O1xuXG4gIGxvZy50ZXh0Q29udGVudCA9IFt4LHksel0ubWFwKGZ1bmN0aW9uKGkpIHsgcmV0dXJuIGkudG9GaXhlZCgyKSB9KS5qb2luKCcsICcpICsgJyAnICtcbiAgICAoTWF0aC5QSSAvIGFscGhhKS50b0ZpeGVkKDIpICsgJyAnICsgXG4gICAgKE1hdGguUEkgLyBiZXRhKS50b0ZpeGVkKDIpO1xuXG59KTtcblxuQ29udGV4dC5jYW52YXMuYWRkRXZlbnRMaXN0ZW5lcignbW91c2Vkb3duJywgZnVuY3Rpb24oZXZ0KSB7XG5cbiAgdmFyIG9uTW92ZSwgb25VcCwgeDAgPSBldnQuY2xpZW50WCwgeTAgPSBldnQuY2xpZW50WTtcblxuICBvbk1vdmUgPSBmdW5jdGlvbihldnQpIHtcbiAgICB2YXIgZHggPSBldnQuY2xpZW50WCAtIHgwLFxuICAgICAgICBkeSA9IGV2dC5jbGllbnRZIC0geTA7XG5cbiAgICBhbHBoYSArPSBkeSAqIC4wMDU7XG4gICAgYmV0YSArPSBkeCAqIC4wMDU7XG5cbiAgICB4MCA9IGV2dC5jbGllbnRYO1xuICAgIHkwID0gZXZ0LmNsaWVudFk7XG5cbiAgICBsb2cudGV4dENvbnRlbnQgPSBbeCx5LHpdLm1hcChmdW5jdGlvbihpKSB7IHJldHVybiBpLnRvRml4ZWQoMikgfSkuam9pbignLCAnKSArICcgJyArXG4gICAgICAoTWF0aC5QSSAvIGFscGhhKS50b0ZpeGVkKDIpICsgJyAnICsgXG4gICAgICAoTWF0aC5QSSAvIGJldGEpLnRvRml4ZWQoMik7XG4gICAgfVxuXG4gIG9uVXAgPSBmdW5jdGlvbihldnQpIHtcbiAgICBDb250ZXh0LmNhbnZhcy5yZW1vdmVFdmVudExpc3RlbmVyKCdtb3VzZW1vdmUnLCBvbk1vdmUpO1xuICAgIENvbnRleHQuY2FudmFzLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBvblVwKTtcbiAgfVxuXG4gIENvbnRleHQuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNlbW92ZScsIG9uTW92ZSk7XG4gIENvbnRleHQuY2FudmFzLmFkZEV2ZW50TGlzdGVuZXIoJ21vdXNldXAnLCBvblVwKTtcblxufSk7Ki9cblxubW9kdWxlLmV4cG9ydHMgPSBzY2VuZTtcbiJdfQ==
