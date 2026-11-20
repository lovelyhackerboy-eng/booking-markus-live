// GET /v2 → /v2/app/ (the UI). The UI lives at /v2/app/ so that its <base href> equals the page URL and in-app
// links like "#/campaign" stay on the same document.
export const dynamic = "force-dynamic";

// Relative Location: behind Passenger req.url carries the internal host (0.0.0.0:3000), never the public one.
export function GET() {
  return new Response(null, { status: 307, headers: { location: "/v2/app/" } });
}
