/**
 * Terrain surface shader. The mesh carries broad biome colour per vertex (2 m
 * grid); this adds everything finer than that per pixel, in world space:
 * clumpy ground mottling, bare-soil patches, rock on slopes (triplanar, so
 * cliffs do not stretch), a wet band at the waterline, moving caustics on the
 * river and lake bed, and a matching bump so the sun rakes across it.
 */
import { MeshStandardMaterial } from 'three';
import { getGroundTextures } from '../../engine/rendering/proceduralTextures';

export const terrainUniforms = {
  uTime: { value: 0 },
  /** 0 night .. 1 full daylight; scales the caustics. */
  uLight: { value: 1 },
};

/** `lite` (Low preset) keeps the mottling and slope rock but drops triplanar sampling, caustics and bump. */
export function createTerrainMaterial(lite = false): MeshStandardMaterial {
  const tex = getGroundTextures();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  if (lite) mat.defines = { ...mat.defines, TERRAIN_LITE: '' };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uDetail = { value: tex.detail };
    shader.uniforms.uRock = { value: tex.rock };
    shader.uniforms.uTime = terrainUniforms.uTime;
    shader.uniforms.uLight = terrainUniforms.uLight;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNormal = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D uDetail;
uniform sampler2D uRock;
uniform float uTime;
uniform float uLight;
varying vec3 vWPos;
varying vec3 vWNormal;
float gBump;
float gWet;
float gBumpFade;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 wn = normalize(vWNormal);
  vec2 gp = vWPos.xz;
  float dist = length(vWPos - cameraPosition);
  float nearK = 1.0 - smoothstep(14.0, 60.0, dist);
  vec3 dA = texture2D(uDetail, gp * 0.31).rgb;
#ifdef TERRAIN_LITE
  vec3 dB = dA.gbr;
  float grain = 0.5;
#else
  vec3 dB = texture2D(uDetail, gp * 0.047 + 0.37).rgb;
  float grain = texture2D(uDetail, gp * 1.7).b;
#endif
  vec3 alb = diffuseColor.rgb;
  // Clumps and broad blotches: lighter tussocks, darker hollows.
  alb *= 0.74 + dA.r * 0.52;
  alb *= 0.84 + dB.g * 0.34;
  alb *= mix(1.0, 0.87 + grain * 0.26, nearK);
  // Bare soil shows through where the cover is thin.
#ifdef TERRAIN_LITE
  // The lite path has no broad-scale sample, and soil keyed to the fine one tiles visibly.
  float soil = 0.0;
#else
  float soil = smoothstep(0.56, 0.7, dB.r + (dA.g - 0.5) * 0.3) * smoothstep(0.3, 0.8, wn.y);
#endif
  alb = mix(alb, vec3(0.27, 0.2, 0.13) * (0.75 + dA.r * 0.5), soil * 0.42);
  // Rock on slopes, sampled on three planes so steep faces are not smeared.
  float slope = 1.0 - wn.y;
  float rockMask = smoothstep(0.13, 0.3, slope + (dA.r - 0.5) * 0.1);
  vec3 tw = pow(abs(wn), vec3(4.0));
  tw /= tw.x + tw.y + tw.z;
#ifdef TERRAIN_LITE
  vec3 rk = texture2D(uRock, vec2(vWPos.x + vWPos.z, vWPos.y) * 0.09).rgb;
#else
  vec3 rk = texture2D(uRock, vWPos.zy * 0.09).rgb * tw.x + texture2D(uRock, vWPos.xz * 0.09).rgb * tw.y + texture2D(uRock, vWPos.xy * 0.09).rgb * tw.z;
#endif
  vec3 rockCol = rk * vec3(0.56, 0.53, 0.5) * (0.8 + dB.g * 0.5);
  // Moss creeps over rock that faces the sky.
  rockCol = mix(rockCol, alb * 0.85, smoothstep(0.55, 0.9, wn.y) * 0.5);
  alb = mix(alb, rockCol, rockMask);
  // Waterline: wet, dark sand and silt.
  gWet = 1.0 - smoothstep(-0.05, 0.5, vWPos.y);
  alb *= mix(1.0, 0.66, gWet);
#ifndef TERRAIN_LITE
  if (vWPos.y < 0.0) {
    // Caustics: two drifting sheets, bright where they coincide; fade with depth.
    float c1 = texture2D(uDetail, gp * 0.19 + vec2(uTime * 0.021, uTime * 0.013)).r;
    float c2 = texture2D(uDetail, gp * 0.23 - vec2(uTime * 0.017, -uTime * 0.019)).r;
    float ca = pow(clamp(1.0 - abs(c1 - c2) * 4.2, 0.0, 1.0), 5.0);
    alb += vec3(0.5, 0.56, 0.42) * ca * uLight * smoothstep(0.0, -0.4, vWPos.y) * exp(vWPos.y * 0.42) * 0.5;
  }
#endif
  gBump = dA.r * 0.5 + rk.g * rockMask * 2.2;
  // Bump only where a pixel still resolves it; further out it would just shimmer.
  gBumpFade = 1.0 - smoothstep(22.0, 85.0, dist);
  diffuseColor.rgb = alb;
}`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, gWet * 0.85);')
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
#ifndef TERRAIN_LITE
{
  // Screen-space bump from the same height the colour used.
  vec3 sx = dFdx(-vViewPosition);
  vec3 sy = dFdy(-vViewPosition);
  vec3 r1 = cross(sy, normal);
  vec3 r2 = cross(normal, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(gBump) * r1 + dFdy(gBump) * r2);
  normal = normalize(abs(det) * normal - grad * 0.55 * gBumpFade);
}
#endif`,
      );
  };
  mat.customProgramCacheKey = () => (lite ? 'terrain-v2-lite' : 'terrain-v2');
  return mat;
}
