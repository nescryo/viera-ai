import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MMDLoader, OutlineEffect } from 'three-stdlib';
import * as MMDParser from 'mmd-parser';
import type { ApiConfig, Persona } from '../../types';
import { ttsService } from '../../services/ttsService';

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

/**
 * Creates a soft warm neutral 2D Anime Illustration Ramp Texture (Warm Shadow Transition)
 * Pure white base with warm neutral gray shadow step (NO cyan/blue shadow cast!)
 */
function createAnimeToonRampTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#d6d0cb'); // Warm neutral gray shadow step
    grad.addColorStop(0.35, '#f2ece8'); // Soft warm transition
    grad.addColorStop(0.65, '#ffffff'); // Pure white highlight step
    grad.addColorStop(1.0, '#ffffff');
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
 * Creates a soft warm porcelain Ramp Texture specifically for Face Skin
 * Renders soft warm ambient shading under bangs, nose bridge, and chin!
 */
function createFaceToonRampTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#f5dcd8'); // Soft warm porcelain shadow step
    grad.addColorStop(0.35, '#faf0ed'); // Soft warm transition
    grad.addColorStop(0.65, '#ffffff'); // Pure bright warm porcelain face
    grad.addColorStop(1.0, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
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

  // Ref to hold loaded MMD mesh, bones, cheek blush materials, and morph target dictionary
  const mmdMeshRef = useRef<THREE.SkinnedMesh | null>(null);
  const upperBodyBoneRef = useRef<THREE.Bone | null>(null);
  const neckBoneRef = useRef<THREE.Bone | null>(null);
  const headBoneRef = useRef<THREE.Bone | null>(null);
  const leftEyeBoneRef = useRef<THREE.Bone | null>(null);
  const rightEyeBoneRef = useRef<THREE.Bone | null>(null);
  const bothEyesBoneRef = useRef<THREE.Bone | null>(null);
  
  const cheekMaterialsRef = useRef<THREE.MeshBasicMaterial[]>([]);
  const foreheadShadowMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const hairBonesRef = useRef<Array<{ bone: THREE.Bone; baseRotZ: number; baseRotX: number; phase: number }>>([]);
  const skirtBonesRef = useRef<Array<{ bone: THREE.Bone; baseRotZ: number; baseRotX: number; phase: number }>>([]);

  const blinkTimerRef = useRef<{ nextBlinkTime: number; isBlinking: boolean; blinkProgress: number }>({
    nextBlinkTime: 0,
    isBlinking: false,
    blinkProgress: 0
  });

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
    camera.position.set(-0.65, 1.30, 1.50); // Spacious & elegant anime character view framing
    camera.lookAt(-0.65, 1.28, 0);

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

    // Anime Inverted-Hull Toon Outline Effect (Crisp 1.4mm anime lineart framing hair & silhouette)
    const effect = new OutlineEffect(renderer, {
      defaultThickness: 0.0014, // Crisp 1.4mm anime lineart (defines hair strands & bangs contour)
      defaultColor: [0.20, 0.18, 0.22], // Medium-dark anime lineart color matching in-game reference
      defaultAlpha: 0.85,
      defaultKeepAlive: true
    });

    containerRef.current.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(animationFrameId);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    // 2. High-Fidelity Masterclass Lighting Pipeline
    // Subdued Warm Ambient Light (0.38 - prevents washed out / flat white faces!)
    const ambientLight = new THREE.AmbientLight(0xfbf8f5, 0.38);
    scene.add(ambientLight);

    // Main Neutral/Warm Sunlight Key Light (RGB ≈ warm/neutral white)
    const keyLight = new THREE.DirectionalLight(0xfffbf5, 0.88);
    keyLight.position.set(2.0, 4.0, 3.0);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0003;
    scene.add(keyLight);

    // Neutral Soft Fill Light (RGB ≈ neutral white - NO CYAN CAST!)
    const fillLight = new THREE.DirectionalLight(0xf5f5f5, 0.28);
    fillLight.position.set(-2.0, 2.0, 2.5);
    scene.add(fillLight);

    // Subtle Cool Rim Light (Very gentle cyan accent from behind - SUBDUED 0.22!)
    const rimLight = new THREE.DirectionalLight(0xe0f2fe, 0.22);
    rimLight.position.set(-0.5, 3.0, -3.0);
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
        cheekMaterialsRef.current = [];
        hairBonesRef.current = [];
        skirtBonesRef.current = [];
        
        mmdMesh.castShadow = false;
        mmdMesh.receiveShadow = false;

        // Auto-scale MMD model to standard human height
        const bbox = new THREE.Box3().setFromObject(mmdMesh);
        const size = bbox.getSize(new THREE.Vector3());
        
        if (size.y > 0) {
          const scaleFactor = 1.65 / size.y;
          mmdMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }

        // Setup Bones & Natural Arm Resting Pose
        let headBone: THREE.Bone | null = null;

        if (mmdMesh.skeleton && mmdMesh.skeleton.bones) {
          mmdMesh.skeleton.bones.forEach((bone, index) => {
            const name = bone.name;
            if (name === '左腕') {
              bone.rotation.z = -THREE.MathUtils.degToRad(46);
            } else if (name === '右腕') {
              bone.rotation.z = THREE.MathUtils.degToRad(46);
            } else if (name === '上半身' || name === '上半身2' || name === '胸') {
              upperBodyBoneRef.current = bone;
            } else if (name === '首') {
              neckBoneRef.current = bone;
            } else if (name === '頭' || name === 'head') {
              headBone = bone;
              headBoneRef.current = bone;
            }

            // Eye bone detection (excluding tip/end bones like 目先.L or 目先.R)
            if (!name.includes('先') && !name.includes('tip') && !name.includes('end') && !name.includes('End')) {
              if (name === '左目' || name === '目.L' || name === '目_L' || name === 'eye_L' || name === 'Eye_L') {
                leftEyeBoneRef.current = bone;
              } else if (name === '右目' || name === '目.R' || name === '目_R' || name === 'eye_R' || name === 'Eye_R') {
                rightEyeBoneRef.current = bone;
              } else if (name === '両目' || name === 'eyes' || name === 'Eyes') {
                bothEyesBoneRef.current = bone;
              }
            }

            if (name.includes('髪') || name.includes('毛') || name.includes('hair') || name.includes('ツインテ') || name.includes('リボン')) {
              hairBonesRef.current.push({
                bone,
                baseRotZ: bone.rotation.z,
                baseRotX: bone.rotation.x,
                phase: index * 0.4
              });
            }

            // Identify Skirt Bones for Secondary Motion Physics (including 裾 prefix)
            if (name.includes('スカート') || name.includes('skirt') || name.includes('裾')) {
              skirtBonesRef.current.push({
                bone,
                baseRotZ: bone.rotation.z,
                baseRotX: bone.rotation.x,
                phase: index * 0.3
              });
            }
          });

          mmdMesh.skeleton.update();

          console.log('[Firefly Eye Tracking Debug]', {
            leftEye: leftEyeBoneRef.current?.name || 'NULL',
            rightEye: rightEyeBoneRef.current?.name || 'NULL',
            bothEyes: bothEyesBoneRef.current?.name || 'NULL',
            matchingBones: mmdMesh.skeleton.bones.map(b => b.name).filter(n => n.includes('目') || n.toLowerCase().includes('eye'))
          });
        }

        const animeToonRampTex = createAnimeToonRampTexture();
        const faceToonRampTex = createFaceToonRampTexture();

        // Clean and optimize materials with Anime Cel-Shading & sRGB Color Space
        mmdMesh.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            const optimizeMaterial = (mat: THREE.Material): THREE.Material => {
              const matName = (mat.name || '').toLowerCase();
              const mapUrl = ((mat as any).map?.name || (mat as any).map?.image?.src || '').toLowerCase();

              // Built-in PMX Blush Texture Overlay (Material #2: 顏+ / 颜赤.tga / 頬 / hoho / blush / 赤み / 照れ / pipi)
              // Hide by default (opacity = 0 & visible = false) so Firefly's face skin (Material #1: 顏) is 100% clean!
              const rawMatName = mat.name || '';
              const isBlushMat = 
                rawMatName.includes('顏+') || rawMatName.includes('颜+') ||
                rawMatName.includes('顏赤') || rawMatName.includes('颜赤') ||
                matName.includes('blush') || matName.includes('pipi') ||
                matName.includes('頬') || matName.includes('ほほ') ||
                matName.includes('hoho') || matName.includes('赤み') ||
                matName.includes('照れ') ||
                mapUrl.includes('颜赤') || mapUrl.includes('yan_chi') ||
                mapUrl.includes('blush') || mapUrl.includes('hoho');

              if (isBlushMat) {
                mat.transparent = true;
                mat.depthWrite = false;
                (mat as any).opacity = 0;
                mat.visible = false;
                mat.userData = { outlineParameters: { visible: false } };
                if (!cheekMaterialsRef.current.includes(mat as THREE.MeshBasicMaterial)) {
                  cheekMaterialsRef.current.push(mat as THREE.MeshBasicMaterial);
                }
                mat.needsUpdate = true;
                return mat;
              }

              const isTransparent = mat.transparent || mat.opacity < 0.98;
              const map = (mat as any).map || null;

              if (map) {
                map.colorSpace = THREE.SRGBColorSpace;
              }

              // Face Skin -> Smooth Porcelain Anime Cel-Shaded Skin
              if (
                matName.includes('face') || matName.includes('顔') ||
                matName.includes('skin') || matName.includes('肌') ||
                matName.includes('head') || mapUrl.includes('颜.png') ||
                mapUrl.includes('face')
              ) {
                const faceMat = new THREE.MeshToonMaterial({
                  map: map,
                  gradientMap: faceToonRampTex,
                  color: new THREE.Color(0xfff7f4), // Soft warm porcelain tone
                  transparent: false, // 100% Solid Opaque
                  depthWrite: true,
                  depthTest: true,
                });
                (faceMat as any).opacity = 1.0;
                faceMat.userData = { outlineParameters: { visible: false } };
                faceMat.needsUpdate = true;
                return faceMat;
              }

              // Eye Highlight Sparkles (Mat #9: 目光) -> Crystal Bright White Sparkles!
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

              // Eye Shadow Overlay (Mat #29: 目影) -> Soft Translucent Upper Eye Shadow
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

              // Eyes, Pupils, Iris (Mat #8: 目) -> Saturated Deep Cyan, Blue, Magenta & Pink Contrast!
              if (matName.includes('eye') || matName.includes('目') || matName.includes('hitomi') || matName.includes('pupil')) {
                const eyeMat = new THREE.MeshBasicMaterial({
                  map: map,
                  color: new THREE.Color(1.0, 1.0, 1.0), // True-to-life sRGB texture colors (deep cyan, magenta, dark pupil contrast!)
                  transparent: false,
                  depthWrite: true,
                  depthTest: true,
                  side: THREE.FrontSide,
                });
                eyeMat.userData = { outlineParameters: { visible: false } };
                eyeMat.needsUpdate = true;
                return eyeMat;
              }

              // Eyebrows (Mat #3 眉 / eyebrow / まゆ) -> Soft Warm Rose-Ash Gray (#8a7c82 matching hair lineart hierarchy!)
              if (rawMatName.includes('眉') || matName.includes('eyebrow') || matName.includes('まゆ')) {
                const browMat = new THREE.MeshBasicMaterial({
                  map: map,
                  color: new THREE.Color(0x8a7c82), // Soft rose-ash gray tint
                  transparent: true,
                  opacity: 0.82, // Softened opacity for seamless integration with hair bangs lineart
                  alphaTest: 0.08,
                  depthWrite: false,
                  depthTest: true,
                  side: THREE.DoubleSide,
                });
                browMat.userData = { outlineParameters: { visible: false } };
                browMat.needsUpdate = true;
                return browMat;
              }

              // Eyelashes, Eyelines (Mat #3 睫 / eyelash / eyeline / ま流) -> Soft Dark Rose-Charcoal (#52464c)
              if (rawMatName.includes('睫') || matName.includes('eyelash') || matName.includes('eyeline') || matName.includes('まつ')) {
                const lashMat = new THREE.MeshBasicMaterial({
                  map: map,
                  color: new THREE.Color(0x52464c), // Soft dark rose-charcoal (delicate, balanced contrast)
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

              // Mouth, Teeth, Tongue -> Clean Vibrant Rendering
              if (matName.includes('mouth') || matName.includes('口') || matName.includes('teeth') || matName.includes('tongue') || matName.includes('舌') || matName.includes('齒')) {
                const mouthMat = new THREE.MeshBasicMaterial({
                  map: map,
                  color: new THREE.Color(0xffffff),
                  transparent: true,
                  alphaTest: 0.05,
                  depthWrite: false,
                  depthTest: true,
                  side: THREE.DoubleSide,
                });
                mouthMat.userData = { outlineParameters: { visible: false } };
                mouthMat.needsUpdate = true;
                return mouthMat;
              }

              // Body, Hair, Clothes, Jacket, Ribbon, Skirt -> Vibrant MeshToonMaterial WITH outline!
              const toonMat = new THREE.MeshToonMaterial({
                map: map,
                gradientMap: animeToonRampTex,
                color: new THREE.Color(0xffffff),
                transparent: isTransparent,
                alphaTest: isTransparent ? 0.35 : 0.0,
                side: (mat as any).side ?? THREE.FrontSide,
                depthWrite: !isTransparent,
              });

              toonMat.userData = { outlineParameters: { visible: true } };

              // Subtle emissive highlight for crystal gems and hair accessories
              if (matName.includes('gem') || matName.includes('ribbon') || matName.includes('hair_acc') || matName.includes('crystal')) {
                toonMat.emissive = new THREE.Color(0x101b28);
              }

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
      const elapsedTime = clock.getElapsedTime();
      
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

      modelGroup.rotation.y = 0;
      modelGroup.rotation.x = 0;

      const targetTorsoYaw = pX * 0.18;
      const targetTorsoPitch = -pY * 0.08;

      let headTiltAdd = 0;
      if (headPatTiltTimer > 0) {
        headPatTiltTimer -= 0.016;
        const progress = Math.max(0, headPatTiltTimer / 1.0);
        headTiltAdd = Math.sin(progress * Math.PI) * 0.12;
      }

      // Update Sparkle Particles position & opacity
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

      const targetHeadYaw = pX * 0.32;
      const targetHeadPitch = -pY * 0.16 + headTiltAdd;

      const breathPhase = Math.sin(elapsedTime * 2.2);
      modelGroup.position.y = breathPhase * 0.003; 

      if (upperBodyBoneRef.current) {
        upperBodyBoneRef.current.rotation.y += (targetTorsoYaw - upperBodyBoneRef.current.rotation.y) * 0.1;
        upperBodyBoneRef.current.rotation.x = (breathPhase * 0.015) + (targetTorsoPitch * 0.5);
      }

      if (neckBoneRef.current) {
        neckBoneRef.current.rotation.y += ((targetHeadYaw * 0.5) - neckBoneRef.current.rotation.y) * 0.1;
        neckBoneRef.current.rotation.x = (-breathPhase * 0.008) + (targetHeadPitch * 0.5);
      }

      if (headBoneRef.current) {
        let extraHeadPitch = 0;
        let extraHeadYaw = 0;
        if (emo === 'blush-hardly') {
          extraHeadPitch = 0.14; // bashfully looking down
          extraHeadYaw = -0.12;  // looking away
        } else if (emo === 'teasing') {
          extraHeadPitch = -0.06; // chin up
        } else if (emo === 'jealous' || emo === 'pouting') {
          extraHeadYaw = 0.12; // sulking head turn
        } else if (emo === 'terrified') {
          extraHeadPitch = 0.22; // Downward head tilt looking up nervously
          extraHeadYaw = Math.sin(elapsedTime * 35.0) * 0.018; // High-frequency horror trembling
        }

        headBoneRef.current.rotation.y += (((targetHeadYaw * 0.5) + extraHeadYaw) - headBoneRef.current.rotation.y) * 0.1;
        headBoneRef.current.rotation.x += (((targetHeadPitch * 0.5) + extraHeadPitch) - headBoneRef.current.rotation.x) * 0.1;
      }

      // Fast Lifelike Eye Tracking (Subtle, natural glance without creepy distortion)
      const rawMouseX = pointerRef.current.targetX;
      const rawMouseY = pointerRef.current.targetY;

      // Natural eye glance angle (Subtle ±0.08 rad yaw / ±0.05 rad pitch)
      const targetEyeYaw = rawMouseX * 0.08;
      const targetEyePitch = -rawMouseY * 0.05;

      const eyeLerpSpeed = 0.25;

      if (leftEyeBoneRef.current) {
        leftEyeBoneRef.current.rotation.y += (targetEyeYaw - leftEyeBoneRef.current.rotation.y) * eyeLerpSpeed;
        leftEyeBoneRef.current.rotation.x += (targetEyePitch - leftEyeBoneRef.current.rotation.x) * eyeLerpSpeed;
      }
      if (rightEyeBoneRef.current) {
        rightEyeBoneRef.current.rotation.y += (targetEyeYaw - rightEyeBoneRef.current.rotation.y) * eyeLerpSpeed;
        rightEyeBoneRef.current.rotation.x += (targetEyePitch - rightEyeBoneRef.current.rotation.x) * eyeLerpSpeed;
      }
      if (bothEyesBoneRef.current && !leftEyeBoneRef.current && !rightEyeBoneRef.current) {
        bothEyesBoneRef.current.rotation.y += (targetEyeYaw - bothEyesBoneRef.current.rotation.y) * eyeLerpSpeed;
        bothEyesBoneRef.current.rotation.x += (targetEyePitch - bothEyesBoneRef.current.rotation.x) * eyeLerpSpeed;
      }

      hairBonesRef.current.forEach(({ bone, baseRotZ, baseRotX, phase }) => {
        const hairSwayZ = Math.sin(elapsedTime * 2.5 + phase) * 0.04 + (targetHeadYaw * 0.12);
        const hairSwayX = Math.cos(elapsedTime * 2.0 + phase) * 0.025 + (targetHeadPitch * 0.08);
        
        bone.rotation.z = baseRotZ + hairSwayZ;
        bone.rotation.x = baseRotX + hairSwayX;
      });

      skirtBonesRef.current.forEach(({ bone, baseRotZ, baseRotX, phase }) => {
        const skirtSwayZ = Math.sin(elapsedTime * 2.2 + phase) * 0.015;
        const skirtSwayX = Math.cos(elapsedTime * 1.8 + phase) * 0.010;

        bone.rotation.z = baseRotZ + skirtSwayZ;
        bone.rotation.x = baseRotX + skirtSwayX;
      });

      particles.rotation.y = elapsedTime * 0.04;

      // AUTOMATIC EYE BLINKING ENGINE
      if (mmdMeshRef.current && mmdMeshRef.current.morphTargetDictionary && mmdMeshRef.current.morphTargetInfluences) {
        const dict = mmdMeshRef.current.morphTargetDictionary;
        const influences = mmdMeshRef.current.morphTargetInfluences;

        const getMorphIdx = (name: string) => dict[name];

        const blinkIndex = getMorphIdx('まばたき') ?? getMorphIdx('blink') ?? getMorphIdx('まばたき鏡');

        if (blinkIndex !== undefined) {
          if (elapsedTime > blinkTimerRef.current.nextBlinkTime && !blinkTimerRef.current.isBlinking) {
            blinkTimerRef.current.isBlinking = true;
            blinkTimerRef.current.blinkProgress = 0;
          }

          if (blinkTimerRef.current.isBlinking) {
            blinkTimerRef.current.blinkProgress += 0.08;
            const blinkWeight = Math.sin(blinkTimerRef.current.blinkProgress * Math.PI);
            influences[blinkIndex] = Math.max(0, blinkWeight);

            if (blinkTimerRef.current.blinkProgress >= 1.0) {
              blinkTimerRef.current.isBlinking = false;
              influences[blinkIndex] = 0;
              blinkTimerRef.current.nextBlinkTime = elapsedTime + 3.5 + Math.random() * 2.0;
            }
          }
        }

        // MMD Vowel Morph Target Lookups
        const morphVowelA  = getMorphIdx('あ');
        const morphVowelI  = getMorphIdx('い');
        const morphVowelU  = getMorphIdx('う');
        const morphVowelE  = getMorphIdx('え');
        const morphVowelO  = getMorphIdx('お');

        const morphSmileMouth = getMorphIdx('口角上げ');
        const morphSmallMouth = getMorphIdx('ん') ?? getMorphIdx('へ');
        const morphFrownMouth = getMorphIdx('口角下げ') ?? getMorphIdx('▲') ?? getMorphIdx('△');

        const morphRelaxedEye  = getMorphIdx('じと目') ?? getMorphIdx('笑い');
        const morphRelaxedEyebrow = getMorphIdx('にこり') ?? getMorphIdx('下');

        const morphAngryEyebrow = getMorphIdx('怒り') ?? getMorphIdx('真面目');
        const morphAngryEye     = getMorphIdx('じと目') ?? getMorphIdx('怒り');

        const morphSadEyebrow   = getMorphIdx('困る') ?? getMorphIdx('悲しい');
        const morphSadEye       = getMorphIdx('じと目');

        const morphSurprisedEye = getMorphIdx('びっくり') ?? getMorphIdx('目大');
        const morphSurprisedEyebrow = getMorphIdx('上');

        let targetSmileMouth = 0;
        let targetSmallMouth = 0;
        let targetFrownMouth = 0;

        let targetVowelA = 0;
        let targetVowelI = 0;
        let targetVowelU = 0;
        let targetVowelE = 0;
        let targetVowelO = 0;

        let targetRelaxedEye = 0;
        let targetRelaxedEyebrow = 0;
        let targetAngryEyebrow = 0;
        let targetAngryEye = 0;
        let targetSadEyebrow = 0;
        let targetSadEye = 0;
        let targetSurprisedEye = 0;
        let targetSurprisedEyebrow = 0;

        if (emo === 'happy') {
          targetSmileMouth = 0.55;
          targetVowelA = 0.32; // Firefly signature cute open-mouth smile :D
          targetRelaxedEyebrow = 0.25;
        } else if (emo === 'blush') {
          targetSmallMouth = 0.45;
          targetSadEyebrow = 0.35;
        } else if (emo === 'blush-hardly') {
          targetSmallMouth = 0.65;
          targetSadEyebrow = 0.60;
          targetRelaxedEye = 0.45;
        } else if (emo === 'teasing') {
          targetSmileMouth = 0.65;
          targetRelaxedEye = 0.55;
          targetRelaxedEyebrow = 0.35;
        } else if (emo === 'jealous') {
          targetFrownMouth = 0.75;
          targetAngryEyebrow = 0.45;
          targetRelaxedEye = 0.40;
        } else if (emo === 'terrified') {
          targetSadEyebrow = 0.95; // Deep distressed downturned sad inner eyebrows (困る)
          targetSurprisedEye = 0.85; // Panicked wide pupils (びっくり)
          targetFrownMouth = 0.45; // Distressed trembling mouth
          targetSmallMouth = 0.35;
        } else if (emo === 'pouting') {
          targetFrownMouth = 0.85;
          targetAngryEyebrow = 0.55;
          targetSmallMouth = 0.35;
        } else if (emo === 'relaxed') {
          targetSmileMouth = 0.25; // Gentle sweet smile
          targetRelaxedEyebrow = 0; // Gentle natural arched eyebrows (no downturned sad morph!)
          targetRelaxedEye = 0; // Wide open expressive round eyes (no squished eyelids!)
        } else if (emo === 'surprised') {
          targetSurprisedEye = 0.85;
          targetSurprisedEyebrow = 0.75;
          targetVowelO = 0.55;
        } else if (emo === 'angry') {
          targetAngryEyebrow = 0.95;
          targetAngryEye = 0.55;
          targetFrownMouth = 0.85;
          targetSmallMouth = 0.45;
        } else if (emo === 'sad') {
          targetSadEyebrow = 0.85;
          targetSadEye = 0.45;
          targetFrownMouth = 0.75;
          targetSmallMouth = 0.35;
        }

        // Organic Emotion-Contextual Anime Speech Wave Generator (Sad, Angry, Blush, Happy)
        if (isSpeakingRef.current) {
          const t = elapsedTime;
          // Multi-frequency irregular harmonics
          const speechWave1 = Math.sin(t * 13.5);
          const speechWave2 = Math.sin(t * 23.7) * 0.4;
          const speechWave3 = Math.cos(t * 8.3) * 0.3;
          const noisePause = Math.sin(t * 3.1);

          // Syllable micro-pauses (brief rest when speaker pauses between words)
          const organicFactor = noisePause < -0.3 ? 0.08 : 1.0;

          const combinedWave = Math.max(0, (speechWave1 + speechWave2 + speechWave3) * 0.55);
          const openPower = Math.pow(combinedWave, 1.1) * organicFactor;

          if (emo === 'sad' || emo === 'terrified') {
            // Melancholy / Terrified speech: NO smile, keep gentle sad downturned mouth corners (0.22)
            targetSmileMouth = 0;
            targetFrownMouth = 0.22;
            targetSmallMouth = 0;
            targetVowelA = Math.min(0.35, openPower * 0.40);
            targetVowelI = Math.abs(Math.sin(t * 9.0)) * 0.15 * organicFactor;
            targetVowelO = Math.abs(Math.sin(t * 6.0)) * 0.20 * organicFactor;
          } else if (emo === 'angry' || emo === 'jealous' || emo === 'pouting') {
            // Determined/Angry/Jealous speech: NO smile, keep firm mouth tension
            targetSmileMouth = 0;
            targetFrownMouth = 0.28;
            targetSmallMouth = 0;
            targetVowelA = Math.min(0.42, openPower * 0.48);
          } else if (emo === 'blush' || emo === 'blush-hardly') {
            // Shy speech: keep subtle blushing small mouth
            targetSmileMouth = 0.20;
            targetSmallMouth = 0.35 * (1 - openPower);
            targetVowelA = Math.min(0.35, openPower * 0.38);
          } else {
            // Happy / Teasing / Smug / Relaxed / Neutral speech: sweet anime smile base
            targetSmileMouth = 0.35;
            targetVowelA = Math.min(0.52, openPower * 0.55);
            targetVowelI = Math.abs(Math.sin(t * 11.2)) * 0.22 * organicFactor;
            targetVowelE = Math.abs(Math.cos(t * 17.4)) * 0.18 * organicFactor;
            targetVowelO = Math.abs(Math.sin(t * 6.8)) * 0.25 * organicFactor;
          }
        }

        // Smoothly fade soft rose-peach cheekbone blush (0 when relaxed/neutral!)
        const targetCheekOpacity = emo === 'blush-hardly' ? 0.35 : (emo === 'blush' ? 0.20 : 0);
        cheekMaterialsRef.current.forEach((mat) => {
          mat.opacity += (targetCheekOpacity - mat.opacity) * 0.15;
          mat.visible = mat.opacity > 0.01;
        });

        // Smoothly fade anime forehead horror/shock dark shadow overlay
        const targetForeheadOpacity = emo === 'terrified' ? 0.90 : 0;
        if (foreheadShadowMaterialRef.current) {
          foreheadShadowMaterialRef.current.opacity += (targetForeheadOpacity - foreheadShadowMaterialRef.current.opacity) * 0.15;
        }



        // Dynamic Map-based Morph Lerp (Prevents alias collision skips for shared indices like じと目)
        const targetMap = new Map<number, number>();
        const setMorphTarget = (idx: number | undefined, val: number) => {
          if (idx === undefined) return;
          const curr = targetMap.get(idx) ?? 0;
          targetMap.set(idx, Math.max(curr, val));
        };

        const morphBlush1 = getMorphIdx('照れ');
        const morphBlush2 = getMorphIdx('赤み');
        const morphBlush3 = getMorphIdx('照れ２');
        const morphBlush4 = getMorphIdx('blush');

        let targetBlushMorph = 0;
        if (emo === 'blush') {
          targetBlushMorph = 0.35;
        } else if (emo === 'blush-hardly') {
          targetBlushMorph = 0.70;
        }

        setMorphTarget(morphBlush1, targetBlushMorph);
        setMorphTarget(morphBlush2, targetBlushMorph);
        setMorphTarget(morphBlush3, targetBlushMorph);
        setMorphTarget(morphBlush4, targetBlushMorph);

        setMorphTarget(morphVowelA, targetVowelA);
        setMorphTarget(morphVowelI, targetVowelI);
        setMorphTarget(morphVowelU, targetVowelU);
        setMorphTarget(morphVowelE, targetVowelE);
        setMorphTarget(morphVowelO, targetVowelO);

        setMorphTarget(morphSmileMouth, targetSmileMouth);
        setMorphTarget(morphSmallMouth, targetSmallMouth);
        setMorphTarget(morphFrownMouth, targetFrownMouth);

        setMorphTarget(morphRelaxedEye, targetRelaxedEye);
        setMorphTarget(morphRelaxedEyebrow, targetRelaxedEyebrow);

        setMorphTarget(morphSurprisedEye, targetSurprisedEye);
        setMorphTarget(morphSurprisedEyebrow, targetSurprisedEyebrow);

        setMorphTarget(morphAngryEyebrow, targetAngryEyebrow);
        setMorphTarget(morphAngryEye, targetAngryEye);

        setMorphTarget(morphSadEyebrow, targetSadEyebrow);
        setMorphTarget(morphSadEye, targetSadEye);

        // Smoothly lerp ALL morph target influences in the MMD model!
        // Resets inactive morph targets (like blush, flustered, angry eyelids) cleanly back to 0!
        for (let i = 0; i < influences.length; i++) {
          const targetVal = targetMap.get(i) ?? 0;
          influences[i] += (targetVal - influences[i]) * 0.15;
        }
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
