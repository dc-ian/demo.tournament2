// GET /api/avatar?u=<tiktok handle>  ->  the player's TikTok profile photo, served from your own domain.
// Vercel's CDN caches the result, so each photo is fetched from TikTok about once a day instead of on every page view.
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const MAX = 2 * 1024 * 1024;
const t = ms => AbortSignal.timeout(ms);

// Pull the avatar URL out of the TikTok profile page.
function findAvatar(html) {
  const m = /"avatarLarger":"([^"]+)"/.exec(html) || /"avatarMedium":"([^"]+)"/.exec(html);
  if (m) { try { return JSON.parse('"' + m[1] + '"'); } catch (e) {} }
  const og = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html);
  return og ? og[1].replace(/&amp;/g, "&") : "";
}

async function getImage(url, referer) {
  const r = await fetch(url, { headers: { "User-Agent": UA, Referer: referer }, signal: t(6000) });
  const type = r.headers.get("content-type") || "";
  if (!r.ok || !type.startsWith("image/")) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  return buf.length && buf.length <= MAX ? { buf, type } : null;
}

async function fromTikTok(u) {
  const page = await fetch("https://www.tiktok.com/@" + u, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, signal: t(6000) });
  if (!page.ok) return null;
  const url = findAvatar(await page.text());
  return /^https:\/\//.test(url) ? getImage(url, "https://www.tiktok.com/") : null;
}

// Backup: unavatar, called from the server (one shared IP and cached, so far fewer rate-limit hits than every viewer calling it).
const fromUnavatar = u => getImage("https://unavatar.io/tiktok/" + encodeURIComponent(u) + "?fallback=false", "https://unavatar.io/");

module.exports = async function handler(req, res) {
  const u = String(req.query && req.query.u || "").replace(/^@/, "");
  if (!/^[\w.]{1,24}$/.test(u)) { res.statusCode = 400; return res.end("bad handle"); }
  let img = null;
  try { img = await fromTikTok(u); } catch (e) {}
  if (!img) { try { img = await fromUnavatar(u); } catch (e) {} }
  if (!img) {
    // Short cache on failure so a temporary block doesn't stick; the page falls back to the player's initial.
    res.setHeader("Cache-Control", "public, s-maxage=300");
    res.statusCode = 404; return res.end("not found");
  }
  res.setHeader("Content-Type", img.type);
  res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.statusCode = 200; res.end(img.buf);
};
module.exports.findAvatar = findAvatar;