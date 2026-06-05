import "./globals.css";
import Providers from "./providers";
import RouteTracker from "./builders/components/RouteTracker";

export const metadata = {
  title: "BuildEx - Minecraft Builder Marketplace",
  description:
    "Hire skilled Minecraft builders or find paid work building spawns, hubs, maps, and decorations."
};

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
        {supabaseOrigin && (
          <>
            <link rel="preconnect" href={supabaseOrigin} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={supabaseOrigin} />
          </>
        )}
      </head>
      <body className="overflow-x-hidden transition-colors duration-300 relative">
        {/* Tracks the current route (ahead of the page) so the builder catalog
            knows when a visitor is returning from a profile and should keep its
            shuffled order. Renders nothing. */}
        <RouteTracker />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
