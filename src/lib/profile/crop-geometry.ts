/** Cropping geometry isolated from Canvas so small-screen movement is testable. */
export interface CropPosition { x: number; y: number; }
export interface CropPlacement {
  imageWidth: number; imageHeight: number; dx: number; dy: number;
}
export function calculateCropPlacement(
  sourceWidth: number, sourceHeight: number,
  targetWidth: number, targetHeight: number,
  zoom: number, position: CropPosition,
): CropPlacement {
  if (![sourceWidth, sourceHeight, targetWidth, targetHeight, zoom, position.x, position.y]
    .every(Number.isFinite) || Math.min(sourceWidth, sourceHeight, targetWidth, targetHeight, zoom) <= 0)
    throw new Error("Invalid crop dimensions");
  const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const imageWidth = sourceWidth * scale * zoom;
  const imageHeight = sourceHeight * scale * zoom;
  const surplusX = Math.max(0, imageWidth - targetWidth);
  const surplusY = Math.max(0, imageHeight - targetHeight);
  const x = Math.max(-1, Math.min(1, position.x));
  const y = Math.max(-1, Math.min(1, position.y));
  return {
    imageWidth, imageHeight,
    dx: (targetWidth - imageWidth) / 2 + x * surplusX / 2,
    dy: (targetHeight - imageHeight) / 2 + y * surplusY / 2,
  };
}
