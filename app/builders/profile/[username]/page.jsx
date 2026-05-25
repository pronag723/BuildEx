import { BUILDERS, getBuilder } from "../../data/builders";
import BuilderProfilePage from "./components/BuilderProfilePage";
import BuilderNotFound from "./components/BuilderNotFound";

export function generateStaticParams() {
  return BUILDERS.map((b) => ({ username: b.username }));
}

export async function generateMetadata({ params }) {
  const { username } = await params;
  const builder = getBuilder(username);
  if (!builder) return { title: "Builder Not Found | BuildEx" };
  return {
    title: `${builder.display_name} — Minecraft Builder | BuildEx`,
    description:
      builder.bio ||
      `Commission ${builder.display_name}, a ${builder.rank} Minecraft builder on BuildEx.`,
    openGraph: {
      title: `${builder.display_name} on BuildEx`,
      description: builder.bio || `Hire ${builder.display_name} for your next Minecraft build.`,
      type: "profile",
    },
  };
}

export default async function ProfilePage({ params }) {
  const { username } = await params;
  const builder = getBuilder(username);
  if (!builder) return <BuilderNotFound />;
  return <BuilderProfilePage builder={builder} />;
}
