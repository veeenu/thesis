var fs          = require('fs');
//var glslify     = require('glslify');
var Util        = require('./lib/util.js'),
    glMatrix    = require('glMatrix'),
    vec3        = glMatrix.vec3,
    mat3        = glMatrix.mat3,
    mat4        = glMatrix.mat4,
    Context     = require('Context'),
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

vsrcPass  = fs.readFileSync(__dirname + '/shaders/pass-vertex.glsl', 'utf-8');
fsrcPass  = fs.readFileSync(__dirname + '/shaders/pass-fragment.glsl', 'utf-8');
vsrcLight = fs.readFileSync(__dirname + '/shaders/light-vertex.glsl', 'utf-8');
fsrcLight = fs.readFileSync(__dirname + '/shaders/light-fragment.glsl', 'utf-8');

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
