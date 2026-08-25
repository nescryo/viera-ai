import * as THREE from 'three';

/**
 * HSR StellarToon Material Factory & Cel-Shading Pipeline
 * Replicates the shader principles of Honkai: Star Rail:
 * 1. Full-Color RGB Cel-Shading Ramps (Warm + Cool Shadows)
 * 2. Sphere Map / MatCap Additive & Multiplicative Blending (MMD SPA/SPH)
 * 3. Stylized Fresnel Rim Lighting with Color & Mask Tuning
 * 4. Luminous Emissive Accents for Eyes, Wings & Ribbon Ornaments
 */

// 1x1 neutral fallback MatCap texture
const defaultMatCapTexture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
defaultMatCapTexture.needsUpdate = true;

/**
 * Creates the HSR Hair Warm/Cool Multi-Step Ramp Texture
 */
export function createHSRHairToonRamp(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.00, '#cfc7cb'); // Soft cool shadow (subtle lavender tone)
    grad.addColorStop(0.35, '#eae2df'); // Warm ambient transition
    grad.addColorStop(0.55, '#f8f4f0'); // Soft illustration transition
    grad.addColorStop(0.70, '#ffffff'); // Direct highlight
    grad.addColorStop(1.00, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates the HSR Body/Clothes Warm/Cool Multi-Step Ramp Texture
 */
export function createHSRBodyToonRamp(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.00, '#d2cad0'); // Fabric shadow
    grad.addColorStop(0.38, '#ede6ea'); // Mid shadow step
    grad.addColorStop(0.60, '#faf6f4'); // Soft light transition
    grad.addColorStop(0.75, '#ffffff'); // Base diffuse
    grad.addColorStop(1.00, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates the Porcelain Peach Face Ramp Texture
 */
export function createHSRFaceToonRamp(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.00, '#fce4e6'); // Warm peach shadow (under bangs & chin only)
    grad.addColorStop(0.12, '#fff4f6'); // Smooth soft transition
    grad.addColorStop(0.20, '#ffffff'); // Porcelain face (~80% surface)
    grad.addColorStop(1.00, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Custom HSR Material Shader Hook
 * Injects MatCap (Sphere Map), Fresnel Rim Lighting, and RGB Gradient Ramp into MeshToonMaterial
 */
export function injectHSRShaderChunks(
  material: THREE.MeshToonMaterial,
  options: {
    matCapTexture?: THREE.Texture | null;
    matCapIntensity?: number;
    matCapMode?: 'add' | 'multiply'; // 'add' for metals/crystals, 'multiply' for hair/silk
    rimColor?: THREE.Color;
    rimIntensity?: number;
    rimPower?: number;
    emissiveBoost?: number;
  } = {}
): void {
  const {
    matCapTexture = null,
    matCapIntensity = 0.35,
    matCapMode = 'add',
    rimColor = new THREE.Color(0xd6f4ff),
    rimIntensity = 0.45,
    rimPower = 3.5,
    emissiveBoost = 0.0
  } = options;

  material.onBeforeCompile = (shader) => {
    // 1. Uniforms injection
    shader.uniforms.uHsrHasMatCap = { value: matCapTexture ? 1.0 : 0.0 };
    shader.uniforms.uHsrMatCap = { value: matCapTexture || defaultMatCapTexture };
    shader.uniforms.uHsrMatCapIntensity = { value: matCapIntensity };
    shader.uniforms.uHsrMatCapMode = { value: matCapMode === 'multiply' ? 1.0 : 0.0 };
    shader.uniforms.uHsrRimColor = { value: rimColor };
    shader.uniforms.uHsrRimIntensity = { value: rimIntensity };
    shader.uniforms.uHsrRimPower = { value: rimPower };
    shader.uniforms.uHsrEmissiveBoost = { value: emissiveBoost };

    // 2. Fragment Shader: Enable Full RGB Gradient Map sampling
    shader.fragmentShader = shader.fragmentShader.replace(
      'return vec3( texture2D( gradientMap, coord ).r );',
      'return texture2D( gradientMap, coord ).rgb;'
    );

    // 3. Fragment Shader: Uniform Declarations
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform float uHsrHasMatCap;
      uniform sampler2D uHsrMatCap;
      uniform float uHsrMatCapIntensity;
      uniform float uHsrMatCapMode;
      uniform vec3 uHsrRimColor;
      uniform float uHsrRimIntensity;
      uniform float uHsrRimPower;
      uniform float uHsrEmissiveBoost;`
    );

    // 4. Fragment Shader: Inject MatCap, Rim Light & Emissive into Radiance
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      
      // --- HSR StellarToon Lighting Enhancements ---
      vec3 hsrNormal = normalize( vNormal );
      vec3 hsrViewDir = normalize( vViewPosition );

      // A. Stylized Fresnel Rim Light
      if ( uHsrRimIntensity > 0.001 ) {
        float hsrNdotV = max( 0.0, dot( hsrNormal, hsrViewDir ) );
        float hsrRim = pow( clamp( 1.0 - hsrNdotV, 0.0, 1.0 ), uHsrRimPower );
        float hsrVerticalBias = clamp( hsrNormal.y * 0.5 + 0.5, 0.25, 1.0 );
        totalEmissiveRadiance += uHsrRimColor * ( hsrRim * hsrVerticalBias * uHsrRimIntensity );
      }

      // B. MatCap Sphere Map (Additive / Multiplicative)
      if ( uHsrHasMatCap > 0.5 && uHsrMatCapIntensity > 0.001 ) {
        vec2 hsrMatCapUv = hsrNormal.xy * 0.5 + 0.5;
        vec4 hsrMatCapColor = texture2D( uHsrMatCap, hsrMatCapUv );
        if ( uHsrMatCapMode > 0.5 ) {
          // Multiplicative Anisotropic Sheen
          totalEmissiveRadiance += ( hsrMatCapColor.rgb - 0.5 ) * ( uHsrMatCapIntensity * 0.5 ) * diffuseColor.rgb;
        } else {
          // Additive Specular (Metals/Crystals)
          totalEmissiveRadiance += hsrMatCapColor.rgb * ( uHsrMatCapIntensity * 0.5 );
        }
      }

      // C. Emissive Boost (for cyan wings, eyes, sparkles)
      if ( uHsrEmissiveBoost > 0.001 ) {
        totalEmissiveRadiance += diffuseColor.rgb * uHsrEmissiveBoost;
      }
      `
    );
  };
}
