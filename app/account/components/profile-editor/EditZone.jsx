"use client";

import { Icon } from "../../../../lib/icons";

// The quiet edit cue: a muted pencil after a block (see .edit-zone / .edit-pen
// in globals.css for the desktop hover).
export function PenGlyph({ size = 14, className = "" }) {
  return <Icon name="pencil" size={size} strokeWidth={2.2} className={`edit-pen ${className}`} />;
}

// One editable block of the profile: the whole block is the button. `label`
// is announced instead of making screen readers guess from the content.
export default function EditZone({ onClick, label, className = "", children }) {
  return (
    <button type="button" onClick={onClick} className={`edit-zone ${className}`}>
      <span className="sr-only">{label}</span>
      {children}
    </button>
  );
}

// Errors stay in the open editor, in the site's usual banner.
export function EditError({ message }) {
  if (!message) return null;
  return (
    <div role="alert" className="auth-banner auth-banner-error mt-3">
      {message}
    </div>
  );
}

export function Spinner() {
  return <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-fg/30 border-t-accent-fg" aria-hidden="true" />;
}
