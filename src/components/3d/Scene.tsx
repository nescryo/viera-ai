import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MMDLoader, OutlineEffect } from 'three-stdlib';
import * as MMDParser from 'mmd-parser';
import type { ApiConfig, Persona } from '../../types';
import { ttsService } from '../../services/ttsService';
import { VieraAnimationController } from './animation';
import {
  createHSRFaceToonRamp,
  injectHSRHairShader,
  injectHSRBodyShader
} from './shaders/stellarToonMaterials';

if (typeof window !== 'undefined') {
  (window as any).MMDParser = MMDParser;
}

interface SceneProps {
  currentPersona: Persona;
  isSpeaking: boolean;
  currentEmotion: string;
  onSelectEmotion?: (emotion: string) => void;
  apiConfig?: ApiConfig;
}

const TESTING_EMOTIONS = [
  { id: 'happy', label: 'Happy' },
  { id: 'blush', label: 'Blush' },
  { id: 'blush-hardly', label: 'Blush Hardly' },
  { id: 'teasing', label: 'Teasing' },
  { id: 'jealous', label: 'Jealous' },
  { id: 'terrified', label: 'Terrified' },
  { id: 'pouting', label: 'Pouting' },
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'surprised', label: 'Surprised' },
  { id: 'angry', label: 'Angry' },
  { id: 'sad', label: 'Sad' }
];

/**
 * Creates a Soft Rose-Peach Anime Cheek Blush Texture
 */
function createSoftPorcelainCheekTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);

    const gradient = ctx.createRadialGradient(128, 128, 6, 128, 128, 118);
    gradient.addColorStop(0, 'rgba(255, 120, 140, 0.25)');
    gradient.addColorStop(0.45, 'rgba(255, 160, 175, 0.10)');
    gradient.addColorStop(0.8, 'rgba(255, 185, 195, 0.02)');
    gradient.addColorStop(1, 'rgba(255, 185, 195, 0)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(128, 128, 118, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(230, 80, 100, 0.15)';
    ctx.lineWidth = 2.0;

    for (let x = 55; x <= 201; x += 18) {
      const heightOffset = Math.sin(((x - 55) / 146) * Math.PI) * 40;
      ctx.beginPath();
      ctx.moveTo(x, 128 - heightOffset);
      ctx.lineTo(x, 128 + heightOffset);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}





/**
 * Creates an Authentic Anime Forehead Horror/Shock Dark Shadow Texture
 */
function createAnimeForeheadShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);

    // Full Width Dark linear gradient fading out near nose bridge
    const gradient = ctx.createLinearGradient(0, 0, 0, 220);
    gradient.addColorStop(0, 'rgba(6, 8, 22, 0.98)');
    gradient.addColorStop(0.45, 'rgba(12, 15, 38, 0.82)');
    gradient.addColorStop(0.80, 'rgba(20, 24, 52, 0.25)');
    gradient.addColorStop(1, 'rgba(20, 24, 52, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 220);

    // Full Width Classic Anime Vertical Shock/Horror Hatching Lines
    for (let x = 5; x <= 251; x += 8) {
      const lineLen = 160 + Math.sin(x * 0.15) * 25;
      const lineGrad = ctx.createLinearGradient(x, 0, x, lineLen);
      lineGrad.addColorStop(0, 'rgba(4, 5, 16, 0.92)');
      lineGrad.addColorStop(0.75, 'rgba(4, 5, 16, 0.30)');
      lineGrad.addColorStop(1, 'rgba(4, 5, 16, 0)');

      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + Math.sin(x * 0.05) * 3, lineLen);
      ctx.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}


