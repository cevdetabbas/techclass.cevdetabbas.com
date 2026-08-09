import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createSession,
  createUser,
  deleteExpiredSessions,
  deleteSession,
  getAssistantMessages,
  getSchedule,
  getSessionByToken,
  getUserByEmail,
  getUserById,
  initDb,
  saveAssistantMessage,
  saveSchedule,
} from "./src/db.js";
import {
  createRawSessionToken,
  hashPassword,
  parseCookies,
  verifyPassword,
} from "./src/auth.js";
import { buildAssistantResponse, normalizeSchedule } from "./src/assistant.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 2930);
const SESSION_COOKIE = "techclass_session";
const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

initDb();
deleteExpiredSessions();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function setSecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(res, status, payload, headers = {}) {
  setSecurityHeaders(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload));
}

function setSessionCookie(token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "HttpOnly",
    "Path=/",
    "SameSite=Lax",
    `Max-Age=${ONE_WEEK_SECONDS}`,
  ];
  if (process.env.COOKIE_SECURE === "true") {
    parts.push("Secure");
  }
  return parts.join("; ");
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1024 * 1024) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!data) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    createdAt: user.created_at,
  };
}

function readAuthPayload(body) {
  return {
    name: String(body?.name || "").trim(),
    email: String(body?.email || "").trim().toLowerCase(),
    password: String(body?.password || ""),
  };
}

function getAuthenticatedUser(req, res) {
  const cookies = parseCookies(req.headers.cookie || "");
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    sendJson(res, 401, { error: "Not signed in." });
    return null;
  }

  const session = getSessionByToken(token);
  if (!session) {
    sendJson(res, 401, { error: "Session expired." }, { "Set-Cookie": clearSessionCookie() });
    return null;
  }

  const user = getUserById(session.user_id);
  if (!user) {
    sendJson(res, 401, { error: "User not found." }, { "Set-Cookie": clearSessionCookie() });
    return null;
  }

  return { user, token };
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/health") {
    sendJson(res, 200, { ok: true, service: "techclass", port: PORT });
    return true;
  }

  if (req.method === "POST" && pathname === "/api/auth/signup") {
    try {
      const body = await readBody(req);
      const { name, email, password } = readAuthPayload(body);
      if (name.length < 2) {
        sendJson(res, 400, { error: "Name must be at least 2 characters." });
        return true;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        sendJson(res, 400, { error: "Enter a valid email address." });
        return true;
      }
      if (password.length < 8) {
        sendJson(res, 400, { error: "Password must be at least 8 characters." });
        return true;
      }
      if (getUserByEmail(email)) {
        sendJson(res, 409, { error: "An account already exists for that email." });
        return true;
      }

      const user = createUser({ name, email, passwordHash: hashPassword(password) });
      const token = createRawSessionToken();
      createSession({ userId: user.id, token, maxAgeSeconds: ONE_WEEK_SECONDS });
      sendJson(res, 201, { user: publicUser(user), schedule: getSchedule(user.id) }, { "Set-Cookie": setSessionCookie(token) });
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "Could not create account." });
    }
    return true;
  }

  if (req.method === "POST" && pathname === "/api/auth/login") {
    try {
      const body = await readBody(req);
      const { email, password } = readAuthPayload(body);
      const user = getUserByEmail(email);
      if (!user || !verifyPassword(password, user.password_hash)) {
        sendJson(res, 401, { error: "Invalid email or password." });
        return true;
      }

      const token = createRawSessionToken();
      createSession({ userId: user.id, token, maxAgeSeconds: ONE_WEEK_SECONDS });
      sendJson(res, 200, { user: publicUser(user), schedule: getSchedule(user.id) }, { "Set-Cookie": setSessionCookie(token) });
    } catch (error) {
      console.error(error);
      sendJson(res, 500, { error: "Could not sign in." });
    }
    return true;
  }

  if (pathname.startsWith("/api/")) {
    const auth = getAuthenticatedUser(req, res);
    if (!auth) {
      return true;
    }

    if (req.method === "GET" && pathname === "/api/me") {
      sendJson(res, 200, { user: publicUser(auth.user), schedule: getSchedule(auth.user.id) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/auth/logout") {
      deleteSession(auth.token);
      sendJson(res, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
      return true;
    }

    if (req.method === "GET" && pathname === "/api/schedule") {
      sendJson(res, 200, { schedule: getSchedule(auth.user.id) });
      return true;
    }

    if (req.method === "PUT" && pathname === "/api/schedule") {
      try {
        const body = await readBody(req);
        const schedule = normalizeSchedule(body?.schedule);
        saveSchedule(auth.user.id, schedule);
        sendJson(res, 200, { schedule });
      } catch (error) {
        sendJson(res, 400, { error: error.message || "Invalid schedule." });
      }
      return true;
    }

    if (req.method === "GET" && pathname === "/api/assistant/messages") {
      sendJson(res, 200, { messages: getAssistantMessages(auth.user.id) });
      return true;
    }

    if (req.method === "POST" && pathname === "/api/assistant") {
      try {
        const body = await readBody(req);
        const message = String(body?.message || "").trim();
        if (!message) {
          sendJson(res, 400, { error: "Message is required." });
          return true;
        }
        const schedule = getSchedule(auth.user.id);
        const response = buildAssistantResponse(message, schedule);
        saveAssistantMessage(auth.user.id, "user", message);
        saveAssistantMessage(auth.user.id, "assistant", response.reply);
        sendJson(res, 200, response);
      } catch (error) {
        console.error(error);
        sendJson(res, 500, { error: "Assistant could not process that request." });
      }
      return true;
    }

    sendJson(res, 404, { error: "API route not found." });
    return true;
  }

  return false;
}

function safePublicPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const clean = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const resolved = path.join(publicDir, clean === "/" ? "index.html" : clean);
  if (!resolved.startsWith(publicDir)) {
    return null;
  }
  return resolved;
}

function sendFile(res, filePath, status = 200) {
  const extension = path.extname(filePath).toLowerCase();
  const type = MIME_TYPES[extension] || "application/octet-stream";
  setSecurityHeaders(res);
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": process.env.NODE_ENV === "production" ? "public, max-age=600" : "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function handleStatic(req, res, pathname) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendJson(res, 405, { error: "Method not allowed." });
    return;
  }

  const candidate = safePublicPath(pathname);
  if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    sendFile(res, candidate);
    return;
  }

  sendFile(res, path.join(publicDir, "index.html"));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const handled = await handleApi(req, res, url.pathname);
    if (!handled) {
      handleStatic(req, res, url.pathname);
    }
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { error: "Internal server error." });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`TechClass listening on ${PORT}`);
});
