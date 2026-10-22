/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static export: the web app is just files on Railway (served by `serve`). Everything
  // dynamic goes through the socket server.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
};

module.exports = nextConfig;
