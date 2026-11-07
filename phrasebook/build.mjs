/**
 * Rebuild phrasebook/index.json from the lesson files and conversation entries
 * already in this repo.
 *
 *   node phrasebook/build.mjs
 *   node phrasebook/build.mjs --check
 *
 * --check exits 1 when the committed index would change. The command only
 * reads lessons/ and conversations/ and writes phrasebook/index.json.
 * It does not publish conversation entries. That workflow is separate.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildIndex } from "./extract.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outPath = path.join(root, "phrasebook", "index.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function loadCorpus(dir = root) {
  const lessonIndex = readJson(path.join(dir, "lessons", "index.json"));
  const lessons = (lessonIndex.lessons || []).map((catalog) => {
    const file = path.join(dir, "lessons", catalog.id, "lesson.json");
    if (!fs.existsSync(file)) throw new Error(`Missing lesson file: lessons/${catalog.id}/lesson.json`);
    return { catalog, doc: readJson(file) };
  });
  const convPath = path.join(dir, "conversations", "index.json");
  let conversations = [];
  if (fs.existsSync(convPath)) {
    const convIndex = readJson(convPath);
    conversations = (convIndex.entries || []).map((catalog) => {
      const file = path.join(dir, "conversations", catalog.id, "entry.json");
      if (!fs.existsSync(file)) throw new Error(`Missing conversation entry: conversations/${catalog.id}/entry.json`);
      return { catalog, doc: readJson(file) };
    });
  }
  return { lessons, conversations };
}

export function serialize(index) {
  return `${JSON.stringify(index, null, 1)}\n`;
}

export function buildFromDisk(dir = root) {
  const { lessons, conversations } = loadCorpus(dir);
  return buildIndex({
    lessons,
    conversations,
    fileExists: (rel) => fs.existsSync(path.join(dir, rel)),
  });
}

function main() {
  const check = process.argv.includes("--check");
  const index = buildFromDisk(root);
  const text = serialize(index);
  if (check) {
    const prev = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
    if (prev !== text) {
      console.error("phrasebook/index.json is out of date. Run: node phrasebook/build.mjs");
      process.exit(1);
    }
    console.log(`phrasebook/index.json matches sources (${index.counts.entries} entries).`);
    return;
  }
  fs.writeFileSync(outPath, text);
  console.log(`Wrote phrasebook/index.json (${index.counts.entries} entries, ${index.counts.words} words, ${index.counts.phrases} phrases).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
