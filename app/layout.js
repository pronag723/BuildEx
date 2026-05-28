import "./globals.css";
import Providers from "./providers";

export const metadata = {
  title: "BuildEx - Minecraft Builder Marketplace",
  description:
    "Hire skilled Minecraft builders or find paid work building spawns, hubs, maps, and decorations."
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className="scroll-smooth dark"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <body className="overflow-x-hidden transition-colors duration-300 relative">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
