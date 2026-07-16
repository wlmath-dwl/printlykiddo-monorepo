import { NextResponse } from "next/server";

import { overwriteLocalTablesFromRemote } from "@/lib/local-db-overwrite-from-remote";

export async function POST() {
  try {
    return NextResponse.json(await overwriteLocalTablesFromRemote());
  } catch (error) {
    const message = error instanceof Error ? error.message : "远端覆盖本地失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
