import type { CharacterModelConfig } from '../types';

export const FIREFLY_MODEL_CONFIG: CharacterModelConfig = {
  pmxUrl: '/models/firefly/firefly.pmx',
  resourcePath: '/models/firefly/',
  targetHeight: 1.65,
  initialOffset: [-0.65, 0, 0],
  cameraFraming: {
    position: [-0.65, 1.30, 1.50],
    lookAt: [-0.65, 1.28, 0],
    fov: 36
  },
  stage: {
    pmxUrl: '/models/stages/CharacterSphere/CharacterSphere_HSRV.pmx',
    resourcePath: '/models/stages/CharacterSphere/',
    textureUrl: '/models/stages/CharacterSphere/textures/Tex_CharacterSphere_HSR.png',
    scale: [0.12, 0.12, 0.12],
    position: [-0.65, 0.5, 0]
  }
};

export const FIREFLY_METADATA = {
  id: 'firefly',
  name: 'Firefly',
  tagline: 'Stellaron Hunter • Iron Cavalry of Glamoth (AR-26710)',
  greeting: "Hello! I'm so happy to see you. Have you had anything sweet to eat today? Let's make another unforgettable memory together!",
  avatarUrl: '/models/firefly/icon.jpeg',
  voice: { pitch: 1.15, rate: 0.98, lang: 'en-US' },
  category: 'Honkai: Star Rail' as const
};
