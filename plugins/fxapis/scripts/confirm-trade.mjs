#!/usr/bin/env node
/**
 * fxapis PreToolUse hook (spec §9): every fxapis trade is confirmed by the
 * person, whatever mode Claude Code is in ("ask" forces the dialog), with one
 * line saying what it will do. While the plugin's allowLiveTrading is off, a
 * trade on an account fxapis reported as live in this session is refused.
 *
 * It reads the session transcript for the accounts' environments, because
 * the hook has no credential of its own to ask fxapis with. Only fxapis's
 * own account tools (list_accounts, get_account, get_account_overview) are
 * trusted for this: a transcript line's tool_use entry names the tool that
 * was called, and only the tool_result that answers that same call (matched
 * by tool_use_id) is read for {id, environment} pairs. User text, assistant
 * text, and any other tool's output — even one that happens to contain the
 * same id and the word "environment" — are never read, so nothing outside
 * fxapis's own answers can set or change an account's trust level.
 *
 * Live is sticky: once fxapis has reported an account as live, it stays
 * live for the rest of the session, even if a later result says otherwise.
 * An account fxapis has never reported is "unknown" (not known yet), and is
 * asked about rather than assumed safe.
 *
 * Fails safe: anything unexpected still asks.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const TRADE_TOOLS = new Set([
  "place_market_order",
  "place_pending_order",
  "close_position",
  "modify_position",
  "cancel_order",
  "place_multi_account_order",
  "cancel_multi_account_order",
]);

/** fxapis's own account tools: the only ones environmentsFrom trusts for an account's environment. */
const ACCOUNT_TOOLS = new Set(["list_accounts", "get_account", "get_account_overview"]);

/** The name fxapis's own tool answers to — from the plugin's server, or a server named fxapis added by hand — or null for anything else. */
function fxapisToolName(name) {
  const match = /^mcp__(?:plugin_fxapis_)?fxapis__([a-z_]+)$/.exec(name ?? "");
  return match ? match[1] : null;
}

/** The fxapis trade tool a hook event is about. */
export function toolOf(name) {
  const tool = fxapisToolName(name);
  return tool && TRADE_TOOLS.has(tool) ? tool : null;
}

/** Whether `name` is one of fxapis's own account tools (list_accounts, get_account, get_account_overview). */
function isAccountTool(name) {
  const tool = fxapisToolName(name);
  return Boolean(tool && ACCOUNT_TOOLS.has(tool));
}

/** Every {id, environment} pair inside one fxapis account tool's result text: a summary line, then fxapis's compact JSON answer. */
function accountsIn(text) {
  const found = [];
  if (typeof text !== "string" || !text.includes('"environment"')) return found;
  const visit = (value) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (value && typeof value === "object") {
      if (typeof value.id === "string" && typeof value.environment === "string") found.push([value.id, value.environment]);
      for (const v of Object.values(value)) visit(v);
    }
  };
  // fxapis puts compact JSON after its summary line; matchAll also recovers an
  // account nested one level deep, such as get_account_overview's "account" field.
  for (const match of text.matchAll(/\{[^{}]*\}/g)) {
    try {
      visit(JSON.parse(match[0]));
    } catch {
      // not an object we can read
    }
  }
  return found;
}

/** The text of a tool_result's answer, as Claude Code's transcript writes it: content is an array of blocks, usually one of type "text". */
function resultText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && block.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n");
}

/**
 * account id → environment, trusting only the tool_results that answer a
 * fxapis account tool's own tool_use (matched by tool_use_id) — never user
 * text, assistant text, or another tool's output. Live is sticky: once an
 * id is seen as live, nothing later can set it back to demo.
 */
export function environmentsFrom(lines) {
  const parsed = [];
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // a line that is not JSON
    }
  }

  const accountToolUseIds = new Set();
  for (const entry of parsed) {
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type === "tool_use" && isAccountTool(block.name)) accountToolUseIds.add(block.id);
    }
  }

  const seen = new Map();
  const record = (id, environment) => {
    if (seen.get(id) === "live") return; // sticky: a live account never downgrades
    seen.set(id, environment);
  };
  for (const entry of parsed) {
    const content = entry?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== "tool_result" || !accountToolUseIds.has(block.tool_use_id)) continue;
      for (const [id, environment] of accountsIn(resultText(block.content))) record(id, environment);
    }
  }
  return seen;
}

const level = (v) => (v === null ? "REMOVED" : (v ?? "unchanged"));

export function summarise(tool, input) {
  const where = input.account_id ? `account ${input.account_id}` : Array.isArray(input.account_ids) ? `${input.account_ids.length} account(s)` : "an account";
  switch (tool) {
    case "place_market_order":
      return `${input.side} ${input.volume} lots ${input.symbol} at market on ${where}`;
    case "place_pending_order":
      return `${input.side} ${input.kind} ${input.volume} lots ${input.symbol} at ${input.price} on ${where}`;
    case "close_position":
      return `close position ${input.position_id}${input.volume ? ` (${input.volume} lots)` : ""} on ${where}`;
    case "modify_position":
      return `set stop loss ${level(input.stop_loss)} and take profit ${level(input.take_profit)} on position ${input.position_id}, ${where}`;
    case "cancel_order":
      return `cancel pending order ${input.order_id}`;
    case "place_multi_account_order":
      return `${input.side} ${input.volume} lots ${input.symbol ?? input.instrument} on ${where}`;
    case "cancel_multi_account_order":
      return `cancel multi-account order ${input.multi_account_order_id}`;
    default:
      return tool;
  }
}

export function decide(event, { allowLive, environments }) {
  const tool = toolOf(event?.tool_name);
  if (!tool) return null;
  const input = event.tool_input ?? {};
  const ids = input.account_id ? [input.account_id] : Array.isArray(input.account_ids) ? input.account_ids : [];
  const kinds = ids.map((id) => environments.get(id) ?? "unknown");
  const live = kinds.includes("live");
  const unknown = ids.length === 0 || kinds.includes("unknown");
  const summary = `fxapis: ${summarise(tool, input)}`;
  if (live && !allowLive) {
    return {
      permissionDecision: "deny",
      permissionDecisionReason: `${summary} — refused: a LIVE account, and live trading is off in the fxapis plugin's settings (allowLiveTrading).`,
    };
  }
  const note = live ? " — LIVE account, real money" : unknown ? " — demo or live not known yet (unknown): list the accounts first" : " — demo";
  return { permissionDecision: "ask", permissionDecisionReason: `${summary}${note}` };
}

function respond(decision) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", ...decision } }));
}

function main() {
  try {
    const event = JSON.parse(readFileSync(0, "utf8"));
    const allowLive = /^(true|1|yes|on)$/i.test(process.env.CLAUDE_PLUGIN_OPTION_ALLOWLIVETRADING ?? "");
    let lines = [];
    try {
      if (event.transcript_path) lines = readFileSync(event.transcript_path, "utf8").split("\n");
    } catch {
      // no transcript: every account is "not known yet"
    }
    const decision = decide(event, { allowLive, environments: environmentsFrom(lines) });
    if (decision) respond(decision);
  } catch (err) {
    respond({ permissionDecision: "ask", permissionDecisionReason: `fxapis: this trade could not be checked (${err instanceof Error ? err.message : String(err)}). Read it before allowing it.` });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
