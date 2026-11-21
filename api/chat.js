import { hasDb, pipeline } from "./_redis.js";
import { translatePair } from "./_translate.js";

const ROOM_RE = /^[a-z0-9-]{4,40}$/;
const WHO = { roman: { name: "Roman", lang: "cs" }, saisuni: { name: "Saisuni", lang: "th" } };
const TTL = 60 * 60 * 24 * 365;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasDb()) return res.status(503).json({ error: "no-db" });
  try { return await handle(req, res); }
  catch (e) { return res.status(500).json({ error: "server", detail: String(e.message || e).slice(0, 200) }); }
}

const hashToObj = (a) => {
  if (a && !Array.isArray(a) && typeof a === "object") return a;
  const o = {}; if (Array.isArray(a)) for (let i = 0; i < a.length; i += 2) o[a[i]] = a[i + 1]; return o;
};
const parseList = (l) => (l || []).map((x) => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);

async function handle(req, res) {
  if (req.method === "GET") {
    const room = String(req.query.room || "");
    if (!ROOM_RE.test(room)) return res.status(400).json({ error: "bad room" });
    const k = `nc:${room}`;
    const known = Number(req.query.v);
    const [vRaw] = await pipeline([["GET", `${k}:v`]]);
    const v = Number(vRaw) || 0;
    if (Number.isFinite(known) && known === v && req.query.v !== undefined) return res.status(200).json({ v, same: true });
    const since = Math.max(0, Number(req.query.since) || 0);
    const range = since > 0 ? ["LRANGE", `${k}:msgs`, since, -1] : ["LRANGE", `${k}:msgs`, -400, -1];
    const [len, list, seen, typing] = await pipeline([["LLEN", `${k}:msgs`], range, ["HGETALL", `${k}:seen`], ["HGETALL", `${k}:typing`]]);
    return res.status(200).json({ v, len: Number(len) || 0, msgs: parseList(list), seen: hashToObj(seen), typing: hashToObj(typing), now: Date.now() });
  }

  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).end(); }
  const b = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const room = String(b.room || "");
  const who = WHO[b.uid];
  if (!ROOM_RE.test(room) || !who) return res.status(400).json({ error: "bad request" });
  const k = `nc:${room}`;

  if (b.type === "typing") {
    await pipeline([["HSET", `${k}:typing`, b.uid, String(Date.now())], ["INCR", `${k}:v`], ["EXPIRE", `${k}:typing`, TTL]]);
    return res.status(200).json({ ok: true });
  }
  if (b.type === "seen") {
    const n = Math.max(0, Number(b.n) || 0);
    await pipeline([["HSET", `${k}:seen`, b.uid, String(n)], ["INCR", `${k}:v`], ["EXPIRE", `${k}:seen`, TTL]]);
    return res.status(200).json({ ok: true });
  }
  if (b.type === "send") {
    const text = typeof b.text === "string" ? b.text.trim().slice(0, 2000) : "";
    if (!text) return res.status(400).json({ error: "empty" });
    const [ctxRaw] = await pipeline([["LRANGE", `${k}:msgs`, -6, -1]]);
    const context = parseList(ctxRaw);
    const tr = await translatePair(text, who.lang, { speaker: b.uid, context });
    const msg = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cid: String(b.cid || "").slice(0, 40),
      uid: b.uid, name: who.name, from: who.lang, text, cs: tr.cs, th: tr.th, via: tr.via, ts: Date.now() };
    const [len] = await pipeline([["RPUSH", `${k}:msgs`, JSON.stringify(msg)], ["HSET", `${k}:typing`, b.uid, "0"], ["INCR", `${k}:v`],
      ["EXPIRE", `${k}:msgs`, TTL], ["EXPIRE", `${k}:v`, TTL]]);
    return res.status(200).json({ msg, len: Number(len) || 0, err: tr.err ? "claude-fallback" : undefined });
  }
  return res.status(400).json({ error: "bad type" });
}
