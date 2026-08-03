"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PreviewViewer } from "../orders/components/WorldPreview";
import { useScrollLock } from "../../lib/useScrollLock";
import { formatPrice } from "../../lib/pricing";
import { generatePreview } from "../../lib/preview/client";
import {
  MAX_WORLD_BYTES,
  createReadyBuild,
  deleteReadyBuild,
  deleteReadyBuildImage,
  getReadyBuildDownloadUrl,
  getReadyBuildPreviewUrl,
  listMyReadyBuildPurchases,
  listMyReadyBuilds,
  reorderReadyBuildImages,
  saveReadyBuild,
  uploadReadyBuildImage,
  uploadReadyBuildVersion,
} from "../../lib/readyBuilds/api";

const EMPTY_FORM = { title: "", description: "", style: "fantasy", price: "", minecraftEdition: "Java Edition", minecraftVersion: "" };
const DEFAULT_FILE_FORMAT = "ZIP world";
const DEFAULT_INCLUDED_CONTENT = "World files described in the listing";
const DEFAULT_DEPENDENCIES = "None";
const STYLES = ["fantasy", "medieval", "sci-fi", "modern", "organic", "pvp"];
const MINECRAFT_EDITIONS = [
  { value: "Java Edition", label: "Java Edition", detail: "PC & Mac" },
  { value: "Bedrock Edition", label: "Bedrock Edition", detail: "Console, mobile & Windows" },
  { value: "Java & Bedrock", label: "Java & Bedrock", detail: "Includes both editions" },
];

