"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Icon } from "@iconify/react";
import { calculateCropPlacement } from "@/lib/profile/crop-geometry";

export type CropTarget = "avatar" | "banner";
type Position = { x: number; y: number };
const CROP: Record<CropTarget, { width: number; height: number; title: string; maxBytes: number }> = {
  avatar: { width: 512, height: 512, title: "Profile photograph", maxBytes: 170_000 },
  banner: { width: 1200, height: 400, title: "Workshop banner", maxBytes: 300_000 },
};
const clamp = (number: number, min: number, max: number) => Math.max(min, Math.min(max, number));

export function renderWorkshopCrop(
  canvas: HTMLCanvasElement,
  source: ImageBitmap,
  target: CropTarget,
  zoom: number,
  position: Position,
) {
  const { width, height } = CROP[target];
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser does not support image editing.");
  context.clearRect(0, 0, width, height);
  // COVER math is shared with unit tests so a crop never exposes blank edges.
  const { imageWidth, imageHeight, dx, dy } = calculateCropPlacement(
    source.width, source.height, width, height, zoom, position,
  );
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, dx, dy, imageWidth, imageHeight);
}

function toWebP(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob
    ? resolve(blob) : reject(new Error("Unable to encode the crop.")), "image/webp", quality));
}
function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result) : reject(new Error("Could not read cropped image."));
    reader.onerror = () => reject(new Error("Could not read cropped image."));
    reader.readAsDataURL(blob);
  });
}
async function exportCrop(source: ImageBitmap, target: CropTarget, zoom: number, position: Position) {
  const config = CROP[target];
  const canvas = document.createElement("canvas");
  renderWorkshopCrop(canvas, source, target, zoom, position);
  for (const quality of [0.84, 0.7, 0.54, 0.42]) {
    const blob = await toWebP(canvas, quality);
    if (blob.size <= config.maxBytes) {
      canvas.width = canvas.height = 0;
      return toDataUrl(blob);
    }
  }
  canvas.width = canvas.height = 0;
  throw new Error("This crop is too detailed to save. Try another image.");
}

export function WorkshopImageCropper({ file, target, onSave, onCancel }: {
  file: File;
  target: CropTarget;
  onSave: (data: string) => Promise<void>;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapRef = useRef<ImageBitmap | null>(null);
  const pointerRef = useRef<{ x: number; y: number; position: Position } | null>(null);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4_000_000) {
        setError("Choose a JPEG, PNG or WebP under 4 MB.");
        return;
      }
      try {
        const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
        if (!live) { bitmap.close(); return; }
        if (bitmap.width > 8000 || bitmap.height > 8000) {
          bitmap.close();
          setError("Image dimensions exceed the editor limit (8000 pixels)."); return;
        }
        bitmapRef.current = bitmap; setReady(true);
      } catch { if (live) setError("This image could not be opened."); }
    };
    void load();
    return () => { live = false; bitmapRef.current?.close(); bitmapRef.current = null; };
  }, [file]);

  useEffect(() => {
    if (!ready || !canvasRef.current || !bitmapRef.current) return;
    renderWorkshopCrop(canvasRef.current, bitmapRef.current, target, zoom, position);
  }, [target, zoom, position, ready]);

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!ready || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { x: event.clientX, y: event.clientY, position };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!pointerRef.current || !bitmapRef.current || !canvasRef.current || busy) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const source = bitmapRef.current;
    const { width, height } = CROP[target];
    const scale = Math.max(width / source.width, height / source.height);
    const surplusX = Math.max(0, source.width * scale * zoom - width);
    const surplusY = Math.max(0, source.height * scale * zoom - height);
    const movedX = (event.clientX - pointerRef.current.x) * width / Math.max(1, rect.width);
    const movedY = (event.clientY - pointerRef.current.y) * height / Math.max(1, rect.height);
    setPosition({
      x: surplusX > 0 ? clamp(pointerRef.current.position.x + movedX * 2 / surplusX, -1, 1) : 0,
      y: surplusY > 0 ? clamp(pointerRef.current.position.y + movedY * 2 / surplusY, -1, 1) : 0,
    });
  };
  const onPointerUp = () => { pointerRef.current = null; };

  const save = async () => {
    if (!bitmapRef.current || busy) return;
    setBusy(true); setError("");
    try {
      await onSave(await exportCrop(bitmapRef.current, target, zoom, position));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Unable to save cropped image.");
      setBusy(false);
    }
  };

  const adjustPosition = (axis: "x" | "y", direction: number) =>
    setPosition((current) => ({ ...current, [axis]: clamp(current[axis] + direction * 0.1, -1, 1) }));

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/90 p-3 sm:p-6"
      role="dialog" aria-modal="true" aria-label={"Crop " + CROP[target].title}>
      <section className="flex max-h-[95dvh] w-full max-w-[570px] flex-col gap-3 overflow-y-auto rounded-xl border border-noema-border bg-[#121214] p-4 text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Adjust {CROP[target].title}</h2>
            <p className="mt-0.5 text-xs text-neutral-400">Drag the photograph, zoom, then save the visible selection.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy}
            className="rounded-lg border border-noema-border p-2" aria-label="Cancel crop">
            <Icon icon="solar:close-circle-linear" className="text-xl" aria-hidden="true" />
          </button>
        </div>
        <div className="flex min-h-[160px] items-center justify-center rounded-lg border border-noema-border bg-black p-3">
          {ready ? (
            <canvas ref={canvasRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
              onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Drag to reposition the selected image"
              className={"block max-h-[46dvh] w-full max-w-full cursor-grab touch-none select-none object-contain active:cursor-grabbing " +
                (target === "avatar" ? "aspect-square max-w-[310px] rounded-full" : "aspect-[3/1] rounded-lg")} />
          ) : <p className="text-sm text-neutral-400">{error || "Opening image…"}</p>}
        </div>
        <label className="text-xs text-neutral-300">
          Zoom · {zoom.toFixed(2)}×
          <input type="range" className="mt-2 w-full accent-[#b9ff66]"
            min={1} max={3} step={0.05} disabled={!ready || busy} value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1.5">
            {(["left", "right", "up", "down"] as const).map((direction) => (
              <button key={direction} type="button" disabled={!ready || busy}
                aria-label={"Nudge photo " + direction}
                className="rounded-md border border-noema-border px-3 py-1.5 text-xs text-neutral-300"
                onClick={() => adjustPosition(direction === "up" || direction === "down" ? "y" : "x",
                  direction === "up" || direction === "left" ? -1 : 1)}>
                <Icon icon={"solar:arrow-" + direction + "-linear"} aria-hidden="true" />
              </button>
            ))}
          </div>
          <button type="button" disabled={!ready || busy}
            onClick={() => { setPosition({ x: 0, y: 0 }); setZoom(1); }}
            className="rounded-md border border-noema-border px-3 py-1.5 text-xs">Reset crop</button>
        </div>
        {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onCancel}
            className="min-h-11 flex-1 rounded-lg border border-noema-border px-3 text-sm text-neutral-300">Cancel</button>
          <button type="button" disabled={!ready || busy} onClick={() => void save()}
            className="min-h-11 flex-1 rounded-lg bg-noema-lime px-3 text-sm font-semibold text-black disabled:opacity-50">
            {busy ? "Saving…" : "Save this crop"}
          </button>
        </div>
      </section>
    </div>
  );
}
