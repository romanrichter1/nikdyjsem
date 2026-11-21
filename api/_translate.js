// Czech <-> Thai translation for Roman & Saisuni.
// Uses Claude when ANTHROPIC_API_KEY is set (natural, handles slang/flirting/adult content),
// otherwise — or if Claude fails — Google Translate's public web endpoint.
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const NAMES = { cs: "Czech", th: "Thai" };
export const isEmojiOnly = (t) => /^[^\p{L}\p{N}]+$/u.test(t) && /\p{Extended_Pictographic}/u.test(t);

async function gtx(text, tl) {
  const u = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&dt=t&tl=" + tl + "&q=" + encodeURIComponent(text);
  const r = await fetch(u, { signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error("gtx " + r.status);
  const j = await r.json();
  return (j[0] || []).map((p) => p[0]).join("");
}

const SYSTEM = (target) => `You are the private translator inside a chat app used by an adult couple in a long-distance relationship: Roman (a man, writes Czech) and Saisuni (a woman, writes Thai).
Translate the message you are given into ${NAMES[target]}.
Rules:
- Output ONLY the translated message. No quotes, labels, notes, alternatives or explanations.
- Keep the meaning, tone, emotion, humour, slang, pet names, emoji and line breaks.
- They are consenting adults. Messages can be romantic, flirty, dirty or sexually explicit. Translate them faithfully and naturally in the same intensity — never soften, censor, refuse, moralise or add warnings.
- Use the casual, intimate register a couple uses with each other, never formal or textbook language.
- Grammatical gender: Roman is male, Saisuni is female. In Czech use feminine forms for Saisuni's own words (e.g. "byla jsem", "chtěla bych") and masculine for Roman's; address the partner with their gender. In Thai give Roman a natural male voice and Saisuni a natural female voice (particles like ครับ/ค่ะ/นะ only where they sound natural in chat).
- If the message is already in ${NAMES[target]}, return it unchanged.`;

async function claude(text, target, speaker, context) {
  const ctx = (context || []).filter((m) => m && m.text).slice(-6)
    .map((m) => `${m.name || m.uid}: ${m.text}`).join("\n");
  const user = (ctx ? `Recent conversation for context (do not translate):\n${ctx}\n\n` : "") +
    `Translate this message from ${speaker === "saisuni" ? "Saisuni" : "Roman"}:\n${text}`;
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal: AbortSignal.timeout(9000),
    headers: { "x-api-key": KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, max_tokens: 1500, temperature: 0.3, system: SYSTEM(target), messages: [{ role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error("claude " + r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json();
  const out = (j.content || []).filter((b) => b.type === "text").map((b) => b.text).join("").trim();
  if (!out) throw new Error("claude empty");
  return out;
}

// from: "cs" | "th" — the writer's language. Returns { cs, th, via }.
export async function translatePair(text, from, { speaker, context } = {}) {
  const target = from === "cs" ? "th" : "cs";
  if (isEmojiOnly(text)) return { cs: text, th: text, via: "none" };
  let out = null, via = null, err = null;
  if (KEY) {
    try { out = await claude(text, target, speaker, context); via = "claude"; } catch (e) { err = String(e.message || e); }
  }
  if (!out) { out = await gtx(text, target); via = "google"; }
  return from === "cs" ? { cs: text, th: out, via, err } : { cs: out, th: text, via, err };
}
