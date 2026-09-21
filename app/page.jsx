import CatalogPage from "./builders/components/CatalogPage";

// The builder feed IS the site. Visitors land straight in the directory rather
// than on a marketing page; what used to live here now sits at /about.
export const metadata = {
  title: "BuildEx — Find a Minecraft Builder",
  description:
    "A directory of Minecraft builders. Browse portfolios, filter by style, and message builders directly.",
};

export default function HomePage() {
  return <CatalogPage />;
}
