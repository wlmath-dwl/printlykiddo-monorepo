import { randomBytes } from "node:crypto";

import { NextResponse } from "next/server";

import {
  getPinterestClientId,
  getPinterestRedirectUri,
  PINTEREST_REVIEW_SCOPES,
} from "@/lib/pinterest-review";

export async function GET(request: Request) {
  const clientId = getPinterestClientId();
  if (!clientId) {
    return NextResponse.json(
      { error: "Missing PINTEREST_CLIENT_ID or PINTEREST_APP_ID." },
      { status: 400 },
    );
  }

  const redirectUri = getPinterestRedirectUri(request);
  const state = randomBytes(16).toString("hex");
  const url = new URL("https://www.pinterest.com/oauth/");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PINTEREST_REVIEW_SCOPES.join(","));
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set("pinterest_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
