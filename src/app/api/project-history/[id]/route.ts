import { readProjectHistory } from "@/lib/project-history/data";
import { eventsInMonth } from "@/lib/project-history/build";
import { projectInsights } from "@/lib/project-history/insights";

export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const month = new URL(request.url).searchParams.get("month");
  if (month !== null && !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)) return Response.json({ error: "Use a calendar month in YYYY-MM format." }, { status: 400 });
  const data = await readProjectHistory(id);
  if (!data) return Response.json({ error: "Project not found." }, { status: 404 });
  return Response.json({ ...data, insights: { ...projectInsights(data), basis: "all-linked-history" }, ...(month ? { timeline: eventsInMonth(data.timeline, month), timelineFilter: { month, basis: "event-date-UTC", undatedEventsExcluded: data.timeline.filter(event => !event.date).length, grantsAreAllTime: true } } : {}) }, {
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}
