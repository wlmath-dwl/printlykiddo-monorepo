import { NextResponse } from "next/server";

import { checkSync } from "@/lib/cloudflare-sync";

export async function POST() {
  try {
    return NextResponse.json(await checkSync());
  } catch (error) {
    const message = error instanceof Error ? error.message : "检查同步失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
