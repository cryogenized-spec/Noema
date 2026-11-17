import { NextRequest, NextResponse } from "next/server";
import { getRssXml } from "@/lib/rss/fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;

/** Unlike RADIX's general-purpose proxy, this returns ONLY bounded RSS/Atom XML.
 * Public production launch additionally requires edge rate limiting and quotas.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing feed URL." }, { status: 400 });
  try {
    const xml = await getRssXml(url);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Feed could not be fetched.";
    const badRequest = /invalid|not allowed|only ordinary https|too long|enter a valid/i.test(message);
    const status = badRequest ? 400 : 502;
    return NextResponse.json({ error: message }, {
      status,
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  }
}
