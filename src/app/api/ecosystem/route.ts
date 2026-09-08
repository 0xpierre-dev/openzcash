import { loadEcosystemCatalog } from "@/lib/ecosystem/data";

export async function GET() {
  return Response.json(loadEcosystemCatalog(), {
    headers: {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
