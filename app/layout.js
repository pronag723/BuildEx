import "./globals.css";
import Providers from "./providers";
import RouteTracker from "./builders/components/RouteTracker";

export const metadata = {
  metadataBase: new URL("https://buildex.builders"),
  title: "BuildEx — Find Minecraft Builders",
  description:
    "Browse Minecraft builder profiles, see their work, and contact them directly. BuildEx is a directory — arrangements and payments are between you and the builder.",
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "BuildEx — Find Minecraft Builders",
    description:
      "Browse Minecraft builder profiles, see their work, and contact them directly. BuildEx is a directory — arrangements and payments are between you and the builder.",
    url: "https://buildex.builders",
    siteName: "BuildEx",
    type: "website"
  }
};

// App Router viewport. width=device-width + initialScale 1 gives correct mobile
// scaling; we deliberately leave pinch-zoom enabled (no maximumScale) — the
// zoom-on-focus issue is solved by the 16px input floor in globals.css instead.
export const viewport = {
  width: "device-width",
  initialScale: 1
};

// Runs before first paint, and does two things.
//
// Theme: the stored colour theme goes onto <html> immediately. It used to be
// applied by each page in an effect after hydration, so a light-theme visitor
// saw the dark page first and then watched it fade over. Keep the key in step
// with lib/ui/useTheme.js.
//
// Language: the static HTML is English; a visitor whose stored (or, on a first
// visit, browser) language is Russian gets <html lang="ru"> and a hidden <body>
// until LanguageProvider has switched the page over, so the English text never
// flashes. The timeout is a failsafe: the page always becomes visible even if
// the app bundle fails to load. Keep the detection in step with
// readInitialLang() in lib/i18n/LanguageProvider.jsx.
const bootScript = `(function(){var d=document.documentElement;try{var t=localStorage.getItem("theme")==="light"?"light":"dark";d.classList.remove(t==="light"?"dark":"light");d.classList.add(t)}catch(e){}try{var l=localStorage.getItem("lang");if(l!=="en"&&l!=="ru"){var n=(navigator.languages&&navigator.languages[0])||navigator.language||"";l=/^ru(?:-|$)/i.test(n)?"ru":"en"}if(l==="ru"){d.lang="ru";d.classList.add("i18n-pending");setTimeout(function(){d.classList.remove("i18n-pending")},2500)}}catch(e){}})();`;

// Supabase project origin (also the Storage CDN host for avatars/banners/
// portfolio images). Warming the TLS connection here shaves the handshake off
// the first image request, which matters a lot on higher-latency links.
const supabaseOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : null;
  } catch {
    return null;
  }
})();

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className="scroll-smooth dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
      </head>
      <body className="overflow-x-hidden relative">
        {/* Tracks the current route (ahead of the page) so the builder catalog
            knows when a visitor is returning from a profile and should keep its
            shuffled order. Renders nothing. */}
        <RouteTracker />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
