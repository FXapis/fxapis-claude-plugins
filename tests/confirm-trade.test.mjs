import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { decide, environmentsFrom, summarise, toolOf } from "../plugins/fxapis/scripts/confirm-trade.mjs";

const SCRIPT = new URL("../plugins/fxapis/scripts/confirm-trade.mjs", import.meta.url).pathname;
const LIVE = "11111111-1111-4111-8111-111111111111";
const DEMO = "22222222-2222-4222-8222-222222222222";
const UNKNOWN = "44444444-4444-4444-8444-444444444444";

/** A tool_use + its tool_result, as Claude Code's transcript writes them: the assistant's call, then the answer — a one-line summary, then compact JSON. */
const call = (id, toolName, text) => [
  JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", id, name: toolName, input: {} }] } }),
  JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", tool_use_id: id, content: [{ type: "text", text }] }] } }),
];

/** list_accounts reporting one live and one demo account, as fxapis's own account tool. */
const accounts = call(
  "call-accounts",
  "mcp__plugin_fxapis_fxapis__list_accounts",
  `2 account(s): 2 ready.\n${JSON.stringify({ items: [{ id: LIVE, login: "1", environment: "live", state: "ready" }, { id: DEMO, login: "2", environment: "demo", state: "ready" }], next_cursor: null, total: 2 })}`
);
const market = (accountId) => ({
  tool_name: "mcp__plugin_fxapis_fxapis__place_market_order",
  tool_input: { account_id: accountId, symbol: "EURUSD", side: "buy", volume: "0.10", idempotency_key: "k" },
});

test("matches fxapis trade tools, from the plugin or added by hand, and nothing else", () => {
  assert.equal(toolOf("mcp__plugin_fxapis_fxapis__close_position"), "close_position");
  assert.equal(toolOf("mcp__fxapis__place_market_order"), "place_market_order");
  assert.equal(toolOf("mcp__fxapis__list_accounts"), null);
  assert.equal(toolOf("mcp__other__place_market_order"), null);
  assert.equal(toolOf("Bash"), null);
});

test("reads each account's environment from fxapis's own account tools' results, and nothing else in the transcript", () => {
  assert.deepEqual([...environmentsFrom([...accounts, "not json", ""])], [[LIVE, "live"], [DEMO, "demo"]]);
});

test("live is sticky: a later fxapis account-tool result reporting demo does not undo it", () => {
  const later = call("call-overview", "mcp__fxapis__get_account_overview", `Main (demo) is ready.\n${JSON.stringify({ account: { id: LIVE, environment: "demo" }, positions: null })}`);
  assert.equal(environmentsFrom([...accounts, ...later]).get(LIVE), "live");
});

test("a later JSON blob elsewhere in the transcript, sharing a live account's id and environment, cannot flip it to demo", () => {
  const impostorText = JSON.stringify({ id: LIVE, environment: "demo" });
  const userText = JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "text", text: `unrelated: ${impostorText}` }] } });
  const otherTool = call("call-weather", "mcp__weather__get_forecast", `forecast ready.\n${impostorText}`);
  assert.equal(environmentsFrom([...accounts, userText, ...otherTool]).get(LIVE), "live");
});

test("an environment reported only outside fxapis's account tools is unknown, not trusted", () => {
  const otherTool = call("call-weather-2", "mcp__weather__get_forecast", JSON.stringify({ id: UNKNOWN, environment: "demo" }));
  const environments = environmentsFrom(otherTool);
  assert.equal(environments.get(UNKNOWN), undefined);
  const d = decide(market(UNKNOWN), { allowLive: false, environments });
  assert.equal(d.permissionDecision, "ask");
  assert.match(d.permissionDecisionReason, /unknown/);
});

test("asks before every trade, in one line", () => {
  assert.equal(summarise("place_market_order", market(DEMO).tool_input), `buy 0.10 lots EURUSD at market on account ${DEMO}`);
  const d = decide(market(DEMO), { allowLive: false, environments: environmentsFrom(accounts) });
  assert.equal(d.permissionDecision, "ask");
  assert.match(d.permissionDecisionReason, /^fxapis: buy 0\.10 lots EURUSD at market on account .* — demo$/);
});

test("denies a live trade while live trading is off, and asks when it is on", () => {
  const environments = environmentsFrom(accounts);
  assert.equal(decide(market(LIVE), { allowLive: false, environments }).permissionDecision, "deny");
  const on = decide(market(LIVE), { allowLive: true, environments });
  assert.equal(on.permissionDecision, "ask");
  assert.match(on.permissionDecisionReason, /LIVE account/);
  const multi = { tool_name: "mcp__fxapis__place_multi_account_order", tool_input: { account_ids: [DEMO, LIVE], instrument: "XAUUSD", side: "buy", volume: "0.01" } };
  assert.equal(decide(multi, { allowLive: false, environments }).permissionDecision, "deny");
});

test("asks, saying so, when it cannot tell demo from live", () => {
  const d = decide(market(UNKNOWN), { allowLive: false, environments: new Map() });
  assert.equal(d.permissionDecision, "ask");
  assert.match(d.permissionDecisionReason, /not known yet/);
  assert.match(d.permissionDecisionReason, /unknown/);
  const cancel = { tool_name: "mcp__fxapis__cancel_order", tool_input: { order_id: "o", idempotency_key: "k" } };
  assert.equal(decide(cancel, { allowLive: false, environments: new Map() }).permissionDecision, "ask");
});

test("says nothing about a tool that is not a trade", () => {
  assert.equal(decide({ tool_name: "mcp__fxapis__list_positions", tool_input: {} }, { allowLive: false, environments: new Map() }), null);
});

test("runs as a hook: JSON in, JSON out; a broken input still asks", () => {
  const dir = mkdtempSync(join(tmpdir(), "fxapis-hook-"));
  const transcript = join(dir, "t.jsonl");
  writeFileSync(transcript, `${accounts.join("\n")}\n`);
  const run = (input, env = {}) => spawnSync(process.execPath, [SCRIPT], { input, env: { ...process.env, ...env }, encoding: "utf8" });

  const live = run(JSON.stringify({ ...market(LIVE), hook_event_name: "PreToolUse", transcript_path: transcript }), { CLAUDE_PLUGIN_OPTION_ALLOWLIVETRADING: "false" });
  assert.equal(live.status, 0);
  assert.equal(JSON.parse(live.stdout).hookSpecificOutput.permissionDecision, "deny");
  const allowed = run(JSON.stringify({ ...market(LIVE), transcript_path: transcript }), { CLAUDE_PLUGIN_OPTION_ALLOWLIVETRADING: "true" });
  assert.equal(JSON.parse(allowed.stdout).hookSpecificOutput.permissionDecision, "ask");
  const broken = run("{not json");
  assert.equal(broken.status, 0);
  assert.equal(JSON.parse(broken.stdout).hookSpecificOutput.permissionDecision, "ask");
});
