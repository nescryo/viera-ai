/**
 * Image helpers for user-uploaded avatars.
 *
 * Uploaded avatars were previously stored as the raw file bytes (base64 data
 * URL) without any resizing, so low-resolution source images looked pixelated
 * once CSS scaled them up (both the small chat-bar avatar and the large
 * profile-modal avatar). Normalizing to a fixed square size produces a
 * consistently sharp avatar and keeps the base64 payload in localStorage small.
 */

/** Default square size (in CSS pixels) used for normalized avatars. */
export const AVATAR_SIZE = 256;

/**
 * Load a user-selected image file, center-crop it to a square, redraw it onto a
 * canvas at the target size and return a compact data URL.
 *
 * @param file - The image file chosen by the user.
 * @param size - Target width/height in pixels (square). Defaults to {@link AVATAR_SIZE}.
 * @returns A `data:` URL (WebP when supported, otherwise JPEG) of the normalized avatar.
 */
export async function normalizeAvatar(file: File, size: number = AVATAR_SIZE): Promise<string> {
  const bitmap = await loadBitmap(file);

  try {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Canvas unsupported: fall back to the raw file so upload still works.
      return readFileAsDataUrl(file);
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Center-crop the largest possible square from the source image (object-fit: cover).
    const side = Math.min(bitmap.width, bitmap.height);
    const sx = (bitmap.width - side) / 2;
    const sy = (bitmap.height - side) / 2;
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);

    // Prefer WebP (smaller); browsers that cannot encode it return a PNG data
    // URL, so fall back to JPEG for predictable, compact output.
    const webp = canvas.toDataURL('image/webp', 0.92);
    if (webp.startsWith('data:image/webp')) {
      return webp;
    }
    return canvas.toDataURL('image/jpeg', 0.92);
  } finally {
    if ('close' in bitmap && typeof bitmap.close === 'function') {
      bitmap.close();
    }
  }
}

/**
 * Decode an image file into something drawable on a canvas. Uses
 * `createImageBitmap` when available, otherwise falls back to an `HTMLImageElement`.
 */
async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fall through to the <img> decoder below.
    }
  }

  const dataUrl = await readFileAsDataUrl(file);
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to decode image file'));
    img.src = dataUrl;
  });
}

/** Read a file as a base64 data URL. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image file'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