function BuildEditor({ listing, onClose, onSaved }) {
  const isEditing = Boolean(listing);
  const [form, setForm] = useState(() => listing ? {
    title: listing.title,
    description: listing.description,
    style: listing.style,
    price: (Number(listing.price_kopecks) / 100).toFixed(2),
    minecraftEdition: listing.minecraft_edition,
    minecraftVersion: listing.minecraft_version,
  } : EMPTY_FORM);
  const [photos, setPhotos] = useState(() => (listing?.media || []).map((image) => ({ ...image, key: image.id, kind: "existing" })));
  const [world, setWorld] = useState(null);
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [styleOpen, setStyleOpen] = useState(false);
  const [editionOpen, setEditionOpen] = useState(false);
  const photoRef = useRef(null);
  const worldRef = useRef(null);
  const numericPrice = Number(form.price);
  const hasInvalidPrice = form.price !== "" && (!Number.isFinite(numericPrice) || numericPrice < 5);
  const normalizedMinecraftVersion = form.minecraftVersion.trim().toLowerCase();
  const hasInvalidMinecraftVersion = normalizedMinecraftVersion === "not specified";
  useScrollLock(true);

  const loadExistingPreview = useCallback(
    () => getReadyBuildPreviewUrl(listing?.version?.preview_path),
    [listing?.version?.preview_path]
  );

  const chooseWorld = (file) => {
    setWorld(file || null);
    setPreview(null);
    setMessage(null);
  };

  const addPhotos = (files) => {
    const additions = Array.from(files || []).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      kind: "new",
      file,
      alt: file.name,
      url: URL.createObjectURL(file),
    }));
    setPhotos((items) => [...items, ...additions]);
  };

  const movePhoto = (from, to) => setPhotos((items) => {
    if (to < 0 || to >= items.length) return items;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });

  const removePhoto = async (photo) => {
    if (photo.kind === "existing" && photos.length === 1) {
      setMessage("Add another image before removing the last one from a listing.");
      return;
    }
    if (photo.kind === "new") {
      URL.revokeObjectURL(photo.url);
      setPhotos((items) => items.filter((item) => item.key !== photo.key));
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await deleteReadyBuildImage(listing.id, photo);
    if (error) {
      setMessage(error.message || "Couldn't delete that image. Please try again.");
    } else {
      setPhotos((items) => items.filter((item) => item.key !== photo.key));
    }
    setBusy(false);
  };

  const generate3dPreview = async () => {
    if (!world) {
      setMessage("Choose a world ZIP before generating its 3D preview.");
      return;
    }
    if (world.size > MAX_WORLD_BYTES) {
      setMessage("World files must be 200 MB or smaller.");
      return;
    }
    setBusy(true);
    setMessage("Preparing your interactive 3D preview…");
    try {
      const result = await generatePreview(world);
      setPreview(result);
      setMessage("3D preview ready — drag to rotate and scroll to zoom.");
    } catch (error) {
      setMessage(error?.message || "We couldn't create a preview from that ZIP.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (event) => {
    event.preventDefault();
    const priceCents = Math.round(Number(form.price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 500) {
      setMessage("The minimum listing price is $5.00.");
      return;
    }
    if (!normalizedMinecraftVersion || hasInvalidMinecraftVersion) {
      setMessage("Enter the Minecraft version buyers need, such as 1.21.x.");
      return;
    }
    if (!isEditing && (!world || !photos.length)) {
      setMessage("Add at least one image and a world ZIP to publish a build.");
      return;
    }
    if (world && world.size > MAX_WORLD_BYTES) {
      setMessage("World files must be 200 MB or smaller.");
      return;
    }
    setBusy(true);
    setMessage(isEditing ? "Saving your build…" : "Publishing your build…");
    try {
      let listingId = listing?.id;
      if (!listingId) {
        const created = await createReadyBuild({ ...form, priceCents });
        if (created.error || !created.listingId) throw created.error || new Error("Couldn't create the listing.");
        listingId = created.listingId;
      }
      const orderedMediaIds = [];
      for (let index = 0; index < photos.length; index += 1) {
        const photo = photos[index];
        if (photo.kind === "existing") {
          orderedMediaIds.push(photo.id);
          continue;
        }
        const result = await uploadReadyBuildImage(listingId, photo.file, 10000 + index);
        if (result.error) throw result.error;
        orderedMediaIds.push(result.id);
      }
      if (orderedMediaIds.length) {
        const reordered = await reorderReadyBuildImages(listingId, orderedMediaIds);
        if (reordered.error) throw reordered.error;
      }
      if (world) {
        const generated = preview || await generatePreview(world);
        const version = await uploadReadyBuildVersion(listingId, world, generated.bytes, generated.meta);
        if (version.error) throw version.error;
      }
      const published = await saveReadyBuild({
        id: listingId,
        title: form.title,
        description: form.description,
        style: form.style,
        priceCents,
        active: true,
        minecraftEdition: form.minecraftEdition,
        minecraftVersion: form.minecraftVersion,
        fileFormat: listing?.file_format || DEFAULT_FILE_FORMAT,
        includedContent: listing?.included_content || DEFAULT_INCLUDED_CONTENT,
        dependencies: listing?.dependencies || DEFAULT_DEPENDENCIES,
      });
      if (published.error) throw published.error;
      onSaved(isEditing ? "Changes saved and the build is live in the marketplace." : "Build published — it is now available in the marketplace.");
      onClose();
    } catch (error) {
      setMessage(error?.message || "Saving failed. Check the files and try again.");
    } finally {
      setBusy(false);
    }
  };

  const previewSource = preview?.bytes
    ? { bytes: preview.bytes }
    : listing?.version?.preview_path ? { loadPreview: loadExistingPreview } : null;

  return (
    <div className="ready-build-editor-overlay fixed inset-0 z-[210] overflow-y-auto bg-[#050806]/85 pt-28 pb-8 backdrop-blur-md sm:px-6 sm:pt-32" role="dialog" aria-modal="true" aria-label={isEditing ? "Edit ready-made build" : "Add a ready-made build"} onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="relative mx-auto w-[calc(100%_-_1.5rem)] max-w-6xl overflow-hidden rounded-[2rem] border border-[#4ade80]/20 bg-[#101512] shadow-[0_30px_100px_rgba(0,0,0,.65)] sm:w-full">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[radial-gradient(ellipse_at_top,rgba(74,222,128,.18),transparent_70%)]" />
        <div className="relative flex items-start justify-between gap-4 border-b border-white/10 px-5 py-5 sm:px-8">
          <div>
            <div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold uppercase tracking-[.18em] text-[#4ade80]">Ready-made builds</p>{isEditing && <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-[.14em] ${listing.is_active ? "border-[#4ade80]/30 bg-[#4ade80]/10 text-[#8df3b2]" : "border-amber-400/30 bg-amber-400/10 text-amber-200"}`}>{listing.is_active ? "Live" : "Draft · publishes on save"}</span>}</div>
            <h2 className="mt-1 text-2xl font-bold">{isEditing ? "Refine your listing" : "Place a finished build"}</h2>
            <p className="mt-1 text-sm text-gray-400">Give buyers a confident look at the world before they purchase it.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-4 py-2 text-sm text-gray-300 transition hover:bg-white/10">Close</button>
        </div>

        <form onSubmit={save} className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_minmax(320px,.9fr)] sm:p-8">
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2"><span className="text-xs font-medium text-gray-400">Build name</span><input required minLength="3" maxLength="100" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="e.g. Emerald Citadel" className="field mt-1.5" /></label>
              <div className="relative"><span className="text-xs font-medium text-gray-400">Style</span><button type="button" aria-haspopup="listbox" aria-expanded={styleOpen} onClick={() => { setStyleOpen((open) => !open); setEditionOpen(false); }} className="field mt-1.5 flex w-full items-center justify-between text-left capitalize"><span>{form.style}</span><svg viewBox="0 0 20 20" className={`h-4 w-4 text-[#4ade80] transition-transform ${styleOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 7 5 5 5-5" /></svg></button>{styleOpen && <div role="listbox" className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-[#4ade80]/30 bg-[#161d18] p-1.5 shadow-[0_18px_45px_rgba(0,0,0,.55)]">{STYLES.map((style) => <button key={style} type="button" role="option" aria-selected={form.style === style} onClick={() => { setForm({ ...form, style }); setStyleOpen(false); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm capitalize transition ${form.style === style ? "bg-[#4ade80]/15 text-[#8df3b2]" : "text-gray-300 hover:bg-white/[.07]"}`}><span>{style}</span>{form.style === style && <span className="text-[#4ade80]">✓</span>}</button>)}</div>}</div>
              <label className="block"><span className="text-xs font-medium text-gray-400">Price in USD</span><input required aria-invalid={hasInvalidPrice} inputMode="decimal" type="number" min="0" step="0.01" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="5.00" className={`field mt-1.5 text-lg font-semibold tabular-nums ${hasInvalidPrice ? "ready-build-price-invalid" : ""}`} /><span className={`mt-1.5 block text-[11px] ${hasInvalidPrice ? "font-medium text-red-400" : "text-gray-500"}`}>{hasInvalidPrice ? "Price must be at least $5.00" : "Minimum price: $5.00"}</span></label>
            </div>
            <label className="block"><span className="text-xs font-medium text-gray-400">Tell buyers what is included</span><textarea required minLength="10" maxLength="4000" rows="5" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Describe the build, dimensions, included interiors, and anything buyers should know." className="field mt-1.5 resize-y" /></label>
            <section className="relative rounded-3xl border border-[#4ade80]/20 bg-[linear-gradient(135deg,rgba(74,222,128,.07),rgba(255,255,255,.015))] p-4 sm:p-5" aria-labelledby="compatibility-heading">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div><p id="compatibility-heading" className="text-sm font-bold text-gray-100">Minecraft compatibility</p><p className="mt-1 text-xs leading-relaxed text-gray-500">Help buyers choose the correct download.</p></div>
                <span className="rounded-full border border-[#4ade80]/25 bg-[#4ade80]/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[.16em] text-[#80efa7]">Required</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="relative">
                  <span className="text-xs font-medium text-gray-400">Minecraft edition</span>
                  <button type="button" aria-haspopup="listbox" aria-expanded={editionOpen} onClick={() => { setEditionOpen((open) => !open); setStyleOpen(false); }} className={`field mt-1.5 flex w-full items-center justify-between gap-3 text-left transition ${editionOpen ? "border-[#4ade80]/60 ring-2 ring-[#4ade80]/10" : ""}`}>
                    <span className="flex min-w-0 items-center gap-2.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#4ade80]/10 text-xs font-black text-[#71e99d]">M</span><span className="truncate font-medium text-gray-100">{form.minecraftEdition}</span></span>
                    <svg viewBox="0 0 20 20" className={`h-4 w-4 shrink-0 text-[#4ade80] transition-transform ${editionOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 7 5 5 5-5" /></svg>
                  </button>
                  {editionOpen && <div role="listbox" className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-[#4ade80]/30 bg-[#151c17] p-1.5 shadow-[0_20px_55px_rgba(0,0,0,.7)]">{MINECRAFT_EDITIONS.map((edition) => <button key={edition.value} type="button" role="option" aria-selected={form.minecraftEdition === edition.value} onClick={() => { setForm({ ...form, minecraftEdition: edition.value }); setEditionOpen(false); }} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition ${form.minecraftEdition === edition.value ? "bg-[#4ade80]/14" : "hover:bg-white/[.06]"}`}><span><span className={`block text-sm font-semibold ${form.minecraftEdition === edition.value ? "text-[#8df3b2]" : "text-gray-200"}`}>{edition.label}</span><span className="mt-0.5 block text-[10px] text-gray-500">{edition.detail}</span></span>{form.minecraftEdition === edition.value && <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-[#4ade80]" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="m4 10 4 4 8-9" /></svg>}</button>)}</div>}
                </div>
                <label className="block"><span className="text-xs font-medium text-gray-400">Minecraft version</span><div className="relative mt-1.5"><input required aria-invalid={hasInvalidMinecraftVersion} value={form.minecraftVersion} onChange={(event) => setForm({ ...form, minecraftVersion: event.target.value })} placeholder="e.g. 1.21.x" className={`field w-full pr-11 font-medium ${hasInvalidMinecraftVersion ? "border-red-400/60 ring-2 ring-red-400/10" : ""}`} /><span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[10px] font-bold uppercase tracking-wider text-gray-600">Ver.</span></div>{hasInvalidMinecraftVersion ? <span className="mt-1.5 block text-[11px] font-medium text-red-300">Replace “Not specified” with a real version.</span> : <span className="mt-1.5 block text-[11px] text-gray-600">A range such as 1.20–1.21 is supported.</span>}</label>
              </div>
            </section>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-dashed border-white/20 bg-white/[.025] p-4">
                <p className="text-sm font-semibold">Showcase images</p><p className="mt-1 text-xs text-gray-500">Use clear screenshots that show the exterior and key rooms.</p>
                <input ref={photoRef} hidden type="file" accept="image/*" multiple onChange={(event) => addPhotos(event.target.files)} />
                <button type="button" onClick={() => photoRef.current?.click()} className="mt-4 w-full rounded-xl border border-white/15 px-3 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-[#4ade80]/50 hover:bg-[#4ade80]/10">Add images</button>
                {photos.length ? <div className="mt-3 space-y-2"><p className="text-[11px] text-gray-500">Set the first image as the cover. Use the arrows to reorder or remove an image.</p><div className="flex gap-2 overflow-x-auto pb-1">{photos.map((photo, index) => <div key={photo.key} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-white/15"><img src={photo.url} alt={photo.alt || "Build"} className="h-full w-full object-cover" />{index === 0 && <span className="absolute left-1 top-1 rounded bg-[#4ade80] px-1 py-0.5 text-[8px] font-bold text-black">COVER</span>}<button type="button" disabled={busy} onClick={() => removePhoto(photo)} aria-label="Remove image" className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-sm font-bold leading-none text-white transition hover:bg-red-500 disabled:opacity-40">×</button><div className="absolute inset-x-1 bottom-1 flex justify-between"><button type="button" disabled={index === 0 || busy} onClick={() => movePhoto(index, index - 1)} aria-label="Move image left" className="h-5 w-5 rounded bg-black/75 text-xs text-white disabled:opacity-30">‹</button><button type="button" disabled={index === photos.length - 1 || busy} onClick={() => movePhoto(index, index + 1)} aria-label="Move image right" className="h-5 w-5 rounded bg-black/75 text-xs text-white disabled:opacity-30">›</button></div></div>)}</div></div> : null}
              </div>
              <div className="rounded-2xl border border-dashed border-[#4ade80]/35 bg-[#4ade80]/[.04] p-4">
                <p className="text-sm font-semibold">World file & 3D preview</p><p className="mt-1 text-xs text-gray-500">Upload a ZIP up to 200 MB. We generate a rotatable voxel preview.</p>
                <input ref={worldRef} hidden type="file" accept=".zip,application/zip" onChange={(event) => chooseWorld(event.target.files?.[0])} />
                <div className="mt-4 flex gap-2"><button type="button" onClick={() => worldRef.current?.click()} className="flex-1 rounded-xl border border-white/15 px-3 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-[#4ade80]/50">{world ? "Change ZIP" : isEditing ? "Replace ZIP" : "Upload ZIP"}</button><button type="button" disabled={!world || busy} onClick={generate3dPreview} className="rounded-xl bg-[#4ade80] px-3 py-2.5 text-sm font-bold text-black disabled:opacity-40">Preview</button></div>
                <p className="mt-2 truncate text-[11px] text-gray-500">{world ? `${world.name} · ${(world.size / 1024 / 1024).toFixed(1)} MB` : listing?.version ? "Current version has a 3D preview" : "No world file selected"}</p>
              </div>
            </div>
            {message && <p className={`rounded-xl px-3 py-2 text-sm ${message.includes("failed") || message.includes("must") || message.includes("Choose") || message.includes("Enter") ? "bg-red-500/10 text-red-300" : "bg-[#4ade80]/10 text-[#9af5bd]"}`}>{message}</p>}
            <div className="flex flex-wrap items-center gap-3"><button disabled={busy} className="rounded-full bg-[#4ade80] px-6 py-3 text-sm font-bold text-black shadow-[0_8px_28px_rgba(74,222,128,.2)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Working…" : isEditing && !listing.is_active ? "Save & publish" : isEditing ? "Save changes" : "Publish build"}</button><span className="text-xs text-gray-500">{isEditing ? "Saving publishes the latest version to the marketplace feed." : "Images, a world ZIP, and a $5 minimum are required."}</span></div>
          </div>
          <aside className="rounded-2xl border border-white/10 bg-black/20 p-4 sm:p-5"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-bold">3D buyer preview</p><p className="text-[11px] text-gray-500">Drag to rotate · scroll to zoom</p></div><span className="rounded-full bg-[#4ade80]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[#4ade80]">Interactive</span></div>{previewSource ? <PreviewViewer source={previewSource} className="h-[330px] w-full" /> : <div className="flex h-[330px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[.02] px-8 text-center"><div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4ade80]/10 text-xl text-[#4ade80]">◇</div><p className="text-sm font-semibold">Preview your world here</p><p className="mt-1 text-xs leading-relaxed text-gray-500">Upload a world ZIP, then choose Preview to inspect the same interactive view buyers receive.</p></div>}</aside>
        </form>
      </div>
    </div>
  );
}

export function ReadyBuildsSection() {
  const [listings, setListings] = useState([]);
  const [editing, setEditing] = useState(undefined);
  const [message, setMessage] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const load = useCallback(async () => {
    const { listings: rows, error } = await listMyReadyBuilds();
    setListings(rows);
    if (error) setMessage(error.message);
  }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = async (listing) => {
    const result = await saveReadyBuild({ id: listing.id, title: listing.title, description: listing.description, style: listing.style, priceCents: listing.price_kopecks, active: !listing.is_active, minecraftEdition: listing.minecraft_edition, minecraftVersion: listing.minecraft_version, fileFormat: listing.file_format, includedContent: listing.included_content, dependencies: listing.dependencies });
    setMessage(result.error?.message || (listing.is_active ? "Listing removed from sale." : "Listing is live again."));
    if (!result.error) load();
  };
  const completeSave = (notice) => { setMessage(notice); load(); };
  const remove = async (listing) => {
    if (!window.confirm(`Delete “${listing.title}” permanently? This cannot be undone.`)) return;
    setDeletingId(listing.id);
    setMessage(null);
    const result = await deleteReadyBuild(listing.id);
    setDeletingId(null);
    if (result.error) {
      setMessage(result.error.message || "The build could not be deleted.");
      return;
    }
    setMessage("Build deleted.");
    load();
  };

  return <section className="space-y-6"><div className="relative overflow-hidden rounded-3xl border border-[#4ade80]/20 bg-[linear-gradient(115deg,rgba(74,222,128,.13),rgba(17,23,19,.75)_50%,rgba(17,23,19,.9))] p-6 sm:p-8"><div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-[#4ade80]">Builder marketplace</p><h2 className="mt-2 text-2xl font-extrabold">Your finished builds</h2><p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-400">Manage live listings, improve the presentation, and add a new world whenever it&apos;s ready for buyers.</p></div><button type="button" onClick={() => setEditing(null)} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#4ade80] px-5 py-3 text-sm font-bold text-black transition hover:scale-[1.02]"><span className="text-lg leading-none">+</span> Add a build</button></div></div>
    {message && <p className="rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-sm text-gray-300">{message}</p>}
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{listings.length ? listings.map((listing) => { const cover = listing.media?.[0]; const paidSales = (listing.purchases || []).filter((purchase) => purchase.status === "paid").length; return <article key={listing.id} className="group overflow-hidden rounded-3xl border border-white/10 bg-white/[.035] transition hover:-translate-y-1 hover:border-[#4ade80]/35"><div className="relative aspect-[16/9] bg-black/30">{cover ? <img src={cover.url} alt={cover.alt || listing.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="flex h-full items-center justify-center text-sm text-gray-600">No images yet</div>}<span className={`absolute right-3 top-3 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${listing.is_active ? "border-[#4ade80]/40 bg-[#102718]/90 text-[#83efa9]" : "border-white/15 bg-black/60 text-gray-300"}`}>{listing.is_active ? "Live" : "Draft"}</span></div><div className="p-5"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold">{listing.title}</h3><p className="mt-1 text-xs capitalize text-gray-500">{listing.style} · {paidSales} sale{paidSales === 1 ? "" : "s"}</p></div><span className="whitespace-nowrap text-sm font-bold text-[#4ade80]">{formatPrice(listing.price_kopecks)}</span></div><p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-400">{listing.description}</p><div className="mt-5 flex flex-wrap items-center gap-2"><button type="button" onClick={() => setEditing(listing)} className="flex-1 rounded-xl border border-white/15 px-3 py-2.5 text-sm font-semibold text-gray-200 transition hover:border-[#4ade80]/50 hover:bg-[#4ade80]/10">Edit build</button><Link href={`/build?id=${listing.id}`} className="rounded-xl px-2 py-2.5 text-xs font-semibold text-gray-400 hover:text-white">View</Link><button type="button" onClick={() => toggle(listing)} className="rounded-xl px-2 py-2.5 text-xs font-semibold text-[#4ade80] hover:bg-[#4ade80]/10">{listing.is_active ? "Unlist" : "Go live"}</button><button type="button" disabled={deletingId === listing.id} onClick={() => remove(listing)} className="rounded-xl px-2 py-2.5 text-xs font-semibold text-red-400 transition hover:bg-red-500/10 disabled:opacity-40">{deletingId === listing.id ? "Deleting…" : "Delete"}</button></div></div></article>; }) : <button type="button" onClick={() => setEditing(null)} className="col-span-full rounded-3xl border border-dashed border-[#4ade80]/35 bg-[#4ade80]/[.035] px-6 py-16 text-center transition hover:bg-[#4ade80]/[.07]"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4ade80]/10 text-2xl text-[#4ade80]">+</span><span className="mt-4 block font-bold">Place your first finished build</span><span className="mt-1 block text-sm text-gray-500">Upload imagery, a world ZIP, and create an interactive 3D preview.</span></button>}</div>
    {editing !== undefined && <BuildEditor listing={editing} onClose={() => setEditing(undefined)} onSaved={completeSave} />}
  </section>;
}

export function ReadyBuildPurchasesSection() { const [purchases,setPurchases]=useState([]); const [message,setMessage]=useState(null); useEffect(()=>{listMyReadyBuildPurchases().then(({purchases:rows})=>setPurchases(rows));},[]); const download=async(id)=>{const {url,error}=await getReadyBuildDownloadUrl(id); if(error) setMessage(error.message); else window.location.assign(url);}; return <section className="glass rounded-3xl p-6 sm:p-8"><p className="text-xs uppercase tracking-widest text-[#4ade80] font-semibold">Library</p><h2 className="text-xl font-bold mt-1">Your ready-made purchases</h2><p className="text-sm text-gray-400 mt-2">Downloads stay tied to the exact version you purchased.</p><div className="mt-6 space-y-3">{purchases.length ? purchases.map(p=><div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-white/10 p-4"><div className="flex-1"><p className="font-semibold">{p.title_snapshot}</p><p className="text-xs text-gray-500">{p.builder?.display_name || p.builder?.username} · {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "Awaiting payment"}</p></div><span className="text-sm text-[#4ade80]">{formatPrice(p.price_kopecks)}</span>{p.status==="paid" && <button onClick={()=>download(p.id)} className="pill-button">Download</button>}</div>) : <p className="text-sm text-gray-500">Your ready-made builds will appear here after purchase.</p>}</div>{message&&<p className="text-sm text-red-400 mt-4">{message}</p>}</section>; }
