/** Lightweight, dependency-free 2D image optimisation for IndexedDB profiles.
 * Canvas re-encoding also strips EXIF location and camera metadata.
 */
export type WorkshopImageKind = "avatar" | "banner" | "gallery";
const presets: Record<WorkshopImageKind, { width: number; height: number; limit: number }> = {
  avatar: { width: 520, height: 520, limit: 180_000 },
  banner: { width: 1280, height: 480, limit: 320_000 },
  gallery: { width: 960, height: 960, limit: 250_000 },
};
const allowed = ["image/jpeg", "image/png", "image/webp"];

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Image conversion failed.")),
      "image/webp", quality);
  });
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Image read failed."));
    reader.onerror = () => reject(new Error("Image read failed."));
    reader.readAsDataURL(blob);
  });
}

export async function optimiseWorkshopImage(file: File, kind: WorkshopImageKind): Promise<string> {
  if (!allowed.includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP image.");
  if (file.size > 4_000_000) throw new Error("Image exceeds 4 MB. Please choose a smaller file.");
  const bitmap = await createImageBitmap(file);
  const preset = presets[kind];
  try {
    if (!bitmap.width || !bitmap.height) throw new Error("Invalid image dimensions.");
    const scale = Math.min(1, preset.width / bitmap.width, preset.height / bitmap.height);
    let width = Math.max(1, Math.round(bitmap.width * scale));
    let height = Math.max(1, Math.round(bitmap.height * scale));
    for (const quality of [0.82, 0.68, 0.52, 0.4]) {
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas is not available.");
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvasToBlob(canvas, quality);
      canvas.width = canvas.height = 0;
      if (blob.size <= preset.limit) return blobToDataUrl(blob);
      width = Math.max(1, Math.round(width * 0.85));
      height = Math.max(1, Math.round(height * 0.85));
    }
    throw new Error("Image is too complex to store locally. Try a simpler image.");
  } finally {
    bitmap.close();
  }
}
