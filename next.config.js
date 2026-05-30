/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig = {
  output: "export",
  // GitHub Pages serves directory URLs (e.g. /builders/) by looking for
  // <route>/index.html. Without trailingSlash, Next emits builders.html while
  // also creating a builders/ directory for nested routes, so Pages redirects
  // /builders -> /builders/ and 404s. trailingSlash makes Next emit
  // builders/index.html, which Pages resolves correctly.
  trailingSlash: true,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  images: {
    unoptimized: true
  },
  turbopack: {
    root: __dirname
  }
};

module.exports = nextConfig;
