// Shared storage for HeyHoney Tournaments: one Vercel Function backed by Upstash Redis (REST API, no dependencies).
//   GET  /api/data  -> public: { T, rev, need }   (need = admin passcode not created yet)
//   POST /api/data  -> { action: setup | login | logout | passwd | save, ... }
// The passcode is hashed (scrypt) and checked here, never in the browser, and only a logged-in admin can save.
const crypto = require("crypto");
const { promisify } = require("util");
const scrypt = promisify(crypto.scrypt);

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DATA = "hh:data", AUTH = "hh:auth", SESS = "hh:s:", RL = "hh:rl:";
const MAX = 5, SESSION_S = 8 * 3600, MAX_BYTES = 800000, TRIES = 8, WINDOW_S = 600;

async function redis(...cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || "Redis " + r.status);
  return j.result;
}

const sha = s => crypto.createHash("sha256").update(s).digest("hex");
const hashPass = async (p, salt) => (await scrypt(p, salt, 32)).toString("hex");
const okPass = p => typeof p === "string" && p.length >= 8 && p.length <= 200;
const okT = T => Array.isArray(T) && T.length <= MAX && T.every(t => t && typeof t === "object" && typeof t.id === "string" && /^\w{1,16}$/.test(t.id));
const send = (res, code, body) => res.status(code).json(body);

async function newAuth(pass, ver) {
  const salt = crypto.randomBytes(16).toString("hex");
  return { salt, hash: await hashPass(pass, salt), ver };
}
async function newSession(ver) {
  const token = crypto.randomBytes(32).toString("hex");
  await redis("SET", SESS + sha(token), ver, "EX", SESSION_S);
  return token;
}
// A session is valid only while its stored version matches the current passcode version, so changing the passcode logs out every other device.
async function session(req) {
  const m = /^Bearer ([a-f0-9]{64})$/.exec(req.headers.authorization || "");
  if (!m) return null;
  const [sv, av] = await Promise.all([redis("GET", SESS + sha(m[1])), redis("GET", AUTH)]);
  if (!sv || !av) return null;
  const auth = JSON.parse(av);
  return sv === String(auth.ver) ? { auth, token: m[1] } : null;
}
// Slows down passcode guessing: a few tries per IP address per 10 minutes.
async function throttle(req) {
  const ip = String(req.headers["x-real-ip"] || req.headers["x-forwarded-for"] || "?").split(",")[0].trim();
  const key = RL + sha(ip), n = await redis("INCR", key);
  if (n === 1) await redis("EXPIRE", key, WINDOW_S);
  return { ok: n <= TRIES, reset: () => redis("DEL", key) };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return send(res, 500, { error: "The database is not connected yet. Add Upstash Redis under Storage in the Vercel project, then redeploy." });
  try {
    if (req.method === "GET") {
      const [raw, has] = await Promise.all([redis("GET", DATA), redis("EXISTS", AUTH)]);
      const d = raw ? JSON.parse(raw) : { rev: 0, T: [] };
      return send(res, 200, { T: d.T, rev: d.rev, need: !has });
    }
    if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return send(res, 405, { error: "Method not allowed" }); }

    let b = req.body;
    if (typeof b === "string") { try { b = JSON.parse(b); } catch (e) { b = {}; } }
    if (!b || typeof b !== "object") b = {};

    if (b.action === "setup") {
      if (!okPass(b.pass)) return send(res, 400, { error: "Use a passcode of 8 to 200 characters." });
      const rl = await throttle(req);
      if (!rl.ok) return send(res, 429, { error: "Too many attempts. Wait a few minutes and try again." });
      const auth = await newAuth(b.pass, 1);
      if ((await redis("SET", AUTH, JSON.stringify(auth), "NX")) !== "OK") return send(res, 409, { error: "An admin passcode already exists. Log in instead." });
      return send(res, 200, { token: await newSession(1) });
    }

    if (b.action === "login") {
      const rl = await throttle(req);
      if (!rl.ok) return send(res, 429, { error: "Too many attempts. Wait a few minutes and try again." });
      const raw = await redis("GET", AUTH);
      if (!raw) return send(res, 409, { error: "No admin passcode exists yet.", need: true });
      const auth = JSON.parse(raw);
      const got = Buffer.from(await hashPass(typeof b.pass === "string" ? b.pass.slice(0, 200) : "", auth.salt), "hex");
      if (!crypto.timingSafeEqual(got, Buffer.from(auth.hash, "hex"))) return send(res, 401, { error: "Wrong passcode. Check it and try again." });
      await rl.reset();
      return send(res, 200, { token: await newSession(auth.ver) });
    }

    const s = await session(req);
    if (!s) return send(res, 401, { error: "Not logged in." });

    if (b.action === "logout") {
      await redis("DEL", SESS + sha(s.token));
      return send(res, 200, { ok: true });
    }

    if (b.action === "passwd") {
      if (!okPass(b.pass)) return send(res, 400, { error: "Use a passcode of 8 to 200 characters." });
      const ver = s.auth.ver + 1;
      await redis("SET", AUTH, JSON.stringify(await newAuth(b.pass, ver)));
      return send(res, 200, { token: await newSession(ver) });
    }

    if (b.action === "save") {
      if (!okT(b.T)) return send(res, 400, { error: "Invalid tournament data." });
      if (JSON.stringify(b.T).length > MAX_BYTES) return send(res, 413, { error: "Too much data." });
      const raw = await redis("GET", DATA), cur = raw ? JSON.parse(raw) : { rev: 0, T: [] };
      // Optimistic concurrency: refuse to overwrite a newer version saved from another device.
      if (+b.rev !== cur.rev) return send(res, 409, { error: "conflict", T: cur.T, rev: cur.rev });
      const rev = cur.rev + 1;
      await redis("SET", DATA, JSON.stringify({ rev, T: b.T }));
      return send(res, 200, { rev });
    }

    return send(res, 400, { error: "Unknown action." });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: "Server error. Try again in a moment." });
  }
};