import { hasDb, pipeline } from "./_redis.js";

const TTL = 60 * 60 * 24 * 180; // keep a room 180 days after last activity
const ROOM_RE = /^[a-z0-9-]{4,40}$/;
const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const clip = (v, n) => (typeof v === "string" ? v.slice(0, n) : "");

function parseHash(arr) {
  const o = {};
  if (arr && !Array.isArray(arr) && typeof arr === "object") { for (const [k, v] of Object.entries(arr)) { try { o[k] = JSON.parse(v); } catch {} } return o; }
  if (Array.isArray(arr)) for (let i = 0; i < arr.length; i += 2) { try { o[arr[i]] = JSON.parse(arr[i + 1]); } catch {} }
  return o;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!hasDb()) return res.status(503).json({ error: "no-db" });
  try { return await handle(req, res); }
  catch (e) { return res.status(500).json({ error: "db-error", detail: String(e.message || e).slice(0, 200) }); }
}

async function handle(req, res) {

  if (req.method === "GET") {
    const room = String(req.query.room || "");
    if (!ROOM_RE.test(room)) return res.status(400).json({ error: "bad room" });
    const k = `nj:${room}`;
    const [state, answers, players] = await pipeline([["GET", `${k}:state`], ["HGETALL", `${k}:answers`], ["HGETALL", `${k}:players`]]);
    let st = null; try { st = state ? JSON.parse(state) : null; } catch {}
    return res.status(200).json({ state: st, answers: parseHash(answers), players: parseHash(players) });
  }

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const { room, uid, type, data } = body;
    if (!ROOM_RE.test(room || "") || !ID_RE.test(uid || "") || !data || typeof data !== "object")
      return res.status(400).json({ error: "bad request" });
    const k = `nj:${room}`;
    const cmds = [];
    if (type === "state") {
      const st = { cats: Array.isArray(data.cats) ? data.cats.slice(0, 10).map((c) => clip(c, 20)) : [], seed: data.seed | 0, pos: data.pos | 0, by: uid, ts: Date.now() };
      cmds.push(["SET", `${k}:state`, JSON.stringify(st), "EX", TTL]);
    } else if (type === "player") {
      cmds.push(["HSET", `${k}:players`, uid, JSON.stringify({ nick: clip(data.nick, 24), lang: data.lang === "th" ? "th" : "cs", ts: Date.now() })]);
      cmds.push(["EXPIRE", `${k}:players`, TTL]);
    } else if (type === "answer") {
      if (!ID_RE.test(data.qid || "")) return res.status(400).json({ error: "bad qid" });
      // an answer may be written by its author, or by the partner only to add a translation
      const a = { qid: data.qid, uid: ID_RE.test(data.uid || "") ? data.uid : uid, nick: clip(data.nick, 24), did: data.did === "yes" ? "yes" : "no",
        text: clip(data.text, 4000), lang: data.lang === "th" ? "th" : "cs", cs: clip(data.cs, 6000), th: clip(data.th, 6000), ts: Number(data.ts) || Date.now() };
      cmds.push(["HSET", `${k}:answers`, `${a.qid}__${a.uid}`, JSON.stringify(a)]);
      cmds.push(["EXPIRE", `${k}:answers`, TTL]);
    } else return res.status(400).json({ error: "bad type" });
    await pipeline(cmds);
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).end();
}
