import SiteFooter from "../home/components/SiteFooter";
import LegalHeader from "./LegalHeaderControls";

// Legal pages follow the site theme like everything else; they used to be a
// separate always-dark shell with its own glow and grid backdrop.
export default function LegalLayout({ children }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <LegalHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
