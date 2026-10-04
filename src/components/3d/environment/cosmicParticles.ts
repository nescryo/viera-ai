import * as THREE from 'three';

export interface CosmicParticlesController {
  points: THREE.Points;
  update: (elapsedTime: number) => void;
  dispose: () => void;
}

// Soft palette: mostly white/lavender stardust with a few teal accents (Firefly theme)
const PALETTE = ['#ffffff', '#dbe7ff', '#c9b8ff', '#e6dcff', '#9fe8e0'];
const PALETTE_WEIGHTS = [0.32, 0.28, 0.2, 0.12, 0.08];

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  attribute float aSize;
  attribute float aPhase;
  attribute float aBrightness;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    vec3 pos = position;
    // Gentle floating drift, unique per particle
    pos.y += sin(uTime * 0.7 + aPhase) * 0.12;
    pos.x += cos(uTime * 0.5 + aPhase * 1.3) * 0.08;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Perspective size attenuation, clamped so near particles never become huge
    float size = aSize * uPixelRatio * (10.0 / -mvPosition.z);
    gl_PointSize = clamp(size, 2.0, 18.0 * uPixelRatio);

    // Twinkle: slow breathing with an occasional brighter sparkle
    float twinkle = 0.6 + 0.4 * sin(uTime * (2.0 + fract(aPhase) * 3.0) + aPhase * 6.2831);
    float sparkle = pow(max(0.0, sin(uTime * 1.0 + aPhase * 3.7)), 16.0);
    vAlpha = aBrightness * (twinkle + sparkle * 0.8);
    vColor = aColor;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Round soft glow: bright core + soft halo, no square edges
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;
    float core = smoothstep(0.18, 0.0, d);
    float halo = smoothstep(0.5, 0.0, d) * 0.35;
    float alpha = (core + halo) * vAlpha;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function pickColor(): THREE.Color {
  let r = Math.random();
  for (let i = 0; i < PALETTE.length; i++) {
    r -= PALETTE_WEIGHTS[i];
    if (r <= 0) return new THREE.Color(PALETTE[i]);
  }
  return new THREE.Color(PALETTE[0]);
}

/**
 * Creates floating cosmic stardust: round, twinkling, varied particles placed behind
 * and around the character (kept out of the camera-to-face corridor).
 */
export function createCosmicParticles(centerX: number = -0.65): CosmicParticlesController {
  const particleCount = 200;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const sizes = new Float32Array(particleCount);
  const phases = new Float32Array(particleCount);
  const brightness = new Float32Array(particleCount);

  for (let i = 0; i < particleCount; i++) {
    // Mostly behind the character (z < -0.5); a few on the sides for depth
    const behind = Math.random() < 0.85;
    let x: number;
    let z: number;
    if (behind) {
      x = (Math.random() - 0.5) * 8;
      z = -0.5 - Math.random() * 3.5;
    } else {
      // Side layer: keep away from the center so nothing covers the face or chat
      const side = Math.random() < 0.5 ? -1 : 1;
      x = side * (1.4 + Math.random() * 2.6);
      z = -0.5 + Math.random() * 1.2;
    }
    positions[i * 3] = x + centerX;
    positions[i * 3 + 1] = Math.random() * 4;
    positions[i * 3 + 2] = z;

    const c = pickColor();
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;

    // Mostly small dust, rare larger sparkles
    sizes[i] = Math.random() < 0.9 ? 1.5 + Math.random() * 2.5 : 5 + Math.random() * 3;
    phases[i] = Math.random() * Math.PI * 2;
    brightness[i] = 0.6 + Math.random() * 0.4;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aBrightness', new THREE.BufferAttribute(brightness, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(typeof window !== 'undefined' ? window.devicePixelRatio : 1, 2) }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  // Skip OutlineEffect's outline pass (it would try to re-shade this custom material)
  material.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geometry, material);

  return {
    points,
    update: (elapsedTime: number) => {
      material.uniforms.uTime.value = elapsedTime;
      // Very slow sway around the character instead of a rigid full rotation
      points.rotation.y = Math.sin(elapsedTime * 0.08) * 0.15;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    }
  };
}
