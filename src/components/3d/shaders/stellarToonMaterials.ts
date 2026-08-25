import * as THREE from 'three';

/**
 * HSR StellarToon Material Factory & Cel-Shading Pipeline
 * Replicates the shader principles of Honkai: Star Rail (from festivities/Blender-StellarToon):
 * 1. Multi-Step miHoYo Cel-Shading Ramp (Warm + Cool Shadows)
 * 2. Sphere Map / MatCap Additive & Multiplicative Blending (MMD SPA/SPH)
 * 3. Stylized Fresnel Rim Lighting with Color & Mask Tuning
 * 4. Screen-Facing Face Normal Softening (Zero polygon cheek artifacts)
 * 5. Anisotropic Hair Specular Sheen (Angel Ring)
 * 6. Luminous Emissive Accents for Eyes, Wings & Ribbon Ornaments
 */

export interface StellarToonTextures {
  bodyMap?: THREE.Texture;
  hairMap?: THREE.Texture;
  faceMap?: THREE.Texture;
  blushMap?: THREE.Texture;
  // MatCap / Sphere Maps
  metalMatCap?: THREE.Texture;     // SP0d_20190820_005614.bmp (metallic gold/silver accents)
  hairMatCap?: THREE.Texture;      // mc1.png / 2.bmp (hair & silk anisotropic sheen)
  fabricMatCap?: THREE.Texture;    // 31.bmp / a4.bmp (soft clothing sheen)
  // Toon Ramps
  toonRampHair?: THREE.CanvasTexture;
  toonRampBody?: THREE.CanvasTexture;
  toonRampFace?: THREE.CanvasTexture;
}

/**
 * Creates the HSR Hair Warm/Cool Multi-Step Ramp Texture
 * Replicates 'Hair Warm Shadow Ramp' from StellarToon
 */
export function createHSRHairToonRamp(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.00, '#b8aeb5'); // Deep cool shadow (subtle lavender undertone)
    grad.addColorStop(0.25, '#d6ccd0'); // Cool-to-warm transition
    grad.addColorStop(0.48, '#ede5e0'); // Warm ambient shadow step
    grad.addColorStop(0.58, '#f7f2ed'); // Soft illustration transition
    grad.addColorStop(0.72, '#ffffff'); // Direct light highlight
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
 * Replicates 'Body Warm Shadow Ramp' from StellarToon
 */
export function createHSRBodyToonRamp(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.00, '#c4bcc3'); // Deep cool fabric shadow
    grad.addColorStop(0.30, '#ded6db'); // Mid cool tone
    grad.addColorStop(0.50, '#f0e8e4'); // Warm shadow step
    grad.addColorStop(0.65, '#fbf8f5'); // Soft light transition
    grad.addColorStop(0.80, '#ffffff'); // Pure diffuse base
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
 * Replicates 'StellarToon - Face' smooth porcelain shading
 */
export function createHSRFaceToonRamp(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0.00, '#fcdde1'); // Soft warm peach shadow (under bangs & chin)
    grad.addColorStop(0.12, '#fef0f2'); // Smooth soft transition
    grad.addColorStop(0.22, '#ffffff'); // Pure warm porcelain face (covering ~80% of face surface)
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
 * Injects MatCap (Sphere Map), Fresnel Rim Lighting, and HSR color balancing into MeshToonMaterial
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
    faceSoftening?: boolean;
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
    faceSoftening = false,
    emissiveBoost = 0.0
  } = options;

  material.onBeforeCompile = (shader) => {
    // 1. Uniforms injection
    shader.uniforms.uHsrMatCap = { value: matCapTexture };
    shader.uniforms.uHsrMatCapIntensity = { value: matCapIntensity };
    shader.uniforms.uHsrMatCapMode = { value: matCapMode === 'multiply' ? 1.0 : 0.0 };
    shader.uniforms.uHsrRimColor = { value: rimColor };
    shader.uniforms.uHsrRimIntensity = { value: rimIntensity };
    shader.uniforms.uHsrRimPower = { value: rimPower };
    shader.uniforms.uHsrFaceSoftening = { value: faceSoftening ? 1.0 : 0.0 };
    shader.uniforms.uHsrEmissiveBoost = { value: emissiveBoost };

    // 2. Vertex Shader: Export view-space normal & camera-space position
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vHsrViewNormal;
      varying vec3 vHsrViewPosition;
      uniform float uHsrFaceSoftening;`
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
      // Transform normal to view-space for MatCap and Rim calculations
      vec3 transformedNormal = normal;
      if (uHsrFaceSoftening > 0.5) {
        // Soften face normal towards front-facing view vector
        transformedNormal = mix(transformedNormal, vec3(0.0, 0.0, 1.0), 0.45);
      }
      vHsrViewNormal = normalize(normalMatrix * transformedNormal);
      vHsrViewPosition = - (modelViewMatrix * vec4(transformed, 1.0)).xyz;`
    );

    // 3. Fragment Shader: Calculate MatCap & Stylized Fresnel Rim
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      varying vec3 vHsrViewNormal;
      varying vec3 vHsrViewPosition;
      uniform sampler2D uHsrMatCap;
      uniform float uHsrMatCapIntensity;
      uniform float uHsrMatCapMode;
      uniform vec3 uHsrRimColor;
      uniform float uHsrRimIntensity;
      uniform float uHsrRimPower;
      uniform float uHsrEmissiveBoost;`
    );

    // Inject before tone mapping & output
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
      
      // --- HSR StellarToon Cel-Shading Enhancements ---
      vec3 normalView = normalize(vHsrViewNormal);
      vec3 viewDir = normalize(vHsrViewPosition);

      // A. MatCap / Sphere Map Calculation
      if (uHsrMatCapIntensity > 0.001) {
        vec2 matCapUv = normalView.xy * 0.5 + 0.5;
        vec4 matCapColor = texture2D(uHsrMatCap, matCapUv);
        
        if (uHsrMatCapMode > 0.5) {
          // Multiplicative Sheen (Hair & Silk anisotropic sheen)
          gl_FragColor.rgb *= mix(vec3(1.0), matCapColor.rgb * 1.6, uHsrMatCapIntensity);
        } else {
          // Additive Specular (Metallic gold/silver & crystal highlights)
          gl_FragColor.rgb += matCapColor.rgb * uHsrMatCapIntensity * gl_FragColor.rgb;
        }
      }

      // B. Stylized Fresnel Rim Lighting
      if (uHsrRimIntensity > 0.001) {
        float NdotV = max(0.0, dot(normalView, viewDir));
        float rimFactor = pow(clamp(1.0 - NdotV, 0.0, 1.0), uHsrRimPower);
        
        // Directional upper-back bias for natural anime silhouette
        float verticalBias = clamp(normalView.y * 0.5 + 0.5, 0.2, 1.0);
        vec3 rim = uHsrRimColor * (rimFactor * verticalBias * uHsrRimIntensity);
        
        gl_FragColor.rgb += rim;
      }

      // C. Emissive Accent Boost (for cyan wings, eyes, and sparkles)
      if (uHsrEmissiveBoost > 0.001) {
        gl_FragColor.rgb += gl_FragColor.rgb * uHsrEmissiveBoost;
      }
      `
    );
  };
}
