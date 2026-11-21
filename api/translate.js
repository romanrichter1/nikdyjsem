// Translates one answer into Czech and Thai via Google Translate's public web endpoint (no API key needed).
async function gtx(text, tl) {
  const u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=" + tl + "&q=" + encodeURIComponent(text);
  const r = await fetch(u);
  if (!r.ok) throw new Error("gtx " + r.status);
  const j = await r.json();
  return (j[0] || []).map((p) => p[0]).join("");
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  const text = typeof body.text === "string" ? body.text.slice(0, 3000) : "";
  const from = body.from === "th" ? "th" : "cs";
  if (!text.trim()) return res.status(400).json({ error: "empty" });
  try {
    const [cs, th] = await Promise.all([from === "cs" ? text : gtx(text, "cs"), from === "th" ? text : gtx(text, "th")]);
    return res.status(200).json({ cs, th });
  } catch (e) {
    return res.status(502).json({ error: "translate failed" });
  }
}
