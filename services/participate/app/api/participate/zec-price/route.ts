import { NextResponse } from "next/server";
import { fundingQuoteExpiresAt } from "@/lib/domain/funding-quote";
import { readFreshZecPrice } from "@/lib/domain/zec-price";
import { getPublicZecUsdPrice } from "@/lib/market/zec-usd";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

/** One cached provider read serves all approved cards. No wallet or database writes. */
export async function GET() {
  try {
    const price = await getPublicZecUsdPrice();
    return NextResponse.json(readFreshZecPrice({
      rateUsdPerZecE8: price.rateUsdPerZecE8.toString(),
      quotedAt: price.quotedAt.toISOString(),
      retrievedAt: price.retrievedAt.toISOString(),
      expiresAt: fundingQuoteExpiresAt(price.quotedAt).toISOString()
    }), { headers });
  } catch {
    return NextResponse.json({ error: "ZEC_PRICE_UNAVAILABLE" }, {
      status: 503, headers: { ...headers, "Retry-After": "15" }
    });
  }
}
