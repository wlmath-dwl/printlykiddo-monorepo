import { NextResponse } from "next/server";

import { getFeaturedCollections } from "@/lib/d1";

export async function GET() {
  const items = await getFeaturedCollections(4);

  return NextResponse.json({
    ok: true,
    items,
  });
}
