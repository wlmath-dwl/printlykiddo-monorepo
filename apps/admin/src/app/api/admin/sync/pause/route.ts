import { NextResponse } from "next/server";

import { requestSyncPause } from "@/lib/cloudflare-sync";

export async function POST() {
  try {
    return NextResponse.json(await requestSyncPause());
  } catch (error) {
    const message = error instanceof Error ? error.message : "暂停同步失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
