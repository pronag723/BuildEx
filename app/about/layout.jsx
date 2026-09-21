// The page itself is a client component (theme, scroll-spy, animated
// background), so its metadata has to live in a layout beside it.
export const metadata = {
  title: "About BuildEx | How the directory works",
  description:
    "What BuildEx is, how to use it, and what it deliberately does not do.",
};

export default function AboutLayout({ children }) {
  return children;
}
