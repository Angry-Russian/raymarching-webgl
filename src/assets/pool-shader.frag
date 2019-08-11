#version 300 es

#define PI 3.14159265359
#define INFINITY 4611686018427388000.0

#define MAX_DISTANCE 100.0
#define HIT_THRESHOLD 0.00001
#define MAX_STEPS 10000

precision highp float;

in vec4 vColor;
uniform int uRaysPerPixel;
uniform int uMaxBounces;
uniform float uDoF;
uniform float uTime;
uniform vec3 uDirectionalLight;
uniform vec3 uCameraPosition;
uniform mat4 uCameraOrientation;
uniform vec2 uResolution;
uniform vec2 uFovea;
uniform vec3 uSphereCenters[11];
uniform vec4 uSphereColors[11];

uniform float uGravityStrength;
uniform float uLightSpeed;
uniform float uGravityExponent;

uniform samplerCube uSkybox;

out vec4 outColor;


#define HIT_NONE 0
#define HIT_PLANE 1
#define HIT_SPHERE 2

struct RayHit {
    vec3 origin;
    float dist;
    vec3 norm;
    int type;
    int object;
};

struct Ray {
    vec3 origin;
    vec3 direction;
    float lifetime;
};

RayHit checkSphere(vec3 p, vec3 c, float r) {
    return RayHit(
        p,
        distance(p, c) - r,
        normalize(p - c),
        HIT_SPHERE,
        0
    );
}

RayHit checkPlane(vec3 p, vec3 c, vec3 norm) {
    vec3 n = normalize(norm);
    return RayHit(
        p,
        dot(p - c, n),
        n,
        HIT_PLANE,
        0
    );
}

RayHit queryDatabase(Ray r) {
    // start off by checking against the table
    RayHit closestHit = RayHit(vec3(0), INFINITY, vec3(0, 1.0, 0), HIT_NONE, 0);

    RayHit rh = checkPlane(r.origin, vec3(0, -.5, 0), vec3(0, 1.0, 0));
    if(rh.dist <= HIT_THRESHOLD) {
        return rh;
    } else {
        closestHit = rh;
    }

    // check spheres
    for(int i = 0; i < 11; i++) {
        rh = checkSphere(r.origin, uSphereCenters[i], .5);
        if(rh.dist <= HIT_THRESHOLD) {
            rh.object = i;
            return rh;
        }
        if(rh.dist < closestHit.dist) {
            closestHit = rh;
        }
    }

    return closestHit;
}

float s = 0.;
float random() {
    s += 1.0;
    return fract(sin((uTime + gl_FragCoord.x / uResolution.x + gl_FragCoord.y / uResolution.y + s)*43758.5453123)*78.233);
}

float random2d (vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}


RayHit march(Ray r){
    RayHit rh;
    int steps = 0;
    while (r.lifetime < MAX_DISTANCE && steps++ < MAX_STEPS) {
        //  r.origin.z = mod(r.origin.z + 5.0, 10.0) - 5.0;
        //  r.origin.x = mod(r.origin.x + 3.0, 6.0) - 3.0;

        rh = queryDatabase(r);

        if(rh.dist < HIT_THRESHOLD) {
            break;
        } else {
            // vec3 newDirection = r.direction + vec3(0, -uGravityStrength * pow(rh.dist/uLightSpeed, uGravityExponent), 0);
            // float l = max(1.0, length(newDirection));
            // r.direction = normalize(newDirection) * l;
            r.origin += r.direction * rh.dist;
            rh.type = HIT_NONE;
        }
        r.lifetime += rh.dist;
    }
    return rh;
}

vec4 trace(Ray r, int maxBounces){

    vec4 rayColor = vec4(1.);
    Ray ray = Ray(r.origin, r.direction, r.lifetime);

    for(int bounce = 0; bounce < maxBounces; bounce++) {
        RayHit rh = march(ray);

        vec4 foundColor;
        // if we hit something, bounce.
        if(rh.type == HIT_SPHERE) {
            foundColor = uSphereColors[rh.object];
        } else if (rh.type == HIT_PLANE) {
            foundColor = vec4(.5);
        } else {
            foundColor = texture(uSkybox, ray.direction);
        }

        ray.origin = rh.origin;
        ray.origin += rh.norm * HIT_THRESHOLD;

        float reflectivity = rayColor.a;
        rayColor = vec4(rayColor.rgb * (dot(rh.norm, uDirectionalLight) + 1. / 2.), rayColor.a);
        rayColor += foundColor * (1. - reflectivity);
        rayColor *= foundColor * reflectivity;

        if(rh.type != HIT_NONE){
            ray.direction = normalize(reflect(ray.direction, rh.norm));
        } else {
            break;
        }
    }
    return rayColor;
}

void main() {
    float aspect = uResolution.x / uResolution.y;

    float step = 1.;
    // float step = 1. - distance(uFovea, gl_FragCoord.xy) / 1024.;
    int rays =  max(1, int(ceil(float(uRaysPerPixel) * step )));
    int bounces = max(1, int(ceil(float(uMaxBounces) * step )));

    vec4 cumulativeColor = vec4(0);
    for(int iRay = 0; iRay < rays; iRay++) {
        vec3 offset = vec3((random()) / uResolution.x, (random()) / uResolution.y, 0);
        vec3 direction = ((uCameraOrientation * vec4(0, 0, 1, 1)).xyz + vec3(
            (gl_FragCoord.x / uResolution.x * 2. - 1.),
            (gl_FragCoord.y / uResolution.y * 2. - 1.) / aspect,
            0
        ));

        Ray r = Ray(uCameraPosition - offset, normalize(direction + offset), 0.0);
        cumulativeColor += trace(r, bounces);
    }
    cumulativeColor /= float(uRaysPerPixel);
    cumulativeColor.a = 1.0;
    outColor = cumulativeColor;

}
