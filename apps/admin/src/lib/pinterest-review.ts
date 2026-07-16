import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";

type PinterestTokenState = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
};

type StoredPinterestTokenState = PinterestTokenState & {
  sessionId?: string;
};

type PinterestBoard = {
  id: string;
  name?: string;
};

type PinterestPin = {
  id: string;
  link?: string;
  title?: string;
};

const tokenState: PinterestTokenState = {
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
};

const TOKEN_FILE_PATH = path.join(process.cwd(), "data/pinterest-review-token.json");
const PINTEREST_PRODUCTION_API_ORIGIN = "https://api.pinterest.com";
const PINTEREST_SANDBOX_API_ORIGIN = "https://api-sandbox.pinterest.com";
const REVIEW_SESSION_ID =
  process.env.PINTEREST_REVIEW_SESSION_ID || randomUUID();
process.env.PINTEREST_REVIEW_SESSION_ID = REVIEW_SESSION_ID;

function readStoredPinterestTokenState(): PinterestTokenState {
  if (!existsSync(TOKEN_FILE_PATH)) {
    return {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    };
  }

  try {
    const raw = readFileSync(TOKEN_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoredPinterestTokenState>;
    if (parsed.sessionId !== REVIEW_SESSION_ID) {
      return {
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
      };
    }

    return {
      accessToken: typeof parsed.accessToken === "string" ? parsed.accessToken : null,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : null,
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : null,
    };
  } catch {
    return {
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    };
  }
}

function writeStoredPinterestTokenState(nextState: PinterestTokenState) {
  mkdirSync(path.dirname(TOKEN_FILE_PATH), { recursive: true });
  writeFileSync(
    TOKEN_FILE_PATH,
    `${JSON.stringify({ ...nextState, sessionId: REVIEW_SESSION_ID }, null, 2)}\n`,
    {
      mode: 0o600,
    },
  );
}

export const PINTEREST_REVIEW_SCOPES = [
  "boards:read",
  "boards:write",
  "pins:read",
  "pins:write",
  "user_accounts:read",
];

export function getPinterestClientId() {
  return (
    process.env.PINTEREST_CLIENT_ID?.trim() ||
    process.env.PINTEREST_APP_ID?.trim() ||
    ""
  );
}

export function getPinterestClientSecret() {
  return (
    process.env.PINTEREST_CLIENT_SECRET?.trim() ||
    process.env.PINTEREST_APP_SECRET?.trim() ||
    ""
  );
}

export function getPinterestRedirectUri(request?: Request) {
  const configured = process.env.PINTEREST_REDIRECT_URI?.trim();
  if (configured) {
    return configured;
  }

  const origin =
    process.env.PINTEREST_PUBLIC_ORIGIN?.trim() ||
    (request ? new URL(request.url).origin : "http://localhost:4538");

  return `${origin.replace(/\/+$/u, "")}/api/admin/pinterest-review/oauth/callback`;
}

export function getPinterestApiOrigin() {
  const configured = process.env.PINTEREST_API_ORIGIN?.trim();
  if (configured) {
    return configured.replace(/\/+$/u, "");
  }

  const environment = process.env.PINTEREST_API_ENV?.trim().toLowerCase();
  if (environment === "production" || environment === "prod") {
    return PINTEREST_PRODUCTION_API_ORIGIN;
  }

  return PINTEREST_SANDBOX_API_ORIGIN;
}

export function getPinterestApiEnvironment() {
  return getPinterestApiOrigin() === PINTEREST_PRODUCTION_API_ORIGIN
    ? "production"
    : "sandbox";
}

function getPinterestEnvAccessToken() {
  if (getPinterestApiEnvironment() === "sandbox") {
    return (
      process.env.PINTEREST_SANDBOX_ACCESS_TOKEN?.trim() ||
      process.env.PINTEREST_ACCESS_TOKEN?.trim() ||
      ""
    );
  }

  return (
    process.env.PINTEREST_PRODUCTION_ACCESS_TOKEN?.trim() ||
    process.env.PINTEREST_ACCESS_TOKEN?.trim() ||
    ""
  );
}

export function getPinterestAccessToken() {
  const storedTokenState = readStoredPinterestTokenState();
  const envAccessToken = getPinterestEnvAccessToken();

  if (getPinterestApiEnvironment() === "sandbox") {
    return envAccessToken || tokenState.accessToken || storedTokenState.accessToken || "";
  }

  return (
    tokenState.accessToken ||
    storedTokenState.accessToken ||
    envAccessToken
  );
}

export function setPinterestTokenState(input: {
  accessToken: string;
  refreshToken?: string | null;
  expiresIn?: number | null;
}) {
  tokenState.accessToken = input.accessToken;
  tokenState.refreshToken = input.refreshToken ?? null;
  tokenState.expiresAt = input.expiresIn
    ? Date.now() + input.expiresIn * 1000
    : null;
  writeStoredPinterestTokenState(tokenState);
}

export function getPinterestConnectionStatus() {
  const storedTokenState = readStoredPinterestTokenState();
  const envAccessToken = Boolean(getPinterestEnvAccessToken());
  const runtimeAccessToken = Boolean(tokenState.accessToken || storedTokenState.accessToken);
  const clientId = getPinterestClientId();
  const clientSecret = getPinterestClientSecret();

  return {
    connected: runtimeAccessToken,
    canPublish: runtimeAccessToken || envAccessToken,
    hasRuntimeAccessToken: runtimeAccessToken,
    hasEnvAccessToken: envAccessToken,
    hasClientId: Boolean(clientId),
    hasClientSecret: Boolean(clientSecret),
    clientIdPreview: clientId ? `${clientId.slice(0, 4)}...${clientId.slice(-3)}` : "",
    apiOrigin: getPinterestApiOrigin(),
    apiEnvironment: getPinterestApiEnvironment(),
    expiresAt: tokenState.expiresAt ?? storedTokenState.expiresAt,
    scopes: PINTEREST_REVIEW_SCOPES,
  };
}

function getPinterestAuthHeader() {
  const clientId = getPinterestClientId();
  const clientSecret = getPinterestClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing PINTEREST_CLIENT_ID/PINTEREST_APP_ID or PINTEREST_CLIENT_SECRET/PINTEREST_APP_SECRET.",
    );
  }

  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export async function exchangePinterestCode(options: {
  code: string;
  redirectUri: string;
}) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
  });

  const response = await fetch("https://api.pinterest.com/v5/oauth/token", {
    method: "POST",
    headers: {
      Authorization: getPinterestAuthHeader(),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    message?: string;
    code?: number;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.message || "Failed to exchange Pinterest OAuth code.");
  }

  setPinterestTokenState({
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? null,
  });

  return data;
}

async function pinterestFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = getPinterestAccessToken();
  if (!accessToken) {
    throw new Error("Pinterest is not connected. Click Connect Pinterest first.");
  }

  const response = await fetch(`${getPinterestApiOrigin()}/v5${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const data = (await response.json().catch(() => ({}))) as T & {
    message?: string;
  };

  if (!response.ok) {
    throw new Error(data.message || `Pinterest API request failed: ${response.status}`);
  }

  return data;
}

export async function createPinterestReviewBoard(name: string) {
  return pinterestFetch<PinterestBoard>("/boards", {
    method: "POST",
    body: JSON.stringify({
      name,
      description: "Temporary board for PrintlyKiddo Pinterest API review.",
      privacy: "PUBLIC",
    }),
  });
}

export async function publishPinterestReviewPin(input: {
  boardId: string;
  imageUrl: string;
  title: string;
  description: string;
  link: string;
  altText: string;
}) {
  return pinterestFetch<PinterestPin>("/pins", {
    method: "POST",
    body: JSON.stringify({
      board_id: input.boardId,
      title: input.title,
      description: input.description,
      link: input.link,
      alt_text: input.altText,
      media_source: {
        source_type: "image_url",
        url: input.imageUrl,
      },
    }),
  });
}
