import { NextResponse } from "next/server";

// Whole-wallet diagnostics cannot enforce community authorization.
export async function GET() {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
