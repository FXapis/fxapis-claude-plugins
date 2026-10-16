import { strict as assert } from "node:assert";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * Agent Skill rules (spec §8; Claude's skill docs): a name of at most 64
 * lowercase letters, digits and hyphens; a description of at most 1024
 * characters saying when to use it; a body under 500 lines; every linked
 * reference file present.
 */
const SKILLS = new URL("../plugins/fxapis/skills/", import.meta.url).pathname;

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
