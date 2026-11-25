// POST /v2/api/admin/jobs { job: "import" | "metrics" } (admin) → run a job now.
// import: Sheet → app, waits for the result (a few seconds). metrics: starts in the background, returns at once.
import { z } from "zod";
import { can } from "@/lib/auth/roles";
import { requireWrite } from "@/lib/auth/session";
import { fail, handle, json } from "@/lib/http";
import { metricsJobRunning, runMetricsJob } from "@/lib/metrics/job";
import { refreshFromSheet } from "@/lib/sheet/bridge";

export const dynamic = "force-dynamic";
const body = z.object({ job: z.enum(["import", "metrics"]) });

export const POST = handle(async (req: Request) => {
  const u = await requireWrite(req);
  if (!can(u.role, "admin")) fail(403, "forbidden");
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) fail(422, "bad_request");
  if (parsed.data!.job === "import") {
    try {
      const r = await refreshFromSheet();
      return json({ ok: true, job: "import", result: r });
    } catch (e) {
      return json({ ok: false, error: "import_failed", detail: (e as Error).message.slice(0, 120) }, { status: 502 });
    }
  }
  if (metricsJobRunning()) return json({ ok: true, job: "metrics", started: false, running: true });
  void runMetricsJob({ batch: 10 }).catch(() => null); // background: the admin page polls /admin/system for the result
  return json({ ok: true, job: "metrics", started: true }, { status: 202 });
});
