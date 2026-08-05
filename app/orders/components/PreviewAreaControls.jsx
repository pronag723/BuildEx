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
    <div className={`mt-4 rounded-2xl border p-4 sm:p-5 ${tone === "warn" ? "border-amber-400/30 bg-amber-400/[0.07] shadow-[0_12px_40px_rgba(251,191,36,.06)]" : "border-white/10 bg-white/[0.03]"}`}>
      {intro}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {["x", "z", "y"].map((axis) => (
          <label key={axis} className="block">
            <span className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-gray-300">
              <span>{axis.toUpperCase()} coordinate</span>{axis === "y" && <span className="font-medium normal-case tracking-normal text-gray-500">Optional</span>}
            </span>
            <input type="text" inputMode="text" pattern="-?[0-9]*" value={coords[axis]}
              onChange={(event) => setCoords((current) => ({ ...current, [axis]: event.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "") }))}
              disabled={busy} placeholder={axis === "y" ? "—" : "0"}
              className="w-full rounded-xl border border-white/15 bg-black/30 px-3 py-3 text-base font-semibold tabular-nums text-white outline-none placeholder:text-gray-600 focus:border-[#4ade80]/60 focus:ring-2 focus:ring-[#4ade80]/15" />
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-gray-400">Capture area: <strong className="text-gray-200">~{span}×{span} blocks</strong>{!editRadius && <> · {sizeLabel}</>}</p>
        <button type="button" disabled={busy} onClick={() => { if (editRadius) setRadius(baseRadius); setEditRadius((value) => !value); }}
          className="rounded-full border border-[#4ade80]/20 bg-[#4ade80]/5 px-3 py-1.5 text-xs font-semibold text-[#4ade80] transition hover:bg-[#4ade80]/10 disabled:opacity-50">
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
