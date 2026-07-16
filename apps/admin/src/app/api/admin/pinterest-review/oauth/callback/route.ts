import { NextResponse } from "next/server";

import {
  exchangePinterestCode,
  getPinterestRedirectUri,
} from "@/lib/pinterest-review";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("pinterest_oauth_state="))
    ?.split("=")[1];
  const redirectTarget = new URL("/admin/pinterest-review", url.origin);

  if (!code) {
    redirectTarget.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectTarget);
  }

  if (!state || !expectedState || state !== expectedState) {
    redirectTarget.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectTarget);
  }

  try {
    await exchangePinterestCode({
      code,
      redirectUri: getPinterestRedirectUri(request),
    });
    redirectTarget.searchParams.set("connected", "1");
  } catch (error) {
    redirectTarget.searchParams.set(
      "error",
      error instanceof Error ? error.message : "oauth_failed",
    );
  }

  const response = NextResponse.redirect(redirectTarget);
  response.cookies.delete("pinterest_oauth_state");
  return response;
}
