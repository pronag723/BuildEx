// ─────────────────────────────────────────────────────────────────────────────
// BuildEx — Haptics
// A light tap of vibration on phones, for moments a gesture "clicks" (a pull
// that will now switch works, the switch itself).
//
// Android browsers have the Vibration API. iOS Safari has none, but since
// iOS 18 toggling a native switch (<input type="checkbox" switch>) plays the
// system's selection haptic, and clicking its label from script does the same
// — so on iPhone we toggle a throwaway hidden one. Both only work inside a
// user gesture (iOS: a tap, i.e. touchend — not touchmove), and both quietly
// do nothing anywhere else (desktop, older iOS), so callers never check.
// ─────────────────────────────────────────────────────────────────────────────

const PATTERNS = {
  tick: 12, // crossing a threshold
  confirm: [16, 40, 10], // an action that happened
};

export function haptic(kind = "tick") {
  if (typeof navigator === "undefined" || typeof document === "undefined") return;
  try {
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tick);
      return;
    }
    const label = document.createElement("label");
    label.ariaHidden = "true";
    label.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {
    // Haptics are a nicety; never let them break a gesture.
  }
}
