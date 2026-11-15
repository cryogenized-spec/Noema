"use client";

import { useEffect, useState } from "react";

/** QR generation runs on the device; no URL or identity leaves the browser.
 * The substantial encoder is lazy-loaded only when this UI is visible.
 */
export function ContactQrCode({ value }: { value: string }) {
  const [svg, setSvg] = useState<{ path: string; size: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setSvg(null); setError("");
    void import("@/lib/qr/qrcodegen").then(({ qrcodegen }) => {
      if (!active) return;
      const code = qrcodegen.QrCode.encodeText(value, qrcodegen.QrCode.Ecc.MEDIUM);
      const commands: string[] = [];
      for (let y = 0; y < code.size; y++) {
        for (let x = 0; x < code.size; x++) {
          if (code.getModule(x, y)) commands.push(`M${x + 4},${y + 4}h1v1h-1z`);
        }
      }
      setSvg({ path: commands.join(""), size: code.size + 8 });
    }).catch(() => {
      if (active) setError("Unable to generate QR on this browser.");
    });
    return () => { active = false; };
  }, [value]);
  return (
    <div className="mx-auto flex h-[210px] w-[210px] max-w-full items-center justify-center rounded-lg bg-white p-2" aria-label="QR code to the NOEMA demo">
      {svg ? (
        <svg viewBox={`0 0 ${svg.size} ${svg.size}`} className="h-full w-full" role="img"
          aria-label="Scannable QR code for this NOEMA invitation demonstration">
          <rect width={svg.size} height={svg.size} fill="#ffffff" />
          <path d={svg.path} fill="#111111" />
        </svg>
      ) : <p className="px-3 text-center text-xs text-black" role="status">{error || "Generating code locally…"}</p>}
    </div>
  );
}
