import { translatePair } from "./_translate.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const text = typeof body.text === "string" ? body.text.slice(0, 3000) : "";
  const from = body.from === "th" ? "th" : "cs";
  if (!text.trim()) return res.status(400).json({ error: "empty" });
  try {
    const r = await translatePair(text, from, { speaker: from === "th" ? "saisuni" : "roman" });
    return res.status(200).json({ cs: r.cs, th: r.th, via: r.via });
  } catch (e) {
    return res.status(502).json({ error: "translate failed" });
  }
}
