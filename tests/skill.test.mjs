import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

/**
 * Agent Skill rules (spec §8; Claude's skill docs): a name of at most 64
 * lowercase letters, digits and hyphens; a description of at most 1024
 * characters saying when to use it; a body under 500 lines; every linked
 * reference file present.
 */
const SKILLS = fileURLToPath(new URL("../plugins/fxapis/skills/", import.meta.url));

for (const name of readdirSync(SKILLS)) {
  test(`skill ${name} follows the rules`, () => {
    const text = readFileSync(join(SKILLS, name, "SKILL.md"), "utf8");
    const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
    assert.ok(match, "frontmatter between --- lines");
    const front = Object.fromEntries(
      match[1].split("\n").map((line) => [line.slice(0, line.indexOf(":")).trim(), line.slice(line.indexOf(":") + 1).trim()])
    );
    assert.match(front.name, /^[a-z0-9-]{1,64}$/);
    assert.equal(front.name, name);
    assert.ok(front.description && front.description.length <= 1024, "description of at most 1024 characters");
    assert.match(front.description, /^Use when/);
    assert.ok(match[2].split("\n").length < 500, "body under 500 lines");
    for (const [, link] of match[2].matchAll(/\]\(([^)#]+\.md)\)/g)) {
      assert.ok(existsSync(join(SKILLS, name, link)), `linked file ${link} exists`);
    }
  });
}

/**
 * The checks below read the fxapis monorepo around this package: the MCP
 * server's tool list, and the zip the docs offer for claude.ai. The published
 * copy of this repository (FXapis/fxapis-claude-plugins) has neither, so
 * there they are skipped rather than failed.
 */
const TOOLS_TS = fileURLToPath(new URL("../../../apps/api/src/services/mcp/tools.ts", import.meta.url));
const SKILL_ZIP = fileURLToPath(new URL("../../../apps/docs/public/downloads/trading-mt5-safely.zip", import.meta.url));
const inMonorepo = existsSync(TOOLS_TS);

/** Every file under `dir`, as paths relative to it with forward slashes, .DS_Store left out as the zip leaves it out. */
function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === ".DS_Store") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path).map((p) => `${entry}/${p}`));
    else out.push(entry);
  }
  return out.sort();
}

/** TOOL_NAMES as the server declares it (apps/api/src/services/mcp/tools.ts), read as text so this test stays plain JavaScript. */
function serverToolNames() {
  const source = readFileSync(TOOLS_TS, "utf8");
  const list = /export const TOOL_NAMES = \[([\s\S]*?)\] as const/.exec(source);
  assert.ok(list, "TOOL_NAMES found in tools.ts");
  return [...list[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
}

test("every tool the skill names is one the server has", { skip: !inMonorepo && "outside the fxapis monorepo" }, () => {
  const tools = serverToolNames();
  assert.ok(tools.length > 20, "the server's tool list was read");
  // A tool name is snake_case and starts with one of the server's verbs
  // (get_, list_, place_, …); other snake_case words in the skill, such as
  // idempotency_key or execute_at, are arguments, not tools.
  const verbs = new Set(tools.map((t) => t.split("_")[0]));
  for (const name of readdirSync(SKILLS)) {
    for (const file of filesUnder(join(SKILLS, name)).filter((f) => f.endsWith(".md"))) {
      const text = readFileSync(join(SKILLS, name, file), "utf8");
      for (const [word] of text.matchAll(/\b[a-z]+(?:_[a-z0-9]+)+\b/g)) {
        if (!verbs.has(word.split("_")[0])) continue;
        assert.ok(tools.includes(word), `${name}/${file} names ${word}, which the MCP server does not have`);
      }
    }
  }
});

/**
 * The entries of a zip file, by name: a small reader for what `zip` writes
 * (stored or deflated entries, no zip64), so the test needs no dependency.
 */
function readZip(path) {
  const buf = readFileSync(path);
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  assert.ok(end >= 0, "end of central directory found");
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(at), 0x02014b50, "central directory entry");
    const method = buf.readUInt16LE(at + 10);
    const compressed = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString("utf8", at + 46, at + 46 + nameLength);
    at += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith("/")) continue;
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const data = buf.subarray(start, start + compressed);
    assert.ok(method === 0 || method === 8, `${name}: stored or deflated`);
    entries.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
  }
  return entries;
}

/** Text as git may check it out on Windows or Linux: the zip and the files compare equal across line endings. */
const lf = (b) => b.toString("utf8").replace(/\r\n/g, "\n");

test("the skill zip in the docs holds exactly the skill's current files", { skip: !inMonorepo && "outside the fxapis monorepo" }, () => {
  // Compared by content, not bytes: a zip records timestamps, so two builds of
  // the same files differ. Rebuild it with `pnpm skill:zip` when this fails.
  const zipped = readZip(SKILL_ZIP);
  const name = "trading-mt5-safely";
  const dir = join(SKILLS, name);
  const expected = filesUnder(dir).map((f) => `${name}/${f}`);
  assert.deepEqual([...zipped.keys()].sort(), expected, "the same files, under one trading-mt5-safely/ folder");
  for (const file of expected) {
    const onDisk = readFileSync(join(SKILLS, ...file.split("/")));
    assert.equal(lf(zipped.get(file)), lf(onDisk), `${file} in the zip matches the skill (run pnpm skill:zip)`);
  }
});
