# 🎨 Viera 3D Anime Rendering & PMX Material Optimization Guide

This documentation provides a comprehensive technical guide on 3D anime cel-shading pipelines, PMX (MMD) material optimization, tone mapping management, neutral-warm lighting, lineart hierarchy implementation, and facial feature harmonization in Viera.

This guide is designed to be reusable whenever importing new 3D character models (PMX/VRM/GLTF) to prevent common visual defects such as washed-out colors, heavy cyan color casts, harsh eyebrow line-art, un-lit glowing mouths, or stuck blush overlay submeshes.

---

## 📐 1. Rendering Architecture & Color Pipeline

To achieve 3D rendering that closely resembles **high-fidelity 2D anime illustrations (Honkai: Star Rail / Genshin Impact standard)**, the WebGL pipeline must be configured to process sRGB textures without clipping or desaturating colors.

```
                WebGL Renderer
                      │
        ┌─────────────┴─────────────┐
        │                           │
  outputColorSpace            toneMapping
  (THREE.SRGBColorSpace)   (ACESFilmicToneMapping)
                                    │
                              exposure = 1.0
```

### Renderer Initialization ([`Scene.tsx`](file:///home/nescryo/Projects/Viera/src/components/3d/Scene.tsx)):
```typescript
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
```

* **`outputColorSpace = SRGBColorSpace`**: Ensures that `.png` / `.tga` texture maps render with rich, accurate sRGB color spaces.
* **`ACESFilmicToneMapping` (Exposure 1.0)**: Gracefully compresses specular bright highlights without causing pastel pinks, cyans, or skin tones to turn washed-out or silvery-grey.

---

## 💡 2. Lighting Pipeline (Neutral/Warm Base)

Anime 3D lighting is **NOT** standard realistic PBR studio lighting. Ideal anime lighting relies on a **warm-neutral base** with low ambient intensity, allowing directional lights to cast soft, painted face and hair shadows naturally.

```
                Subtle Cool Rim
                   (0xe0f2fe, 0.22)
                          \
                           \
                     [ 3D CHARACTER ]
                          ↑
                          │
                     Warm/Neutral Key
                     (0xfffbf5, 0.88)
```

### Light Configuration:
1. **Warm Champagne Ambient Light (`0.42`)**:
   * *Principle*: Ambient light **MUST NOT** be overly bright (`> 0.60`). High ambient light floods all surfaces uniformly, flattening face features, hair locks, and clothing folds into featureless white planes.
   * `const ambientLight = new THREE.AmbientLight(0xfff0e4, 0.42);`
2. **Main Warm/Neutral Key Light (`0.90`)**:
   * Primary directional sunlight placed at top-right-front with a warm neutral white tint.
   * `const keyLight = new THREE.DirectionalLight(0xfff6ea, 0.90);`
3. **Neutral Soft Fill Light (`0.28`)**:
   * Fills shadows from the front-left without introducing cyan or blue color casts onto clothing or hair.
   * `const fillLight = new THREE.DirectionalLight(0xf5f5f5, 0.28);`
4. **Subtle Cool Rim Backlight (`0.22`)**:
   * Backlight adding a soft hair silhouette edge glow. Kept **subdued (`0.22`)** so cyan light does not spill over onto the front of the character.
   * `const rimLight = new THREE.DirectionalLight(0xe0f2fe, 0.22);`

---

## 🎨 3. Cel-Shading Ramp Texture (Soft 2D Illustration Shading)

Avoid discrete 3-step hard toon ramps (*NearestFilter*) which produce harsh, blocky 3D shadows. Use a **Smooth Linear Gradient Ramp** with `LinearFilter` for soft *white to warm gray* transitions typical of 2D anime art.

### Soft Anime Toon Ramp (Hair & Clothes):
```typescript
function createAnimeToonRampTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#d6d0cb');    // Soft warm neutral gray shadow
    grad.addColorStop(0.35, '#f2ece8'); // Soft illustration transition
    grad.addColorStop(0.65, '#ffffff'); // Main highlight
    grad.addColorStop(1.0, '#ffffff');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}
```

### Soft Face Toon Ramp (Porcelain Skin):
```typescript
function createFaceToonRampTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, '#fce4e6');   // Soft warm peach shadow (under bangs & chin only)
    grad.addColorStop(0.12, '#fff4f6'); // Smooth soft transition
    grad.addColorStop(0.20, '#ffffff'); // Pure bright warm porcelain face (80% of face surface!)
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
```

---

## 🔍 4. PMX / MMD Material Inspection & Submesh Handling

When importing official miHoYo/MMD PMX models, note that models often contain **duplicate submeshes for blush overlay expressions** and use **Traditional Chinese character names**.

### Traditional Chinese Submesh Matching (`顏` vs `顔`):
* `Mat #1: 顏` (Main Face Skin - Traditional Chinese `顏` `\u984f`)
* `Mat #11: 肌` (Body/Neck Skin - `肌`)
* `Mat #2: 顏+` (Blush Mesh Overlay - Stacked directly in front of face).
* **Critical Fix**: Always check for both Traditional Chinese (`顏`) and Simplified Chinese (`顔`) material names in your material optimization filter, otherwise Material #1 will fall back to default toon maps.

