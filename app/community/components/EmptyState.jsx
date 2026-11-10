"use client";

// A channel with nothing in it: an icon, a line, and one clear action.

import Link from "next/link";
import { Icon } from "../../../lib/icons";

export default function EmptyState({ icon = "chat", title, body, action }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line/15 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-line/[0.06] text-ink-3">
        <Icon name={icon} size={22} />
      </span>
      <p className="mt-4 text-sm font-semibold">{title}</p>
      {body && <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-ink-3">{body}</p>}
      {action &&
        (action.href ? (
          <Link href={action.href} className="btn btn-primary btn-sm mt-5">
            {action.icon && <Icon name={action.icon} size={15} />}
            {action.label}
          </Link>
        ) : (
          <button type="button" onClick={action.onClick} className="btn btn-primary btn-sm mt-5">
            {action.icon && <Icon name={action.icon} size={15} />}
            {action.label}
          </button>
        ))}
    </div>
  );
}
