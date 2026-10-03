import * as THREE from 'three';

export interface CosmicParticlesController {
  points: THREE.Points;
  update: (elapsedTime: number) => void;
  dispose: () => void;
}

/**
 * Creates 200 Floating Cosmic Starlight Dust Particles for background atmosphere
 */
export function createCosmicParticles(centerX: number = -0.65): CosmicParticlesController {
  const particleCount = 200;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount * 3; i += 3) {
    positions[i] = (Math.random() - 0.5) * 8 + centerX;
    positions[i + 1] = Math.random() * 4;
    positions[i + 2] = (Math.random() - 0.5) * 8;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: new THREE.Color('#dbe7ff'),
    size: 0.035,
    transparent: true,
    opacity: 0.70
  });

  const points = new THREE.Points(geometry, material);

  return {
    points,
    update: (elapsedTime: number) => {
      points.rotation.y = elapsedTime * 0.04;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
    }
  };
}
