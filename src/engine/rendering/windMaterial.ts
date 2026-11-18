/**
 * Shared vegetation material: vertex-coloured PBR sampling the foliage atlas,
 * with wind sway injected into the vertex shader.
 *
 * - `aWind` (per vertex) is the sway weight; phase comes from each instance's
 *   world position so plants do not move in unison, and a slow gust front
 *   travels across the map.
 * - `aSoft` marks leaf cards: their normals are kept as authored on both faces
 *   and they glow when the sun is behind them.
 */
import { Color, DoubleSide, MeshStandardMaterial, Vector3 } from 'three';
import { getFoliageAtlas } from './proceduralTextures';

export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },
  /** World-space direction towards the sun and its colour x strength (0 at night). */
  uSunDir: { value: new Vector3(0.3, 0.8, 0.5) },
  uSunGlow: { value: new Color(1, 0.95, 0.8) },
  /** Ground cover shrinks to nothing between 70 % and 100 % of this distance from the camera. */
  uGrassFar: { value: 90 },
};

/** `plain` (Low preset) skips the atlas entirely: geometry built for that preset is untextured. */
export function createWindMaterial(roughness = 0.85, plain = false): MeshStandardMaterial {
  const atlas = plain ? null : getFoliageAtlas();
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side: DoubleSide, map: atlas, alphaTest: atlas ? 0.32 : 0 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.uniforms.uSunDir = windUniforms.uSunDir;
    shader.uniforms.uSunGlow = windUniforms.uSunGlow;
    shader.uniforms.uGrassFar = windUniforms.uGrassFar;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute float aWind;
attribute float aSoft;
uniform float uTime;
uniform float uWind;
uniform float uGrassFar;
varying float vSoft;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vSoft = min(aSoft, 1.0);
#ifdef USE_INSTANCING
  vec3 wPos = instanceMatrix[3].xyz;
  if (aSoft > 1.5) {
    // Grass thins out with distance instead of ending at a chunk edge.
    float gd = distance(wPos.xz, cameraPosition.xz);
    transformed *= 1.0 - smoothstep(uGrassFar * 0.7, uGrassFar, gd);
  }
#else
  vec3 wPos = vec3(0.0);
#endif
float wPhase = wPos.x * 0.37 + wPos.z * 0.29;
float wSway = sin(uTime * 1.5 + wPhase + position.y * 0.3) * 0.6 + sin(uTime * 2.9 + wPhase * 1.7) * 0.25;
// A gust front sweeping the valley: grass and crowns lean in waves, not all at once.
float wGust = 0.55 + 0.45 * sin(uTime * 0.45 - wPos.x * 0.045 - wPos.z * 0.03);
float wFlutter = sin(uTime * 6.3 + position.x * 3.1 + position.z * 2.7 + wPhase) * 0.08 * vSoft;
transformed.x += (wSway + wFlutter) * aWind * uWind * wGust * 0.35;
transformed.z += (cos(uTime * 1.2 + wPhase) + wFlutter) * aWind * uWind * wGust * 0.22;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uSunDir;
uniform vec3 uSunGlow;
varying float vSoft;`,
      )
      .replace(
        '#include <normal_fragment_begin>',
        `#include <normal_fragment_begin>
#ifdef DOUBLE_SIDED
  // Leaf cards carry crown-shaped normals; undo the back-face flip for them.
  if (vSoft > 0.5 && !gl_FrontFacing) normal = -normal;
#endif`,
      )
      .replace(
        '#include <opaque_fragment>',
        `// Sunlight passing through leaves when looking towards the sun.
vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
float through = pow(max(dot(normalize(-vViewPosition), sunV), 0.0), 3.0);
outgoingLight += diffuseColor.rgb * uSunGlow * vSoft * (0.1 + through * 0.75);
#include <opaque_fragment>`,
      );
  };
  // All instances share one program.
  mat.customProgramCacheKey = () => (plain ? 'wind-v3-plain' : 'wind-v3');
  return mat;
}
