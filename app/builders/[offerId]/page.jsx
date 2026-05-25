import { offers } from "../data/offers";
import OfferDetailPage from "./components/OfferDetailPage";
import OfferNotFound from "./components/OfferNotFound";

export function generateStaticParams() {
  return offers.map((o) => ({ offerId: o.id }));
}

export async function generateMetadata({ params }) {
  const { offerId } = await params;
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) return { title: "Offer Not Found | BuildEx" };
  return {
    title: `${offer.title} | BuildEx`,
    description: offer.description,
    openGraph: {
      title: `${offer.title} | BuildEx`,
      description: offer.description,
      type: "website",
    },
  };
}

export default async function OfferPage({ params }) {
  const { offerId } = await params;
  const offer = offers.find((o) => o.id === offerId);
  if (!offer) return <OfferNotFound />;
  return <OfferDetailPage offer={offer} />;
}
