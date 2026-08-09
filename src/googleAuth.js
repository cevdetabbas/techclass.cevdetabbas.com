const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const GOOGLE_SCOPES = "openid email profile";

function configuredRedirectUri() {
  return String(process.env.GOOGLE_REDIRECT_URI || "").trim();
}

function publicBaseUrl(req) {
  const configured = String(process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (configured) {
    return configured;
  }

  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || "http";
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "localhost:2930").split(",")[0].trim();
  return `${proto}://${host}`;
}

export function hasGoogleOAuthConfig() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(req) {
  return configuredRedirectUri() || `${publicBaseUrl(req)}/api/auth/google/callback`;
}

export function buildGoogleAuthUrl({ req, state }) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(req),
    response_type: "code",
    scope: GOOGLE_SCOPES,
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeGoogleCode({ req, code }) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Google token exchange failed.");
  }
  return payload;
}

export async function readGoogleProfile(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = await response.json().catch(() => ({}));
  if (!response.ok || !profile.sub || !profile.email) {
    throw new Error(profile.error_description || profile.error || "Could not read Google profile.");
  }
  if (profile.email_verified === false || profile.email_verified === "false") {
    throw new Error("Google email is not verified.");
  }
  return {
    googleSub: String(profile.sub),
    email: String(profile.email).trim().toLowerCase(),
    name: String(profile.name || profile.given_name || profile.email.split("@")[0]).trim(),
    avatarUrl: String(profile.picture || "").trim(),
  };
}
