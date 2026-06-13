/**
 * Seed script — pre-upserts informational Q&As so a cache HIT is guaranteed
 * live (NICO.md #5). Run before the demo:
 *
 *   npm run seed            # upsert seed Q&As
 *   npm run seed -- --reset # also reset metric counters first
 *   npm run seed -- --flush # also wipe ALL cached vectors first (clean slate)
 *
 * The live demo pair (Alice asks A -> MISS, Bob paraphrases A -> HIT) uses a
 * FRESH, UN-seeded prompt so the miss->hit transition happens on stage. See
 * DEMO_PROMPTS below — keep these rehearsed and free of live randomness.
 *
 * Env is loaded via tsx's --env-file=.env.local flag (see the "seed" script in
 * package.json) so it's present before clients.ts reads it.
 */
import { embed } from "ai";
import { openai, vector, type CachedAnswer } from "../lib/clients";
import { EMBED_MODEL, DEFAULT_REPO } from "../lib/constants";
import { estimateTokens } from "../lib/tokens";
import { resetMetrics } from "../lib/metrics";

// The gateway namespaces the shared cache per repo. Seed into the default repo
// so both agents (which default to it) hit the seeded answers. Override with
// `npm run seed -- --repo <id>`.
function repoArg(): string {
  const i = process.argv.indexOf("--repo");
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : DEFAULT_REPO;
}
const REPO = repoArg();

// Pre-seeded informational Q&As. A paraphrase of any of these will HIT.
const SEED: { prompt: string; answer: string; author: string }[] = [
  {
    prompt: "What is photosynthesis?",
    answer:
      "Photosynthesis is the process plants, algae, and some bacteria use to convert sunlight, water, and carbon dioxide into glucose (energy) and oxygen. It happens mainly in the chloroplasts using the green pigment chlorophyll.",
    author: "Alice",
  },
  {
    prompt: "What is the capital of France?",
    answer: "The capital of France is Paris.",
    author: "Bob",
  },
  {
    prompt: "How does HTTPS keep a connection secure?",
    answer:
      "HTTPS wraps HTTP in TLS. The client and server perform a handshake to agree on encryption keys, the server proves its identity with a certificate signed by a trusted authority, and all traffic is then encrypted and integrity-checked so it can't be read or tampered with in transit.",
    author: "Carol",
  },
  {
    prompt: "Why is the sky blue?",
    answer:
      "Sunlight contains all colors. As it passes through the atmosphere, shorter blue wavelengths scatter much more than longer red ones (Rayleigh scattering), so blue light reaches our eyes from all directions and the sky looks blue.",
    author: "Dave",
  },
];

// Rehearsed live demo prompts — NOT seeded, so A is a real MISS on stage.
export const DEMO_PROMPTS = {
  // Alice asks this first -> MISS (generates + caches).
  alice: "What are the main benefits of caching API responses?",
  // Bob asks this next -> HIT against Alice's freshly cached answer.
  bob: "Why is it useful to cache responses from an API?",
};

// Stable id per seed prompt so re-running overwrites instead of duplicating.
function seedId(prompt: string): string {
  return "seed:" + prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
}

async function main() {
  const flush = process.argv.includes("--flush");
  if (flush) {
    await vector.namespace(REPO).reset();
    console.log(`✓ vector namespace "${REPO}" flushed`);
  }

  const reset = flush || process.argv.includes("--reset");
  if (reset) {
    await resetMetrics();
    console.log("✓ metric counters reset");
  }

  for (const item of SEED) {
    const { embedding } = await embed({
      model: openai.embedding(EMBED_MODEL),
      value: item.prompt,
    });
    const record: CachedAnswer = {
      prompt: item.prompt,
      answer: item.answer,
      author: item.author,
      ts: Date.now(),
      answerTokens: estimateTokens(item.answer),
    };
    await vector.namespace(REPO).upsert({
      id: seedId(item.prompt),
      vector: embedding,
      metadata: record as unknown as Record<string, unknown>,
    });
    console.log(`✓ seeded: "${item.prompt}"`);
  }

  console.log(`\nDone — ${SEED.length} Q&As cached in namespace "${REPO}".`);
  console.log("Rehearsed demo pair (NOT seeded):");
  console.log(`  Alice -> ${DEMO_PROMPTS.alice}`);
  console.log(`  Bob   -> ${DEMO_PROMPTS.bob}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
