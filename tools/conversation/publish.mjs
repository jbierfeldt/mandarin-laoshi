#!/usr/bin/env node
/**
 * Dry-run by default. Writes conversation JSON only with --apply.
 * Does not push, deploy, send messages, or generate audio.
 * Does not modify cp_2026_11_07 or the phrasebook search index.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateAuthoring } from "./validate.mjs";
import { toIndexRow, toPlayerEntry } from "./build.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "../..");
const RESERVED = "cp_2026_11_07";

export function canon(value) {
  if (Array.isArray(value)) return `[${value.map(canon).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canon(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function lessonIds(root) {
  const path = join(root, "lessons/index.json");
  if (!existsSync(path)) return [];
  const data = readJson(path);
  if (!data || !Array.isArray(data.lessons)) {
    const err = new Error("lessons/index.json has no lessons array");
    err.code = "catalog_malformed";
    throw err;
  }
  return data.lessons.map((l) => l.id);
}

function loadCatalog(root) {
  const path = join(root, "conversations/index.json");
  if (!existsSync(path)) return { path, catalog: { entries: [] }, created: true };
  const catalog = readJson(path);
  if (!catalog || !Array.isArray(catalog.entries)) {
    const err = new Error("conversations/index.json has no entries array");
    err.code = "catalog_malformed";
    throw err;
  }
  const ids = catalog.entries.map((e) => e && e.id);
  if (ids.some((id, i) => ids.indexOf(id) !== i)) {
    const err = new Error("conversations/index.json has a duplicate id");
    err.code = "index_collision";
    throw err;
  }
  return { path, catalog, created: false };
}

function placeRow(entries, row) {
  const rest = entries.filter((e) => e.id !== row.id);
  const existed = rest.length !== entries.length;
  const t = Date.parse(row.date);
  let index = rest.findIndex((e) => Date.parse(e.date) < t);
  if (index < 0) index = rest.length;
  if (existed) {
    const at = entries.findIndex((e) => e.id === row.id);
    const next = entries.slice();
    next[at] = row;
    return { entries: next, existed };
  }
  const next = rest.slice();
  next.splice(index, 0, row);
  return { entries: next, existed: false };
}

export function assess(input, root) {
  const validated = validateAuthoring(input);
  if (!validated.ok) {
    return { ...validated, entry: null, row: null, action: "invalid", report: report({ ...validated, entry: null, row: null, action: "invalid", root, catalogNote: "" }) };
  }
  const extra = [];
  try {
    if (lessonIds(root).includes(validated.value.id)) {
      extra.push({ code: "index_collision", path: "id", message: `${validated.value.id} is already a lesson id in lessons/index.json` });
    }
  } catch (err) {
    extra.push({ code: err.code || "catalog_malformed", path: "lessons/index.json", message: err.message });
  }
  let loaded;
  try {
    loaded = loadCatalog(root);
  } catch (err) {
    extra.push({ code: err.code || "catalog_malformed", path: "conversations/index.json", message: err.message });
  }
  if (extra.length) {
    return {
      ok: false,
      errors: extra,
      warnings: validated.warnings,
      value: validated.value,
      entry: null,
      row: null,
      action: "invalid",
      report: report({ ok: false, errors: extra, warnings: validated.warnings, entry: null, row: null, action: "invalid", root, catalogNote: "" }),
    };
  }
  const entry = toPlayerEntry(validated.value);
  const row = toIndexRow(validated.value);
  const placed = placeRow(loaded.catalog.entries, row);
  const sameRow = placed.existed && canon(loaded.catalog.entries.find((e) => e.id === row.id)) === canon(row);
  const entryPath = join(root, "conversations", entry.id, "entry.json");
  let sameEntry = false;
  if (existsSync(entryPath)) sameEntry = canon(readJson(entryPath)) === canon(entry);
  let action = "created";
  if (placed.existed || existsSync(entryPath)) action = sameRow && sameEntry ? "unchanged" : "updated";
  if (!placed.existed && !existsSync(entryPath)) action = "created";
  const catalogNote = loaded.created
    ? "would create conversations/index.json"
    : `conversations/index.json has ${loaded.catalog.entries.length} entr${loaded.catalog.entries.length === 1 ? "y" : "ies"}`;
  const result = {
    ok: true,
    errors: [],
    warnings: validated.warnings,
    value: validated.value,
    entry,
    row,
    action,
    catalog: { ...loaded.catalog, entries: placed.entries },
    catalogPath: loaded.path,
    entryPath,
    sameEntry,
    sameRow: placed.existed ? sameRow : false,
    loaded,
    report: "",
  };
  result.report = report({ ...result, root, catalogNote });
  return result;
}

function report(r) {
  const lines = [];
  lines.push(r.ok ? "preflight ok" : "preflight failed");
  if (!r.ok) {
    for (const e of r.errors) lines.push(`- ${e.code} ${e.path}: ${e.message}`);
    lines.push("writes: 0");
    lines.push("publish: not performed");
    return lines.join("\n");
  }
  const id = r.entry.id;
  const drills = r.entry.sections.filter((s) => s.type === "drill");
  const audio = r.entry.sections.flatMap((s) => s.items || []).filter((it) => it && it.audio).length;
  lines.push("schema: conversations/<id>/entry.json · schema 1 · kind conversation · script hans");
  lines.push(`route: #/practice/${id}`);
  lines.push(`id: ${id}`);
  lines.push(`action: ${r.action}`);
  lines.push(`lines: ${r.value.lines.length}`);
  lines.push(`vocab: ${r.value.vocab.length}`);
  lines.push(`drills: ${drills.map((s) => `${s.title} ${s.items.length}`).join(", ")}`);
  lines.push(audio ? `audio: ${audio} clip list(s) copied, none generated` : "audio: none (readable entry does not wait on clips)");
  lines.push(`catalog: ${r.catalogNote}`);
  if (r.loaded && r.loaded.catalog.entries.some((e) => e.id === RESERVED)) {
    lines.push(`${RESERVED}: left untouched`);
  }
  lines.push(`entry: ${r.action === "unchanged" ? "unchanged" : r.action} conversations/${id}/entry.json`);
  lines.push("writes: 0 (dry-run; pass --apply to write files in the repo)");
  lines.push("publish: not performed. GitHub Pages updates only after a normal PR merge to main.");
  lines.push("phrasebook: not written. Search index stays with the phrasebook work.");
  for (const w of r.warnings) lines.push(`warning ${w.code} ${w.path}: ${w.message}`);
  return lines.join("\n");
}

export function applyResult(result) {
  if (!result.ok) return { wrote: [] };
  if (result.entry.id === RESERVED) {
    throw new Error(`refusing to write ${RESERVED}`);
  }
  const wrote = [];
  if (!result.sameEntry) {
    mkdirSync(dirname(result.entryPath), { recursive: true });
    writeFileSync(result.entryPath, `${JSON.stringify(result.entry, null, 2)}\n`);
    wrote.push(result.entryPath);
  }
  const nextCatalog = result.catalog;
  const current = result.loaded.created ? null : result.loaded.catalog;
  if (!current || canon(current) !== canon(nextCatalog)) {
    mkdirSync(dirname(result.catalogPath), { recursive: true });
    writeFileSync(result.catalogPath, `${JSON.stringify(nextCatalog, null, 2)}\n`);
    wrote.push(result.catalogPath);
  }
  return { wrote };
}

function help() {
  return `Usage: node tools/conversation/publish.mjs <entry.json> [--apply] [--root dir]

Default is a dry run: validate and print the plan. Nothing is written.
--apply writes conversations/<id>/entry.json and updates conversations/index.json.
It does not push, open a pull request, deploy, or generate audio.
cp_2026_11_07 is refused. Textbook and podcast lessons are not modified.`;
}

function main() {
  const args = process.argv.slice(2);
  let apply = false;
  let root = REPO_ROOT;
  let file = null;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--apply") apply = true;
    else if (a === "--root") {
      root = resolve(args[++i] || "");
      if (!args[i]) {
        console.error("missing --root directory");
        process.exit(2);
      }
    } else if (a === "--help" || a === "-h") {
      console.log(help());
      process.exit(0);
    } else if (a.startsWith("-")) {
      console.error(`unknown flag ${a}`);
      console.error("This command has no publish, push, or audio flag.");
      process.exit(2);
    } else if (!file) file = a;
    else {
      console.error(`unexpected argument ${a}`);
      process.exit(2);
    }
  }
  if (!file) {
    console.error(help());
    process.exit(2);
  }
  let input;
  try {
    input = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    console.log(`preflight failed\n- malformed_json : ${err.message}\nwrites: 0\npublish: not performed`);
    process.exit(1);
  }
  let result;
  try {
    result = assess(input, root);
  } catch (err) {
    console.log(`preflight failed\n- template_invariant : ${err.message}\nwrites: 0\npublish: not performed`);
    process.exit(1);
  }
  if (!apply) {
    console.log(result.report);
    process.exit(result.ok ? 0 : 1);
  }
  if (!result.ok) {
    console.log(result.report);
    process.exit(1);
  }
  const { wrote } = applyResult(result);
  const lines = result.report.replace("writes: 0 (dry-run; pass --apply to write files in the repo)", wrote.length ? `writes: ${wrote.length}\n${wrote.map((p) => `wrote ${p}`).join("\n")}` : "writes: 0");
  console.log(lines);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
