import { NextResponse } from "next/server";

import {
  getPinterestConnectionStatus,
  getPinterestRedirectUri,
} from "@/lib/pinterest-review";

export async function GET(request: Request) {
  return NextResponse.json({
    ...getPinterestConnectionStatus(),
    redirectUri: getPinterestRedirectUri(request),
  });
}
