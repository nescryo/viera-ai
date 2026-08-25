import * as THREE from 'three';

/**
 * HSR StellarToon Material Factory & Cel-Shading Pipeline
 * Uses official Honkai: Star Rail datamined LightMaps, Ramps & MatCaps:
 * - Hair LightMap (R=AO, G=Threshold, B=Angel Ring Specular, A=Rim Mask)
 * - Body LightMap (R=AO, G=Material Row, B=Specular/Metallic, A=Rim Mask)
 * - Multi-Row Warm/Cool Ramp Textures from miHoYo
 * - Official HSR MatCap_17
 */

// 1x1 neutral fallback texture
const defaultWhiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
defaultWhiteTexture.needsUpdate = true;

const defaultMidTexture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
defaultMidTexture.needsUpdate = true;

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
    grad.addColorStop(0.00, '#fcdde2'); // Soft warm peach shadow (under bangs & chin only)
    grad.addColorStop(0.14, '#fef2f4'); // Smooth soft transition
    grad.addColorStop(0.22, '#ffffff'); // Warm porcelain face (80% surface)
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
 * Custom HSR Hair Material Hook using Official LightMap & Warm Ramp
 */
export function injectHSRHairShader(
  material: THREE.MeshToonMaterial,
  options: {
    lightMap: THREE.Texture;
    warmRamp: THREE.Texture;
    rimColor?: THREE.Color;
    rimIntensity?: number;
  }
): void {
  const {
    lightMap,
    warmRamp,
    rimColor = new THREE.Color(0xdef4ff),
    rimIntensity = 0.45
  } = options;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHsrHairLightMap = { value: lightMap };
    shader.uniforms.uHsrHairRamp = { value: warmRamp };
    shader.uniforms.uHsrRimColor = { value: rimColor };
    shader.uniforms.uHsrRimIntensity = { value: rimIntensity };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D uHsrHairLightMap;
      uniform sampler2D uHsrHairRamp;
      uniform vec3 uHsrRimColor;
      uniform float uHsrRimIntensity;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      
      // --- Official HSR Hair Cel-Shading Pipeline ---
      vec3 hsrNormal = normalize( vNormal );
      vec3 hsrViewDir = normalize( vViewPosition );
      
      // 1. Sample Official Hair LightMap (R=AO/Shadow, G=Threshold, B=Specular, A=Rim)
      vec4 hsrLM = texture2D( uHsrHairLightMap, vUv );
      float hsrAO = hsrLM.r;
      float hsrThresholdOffset = ( hsrLM.g - 0.5 ) * 0.40;
      float hsrSpecMask = hsrLM.b;
      float hsrRimMask = max( hsrLM.a, 0.45 );

      // 2. Front-Top Directional Light
      vec3 keyLightDir = normalize( vec3( 0.25, 0.60, 0.75 ) );
      float hsrNdotL = dot( hsrNormal, keyLightDir );
      float halfLambert = hsrNdotL * 0.5 + 0.5;

      // 3. Sample Official HSR Hair Warm Ramp
      float shadowCoord = clamp( halfLambert * hsrAO + hsrThresholdOffset, 0.01, 0.99 );
      vec3 hsrRampColor = texture2D( uHsrHairRamp, vec2( shadowCoord, 0.5 ) ).rgb;
      
      // Softly apply ramp shadow to diffuse
      totalEmissiveRadiance += diffuseColor.rgb * ( hsrRampColor - 1.0 ) * 0.65;

      // 4. Anisotropic Hair Specular Shine (Angel Ring from LightMap Channel B)
      if ( hsrSpecMask > 0.01 ) {
        vec3 angelRing = vec3( 0.96, 0.98, 1.0 ) * ( hsrSpecMask * 0.55 );
        totalEmissiveRadiance += angelRing;
      }

      // 5. Stylized Fresnel Rim Light
      float hsrNdotV = max( 0.0, dot( hsrNormal, hsrViewDir ) );
      float hsrRim = pow( clamp( 1.0 - hsrNdotV, 0.0, 1.0 ), 3.2 );
      float hsrVerticalBias = clamp( hsrNormal.y * 0.5 + 0.5, 0.3, 1.0 );
      totalEmissiveRadiance += uHsrRimColor * ( hsrRim * hsrVerticalBias * uHsrRimIntensity * hsrRimMask );
      `
    );
  };
}

/**
 * Custom HSR Body/Clothing Material Hook using Official LightMap & Warm Ramp
 */
export function injectHSRBodyShader(
  material: THREE.MeshToonMaterial,
  options: {
    lightMap: THREE.Texture;
    warmRamp: THREE.Texture;
    matCap?: THREE.Texture | null;
    rimColor?: THREE.Color;
    rimIntensity?: number;
    emissiveBoost?: number;
  }
): void {
  const {
    lightMap,
    warmRamp,
    matCap = null,
    rimColor = new THREE.Color(0xe0f2fe),
    rimIntensity = 0.35,
    emissiveBoost = 0.0
  } = options;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uHsrBodyLightMap = { value: lightMap };
    shader.uniforms.uHsrBodyRamp = { value: warmRamp };
    shader.uniforms.uHsrHasMatCap = { value: matCap ? 1.0 : 0.0 };
    shader.uniforms.uHsrMatCap = { value: matCap || defaultMidTexture };
    shader.uniforms.uHsrRimColor = { value: rimColor };
    shader.uniforms.uHsrRimIntensity = { value: rimIntensity };
    shader.uniforms.uHsrEmissiveBoost = { value: emissiveBoost };

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
      uniform sampler2D uHsrBodyLightMap;
      uniform sampler2D uHsrBodyRamp;
      uniform float uHsrHasMatCap;
      uniform sampler2D uHsrMatCap;
      uniform vec3 uHsrRimColor;
      uniform float uHsrRimIntensity;
      uniform float uHsrEmissiveBoost;`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      
      // --- Official HSR Body/Clothing Cel-Shading Pipeline ---
      vec3 hsrNormal = normalize( vNormal );
      vec3 hsrViewDir = normalize( vViewPosition );
      
      // 1. Sample Official Body LightMap (R=AO, G=Material Row, B=Specular, A=Rim)
      vec4 hsrLM = texture2D( uHsrBodyLightMap, vUv );
      float hsrAO = hsrLM.r;
      float hsrMatRow = clamp( hsrLM.g, 0.01, 0.99 );
      float hsrSpecMask = hsrLM.b;
      float hsrRimMask = max( hsrLM.a, 0.40 );

      // 2. Front-Top Directional Light
      vec3 keyLightDir = normalize( vec3( 0.25, 0.60, 0.75 ) );
      float hsrNdotL = dot( hsrNormal, keyLightDir );
      float halfLambert = hsrNdotL * 0.5 + 0.5;

      // 3. Sample Official Multi-Row Body Warm Ramp
      float shadowCoord = clamp( halfLambert * hsrAO, 0.01, 0.99 );
      vec3 hsrRampColor = texture2D( uHsrBodyRamp, vec2( shadowCoord, hsrMatRow ) ).rgb;
      
      totalEmissiveRadiance += diffuseColor.rgb * ( hsrRampColor - 1.0 ) * 0.55;

      // 4. Specular / Metallic Accents (from LightMap Channel B)
      if ( hsrSpecMask > 0.01 ) {
        totalEmissiveRadiance += diffuseColor.rgb * ( hsrSpecMask * 0.40 );
      }

      // 5. Official MatCap Sheen
      if ( uHsrHasMatCap > 0.5 ) {
        vec2 matCapUv = hsrNormal.xy * 0.5 + 0.5;
        vec4 mc = texture2D( uHsrMatCap, matCapUv );
        totalEmissiveRadiance += ( mc.rgb - 0.5 ) * 0.20 * diffuseColor.rgb;
      }

      // 6. Stylized Fresnel Rim Light
      float hsrNdotV = max( 0.0, dot( hsrNormal, hsrViewDir ) );
      float hsrRim = pow( clamp( 1.0 - hsrNdotV, 0.0, 1.0 ), 3.6 );
      totalEmissiveRadiance += uHsrRimColor * ( hsrRim * uHsrRimIntensity * hsrRimMask );

      // 7. Emissive Accent Boost
      if ( uHsrEmissiveBoost > 0.001 ) {
        totalEmissiveRadiance += diffuseColor.rgb * uHsrEmissiveBoost;
      }
      `
    );
  };
}
