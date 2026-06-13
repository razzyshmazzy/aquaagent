import { Index } from "@upstash/vector";
import { Redis } from "@upstash/redis";
import { createOpenAI } from "@ai-sdk/openai";

// Upstash Vector — similarity search over cached prompts.
// Reads UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN.
// NOTE: the index must be created with dimension 1536 (text-embedding-3-small)
// and cosine similarity.
export const vector = Index.fromEnv();

// Upstash Redis — metric counters.
// Reads UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN.
export const redis = Redis.fromEnv();

// OpenAI via the Vercel AI SDK. Reads OPENAI_API_KEY.
export const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Shape of what we store alongside each cached vector.
export type CachedAnswer = {
  prompt: string;
  answer: string;
  author: string;
  ts: number;
  answerTokens: number;
};
