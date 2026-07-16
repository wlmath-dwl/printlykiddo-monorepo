import { NextResponse } from "next/server";

import { listPuzzleCategories } from "@/lib/puzzle-local-db";

export async function GET(request: Request) {
  const parent = new URL(request.url).searchParams.get("parent");
  return NextResponse.json(listPuzzleCategories(parent === null ? undefined : parent || null));
}
