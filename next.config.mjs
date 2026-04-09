/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/v0_seg2_file_preview' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/v0_seg2_file_preview' : '',
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
