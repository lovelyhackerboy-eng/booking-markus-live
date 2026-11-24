// App chạy dưới booking.markus.agency/v2 (Passenger, cùng origin với app PHP cũ → dùng chung Google Sign-In).
// output "standalone": build ở máy (container Linux), chỉ upload bản đã build — hosting giới hạn 1,5 GB RAM cho cả tài khoản.
/** @type {import('next').NextConfig} */
export default {
  basePath: "/v2",
  output: "standalone",
  poweredByHeader: false,
  // /v2/app/ (with slash) must stay as is: the UI shell is served there so relative assets and #/ links resolve.
  skipTrailingSlashRedirect: true,
  reactStrictMode: true,
  // UI files live in public/app but are requested as /v2/a/<build>/… (lib/ui-shell.ts): a new URL per deploy, so they can
  // be cached for a year. These requests reach Next (no such static path exists), which rewrites them to public/app.
  async rewrites() {
    return { afterFiles: [{ source: "/a/:build/:path+", destination: "/app/:path+" }] };
  },
  async headers() {
    // Dev: the build id is always "dev" and files change in place → never cache there.
    const cache = process.env.NODE_ENV === "production" ? "public, max-age=31536000, immutable" : "no-store";
    return [{ source: "/a/:build/:path+", headers: [{ key: "Cache-Control", value: cache }] }];
  },
};
