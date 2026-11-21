# Nikdy jsem · ฉันไม่เคย

Hra „Nikdy jsem…“ pro dva na dálku (čeština + thajština). 240 otázek, sdílená karta, odpovědi psané nebo diktované, automatický překlad.

## Nasazení na Vercel
1. Vercel → Add New → Project → importuj tento repozitář → Deploy (nic nenastavuj).
2. V projektu: Storage → Upstash (Redis) → Create → Connect to project.
3. Deployments → ⋯ → Redeploy.
4. Otevři web — adresa dostane `?room=…`. Ten odkaz pošli partnerce.

Bez databáze se hra načte, ale neukládá (ukáže hlášku „Databáze není připojená“).