export const Scene: React.FC<SceneProps> = React.memo(({
  currentPersona,
  isSpeaking,
  currentEmotion,
  onSelectEmotion,
  apiConfig
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadStatus, setLoadStatus] = useState<string>("Loading Firefly 3D Model...");

  // Keep track of currentEmotion in ref to avoid re-loading 3D model on emotion changes
  const currentEmotionRef = useRef(currentEmotion);
  useEffect(() => {
    currentEmotionRef.current = currentEmotion;
  }, [currentEmotion]);

  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const apiConfigRef = useRef(apiConfig);
  useEffect(() => {
    apiConfigRef.current = apiConfig;
  }, [apiConfig]);

  const onSelectEmotionRef = useRef(onSelectEmotion);
  useEffect(() => {
    onSelectEmotionRef.current = onSelectEmotion;
  }, [onSelectEmotion]);

  // Ref to hold loaded MMD mesh, modular animation controller, and dynamic overlay materials
  const mmdMeshRef = useRef<THREE.SkinnedMesh | null>(null);
  const animationControllerRef = useRef<VieraAnimationController | null>(null);
  const cheekMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const foreheadShadowMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let isDisposed = false;
    let animationFrameId: number;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    // Clean container completely before initializing WebGL
    containerRef.current.innerHTML = '';

    // 1. Scene & Close Dynamic Portrait Camera Setup (Matching ff.jpg Illustration Framing)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f1322'); // Space cosmic dark environment

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(-0.52, 1.34, 1.28); // Shifted slightly right & up to position Firefly bottom-left
    camera.lookAt(-0.52, 1.28, 0);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Anime Inverted-Hull Toon Outline Effect (Delicate & crisp 1.3mm lineart matching HSR in-game)
    const effect = new OutlineEffect(renderer, {
      defaultThickness: 0.0013, // Delicate and crisp anime lineart
      defaultColor: [0.18, 0.16, 0.20], // Rich dark violet-charcoal matching HSR in-game palette
      defaultAlpha: 0.88,
      defaultKeepAlive: true
    });

    containerRef.current.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(animationFrameId);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    // 2. High-Fidelity Masterclass Lighting Pipeline (HSR Celestial Stage)
    // Warm Ambient Light (0.40 - warm champagne base preventing washed out faces)
    const ambientLight = new THREE.AmbientLight(0xfdf9f6, 0.40);
    scene.add(ambientLight);

    // Main Neutral/Warm Sunlight Key Light (RGB ≈ warm sunlight white)
    const keyLight = new THREE.DirectionalLight(0xfff8f0, 0.92);
    keyLight.position.set(2.2, 4.0, 3.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0003;
    scene.add(keyLight);

    // Neutral Soft Fill Light (RGB ≈ soft sky fill - NO CYAN CAST!)
    const fillLight = new THREE.DirectionalLight(0xf2f4f8, 0.30);
    fillLight.position.set(-2.2, 2.0, 2.5);
    scene.add(fillLight);

    // Subtle Directional Rim Backlight (0.30 for silhouette separation)
    const rimLight = new THREE.DirectionalLight(0xdef0fa, 0.30);
    rimLight.position.set(-0.5, 3.5, -3.2);
    scene.add(rimLight);

    // 3. Ground Pedestal & Grid
    const gridHelper = new THREE.GridHelper(10, 20, 0x3b82f6, 0x2b2d31);
    gridHelper.position.set(-0.65, 0, 0);
    scene.add(gridHelper);

    // 4. Floating Firefly Particles
    const particleCount = 180;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 8 - 0.65;
      positions[i + 1] = Math.random() * 4;
      positions[i + 2] = (Math.random() - 0.5) * 8;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMaterial = new THREE.PointsMaterial({
      color: new THREE.Color(currentPersona.accentColor || '#3b82f6'),
      size: 0.035,
      transparent: true,
      opacity: 0.65
    });
    const particles = new THREE.Points(geometry, particleMaterial);
    scene.add(particles);

    // 5. 3D Model Root Group
    const modelGroup = new THREE.Group();
    modelGroup.position.set(-0.65, 0, 0);
    scene.add(modelGroup);

    // Pedestal Base
    const pedestalGeo = new THREE.CylinderGeometry(0.8, 0.9, 0.08, 32);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x2b2d31,
      roughness: 0.5,
      metalness: 0.6
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.y = 0.04;
    modelGroup.add(pedestal);

    // 6. Load Firefly .pmx Model
    THREE.Cache.enabled = false;
    const mmdLoader = new MMDLoader();
    mmdLoader.setResourcePath('/models/firefly/');
    const pmxUrl = '/models/firefly/firefly.pmx';
    const softPorcelainCheekTex = createSoftPorcelainCheekTexture();

    mmdLoader.load(
      pmxUrl,
      (mmdMesh: THREE.SkinnedMesh) => {
        if (isDisposed) return;

        mmdMeshRef.current = mmdMesh;
        animationControllerRef.current = new VieraAnimationController(mmdMesh);
        cheekMaterialsRef.current = [];
        
        mmdMesh.castShadow = false;
        mmdMesh.receiveShadow = false;

        // Auto-scale MMD model to standard human height
        const bbox = new THREE.Box3().setFromObject(mmdMesh);
        const size = bbox.getSize(new THREE.Vector3());
        
        if (size.y > 0) {
          const scaleFactor = 1.65 / size.y;
          mmdMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }

        // Load Official HSR Datamined Textures
        const textureLoader = new THREE.TextureLoader();
        const hairLightMap = textureLoader.load('/models/firefly/Avatar_Firefly_01_Hair_LightMap.png');
        hairLightMap.colorSpace = THREE.NoColorSpace;

        const bodyLightMap = textureLoader.load('/models/firefly/Avatar_Firefly_01_Body_LightMap.png');
        bodyLightMap.colorSpace = THREE.NoColorSpace;

        const hairWarmRamp = textureLoader.load('/models/firefly/Avatar_Firefly_00_Hair_Warm_Ramp.png');
        hairWarmRamp.colorSpace = THREE.SRGBColorSpace;
        hairWarmRamp.minFilter = THREE.LinearFilter;
        hairWarmRamp.magFilter = THREE.LinearFilter;

        const bodyWarmRamp = textureLoader.load('/models/firefly/Avatar_Firefly_01_Body_Warm_Ramp.png');
        bodyWarmRamp.colorSpace = THREE.SRGBColorSpace;
        bodyWarmRamp.minFilter = THREE.LinearFilter;
        bodyWarmRamp.magFilter = THREE.LinearFilter;

        const hsrMatCap = textureLoader.load('/models/firefly/MatCap_17.png');
        hsrMatCap.colorSpace = THREE.SRGBColorSpace;

        const hsrFaceRamp = createHSRFaceToonRamp();

        // Clean and optimize materials with Official HSR Cel-Shading Pipeline
        mmdMesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const optimizeMaterial = (mat: THREE.Material): THREE.Material => {
              const matName = (mat.name || '').toLowerCase();
              const mapUrl = ((mat as any).map?.name || (mat as any).map?.image?.src || '').toLowerCase();

              // Built-in PMX Blush Texture Overlay (Material #2: 顏+ / 颜赤.tga / 頬 / hoho / blush / 赤み / 照れ / pipi)
              // Enabled with sweet 18% living flush in relaxed state!
              const rawMatName = mat.name || '';
              const isBlushMat = 
                rawMatName.includes('顏+') || rawMatName.includes('颜+') ||
                rawMatName.includes('顏赤') || rawMatName.includes('颜赤') ||
                mapUrl.includes('颜赤') || mapUrl.includes('yan_chi');

              if (isBlushMat) {
                const blushTex = textureLoader.load('/models/firefly/颜赤.png');
                blushTex.colorSpace = THREE.SRGBColorSpace;
                const blushMat = new THREE.MeshBasicMaterial({
                  map: blushTex,
                  color: new THREE.Color('#ff859c'), // Warm sweet peach-rose flush!
                  transparent: true,
                  opacity: 0.18, // Faint 18% living flush in normal/relaxed state
                  depthWrite: false,
                  depthTest: true,
                  side: THREE.DoubleSide,
                });
                blushMat.polygonOffset = true;
                blushMat.polygonOffsetFactor = -4;
                blushMat.polygonOffsetUnits = -4;
                (blushMat as any).renderOrder = 10;
                blushMat.visible = true;
                blushMat.userData = { outlineParameters: { visible: false } };
                if (!cheekMaterialsRef.current.includes(blushMat)) {
                  cheekMaterialsRef.current.push(blushMat);
                }
                blushMat.needsUpdate = true;
                return blushMat;
              }

              // Hide all duplicate expression/outline overlay shells (+ meshes: 衣+, 裙+, 後腦勺+, 髮飾翼+, 胸針飾+, 衣金屬+) & biaoq
              if (
                (rawMatName.includes('+') && !isBlushMat) ||
                rawMatName.includes('biaoq') ||
                rawMatName.includes('bq')
              ) {
                const hiddenOverlayMat = new THREE.MeshBasicMaterial({
                  transparent: true,
                  opacity: 0,
                  depthWrite: false,
                  depthTest: true,
                  visible: false,
                });
                hiddenOverlayMat.userData = { outlineParameters: { visible: false } };
                return hiddenOverlayMat;
              }

              const isTransparent = mat.transparent || mat.opacity < 0.98;
              const map = (mat as any).map || null;

              if (map) {
                map.colorSpace = THREE.SRGBColorSpace;
              }

              // 1. Face & Body Skin -> Rich Warm Porcelain Peach Anime Skin (Mat #1: 顏 & Mat #11: 肌)
              if (
                rawMatName.includes('顏') || rawMatName.includes('顔') ||
                rawMatName.includes('肌') || matName.includes('face') ||
                matName.includes('skin') || matName.includes('head') ||
                mapUrl.includes('颜.png') || mapUrl.includes('face')
              ) {
                const faceMat = new THREE.MeshToonMaterial({
                  map: map,
                  gradientMap: hsrFaceRamp,
                  color: new THREE.Color(0xfff7f4), // Soft warm porcelain white skin tone matching in-game HSR
                  transparent: false, // 100% Solid Opaque
                  depthWrite: true,
                  depthTest: true,
                });
                (faceMat as any).opacity = 1.0;
                faceMat.userData = { outlineParameters: { visible: false } };
                faceMat.needsUpdate = true;
                return faceMat;
              }

              // 2. Eye Highlight Sparkles (Mat #9: 目光) -> Crystal Bright White Sparkles!
              if (rawMatName.includes('目光') || rawMatName.includes('sparkle') || rawMatName.includes('highlight')) {
                const sparkleMat = new THREE.MeshBasicMaterial({
                  map: map,
                  color: new THREE.Color(0xffffff),
                  transparent: true,
                  alphaTest: 0.02,
                  depthWrite: false,
                  depthTest: true,
                  side: THREE.DoubleSide,
                });
                sparkleMat.userData = { outlineParameters: { visible: false } };
                sparkleMat.needsUpdate = true;
                return sparkleMat;
              }

              // 3. Eye Shadow Overlay (Mat #29: 目影) -> Soft Translucent Upper Eye Shadow
              if (rawMatName.includes('目影') || rawMatName.includes('eye_shadow')) {
                const shadowMat = new THREE.MeshBasicMaterial({
                  map: map,
                  color: new THREE.Color(0xffffff),
                  transparent: true,
                  opacity: 0.35,
                  depthWrite: false,
                  depthTest: true,
                });
                shadowMat.userData = { outlineParameters: { visible: false } };
                shadowMat.needsUpdate = true;
                return shadowMat;
              }

              // 4. Eyes, Pupils, Iris (Mat #8: 目) -> Saturated Soft Luminous Shading
              if (matName.includes('eye') || matName.includes('目') || matName.includes('hitomi') || matName.includes('pupil')) {
                const eyeMat = new THREE.MeshToonMaterial({
                  map: map,
                  gradientMap: hsrFaceRamp,
                  color: new THREE.Color(0xf6eff2),
                  emissive: new THREE.Color(0x0c3034),
                  transparent: false,
                  depthWrite: true,
                  depthTest: true,
                  side: THREE.FrontSide,
                });
                eyeMat.userData = { outlineParameters: { visible: false } };
                eyeMat.needsUpdate = true;
                return eyeMat;
              }

              // 5. Eyebrows (Mat #3 眉 / eyebrow / まゆ) -> Soft Warm Rose-Ash Gray (#8a7c82)
              if (rawMatName.includes('眉') || matName.includes('eyebrow') || matName.includes('まゆ')) {
                const browMat = new THREE.MeshBasicMaterial({
                  map: map,
                  color: new THREE.Color(0x8a7c82),
                  transparent: true,
                  opacity: 0.82,
                  alphaTest: 0.08,
                  depthWrite: false,
                  depthTest: true,
                  side: THREE.DoubleSide,
                });
                browMat.userData = { outlineParameters: { visible: false } };
                browMat.needsUpdate = true;
                return browMat;
              }

              // 6. Eyelashes, Eyelines (Mat #3 睫 / eyelash / eyeline / まつ) -> Soft Dark Rose-Charcoal (#52464c)
              if (rawMatName.includes('睫') || matName.includes('eyelash') || matName.includes('eyeline') || matName.includes('まつ')) {
                const lashMat = new THREE.MeshBasicMaterial({
                  map: map,
                  color: new THREE.Color(0x52464c),
                  transparent: true,
                  alphaTest: 0.05,
                  depthWrite: false,
                  depthTest: true,
                  side: THREE.DoubleSide,
                });
                lashMat.userData = { outlineParameters: { visible: false } };
                lashMat.needsUpdate = true;
                return lashMat;
              }

              // 7. Mouth, Teeth, Tongue & Inner Cavity -> Soft Warm Toon Shading (depthWrite: true)
              if (
                rawMatName.includes('歯') || rawMatName.includes('齒') ||
                rawMatName.includes('口') || matName.includes('mouth') ||
                matName.includes('teeth') || matName.includes('tooth') ||
                matName.includes('tongue') || matName.includes('舌')
              ) {
                const mouthMat = new THREE.MeshToonMaterial({
                  map: map,
                  gradientMap: hsrFaceRamp,
                  color: new THREE.Color(0xf5eef0),
                  transparent: isTransparent,
                  alphaTest: isTransparent ? 0.05 : 0.0,
                  depthWrite: true,
                  depthTest: true,
                  side: THREE.DoubleSide,
                });
                mouthMat.userData = { outlineParameters: { visible: false } };
                mouthMat.needsUpdate = true;
                return mouthMat;
              }

              // 8. Hair Materials (Mat #10: 髪 & Mat #16: 後腦勺) -> Official HSR LightMap & Angel Ring Specular
              if (rawMatName.includes('髪') || rawMatName.includes('頭') || matName.includes('hair')) {
                const hairMat = new THREE.MeshToonMaterial({
                  map: map,
                  gradientMap: hairWarmRamp,
                  color: new THREE.Color(0xffffff),
                  transparent: isTransparent,
                  alphaTest: isTransparent ? 0.35 : 0.0,
                  side: (mat as any).side ?? THREE.FrontSide,
                  depthWrite: !isTransparent,
                });
                injectHSRHairShader(hairMat, {
                  lightMap: hairLightMap,
                  warmRamp: hairWarmRamp,
                  rimColor: new THREE.Color(0xd4f4ff),
                  rimIntensity: 0.45
                });
                hairMat.userData = { outlineParameters: { visible: true } };
                hairMat.needsUpdate = true;
                return hairMat;
              }

              // 9. Ribbon, Gem, Butterfly Wings -> Luminous Vibrant Teal/Cyan Tint with Additive Specular
              if (
                rawMatName.includes('翼') || rawMatName.includes('胸針') || rawMatName.includes('飾') ||
                matName.includes('gem') || matName.includes('ribbon') || matName.includes('hair_acc') || matName.includes('crystal')
              ) {
                const accMat = new THREE.MeshToonMaterial({
                  map: map,
                  gradientMap: bodyWarmRamp,
                  color: new THREE.Color(1.05, 1.15, 1.18),
                  emissive: new THREE.Color(0x0e5048),
                  transparent: isTransparent,
                  alphaTest: isTransparent ? 0.35 : 0.0,
                  side: (mat as any).side ?? THREE.FrontSide,
                  depthWrite: !isTransparent,
                });
                injectHSRBodyShader(accMat, {
                  lightMap: bodyLightMap,
                  warmRamp: bodyWarmRamp,
                  matCap: hsrMatCap,
                  rimColor: new THREE.Color(0x80ffff),
                  rimIntensity: 0.60,
                  emissiveBoost: 0.35
                });
                accMat.userData = { outlineParameters: { visible: true } };
                accMat.needsUpdate = true;
                return accMat;
              }

              // 10. Metallic Parts & Buckles -> Lustrous Additive MatCap Sheen
              if (
                rawMatName.includes('金') || rawMatName.includes('銀') ||
                matName.includes('metal') || matName.includes('buckle') ||
                matName.includes('button') || matName.includes('gold') ||
                matName.includes('silver') || rawMatName.includes('剑')
              ) {
                const metalMat = new THREE.MeshToonMaterial({
                  map: map,
                  gradientMap: bodyWarmRamp,
                  color: new THREE.Color(0xffffff),
                  transparent: isTransparent,
                  alphaTest: isTransparent ? 0.35 : 0.0,
                  side: (mat as any).side ?? THREE.FrontSide,
                  depthWrite: !isTransparent,
                });
                injectHSRBodyShader(metalMat, {
                  lightMap: bodyLightMap,
                  warmRamp: bodyWarmRamp,
                  matCap: hsrMatCap,
                  rimColor: new THREE.Color(0xffeedd),
                  rimIntensity: 0.50
                });
                metalMat.userData = { outlineParameters: { visible: true } };
                metalMat.needsUpdate = true;
                return metalMat;
              }

              // 11. Default Body, Clothes, Jacket, Skirt -> Official Multi-Row HSR Body Shading
              const toonMat = new THREE.MeshToonMaterial({
                map: map,
                gradientMap: bodyWarmRamp,
                color: new THREE.Color(0xffffff),
                transparent: isTransparent,
                alphaTest: isTransparent ? 0.35 : 0.0,
                side: (mat as any).side ?? THREE.FrontSide,
                depthWrite: !isTransparent,
              });
              injectHSRBodyShader(toonMat, {
                lightMap: bodyLightMap,
                warmRamp: bodyWarmRamp,
                matCap: hsrMatCap,
                rimColor: new THREE.Color(0xe0f2fe),
                rimIntensity: 0.35
              });

              toonMat.userData = { outlineParameters: { visible: true } };
              toonMat.needsUpdate = true;
              return toonMat;
            };

            if (Array.isArray(mesh.material)) {
              mesh.material = mesh.material.map((m) => optimizeMaterial(m));
            } else if (mesh.material) {
              mesh.material = optimizeMaterial(mesh.material);
            }
          }
        });

        // Bind Blender Exported mat_forehead_shadow vertices to headBone in SkinnedMesh
        if (mmdMesh.skeleton && mmdMesh.skeleton.bones && Array.isArray(mmdMesh.material)) {
          let headBoneIdx = -1;
          mmdMesh.skeleton.bones.forEach((b, idx) => {
            if (b.name === '頭' || b.name === 'head') headBoneIdx = idx;
          });

          const foreheadMatIdx = mmdMesh.material.findIndex((m) =>
            (m.name || '').toLowerCase().includes('forehead')
          );

          if (foreheadMatIdx !== -1) {
            const mat = mmdMesh.material[foreheadMatIdx] as THREE.MeshBasicMaterial;
            if (mat) {
              mat.map = createAnimeForeheadShadowTexture();
              mat.transparent = true;
              mat.opacity = 0;
              foreheadShadowMaterialRef.current = mat;
            }
          }

          if (foreheadMatIdx !== -1 && headBoneIdx !== -1 && mmdMesh.geometry.groups) {
            const group = mmdMesh.geometry.groups.find((g) => g.materialIndex === foreheadMatIdx);
            if (group) {
              const skinIndexAttr = mmdMesh.geometry.attributes.skinIndex;
              const skinWeightAttr = mmdMesh.geometry.attributes.skinWeight;
              if (skinIndexAttr && skinWeightAttr) {
                const start = group.start;
                const count = group.count;
                const indexAttr = mmdMesh.geometry.index;
                const vertexIndices = new Set<number>();
                if (indexAttr) {
                  for (let i = start; i < start + count; i++) {
                    vertexIndices.add(indexAttr.getX(i));
                  }
                } else {
                  for (let i = start; i < start + count; i++) {
                    vertexIndices.add(i);
                  }
                }

                vertexIndices.forEach((vIdx) => {
                  skinIndexAttr.setXYZW(vIdx, headBoneIdx, 0, 0, 0);
                  skinWeightAttr.setXYZW(vIdx, 1.0, 0, 0, 0);
                });

                skinIndexAttr.needsUpdate = true;
                skinWeightAttr.needsUpdate = true;
              }
            }
          }
        }

        modelGroup.add(mmdMesh);
        setModelLoaded(true);
        setLoadStatus("Firefly 3D Active");
      },
      (xhr: ProgressEvent) => {
        if (xhr.lengthComputable && !isDisposed) {
          const percent = ((xhr.loaded / xhr.total) * 100).toFixed(0);
          setLoadStatus(`Loading Firefly 3D Model (${percent}%)`);
        }
      },
      (error: unknown) => {
        if (isDisposed) return;
        console.error("PMX Load error:", error);
        
        const cardGeo = new THREE.PlaneGeometry(0.95, 1.45);
        const textureLoader = new THREE.TextureLoader();
        const avatarTex = textureLoader.load(currentPersona.avatarUrl);
        const cardMat = new THREE.MeshStandardMaterial({
          map: avatarTex,
          side: THREE.DoubleSide,
          transparent: true,
          roughness: 0.2
        });
        const avatarCard = new THREE.Mesh(cardGeo, cardMat);
        avatarCard.position.y = 1.15;
        modelGroup.add(avatarCard);

        setModelLoaded(true);
        setLoadStatus("Firefly 3D (Fallback Avatar Active)");
      }
    );

    // 7. Raycaster 3D Touch & Sparkle Particles System
    const raycaster = new THREE.Raycaster();
    const mouseVector = new THREE.Vector2();
    let headPatTiltTimer = 0;

    // Sparkles particle geometry for head pats
    const sparkleCount = 30;
    const sparkleGeo = new THREE.BufferGeometry();
    const sparklePos = new Float32Array(sparkleCount * 3);
    const sparkleVel = new Float32Array(sparkleCount * 3);
    const sparkleLife = new Float32Array(sparkleCount);

    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3));
    const sparkleMat = new THREE.PointsMaterial({
      color: 0xffd700,
      size: 0.045,
      transparent: true,
      opacity: 0
    });
    const sparkleParticles = new THREE.Points(sparkleGeo, sparkleMat);
    scene.add(sparkleParticles);

    const triggerSparkles = (hitPoint: THREE.Vector3) => {
      sparkleMat.opacity = 0.95;
      const posAttr = sparkleGeo.attributes.position as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;

      for (let i = 0; i < sparkleCount; i++) {
        positions[i * 3] = hitPoint.x + (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 1] = hitPoint.y + (Math.random() - 0.5) * 0.3;
        positions[i * 3 + 2] = hitPoint.z + (Math.random() - 0.5) * 0.3;

        sparkleVel[i * 3] = (Math.random() - 0.5) * 0.015;
        sparkleVel[i * 3 + 1] = Math.random() * 0.02 + 0.01;
        sparkleVel[i * 3 + 2] = (Math.random() - 0.5) * 0.015;

        sparkleLife[i] = 1.0;
      }
      posAttr.needsUpdate = true;
    };

    const updatePointerTracking = (clientX: number, clientY: number) => {
      if (isDisposed) return;
      const w = window.innerWidth;
      const h = window.innerHeight;
      pointerRef.current.targetX = (clientX / w) * 2 - 1;
      pointerRef.current.targetY = -(clientY / h) * 2 + 1;
    };

    const handlePointerMove = (clientX: number, clientY: number) => {
      updatePointerTracking(clientX, clientY);
    };

    let chestTouchCount = 0;
    let chestTouchResetTimer: ReturnType<typeof setTimeout> | null = null;
    let lastInteractionTime = 0;

    const handlePointerClick = (clientX: number, clientY: number) => {
      if (isDisposed || !containerRef.current || !mmdMeshRef.current) return;

      // Cooldown & Speaking Guard: Ignore click spam if Firefly is speaking or interacted within 1.2s
      const now = Date.now();
      if (isSpeakingRef.current || ttsService.isSpeaking() || now - lastInteractionTime < 1200) {
        return;
      }

      updatePointerTracking(clientX, clientY);

      const rect = containerRef.current.getBoundingClientRect();
      mouseVector.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseVector.y = -((clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouseVector, camera);
      const intersects = raycaster.intersectObject(mmdMeshRef.current, false);

      if (intersects.length > 0) {
        const hit = intersects[0];
        const hitPoint = hit.point;
        const relX = Math.abs(hitPoint.x - (-0.65)); // Relative X offset from Firefly model center (-0.65)

        // Record interaction time to throttle click spam
        lastInteractionTime = now;

        // Strict Head Pat Zone ONLY (Top of Head & Hair: y >= 1.35 and relX < 0.28)
        if (relX < 0.28 && hitPoint.y >= 1.35) {
          chestTouchCount = 0; // Reset chest touch counter on head pat!
          if (chestTouchResetTimer) clearTimeout(chestTouchResetTimer);

          currentEmotionRef.current = 'blush';
          onSelectEmotionRef.current?.('blush');
          headPatTiltTimer = 1.0;
          triggerSparkles(hitPoint);

          const interjections = ["えーっと、なに…？", "んんっ…恥ずかしいよ…", "えっ、なになに…？"];
          const pickedVoice = interjections[Math.floor(Math.random() * interjections.length)];

          ttsService.speak(
            pickedVoice,
            currentPersona,
            () => { isSpeakingRef.current = true; },
            () => { isSpeakingRef.current = false; },
            undefined,
            apiConfigRef.current
          );
        } 
        // Strict Chest Zone (1.08 <= y < 1.35 and relX < 0.18)
        else if (relX < 0.18 && hitPoint.y >= 1.08 && hitPoint.y < 1.35) {
          chestTouchCount += 1;

          if (chestTouchResetTimer) clearTimeout(chestTouchResetTimer);
          chestTouchResetTimer = setTimeout(() => {
            chestTouchCount = 0;
          }, 8000);

          let targetEmotion = 'blush-hardly';
          let voiceText = "ちょ、ちょっと…どこ触ってるの…？！";

          if (chestTouchCount >= 6) {
            // After 3 more touches (total 6+): Terrified (Japanese)
            targetEmotion = 'terrified';
            const lines = ["きゃあぁっ…！お、お願いだからやめてぇ…！", "う、うわぁぁん…！こわいよぉ…！", "た、助けてぇ…離れてぇ…！"];
            voiceText = lines[Math.floor(Math.random() * lines.length)];
          } else if (chestTouchCount >= 3) {
            // After 3 consecutive touches: Pouting (Japanese)
            targetEmotion = 'pouting';
            const lines = ["むーっ！もう、いい加減にしてよっ！", "ふんっ！開拓者さんなんて、もう知らないっ！", "もうっ！おこるよっ…？！"];
            voiceText = lines[Math.floor(Math.random() * lines.length)];
          } else {
            // Touches 1 - 2: Blush Hardly (Japanese)
            targetEmotion = 'blush-hardly';
            const lines = ["ちょ、ちょっと…どこ触ってるの…？！", "や、やだ…ダメだってば…！", "ひゃぁっ？！な、なにやってるの…？！"];
            voiceText = lines[Math.floor(Math.random() * lines.length)];
          }

          currentEmotionRef.current = targetEmotion;
          onSelectEmotionRef.current?.(targetEmotion);
          triggerSparkles(hitPoint);

          ttsService.speak(
            voiceText,
            currentPersona,
            () => { isSpeakingRef.current = true; },
            () => { isSpeakingRef.current = false; },
            undefined,
            apiConfigRef.current
          );
        }
        // All other body parts (arms, shoulders, skirt, legs): ZERO reaction
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const onClick = (e: MouseEvent) => {
      handlePointerClick(e.clientX, e.clientY);
    };

    const containerEl = containerRef.current;
    if (containerEl) {
      containerEl.addEventListener('click', onClick);
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);

    // 8. High-Performance Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsedTime = clock.elapsedTime;
      
      // Normalize & Map Emotion Tags cleanly
      const rawEmo = (currentEmotionRef.current || 'relaxed').toLowerCase().trim();
      let emo = rawEmo;
      if (rawEmo === 'smirk' || rawEmo === 'excited') emo = 'happy';
      else if (rawEmo === 'determined') emo = 'angry';
      else if (rawEmo === 'shy' || rawEmo === 'embarrassed') emo = 'blush';
      else if (rawEmo === 'flustered' || rawEmo === 'crimson' || rawEmo === 'blush_hardly' || rawEmo === 'hard_blush') emo = 'blush-hardly';
      else if (rawEmo === 'playful' || rawEmo === 'tease' || rawEmo === 'proud' || rawEmo === 'smug') emo = 'teasing';
      else if (rawEmo === 'envious') emo = 'jealous';
      else if (rawEmo === 'panic' || rawEmo === 'scared') emo = 'terrified';
      else if (rawEmo === 'sulk' || rawEmo === 'sulking') emo = 'pouting';
      else if (rawEmo === 'calm' || rawEmo === 'peaceful' || rawEmo === 'neutral') emo = 'relaxed';
      else if (rawEmo === 'shocked') emo = 'surprised';

      // Lightweight Hover Cursor Check (0.0001ms execution time)
      if (containerRef.current) {
        const px = pointerRef.current.targetX;
        const py = pointerRef.current.targetY;
        if (px >= -0.45 && px <= 0.45 && py >= 0.05 && py <= 0.85) {
          containerRef.current.style.cursor = 'pointer';
        } else {
          containerRef.current.style.cursor = 'default';
        }
      }

      pointerRef.current.x += (pointerRef.current.targetX - pointerRef.current.x) * 0.05;
      pointerRef.current.y += (pointerRef.current.targetY - pointerRef.current.y) * 0.05;

      const pX = pointerRef.current.x;
      const pY = pointerRef.current.y;

      // 1. Update Head Pat Timer
      let headPatTiltTimerVal = 0;
      if (headPatTiltTimer > 0) {
        headPatTiltTimer -= 0.016;
        headPatTiltTimerVal = headPatTiltTimer;
      }

      // 2. Update Sparkle Particles position & opacity
      if (sparkleMat.opacity > 0) {
        sparkleMat.opacity -= 0.018;
        const posAttr = sparkleGeo.attributes.position as THREE.BufferAttribute;
        const positions = posAttr.array as Float32Array;

        for (let i = 0; i < sparkleCount; i++) {
          positions[i * 3] += sparkleVel[i * 3];
          positions[i * 3 + 1] += sparkleVel[i * 3 + 1];
          positions[i * 3 + 2] += sparkleVel[i * 3 + 2];
        }
        posAttr.needsUpdate = true;
      }

      // 3. Ambient Particle Drift
      particles.rotation.y = elapsedTime * 0.04;

      // 4. AIRI Modular Animation Engine Update (Spring Head Roll, Figure-8 Sway, Saccades, Smile-Blink, LipSync)
      if (animationControllerRef.current && mmdMeshRef.current) {
        animationControllerRef.current.update({
          mesh: mmdMeshRef.current,
          modelGroup,
          elapsedTime,
          delta,
          pointerX: pX,
          pointerY: pY,
          emotion: emo,
          isSpeaking: isSpeakingRef.current || ttsService.isSpeaking(),
          headPatTiltTimer: headPatTiltTimerVal,
          cheekMaterials: cheekMaterialsRef.current,
          foreheadMaterial: foreheadShadowMaterialRef.current
        });
      }

      effect.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      if (!containerRef.current || isDisposed) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      effect.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      if (containerEl) {
        containerEl.removeEventListener('click', onClick);
      }
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      softPorcelainCheekTex.dispose();

      scene.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) {
          const mesh = object as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            materials.forEach((mat) => {
              if ('map' in mat && (mat as any).map) {
                (mat as any).map.dispose();
              }
              mat.dispose();
            });
          }
        }
      });
      renderer.dispose();

      if (renderer.domElement && renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [currentPersona]);

  return (
    <div className="scene-container">
      <div ref={containerRef} className="three-canvas-container" />
      
      <div className="scene-status-overlay">
        <span className="live-vrm-badge">
          <span className="pulse-dot" /> 
          {modelLoaded ? `3D Viewport • ${loadStatus}` : loadStatus}
        </span>
        <span className="current-emotion-badge">
          Expression: {currentEmotion || 'Relaxed'}
        </span>

        {/* Vertical Emotion Testing Toolbar */}
        <div className="testing-emotions-bar">
          <span className="testing-label">Test Expression</span>
          <div className="testing-emotions-list">
            {TESTING_EMOTIONS.map((emo) => (
              <button
                key={emo.id}
                className={`emotion-test-btn ${currentEmotion === emo.id ? 'active' : ''}`}
                onClick={() => onSelectEmotion?.(emo.id)}
              >
                {emo.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});
