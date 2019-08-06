#version 300 es

precision highp float;

uniform vec3 uCameraPosition;
uniform vec2 uResolution;
uniform vec3 uSphereCenters[11];

in vec2 aVertexPosition;
in vec4 aVertexColor;
out vec4 vColor;

void main(){
    gl_Position = vec4(aVertexPosition, 0, 1.);
    vColor = aVertexColor;
}