# Slate — Path to Startup

An honest assessment of what stands between the current app and something you can put in front of real users and charge for. Ordered by urgency.

---

## What I fixed today (code, already done)

1. **Broken confidence bubble.** The low-confidence "I read this as…" chip rendered the literal text `${m.readAs}$` instead of the math. This is one of your headline differentiators and it was visibly broken on every low-confidence read. It now renders the LaTeX properly.

2. **Fragile AI parsing → 500s mid-problem.** All three AI endpoints did a naive fence-strip + `JSON.parse`. Any time the model wrapped its answer in prose or a stray token, the student got a 500 error. Added a shared robust JSON extractor (`src/lib/ai-json.ts`) that pulls the first balanced JSON object out of messy output, plus one corrective retry on `generate-problem` / `extract-problems`. `tutor-feedback` now degrades gracefully to showing the raw reply instead of erroring. The extractor is unit-tested against fenced, prose-wrapped, brace-in-string, and escaped-quote cases.

> Run `bun install && bun run lint` locally to confirm the build before deploying.

These make the app *less embarrassing*, but they don't make it a business. That's below.

---

## Tier 1 — Ship-blockers (do before ANY public link)

**1. Cost & abuse control. This is the one that can bankrupt you.**
Right now every API route is anonymous and spends one shared `LOVABLE_API_KEY`. There is no per-user cap, no auth, no rate limit. The first time this is posted anywhere public, bots and strangers burn your credits — `tutor-feedback` sends a full image to Gemini on a loop every 10 seconds per open tab. You need, at minimum: a per-IP/per-user rate limit (Cloudflare KV or Durable Objects), a hard daily spend cap, and a bot wall (Turnstile) in front of the AI routes. Nothing else on this list matters if this isn't done.

**2. Accounts & persistence.**
Everything lives in React state. A refresh wipes the session; there are no users, no saved history, no progress. You cannot have paying customers without accounts, and you cannot show retention/learning (your actual value) without stored history. Pick an auth + DB stack and wire: user record, saved sessions, problem history, per-user usage counter (which also powers #1).

**3. Own your model access. ✅ DONE.**
Slate no longer depends on Lovable's AI gateway or key. All three AI routes now call Google's Gemini API directly through `src/lib/ai-provider.ts` (`getModel` / `MODELS`), reading `GOOGLE_GENERATIVE_AI_API_KEY`. Default model is `gemini-2.5-flash` (free tier: ~1,500 req/day, vision-capable). Setup steps are in `.env.example`. Remaining: the Lovable *build* wrapper (`@lovable.dev/vite-tanstack-config`) is still in place — it's just a Vite convenience bundle and carries no cost/lock-in on your data or spend, so removing it is optional and best done as its own careful step.

---

## Tier 2 — De-risk the core (the thing that actually has to work)

Your entire value proposition rests on one loop: **read messy handwritten math correctly, and give a hint that's correct at the current step.** A confidently-wrong hint that "corrects" right work is worse than no tutor. You currently have zero measurement of this.

- **Build an eval harness.** Collect 100–200 real handwritten samples (yours, friends, tablet screenshots) with known-correct transcriptions. Score the model's `readAs` against them. This single number — read accuracy — is your most important metric and belongs in every investor conversation.
- **Log every interaction** (image hash, `readAs`, `readConfidence`, whether the student corrected it). This is both your quality signal and, over time, your proprietary training data — a real moat.
- **Instrument the funnel:** problems started vs. completed, hint-ladder depth, where students abandon.

---

## Tier 3 — Differentiation (why Slate, not Photomath/Khanmigo/Wolfram)

Be honest that "AI that does math" is a crowded, well-funded space. Slate's edge is **not** solving problems — it's the stylus-native, Socratic, checkpoint-guided *experience that refuses to just give the answer*. Lean into that and resist becoming another answer-getter.

Two product gaps that undercut the "real tutor" claim today:
- **Alternate solution paths.** Checkpoints assume one predetermined route. A strong student who solves it a valid-but-different way will feel the tutor is broken. A real tutor recognizes a correct detour. This is a genuine wedge — most competitors fail here too.
- **Who is it for?** Solo student vs. teacher-assigned changes everything downstream (parent/teacher dashboards, assignment flows, class rosters). Decide before building more.

---

## Tier 4 — Business model

Decisions, not code, but they gate everything above:
- **Who pays?** Student direct (freemium subscription), parent, or school/district (B2B2C, slower but stickier and higher ACV)?
- **Pricing shape.** Per-seat subscription is standard for ed-tech. Free tier must be metered tightly because each session has real COGS (image + model call every few seconds).
- **The metered free tier and the paywall are the same system as Tier 1 #1 and #2** — build usage accounting once, use it for both abuse control and monetization.

---

## Decisions I need from you to keep going on code

The Tier 1 work is decision-gated. Tell me and I'll build it:

1. **Auth + database stack** — e.g. Supabase (fastest, gives you auth + Postgres + storage in one), Clerk + Postgres, or Lovable Cloud if you want to stay in that ecosystem.
2. **Rate-limiting substrate** — Cloudflare KV vs. Durable Objects (you're already on Workers, so this is natural).
3. **Model provider** — stay on Lovable's gateway for now, or move to a direct provider key.
4. **Audience** — solo students first, or teacher/classroom from the start.

Answer those and the next session can be: accounts + per-user metering + a rate-limited, bot-walled AI layer — i.e. the things that turn this from a demo into something you can actually launch.
