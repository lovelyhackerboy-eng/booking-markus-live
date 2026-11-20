// Runtime configuration, from environment only (runtime.env on the host, never committed).
export const env = {
  // Exact origin the browser sends, e.g. https://booking.markus.agency — used for the Origin/CSRF check.
  appOrigin: () => process.env.APP_ORIGIN || "",
  basePath: "/v2",
  googleClientId: () => process.env.GOOGLE_CLIENT_ID || "",
  // "sheet" (Employees tab via the service account) or "db" (users table; local development and tests).
  directory: (): "sheet" | "db" => {
    const v = process.env.DIRECTORY || (process.env.NODE_ENV === "production" ? "sheet" : "db");
    return v === "db" ? "db" : "sheet";
  },
  sheetId: () => process.env.SHEET_ID || "",
  serviceAccountPath: () => process.env.GOOGLE_SA_PATH || "",
};
