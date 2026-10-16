import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

/** What `claude plugin validate` checks first, without needing Claude Code installed: shapes, names, paths, references. */
const root = new URL("../", import.meta.url).pathname;
const json = (path) => JSON.parse(readFileSync(root + path, "utf8"));

test("the marketplace names one plugin, fxapis, at a relative path that exists", () => {
  const m = json(".claude-plugin/marketplace.json");
  assert.equal(m.name, "fxapis");
  assert.equal(m.owner.name, "fxapis");
  assert.deepEqual(m.plugins.map((p) => p.name), ["fxapis"]);
  assert.match(m.plugins[0].source, /^\.\//);
  assert.ok(existsSync(root + m.plugins[0].source + "/.claude-plugin/plugin.json"));
});

test("the plugin declares its options strictly, and the MCP server uses only declared ones", () => {
  const p = json("plugins/fxapis/.claude-plugin/plugin.json");
  assert.equal(p.name, "fxapis");
  const allowed = new Set(["type", "title", "description", "required", "default", "options", "multiple", "sensitive", "min", "max"]);
  for (const [key, option] of Object.entries(p.userConfig)) {
    assert.match(key, /^[A-Za-z_][A-Za-z0-9_]*$/);
    for (const field of Object.keys(option)) assert.ok(allowed.has(field), `${key}.${field}`);
  }
  assert.equal(p.userConfig.api_key.sensitive, true);
  assert.equal(p.userConfig.allowLiveTrading.default, false);
  const mcp = json("plugins/fxapis/.mcp.json");
  assert.deepEqual(Object.keys(mcp.mcpServers), ["fxapis"]);
  assert.equal(mcp.mcpServers.fxapis.type, "http");
  assert.equal(mcp.mcpServers.fxapis.url, "https://api.fxapis.com/mcp");
  for (const [, ref] of JSON.stringify(mcp).matchAll(/\$\{user_config\.([A-Za-z0-9_]+)\}/g)) assert.ok(p.userConfig[ref], ref);
});

test("the hook covers exactly the seven trade tools, from the plugin's server or one added by hand", () => {
  const hooks = json("plugins/fxapis/hooks/hooks.json").hooks.PreToolUse;
  const matcher = new RegExp(hooks[0].matcher);
  for (const tool of ["place_market_order", "place_pending_order", "close_position", "modify_position", "cancel_order", "place_multi_account_order", "cancel_multi_account_order"]) {
    assert.ok(matcher.test(`mcp__plugin_fxapis_fxapis__${tool}`), tool);
    assert.ok(matcher.test(`mcp__fxapis__${tool}`), tool);
  }
  for (const tool of ["list_accounts", "get_account_overview", "bring_accounts_online"]) assert.ok(!matcher.test(`mcp__plugin_fxapis_fxapis__${tool}`), tool);
  assert.match(hooks[0].hooks[0].command, /\$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/confirm-trade\.mjs/);
});

test("every command has a description", () => {
  for (const name of ["status", "positions", "connect-help"]) {
    assert.match(readFileSync(`${root}plugins/fxapis/commands/${name}.md`, "utf8"), /^---\ndescription: .+\n---\n/);
  }
});
