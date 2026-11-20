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
};
