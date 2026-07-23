"use client";

import { useCallback, useEffect, useState } from "react";
import {
  configureManagedStudio,
  createModeratorInvite,
  listModeratorInvites,
  listStudios,
  recoverManagedStudioOwner,
  setModeratorInviteStatus,
} from "../../../lib/studios/api";
import { formatPrice } from "../../../lib/pricing";

const INPUT =
  "w-full px-3 py-2.5 rounded-xl bg-black/25 border border-white/10 text-sm outline-none focus:border-emerald-400/60";

export default function StudiosConsole() {
  const [invites, setInvites] = useState([]);
  const [studios, setStudios] = useState([]);
  const [internalName, setInternalName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    const [inviteResult, studioResult] = await Promise.all([
      listModeratorInvites(),
      listStudios(),
    ]);
    setInvites(inviteResult.invites || []);
    setStudios(studioResult.studios || []);
    setError(inviteResult.error?.message || studioResult.error?.message || null);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function createInvite(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const result = await createModeratorInvite({
      internalName: internalName.trim(),
      code: code.trim(),
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Couldn't create the moderator invite.");
      return;
    }
    setInternalName("");
    setCode("");
    reload();
  }

  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">Managed studios</h1>
        <p className="text-sm text-gray-400 mt-1">
          Invite verified moderators, configure BuildEx commission, and control storefront access.
        </p>
      </div>

      <form onSubmit={createInvite} className="glass rounded-2xl p-4 grid md:grid-cols-[1fr_1fr_auto] gap-3">
        <label>
          <span className="text-xs text-gray-400 block mb-1">Internal reference name</span>
          <input
            className={INPUT}
            value={internalName}
            onChange={(event) => setInternalName(event.target.value)}
            placeholder="Discord studio / contact"
          />
        </label>
        <label>
          <span className="text-xs text-gray-400 block mb-1">Moderator-only code</span>
          <input
            className={INPUT}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="Minimum 6 characters"
            autoComplete="off"
          />
        </label>
        <button
          disabled={busy || internalName.trim().length < 1 || code.trim().length < 6}
          className="self-end px-5 py-2.5 rounded-xl bg-emerald-400 text-black text-sm font-bold disabled:opacity-40"
        >
          Create invite
        </button>
      </form>

      {error && <div className="auth-banner auth-banner-error">{error}</div>}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 font-semibold text-sm">Moderator invites</div>
        {invites.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No studio moderator invites yet.</p>
        ) : (
          <div className="divide-y divide-white/[0.07]">
            {invites.map((invite) => (
              <div key={invite.id} className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[220px]">
                  <p className="font-semibold text-sm">{invite.internal_name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Code: <span className="font-mono text-gray-300">{String(invite.code)}</span>
                    {" · "}{invite.status}
                  </p>
                </div>
                {invite.status !== "claimed" && (
                  <button
                    type="button"
                    onClick={async () => {
                      await setModeratorInviteStatus(
                        invite.id,
                        invite.status === "revoked" ? "pending" : "revoked"
                      );
                      reload();
                    }}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-xs"
                  >
                    {invite.status === "revoked" ? "Restore" : "Revoke"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {studios.length === 0 ? (
          <div className="glass rounded-2xl p-5 text-sm text-gray-500">
            Claimed studios will appear here.
          </div>
        ) : (
          studios.map((studio) => (
            <ManagedStudioRow key={studio.id} studio={studio} onChanged={reload} />
          ))
        )}
      </div>
    </section>
  );
}

function ManagedStudioRow({ studio, onChanged }) {
  const [fee, setFee] = useState(
    studio.platform_commission_bps == null
      ? ""
      : String(studio.platform_commission_bps / 100)
  );
  const [status, setStatus] = useState(studio.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [replacementOwner, setReplacementOwner] = useState("");

  async function save() {
    setBusy(true);
    setError(null);
    const bps = Math.round(Number(fee) * 100);
    const result = await configureManagedStudio({
      id: studio.id,
      platformCommissionBps: bps,
      status,
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message || "Couldn't update the studio.");
      return;
    }
    onChanged();
  }

  return (
    <article className="glass rounded-2xl p-4">
      <div className="flex flex-wrap gap-4 items-start">
        <div className="flex-1 min-w-[220px]">
          <p className="font-bold">{studio.display_name}</p>
          <p className="text-xs text-gray-500 mt-1">
            Owner:{" "}
            {studio.moderator?.display_name ||
              studio.moderator?.username ||
              studio.moderator_id}
          </p>
          <p className="text-xs text-gray-500">@{studio.username} · {studio.status}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-400">
            <span>{studio.completed_orders} completed</span>
            <span>{studio.reviews_count} reviews</span>
            <span>{studio.available_count} available</span>
            <span>Balance {formatPrice(studio.balance?.available_cents || 0)}</span>
            <span>From {studio.starts_from ? formatPrice(studio.starts_from) : "—"}</span>
          </div>
        </div>
        <label className="w-36">
          <span className="text-xs text-gray-400 block mb-1">BuildEx fee %</span>
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
            className={INPUT}
          />
        </label>
        <label className="w-36">
          <span className="text-xs text-gray-400 block mb-1">Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className={INPUT}>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
        <button
          type="button"
          onClick={save}
          disabled={busy || fee === ""}
          className="mt-5 px-4 py-2.5 rounded-xl bg-emerald-400 text-black text-sm font-bold disabled:opacity-40"
        >
          Save
        </button>
      </div>
      <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-end gap-2">
        <label className="flex-1 min-w-[240px]">
          <span className="text-xs text-gray-400 block mb-1">
            Recover ownership to account UUID
          </span>
          <input
            className={INPUT}
            value={replacementOwner}
            onChange={(event) => setReplacementOwner(event.target.value.trim())}
            placeholder="Replacement profile UUID"
          />
        </label>
        <button
          type="button"
          disabled={busy || !replacementOwner}
          onClick={async () => {
            setBusy(true);
            const result = await recoverManagedStudioOwner(studio.id, replacementOwner);
            setBusy(false);
            if (result.error) setError(result.error.message);
            else {
              setReplacementOwner("");
              onChanged();
            }
          }}
          className="px-4 py-2.5 rounded-xl border border-amber-400/30 text-amber-300 text-sm disabled:opacity-40"
        >
          Recover owner
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
    </article>
  );
}
