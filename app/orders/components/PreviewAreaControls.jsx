"use client";

import { PREVIEW_RADIUS_MAX, PREVIEW_RADIUS_MIN, SIZE_META } from "../../../lib/pricing";

export const FATAL_WORLD_CODES = new Set(["parse_failed", "no_regions", "empty"]);
export const COORD_PROMPT_CODES = new Set(["needs_coords", "too_large"]);

export default function PreviewAreaControls({
  coords, setCoords, radius, setRadius, baseRadius, buildingSize,
  editRadius, setEditRadius, busy, generating, onGenerate,
  tone = "neutral", intro, submitLabel = "Generate preview",
}) {
  const sizeLabel = SIZE_META[buildingSize]?.label || buildingSize || "selected";
  const span = radius * 2;
  return (
    <div className={`mt-4 rounded-2xl border p-3 ${tone === "warn" ? "border-amber-400/20 bg-amber-400/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
      {intro}
      <div className="grid grid-cols-3 gap-2">
        {["x", "y", "z"].map((axis) => (
          <label key={axis} className="block">
            <span className="mb-1 block text-[10px] uppercase tracking-widest text-gray-400">
              {axis.toUpperCase()}{axis === "y" && " (opt.)"}
            </span>
            <input type="text" inputMode="text" pattern="-?[0-9]*" value={coords[axis]}
              onChange={(event) => setCoords((current) => ({ ...current, [axis]: event.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "") }))}
              disabled={busy} placeholder={axis === "y" ? "—" : "0"}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-gray-600 focus:border-[#4ade80]/60 focus:ring-2 focus:ring-[#4ade80]/15" />
          </label>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-[11px] text-gray-400">Capture area: <strong className="text-gray-200">~{span}×{span} blocks</strong>{!editRadius && <> · {sizeLabel}</>}</p>
        <button type="button" disabled={busy} onClick={() => { if (editRadius) setRadius(baseRadius); setEditRadius((value) => !value); }}
          className="text-[11px] font-semibold text-[#4ade80] hover:underline disabled:opacity-50">
          {editRadius ? "Use suggested" : "Edit area size"}
        </button>
      </div>
      {editRadius && <div className="mt-2">
        <input type="range" min={PREVIEW_RADIUS_MIN} max={PREVIEW_RADIUS_MAX} step={8} value={radius}
          onChange={(event) => setRadius(Number(event.target.value))} disabled={busy} className="w-full accent-[#4ade80]" />
        <div className="mt-0.5 flex justify-between text-[10px] text-gray-500"><span>{PREVIEW_RADIUS_MIN * 2}×{PREVIEW_RADIUS_MIN * 2}</span><span>{PREVIEW_RADIUS_MAX * 2}×{PREVIEW_RADIUS_MAX * 2} blocks</span></div>
      </div>}
      <button type="button" onClick={onGenerate} disabled={busy}
        className="mt-3 w-full rounded-full bg-[#4ade80] px-4 py-2.5 text-sm font-bold text-black green-glow transition-all hover:bg-[#22c55e] disabled:cursor-not-allowed disabled:opacity-50">
        {generating ? "Generating…" : submitLabel}
      </button>
    </div>
  );
}
