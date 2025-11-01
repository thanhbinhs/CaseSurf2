


/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.googleusercontent.com', // Cho phép tất cả subdomain
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },

  async headers() {
    return [
      {
        // Áp dụng cho tất cả route
        source: '/(.*)',
        headers: [
          // Cho phép accelerometer
          {
            key: 'Permissions-Policy',
            value: 'accelerometer=*', // hoặc accelerometer=(self) nếu chỉ muốn trang chính
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