```typescript
const rawMatName = mat.name || '';
const isFaceOrSkin = 
  rawMatName.includes('顏') || rawMatName.includes('顔') ||
  rawMatName.includes('肌') || matName.includes('face') ||
  matName.includes('skin') || matName.includes('head') ||
  mapUrl.includes('颜.png') || mapUrl.includes('face');

// Hide blush submesh by default
const isBlushMat = 
  rawMatName.includes('顏+') || rawMatName.includes('颜+') ||
  rawMatName.includes('顏赤') || rawMatName.includes('颜赤') ||
  matName.includes('blush') || matName.includes('赤み') || matName.includes('照れ');

if (isBlushMat) {
  mat.transparent = true;
  mat.depthWrite = false;
  (mat as any).opacity = 0;
  mat.visible = false; // Disable rendering in relaxed/normal state!
  cheekMaterialsRef.current.push(mat as THREE.MeshBasicMaterial);
  return mat;
}
```

---

## 👁️ 5. Local Material Isolation & Facial Harmonization

Each facial feature requires isolated material tuning to maintain soft, expressive, and gentle character aesthetics without un-lit glowing features:

| Element | Material Type | Gradient Map | Tint / Color Setting | Technical Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Face & Neck Skin** (`顏`, `肌`) | `MeshToonMaterial` | `faceToonRampTex` | `Color(0xfff7f4)` | Opaque (`transparent: false`), warm soft porcelain white. |
| **Eye Iris** (`目`) | `MeshToonMaterial` | `faceToonRampTex` | `Color(0xf5eef0)` | Harmonized with face lighting to prevent un-lit neon glare. |
| **Mouth / Teeth** (`口`, `teeth`) | `MeshToonMaterial` | `faceToonRampTex` | `Color(0xf5eef0)` | Harmonized with face lighting to prevent glowing mouth cavities. |
| **Eye Sparkles** (`目光`) | `MeshBasicMaterial` | None | `Color(0xffffff)` | `transparent: true`, `alphaTest: 0.02` for bright crystal highlights (`✦`). |
| **Eyebrows** (`眉`, `eyebrow`) | `MeshBasicMaterial` | None | `Color(0x8a7c82)` | `opacity: 0.82` for seamless integration with hair bangs lineart. |
| **Eyelashes** (`睫`, `eyelash`) | `MeshBasicMaterial` | None | `Color(0x52464c)` | Soft dark rose-charcoal (avoids harsh pitch black). |

---

## ✏️ 6. Lineart Hierarchy & Inverted-Hull Outline

Outlines must not be so thin that they become invisible, nor so thick that they overpower facial features.

### Outline Balancing ([`OutlineEffect`](file:///home/nescryo/Projects/Viera/src/components/3d/Scene.tsx)):
```typescript
const effect = new OutlineEffect(renderer, {
  defaultThickness: 0.0014,        // Crisp 1.4mm anime lineart framing hair strands & silhouette
  defaultColor: [0.20, 0.18, 0.22], // Medium-dark neutral anime lineart color
  defaultAlpha: 0.85,
  defaultKeepAlive: true
});
```

* **Ideal Lineart Hierarchy**:
  $$\text{Hair Lineart (Medium-Dark 1.4mm)} \rightarrow \text{Eyebrows (Soft Rose-Ash Gray Opacity 0.82)} \rightarrow \text{Eyelashes (Soft Dark Charcoal)}$$

---

## 🎭 7. Morph Target Management (Resetting Inactive Morph States)

In Three.js MMD/VRM animations, update morph targets by looping over the entire `influences` array to ensure inactive morph targets **are smoothly lerped back down to 0**.

```typescript
// Loop over all morph target influences in the MMD model
for (let i = 0; i < influences.length; i++) {
  const targetVal = targetMap.get(i) ?? 0;
  influences[i] += (targetVal - influences[i]) * 0.15; // Smooth interpolation to 0!
}
```

---

## 📷 8. Camera Position & Character Framing

For illustration/presentation composition, set an intimate portrait framing focused on the head and upper body:

```typescript
const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
camera.position.set(-0.65, 1.30, 1.50); // Balanced upper-body portrait distance
camera.lookAt(-0.65, 1.28, 0);
```

---

## 📌 Checklist for Adding New 3D Models:

- [ ] Set `outputColorSpace = SRGBColorSpace` and `toneMapping = ACESFilmicToneMapping (1.0)`.
- [ ] Keep Ambient Light warm (`0.42`) and use a Warm Key Light (`0.90`).
- [ ] Check for Traditional Chinese (`顏`) and Simplified Chinese (`顔`) material names.
- [ ] Check for duplicate blush submeshes (`顏+`, `blush`) and set `opacity = 0`, `visible = false`.
- [ ] Create toon ramps using smooth linear gradients with `LinearFilter`.
- [ ] Use `MeshToonMaterial` with `faceToonRampTex` for Iris and Mouth to harmonize lighting with face skin.
- [ ] Separate eyebrow tint (`#8a7c82`) and eyelash tint (`#52464c`) from solid black.
- [ ] Set `OutlineEffect` thickness to `0.0014` with a medium dark brownish-grey tint.
- [ ] Reset all inactive morph targets to `0` in the animation loop.

---
*Documented by Ivy for Viera 3D Rendering System.* 🌸✨
