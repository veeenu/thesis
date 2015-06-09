
#extension GL_OES_standard_derivatives : require
precision highp float;uniform sampler2D tex;uniform float fade;varying vec2 coord;void main(){vec3 color=texture2D(tex,coord).rgb;color=mix(vec3(0.),color,fade);gl_FragColor=vec4(color,1.);}