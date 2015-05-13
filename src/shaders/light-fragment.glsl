#extension GL_OES_standard_derivatives : enable
precision highp float;

uniform sampler2D target0, depthBuffer;
uniform mat4 inverseProjection, viewMatrix;

varying vec2 sscoord, coord;
varying vec3 lPos;

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

void main() {

  vec4 t0 = texture2D(target0, coord);
  if(length(t0.xy) == 0.)
    discard;

  float depth     = t0.w;

  vec4 vertexFromDepth = inverseProjection * vec4(sscoord, depth, 1.);
  vec3 vertex = vertexFromDepth.xyz / vertexFromDepth.w;
  vec3 lightDir = lPos - vertex;

  float dist = length(lightDir);
  if(dist > 4.)
    discard;

  vec3 normal = -normalize(unpackNormal(t0.xy)),
       color  = unpackColor(t0.z);

  float lambert = max(dot(faceforward(-normal, lightDir, normal), normalize(lightDir)), 0.),
        att = min(1., 1. / (.2 + .1 * dist + .8 * dist * dist));

  gl_FragColor = vec4(lambert * att * color, 1.);
  //gl_FragColor = vec4(color, 1.);
}
