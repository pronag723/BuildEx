"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Avatar from "../../../lib/ui/Avatar";
import { formatPrice } from "../../../lib/pricing";
import { PreviewViewer } from "../../orders/components/WorldPreview";
import { createReadyBuildPurchase, createReadyBuildInvoice, getReadyBuild, getReadyBuildPreviewUrl } from "../../../lib/readyBuilds/api";
import { getPaymentOptions } from "../../../lib/payments/api";
import { useAuthGate } from "../../../lib/auth/useAuthGate";

export default function ReadyBuildDetailPage({ listingId }) {
  const [listing, setListing] = useState(null); const [loading, setLoading] = useState(true); const [media, setMedia] = useState("photos");
  const [rails, setRails] = useState([]); const [rail, setRail] = useState(""); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const { requireAuth } = useAuthGate();
  useEffect(() => { getReadyBuild(listingId).then(({ listing: row, error: err }) => { setListing(row); setError(err?.message || null); setLoading(false); }); }, [listingId]);
  useEffect(() => { if (!listing) return; getPaymentOptions(listing.price_kopecks).then(({ options }) => { const available = options.filter((x) => x.available); setRails(available); setRail(available[0]?.code || ""); }); }, [listing]);
  if (loading) return <main className="min-h-screen flex items-center justify-center"><div className="w-10 h-10 rounded-full border-2 border-[#4ade80] border-t-transparent animate-spin" /></main>;
  if (!listing || !listing.is_active) return <main className="min-h-screen flex items-center justify-center p-6"><div className="glass rounded-3xl p-8 text-center"><h1 className="text-xl font-bold">Build not found</h1><Link className="text-[#4ade80] text-sm mt-3 inline-block" href="/builders">Browse builds</Link></div></main>;
  const photos = [...(listing.media || [])].sort((a,b) => a.position-b.position);
  const buy = async () => {
    if (!requireAuth()) return; setBusy(true); setError(null);
    const { purchaseId, error: purchaseError } = await createReadyBuildPurchase(listing.id);
    if (purchaseError || !purchaseId) { setError(purchaseError?.message || "Couldn't start your purchase."); setBusy(false); return; }
    const { checkoutUrl, error: invoiceError } = await createReadyBuildInvoice(purchaseId, rail);
    if (invoiceError || !checkoutUrl) { setError(invoiceError?.message || "Checkout isn't available."); setBusy(false); return; }
    window.location.assign(checkoutUrl);
  };
  return <main className="min-h-screen pt-28 pb-20 px-4 sm:px-6"><div className="max-w-6xl mx-auto">
    <Link href="/builders?mode=ready" className="text-sm text-gray-400 hover:text-[#4ade80] transition-colors">← Ready-made builds</Link>
    <div className="grid lg:grid-cols-[minmax(0,1.5fr)_380px] gap-7 mt-5">
      <section className="glass rounded-3xl overflow-hidden">
        <div className="p-3 border-b border-white/10 flex gap-2"><button onClick={() => setMedia("photos")} className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${media === "photos" ? "bg-[#4ade80] text-black" : "text-gray-400 hover:bg-white/5"}`}>Photos</button><button onClick={() => setMedia("preview")} className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${media === "preview" ? "bg-[#4ade80] text-black" : "text-gray-400 hover:bg-white/5"}`}>3D preview</button></div>
        {media === "photos" ? <div className="grid sm:grid-cols-2 gap-2 p-2">{photos.map((image) => <img key={image.id} src={image.url} alt={image.alt || listing.title} className="w-full aspect-[4/3] object-cover rounded-2xl" />)}</div> : <div className="p-3"><PreviewViewer source={{ loadPreview: () => getReadyBuildPreviewUrl(listing.version?.preview_path) }} className="w-full h-[460px]" /></div>}
      </section>
      <aside className="glass rounded-3xl p-6 h-fit lg:sticky lg:top-28">
        <p className="text-xs uppercase tracking-widest text-[#4ade80] font-semibold">{listing.style}</p><h1 className="text-3xl font-extrabold mt-2 leading-tight">{listing.title}</h1><p className="text-gray-400 text-sm leading-relaxed mt-4 whitespace-pre-wrap">{listing.description}</p>
        <div className="flex items-center gap-3 py-5 mt-5 border-y border-white/10"><Avatar src={listing.builder?.avatar_url} name={listing.builder?.display_name} className="w-11 h-11 rounded-full" /><div><p className="font-semibold text-sm">{listing.builder?.display_name || listing.builder?.username}</p><p className="text-xs text-gray-500">{listing.builder?.builder?.rank || "rookie"} builder</p></div></div>
        <p className="text-3xl font-extrabold text-[#4ade80] mt-5">{formatPrice(listing.price_kopecks)}</p>
        {rails.length > 1 && <select value={rail} onChange={(e) => setRail(e.target.value)} className="w-full mt-4 p-3 rounded-xl bg-black/20 border border-white/10 text-sm">{rails.map((x) => <option key={x.code} value={x.code}>{x.displayName}</option>)}</select>}
        <button onClick={buy} disabled={busy || !rail} className="w-full mt-4 py-3 rounded-full bg-[#4ade80] text-black font-bold hover:bg-[#86efac] transition-all disabled:opacity-50">{busy ? "Opening checkout…" : "Buy & download"}</button>
        <p className="text-[11px] leading-relaxed text-gray-500 mt-3">Digital item. Your world download becomes available immediately after payment. Refund requests are reviewed by support.</p>{error && <p className="text-sm text-red-400 mt-3">{error}</p>}
      </aside>
    </div></div></main>;
}
