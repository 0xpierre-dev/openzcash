import { validActivityMonth } from "@/lib/project-history/activity";
import { readMonthlyProjectActivity } from "@/lib/project-history/data";

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? "";
  const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
  if (!validActivityMonth(month) || month > new Date().toISOString().slice(0, 7)) return Response.json({ error: "Use a current or past month in YYYY-MM format." }, { status: 400, headers });
  const data = await readMonthlyProjectActivity(month);
  return Response.json(data, { status: data.coverage.paymentsAvailable ? 200 : 503, headers });
}
