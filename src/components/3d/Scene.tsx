import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { MMDLoader, OutlineEffect } from 'three-stdlib';
import * as MMDParser from 'mmd-parser';
import { ChevronDown } from 'lucide-react';
import type { Persona } from '../../types';
import { getCharacterPackage } from '../../characters/registry';
import type { CharacterPackage } from '../../characters/types';
import { ttsService } from '../../services/ttsService';
import { VieraAnimationController } from './animation';
import { EMOTION_REGISTRY, isRegisteredEmotion, DEFAULT_EMOTION_ID } from '../../data/emotionRegistry';
import { setupCharacterStage } from './environment/characterSphereStage';
import { createCosmicParticles } from './environment/cosmicParticles';

if (typeof window !== 'undefined') {
  (window as any).MMDParser = MMDParser;
}

interface SceneProps {
  currentPersona: CharacterPackage | Persona;
  isSpeaking: boolean;
  currentEmotion: string;
  onSelectEmotion?: (emotion: string) => void;
}

const TESTING_EMOTIONS = EMOTION_REGISTRY;

export const Scene: React.FC<SceneProps> = React.memo(({
  currentPersona,
  isSpeaking,
  currentEmotion,
  onSelectEmotion
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadStatus, setLoadStatus] = useState<string>("Loading 3D Model...");
  const [isEmotionListOpen, setIsEmotionListOpen] = useState<boolean>(() => 
    typeof window !== 'undefined' ? window.innerWidth > 900 : false
  );

  // Keep track of currentEmotion in ref to avoid re-loading 3D model on emotion changes
  const currentEmotionRef = useRef(currentEmotion);
  useEffect(() => {
    currentEmotionRef.current = currentEmotion;
  }, [currentEmotion]);

  const isSpeakingRef = useRef(isSpeaking);
  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

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

    // Resolve Character Package (contains 3D model path, camera framing, cel-shading optimizer)
    const charPkg = getCharacterPackage(currentPersona.id);

    // 1. Scene & Close Dynamic Portrait Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0f1322'); // Space cosmic dark environment

    const camera = new THREE.PerspectiveCamera(
      charPkg.model.cameraFraming.fov || 36,
      width / height,
      0.1,
      500
    );
    camera.position.set(...charPkg.model.cameraFraming.position);
    camera.lookAt(...charPkg.model.cameraFraming.lookAt);

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
    renderer.toneMapping = THREE.LinearToneMapping;
    renderer.toneMappingExposure = 1.05;

    // Anime Inverted-Hull Toon Outline Effect (Clean, crisp, well-defined anime lineart)
    const effect = new OutlineEffect(renderer, {
      defaultThickness: 0.0036,
      defaultColor: [0.18, 0.16, 0.20],
      defaultAlpha: 0.95,
      defaultKeepAlive: true
    });

    containerRef.current.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(animationFrameId);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost, false);

    // 2. High-Fidelity Masterclass Anime Lighting Pipeline
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd0d5e2, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.78);
    keyLight.position.set(0.4, 1.8, 3.2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.bias = -0.0003;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xf2f5ff, 0.30);
    fillLight.position.set(-1.8, 1.2, 2.2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe8f4ff, 0.35);
    rimLight.position.set(0.0, 2.8, -2.5);
    scene.add(rimLight);

    // 3. Stage & Foot Contact Shadow
    const stageCtrl = setupCharacterStage(scene, charPkg.model.stage, () => isDisposed);

    // 4. Floating Cosmic Starlight Dust Particles
    const particlesCtrl = createCosmicParticles(charPkg.model.initialOffset[0]);
    scene.add(particlesCtrl.points);

    // 5. 3D Model Root Group
    const modelGroup = new THREE.Group();
    modelGroup.position.set(...charPkg.model.initialOffset);
    scene.add(modelGroup);

    // 6. Load Character .pmx Model dynamically from Character Package
    // Enable Three.js in-memory loader cache so re-mounts within the same
    // session (StrictMode double-mount, persona switches) reuse already-fetched
    // PMX/texture data instead of re-downloading and re-parsing it.
    THREE.Cache.enabled = true;

    // Shared loading manager: the MMDLoader and every texture created during
    // material optimization register with this manager, so manager.onLoad only
    // fires once ALL textures have finished decoding. We keep the model hidden
    // until then to avoid materials popping in one-by-one.
    const loadingManager = new THREE.LoadingManager();
    const mmdLoader = new MMDLoader(loadingManager);
    mmdLoader.setResourcePath(charPkg.model.resourcePath);

    setLoadStatus(`Loading ${charPkg.name} 3D Model...`);

    mmdLoader.load(
      charPkg.model.pmxUrl,
      (mmdMesh: THREE.SkinnedMesh) => {
        if (isDisposed) return;

        mmdMeshRef.current = mmdMesh;
        animationControllerRef.current = new VieraAnimationController(mmdMesh);
        cheekMaterialsRef.current = [];
        
        mmdMesh.castShadow = false;
        mmdMesh.receiveShadow = false;

        // Auto-scale MMD model to character target height
        const bbox = new THREE.Box3().setFromObject(mmdMesh);
        const size = bbox.getSize(new THREE.Vector3());
        
        if (size.y > 0) {
          const scaleFactor = charPkg.model.targetHeight / size.y;
          mmdMesh.scale.set(scaleFactor, scaleFactor, scaleFactor);
        }

        // Apply character package cel-shading & material optimizations.
        // Pass the shared manager so textures created here (e.g. blush overlay)
        // are tracked and awaited before the model is revealed.
        const matBindings = charPkg.optimizeMaterials(mmdMesh, loadingManager);
        cheekMaterialsRef.current = matBindings.cheekMaterials;
        foreheadShadowMaterialRef.current = matBindings.foreheadMaterial;

        // Keep the model hidden until every texture has finished decoding so it
        // appears fully shaded at once instead of materials popping in.
        mmdMesh.visible = false;
        modelGroup.add(mmdMesh);
        setLoadStatus(`Finalizing ${charPkg.name} textures...`);

        let revealed = false;
        const revealModel = () => {
          if (revealed || isDisposed) return;
          revealed = true;
          mmdMesh.visible = true;
          setModelLoaded(true);
          setLoadStatus(`${charPkg.name} 3D Active`);
        };

        // Reveal once ALL textures tracked by the manager have finished loading.
        loadingManager.onLoad = revealModel;

        // Safety net: if every texture was served synchronously from cache,
        // the manager may already be idle and onLoad will not fire again.
        // Reveal on the next frame in that case so the model never stays hidden.
        requestAnimationFrame(() => {
          if (!revealed && !isDisposed) {
            revealModel();
          }
        });
      },
      (xhr: ProgressEvent) => {
        if (xhr.lengthComputable && !isDisposed) {
          const percent = ((xhr.loaded / xhr.total) * 100).toFixed(0);
          setLoadStatus(`Loading ${charPkg.name} 3D Model (${percent}%)`);
        }
      },
      (error: unknown) => {
        if (isDisposed) return;
        console.error("PMX Load error:", error);
        
        const cardGeo = new THREE.PlaneGeometry(0.95, 1.45);
        const textureLoader = new THREE.TextureLoader();
        const avatarTex = textureLoader.load(charPkg.avatarUrl);
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
        setLoadStatus(`${charPkg.name} 3D (Fallback Avatar Active)`);
      }
    );

    // 7. Gaze Tracking Pointer Listeners
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

    const onMouseMove = (e: MouseEvent) => {
      handlePointerMove(e.clientX, e.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches && e.touches[0]) {
        handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove);

    // 8. High-Performance Animation Loop
    let clock = new THREE.Clock();

    const animate = () => {
      if (isDisposed) return;
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.05);
      const elapsedTime = clock.elapsedTime;
      
      // 3D Visual Emotion State (Strict Canonical ID from Registry)
      const rawEmo = currentEmotionRef.current?.toLowerCase().trim();
      const emo = isRegisteredEmotion(rawEmo) ? rawEmo : DEFAULT_EMOTION_ID;

      pointerRef.current.x += (pointerRef.current.targetX - pointerRef.current.x) * 0.05;
      pointerRef.current.y += (pointerRef.current.targetY - pointerRef.current.y) * 0.05;

      const pX = pointerRef.current.x;
      const pY = pointerRef.current.y;

      // 1. Ambient Particle Drift
      particlesCtrl.update(elapsedTime);

      // 2. AIRI Modular Animation Engine Update (Spring Head Roll, Figure-8 Sway, Saccades, Smile-Blink, LipSync)
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
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);

      stageCtrl.dispose();
      particlesCtrl.dispose();

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
          <button 
            type="button"
            className="testing-label-toggle"
            onClick={() => setIsEmotionListOpen((prev) => !prev)}
            aria-expanded={isEmotionListOpen}
            aria-label="Toggle expressions list"
          >
            <span>Test Expression</span>
            <ChevronDown size={14} className={`toggle-arrow ${isEmotionListOpen ? 'open' : ''}`} />
          </button>
          
          {isEmotionListOpen && (
            <div className="testing-emotions-list">
              {TESTING_EMOTIONS.map((emo) => (
                <button
                  key={emo.id}
                  className={`emotion-test-btn ${currentEmotion === emo.id ? 'active' : ''}`}
                  onClick={() => onSelectEmotion?.(emo.id)}
                  aria-label={`Test expression: ${emo.label}`}
                >
                  {emo.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
