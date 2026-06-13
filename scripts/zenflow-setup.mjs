#!/usr/bin/env node
/**
 * zenflow:setup — point this developer's agents at the ZenFlow/Carbo gateway,
 * attributed to *them*. Run once per clone:
 *
 *   npm run zenflow:setup                       # gateway = http://localhost:3000
 *   npm run zenflow:setup -- --url https://your-gateway.vercel.app
 *   ZENFLOW_GATEWAY_URL=https://… npm run zenflow:setup
 *
 * It writes .claude/settings.local.json (gitignored, per-user) so Claude Code
 * routes through the gateway with YOUR GitHub login as x-zenflow-author, and
 * prints the equivalent Codex ~/.codex/config.toml block (Codex can't be
 * configured per-repo for security — it must be user-level).
 *
 * Nothing here is committed: the repo stays free of any one person's identity,
 * and no shared file silently reroutes a teammate's traffic.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

function sh(cmd) {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : "";
}

// --- gateway URL ------------------------------------------------------------
const url = (
  arg("--url") ||
  process.env.ZENFLOW_GATEWAY_URL ||
  "http://localhost:3000"
).replace(/\/+$/, "");

// --- repo id (owner/repo from the git remote) -------------------------------
function repoId() {
  const remote = sh("git config --get remote.origin.url");
  const m = remote.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  if (m) return m[1];
  return sh("basename $(git rev-parse --show-toplevel)") || "local";
}

// --- author (GitHub login, best effort) -------------------------------------
function authorLogin() {
  const gh = sh("gh api user --jq .login"); // gh CLI, if installed + authed
  if (gh) return gh;
  const email = sh("git config user.email");
  if (email) return email;
  const name = sh("git config user.name");
  if (name) return name.replace(/\s+/g, "-").toLowerCase();
  return "anon";
}

const repo = repoId();
const author = authorLogin();
const headers = `x-zenflow-repo: ${repo}\nx-zenflow-author: ${author}`;

// --- write .claude/settings.local.json (merge, don't clobber) ---------------
mkdirSync(".claude", { recursive: true });
const localPath = join(".claude", "settings.local.json");
let local = {};
if (existsSync(localPath)) {
  try {
    local = JSON.parse(readFileSync(localPath, "utf8"));
  } catch {
    local = {};
  }
}
local.env = {
  ...(local.env ?? {}),
  ANTHROPIC_BASE_URL: url,
  ANTHROPIC_CUSTOM_HEADERS: headers,
};
writeFileSync(localPath, JSON.stringify(local, null, 2) + "\n");

// --- report -----------------------------------------------------------------
console.log("✓ ZenFlow wired up for this clone\n");
console.log(`  gateway : ${url}`);
console.log(`  repo    : ${repo}`);
console.log(`  author  : ${author}`);
if (author === "anon") {
  console.log(
    "  ⚠ couldn't detect your GitHub login (install + auth `gh`, or set git user) —"
  );
  console.log("    your usage will be attributed to \"anon\". Re-run after fixing.");
}
console.log(`\n  wrote ${localPath} (gitignored) — restart Claude Code to apply.\n`);

console.log("For Codex, add this to ~/.codex/config.toml (user-level) and restart:\n");
console.log(`  model_provider = "carbo"

  [model_providers.carbo]
  name = "Carbo"
  base_url = "${url}/v1"
  wire_api = "chat"
  env_key = "OPENAI_API_KEY"
  http_headers = { "x-zenflow-repo" = "${repo}", "x-zenflow-author" = "${author}" }
`);
