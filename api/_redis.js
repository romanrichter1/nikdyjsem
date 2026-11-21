// Redis access for Vercel. Works with:
//  - Upstash / Vercel KV REST variables (any prefix): *KV_REST_API_URL + *KV_REST_API_TOKEN, or *UPSTASH_REDIS_REST_URL + *_TOKEN
//  - a plain TCP connection string: *REDIS_URL / *KV_URL (redis:// or rediss://)
const env = process.env;
const find = (re) => { for (const k of Object.keys(env)) if (re.test(k) && env[k]) return env[k]; return null; };

const REST_URL = find(/KV_REST_API_URL$/) || find(/REDIS_REST_URL$/);
const REST_TOKEN = find(/KV_REST_API_TOKEN$/) || find(/REDIS_REST_TOKEN$/);
const TCP_URL = (() => { const v = find(/REDIS_URL$/) || find(/KV_URL$/); return v && /^rediss?:\/\//.test(v) ? v : null; })();

export const hasDb = () => Boolean((REST_URL && REST_TOKEN) || TCP_URL);

let clientPromise = null;
async function tcpClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const { createClient } = await import("redis");
      const c = createClient({ url: TCP_URL });
      c.on("error", () => {});
      await c.connect();
      return c;
    })().catch((e) => { clientPromise = null; throw e; });
  }
  return clientPromise;
}

export async function pipeline(cmds) {
  if (REST_URL && REST_TOKEN) {
    const r = await fetch(REST_URL.replace(/\/$/, "") + "/pipeline", {
      method: "POST",
      headers: { Authorization: `Bearer ${REST_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
    });
    if (!r.ok) throw new Error("redis " + r.status);
    return (await r.json()).map((x) => x.result);
  }
  const c = await tcpClient();
  const out = [];
  for (const cmd of cmds) out.push(await c.sendCommand(cmd.map(String)));
  return out;
}
