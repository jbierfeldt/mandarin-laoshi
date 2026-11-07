import { syllablesOf, sameReading } from "./pinyin.mjs";
import { convertChar, isTraditionalOnly } from "./s2t.mjs";

const ID_RE = /^cp_(\d{4})_(\d{2})_(\d{2})(?:_([a-z0-9]+(?:-[a-z0-9]+)*))?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(Z|[+-]\d{2}:\d{2})$/;
const RESERVED_IDS = new Set(["cp_2026_11_07"]);

const TOP_KEYS = new Set(["id", "date", "title", "subtitle", "short", "focus", "emoji", "color", "tags", "lines"]);
const LINE_KEYS = new Set(["id", "zh", "trad", "py", "en", "note", "words", "audio"]);
const WORD_KEYS = new Set(["zh", "trad", "py", "en"]);
const AUDIO_KEYS = new Set(["src", "label", "real", "voice"]);

export function isHan(ch) {
  return /\p{Script=Han}/u.test(ch);
}

export function hanChars(s) {
  return [...String(s ?? "").normalize("NFC")].filter(isHan);
}

function push(errors, code, path, message) {
  if (errors.length < 50) errors.push({ code, path, message });
}

function unknownKeys(obj, allowed, path, errors) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) push(errors, "unknown_field", `${path}.${key}`, `unknown field "${key}"`);
  }
}

function reqString(value, path, code, errors) {
  if (typeof value !== "string" || !value.trim()) {
    push(errors, code, path, `${path} is required`);
    return "";
  }
  return value.normalize("NFC").trim();
}

function validDate(text) {
  const m = DATE_RE.exec(text);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const ss = Number(m[6]);
  if (hh > 23 || mm > 59 || ss > 59) return null;
  const off = m[7];
  if (off !== "Z") {
    const oh = Number(off.slice(1, 3));
    const om = Number(off.slice(4, 6));
    if (oh > 23 || om > 59) return null;
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d, text };
}

function resolveTrad(simpChars, tradText, path, errors) {
  if (tradText == null || tradText === "") return null;
  if (typeof tradText !== "string") {
    push(errors, "traditional_alignment", path, "trad must be a string");
    return null;
  }
  const trad = hanChars(tradText);
  if (trad.length !== simpChars.length) {
    push(errors, "traditional_alignment", path, `traditional has ${trad.length} characters and simplified has ${simpChars.length}`);
    return null;
  }
  return trad;
}

function checkAudio(audio, path, errors) {
  if (audio == null) return null;
  if (!Array.isArray(audio) || audio.length === 0) {
    push(errors, "malformed_audio", path, "audio must be a non-empty array of clips");
    return null;
  }
  const clips = [];
  audio.forEach((clip, i) => {
    const p = `${path}[${i}]`;
    if (!clip || typeof clip !== "object" || Array.isArray(clip)) {
      push(errors, "malformed_audio", p, "audio clip must be an object");
      return;
    }
    unknownKeys(clip, AUDIO_KEYS, p, errors);
    if (typeof clip.src !== "string" || !/^audio\/[a-z0-9][a-z0-9._-]*\.mp3$/.test(clip.src) || clip.src.includes("..")) {
      push(errors, "malformed_audio", `${p}.src`, "src must be a relative audio/*.mp3 path");
    }
    if (typeof clip.label !== "string" || !clip.label.trim()) {
      push(errors, "audio_label", `${p}.label`, "audio label is required");
    } else if (clip.real === false && !/synthetic/i.test(clip.label)) {
      push(errors, "audio_label", `${p}.label`, "synthetic clips must say synthetic in the label");
    } else if (clip.real === true && !/\bREAL\b/.test(clip.label)) {
      push(errors, "audio_label", `${p}.label`, "a real clip label must include REAL");
    }
    if (typeof clip.real !== "boolean") push(errors, "malformed_audio", `${p}.real`, "real must be true or false");
    if (clip.voice != null && typeof clip.voice !== "string") push(errors, "malformed_audio", `${p}.voice`, "voice must be a string");
    clips.push({
      src: clip.src,
      label: typeof clip.label === "string" ? clip.label.trim() : "",
      real: clip.real,
      ...(clip.voice ? { voice: clip.voice.trim() } : {}),
    });
  });
  return clips;
}

/**
 * Validate an authoring document. Does not read or write the catalog.
 * @returns {{ok:boolean, errors:{code:string,path:string,message:string}[], warnings:{code:string,path:string,message:string}[], value:object|null}}
 */
export function validateAuthoring(input) {
  const errors = [];
  const warnings = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: [{ code: "malformed_json", path: "", message: "authoring document must be a JSON object" }], warnings, value: null };
  }
  unknownKeys(input, TOP_KEYS, "", errors);

  const id = reqString(input.id, "id", "missing_id", errors);
  if (id && !ID_RE.test(id)) {
    push(errors, "malformed_id", "id", "id must look like cp_2026_01_15 or cp_2026_01_15_tea");
  }
  if (RESERVED_IDS.has(id)) {
    push(errors, "reserved_id", "id", `${id} is the published Nov 7 entry. This tool will not write or replace it`);
  }

  const dateText = reqString(input.date, "date", "missing_date", errors);
  const date = dateText ? validDate(dateText) : null;
  if (dateText && !date) push(errors, "malformed_date", "date", "date must be ISO 8601 with seconds and a timezone, such as 2026-01-15T12:00:00-05:00");
  if (id && date && ID_RE.test(id)) {
    const want = `${date.y}_${String(date.mo).padStart(2, "0")}_${String(date.d).padStart(2, "0")}`;
    const got = id.slice(3, 13);
    if (got !== want) push(errors, "id_date_mismatch", "id", `id date ${got} does not match date ${date.text.slice(0, 10)}`);
  }

  const title = reqString(input.title, "title", "missing_title", errors);
  if (!Array.isArray(input.lines) || input.lines.length === 0) push(errors, "missing_lines", "lines", "at least one line is required");

  let subtitle = "";
  if (input.subtitle != null) {
    if (typeof input.subtitle !== "string") push(errors, "malformed_field", "subtitle", "subtitle must be a string");
    else subtitle = input.subtitle.normalize("NFC").trim();
  }
  let short = title;
  if (input.short != null) {
    if (typeof input.short !== "string" || !input.short.trim()) push(errors, "malformed_field", "short", "short must be a non-empty string");
    else short = input.short.normalize("NFC").trim();
  }
  let focus = "";
  if (input.focus != null) {
    if (typeof input.focus !== "string") push(errors, "malformed_field", "focus", "focus must be a string");
    else focus = input.focus.normalize("NFC").trim();
  }
  let emoji = "💬";
  if (input.emoji != null) {
    if (typeof input.emoji !== "string" || [...input.emoji].length > 8) push(errors, "malformed_field", "emoji", "emoji must be a short string");
    else emoji = input.emoji;
  }
  let color = "#0B7285";
  if (input.color != null) {
    if (typeof input.color !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(input.color)) push(errors, "malformed_field", "color", "color must be a #RRGGBB hex");
    else color = input.color;
  }
  let tags = null;
  if (input.tags != null) {
    if (!Array.isArray(input.tags) || input.tags.some((t) => typeof t !== "string" || !t.trim() || t.length > 40)) {
      push(errors, "malformed_field", "tags", "tags must be short strings");
    } else tags = input.tags.map((t) => t.trim());
  } else if (date) tags = ["conversation", date.text.slice(0, 10)];

  const seenLineIds = new Set();
  const vocab = [];
  const vocabBySimp = new Map();
  const lines = [];

  (Array.isArray(input.lines) ? input.lines : []).forEach((line, li) => {
    const path = `lines[${li}]`;
    if (!line || typeof line !== "object" || Array.isArray(line)) {
      push(errors, "malformed_field", path, "line must be an object");
      return;
    }
    unknownKeys(line, LINE_KEYS, path, errors);
    const zh = reqString(line.zh, `${path}.zh`, "missing_chinese", errors);
    const en = reqString(line.en, `${path}.en`, "missing_english", errors);
    const pyText = reqString(line.py, `${path}.py`, "missing_pinyin", errors);
    let note = "";
    if (line.note != null) {
      if (typeof line.note !== "string") push(errors, "malformed_field", `${path}.note`, "note must be a string");
      else note = line.note.normalize("NFC").trim();
    }
    const lineId = line.id != null ? String(line.id).trim() : `s${String(li + 1).padStart(2, "0")}`;
    if (!/^s\d{2,}$/.test(lineId)) push(errors, "malformed_id", `${path}.id`, "line id must look like s01");
    if (seenLineIds.has(lineId)) push(errors, "duplicate_line_id", `${path}.id`, `duplicate line id ${lineId}`);
    seenLineIds.add(lineId);

    const simp = hanChars(zh);
    if (zh && simp.length === 0) push(errors, "missing_chinese", `${path}.zh`, "line has no Chinese characters");
    for (const ch of simp) {
      if (isTraditionalOnly(ch)) {
        warnings.push({ code: "traditional_in_simplified", path: `${path}.zh`, message: `${ch} looks like traditional. Put simplified characters in zh and traditional in trad` });
      }
    }
    const lineTrad = resolveTrad(simp, line.trad, `${path}.trad`, errors);

    const spoken = pyText ? syllablesOf(pyText, simp.length || null) : null;
    if (spoken?.error && spoken.error.code !== "missing_pinyin") {
      push(errors, spoken.error.code, `${path}.py`, spoken.error.message);
    }

    if (!Array.isArray(line.words) || line.words.length === 0) {
      push(errors, "missing_words", `${path}.words`, "every line needs a word-by-word breakdown");
    }

    const words = [];
    const flat = [];
    (Array.isArray(line.words) ? line.words : []).forEach((word, wi) => {
      const wp = `${path}.words[${wi}]`;
      if (!word || typeof word !== "object" || Array.isArray(word)) {
        push(errors, "malformed_field", wp, "word must be an object");
        return;
      }
      unknownKeys(word, WORD_KEYS, wp, errors);
      const wzh = reqString(word.zh, `${wp}.zh`, "missing_chinese", errors);
      const wen = reqString(word.en, `${wp}.en`, "missing_gloss", errors);
      const wpy = reqString(word.py, `${wp}.py`, "missing_pinyin", errors);
      const wsimp = hanChars(wzh);
      if (wzh && wsimp.length === 0) push(errors, "missing_chinese", `${wp}.zh`, "word has no Chinese characters");
      const wtrad = resolveTrad(wsimp, word.trad, `${wp}.trad`, errors);
      const syl = wpy ? syllablesOf(wpy, wsimp.length || null) : null;
      if (syl?.error && syl.error.code !== "missing_pinyin") push(errors, syl.error.code, `${wp}.py`, syl.error.message);
      if (syl?.syllables && wsimp.length && syl.syllables.length !== wsimp.length) {
        push(errors, "pinyin_alignment", `${wp}.py`, `${wzh} has ${wsimp.length} characters but ${syl.syllables.length} syllables`);
      }
      const chars = wsimp.map((ch, ci) => {
        let trad = ch;
        if (wtrad) trad = wtrad[ci];
        else if (lineTrad) trad = lineTrad[flat.length + ci];
        else {
          const conv = convertChar(ch);
          if (conv.ambiguous) {
            push(errors, "ambiguous_traditional", `${wp}.zh`, `${ch} can be ${conv.ambiguous.join(" or ")}. Add trad`);
          } else trad = conv.trad;
        }
        return {
          simp: ch,
          trad,
          display: syl?.syllables?.[ci]?.display || "",
          tone: syl?.syllables?.[ci]?.tone ?? null,
        };
      });
      if (wtrad && lineTrad) {
        const slice = lineTrad.slice(flat.length, flat.length + wsimp.length).join("");
        if (slice !== wtrad.join("")) {
          push(errors, "traditional_alignment", `${wp}.trad`, `word trad ${wtrad.join("")} does not match the line trad slice ${slice}`);
        }
      }
      flat.push(...chars);
      words.push({
        simp: wsimp.join(""),
        trad: chars.map((c) => c.trad).join(""),
        py: (syl?.syllables || []).map((s) => s.display).join(""),
        en: wen,
        chars,
      });
    });

    if (simp.length && flat.length && flat.length !== simp.length) {
      push(errors, "token_alignment", `${path}.words`, `words join to ${flat.map((c) => c.simp).join("")} but the line is ${simp.join("")}`);
    } else if (simp.length && flat.length === simp.length && flat.map((c) => c.simp).join("") !== simp.join("")) {
      push(errors, "token_alignment", `${path}.words`, `words join to ${flat.map((c) => c.simp).join("")} but the line is ${simp.join("")}`);
    }
    if (spoken?.syllables && flat.length === spoken.syllables.length && flat.length) {
      const fromWords = syllablesOf(flat.map((c) => c.display).filter(Boolean).join(" "), flat.length);
      if (fromWords.syllables && !sameReading(fromWords.syllables, spoken.syllables)) {
        push(errors, "pinyin_alignment", `${path}.py`, `line pinyin is ${spoken.syllables.map((s) => s.display).join(" ")} but the words are ${fromWords.syllables.map((s) => s.display).join(" ")}`);
      }
    } else if (spoken?.syllables && simp.length && spoken.syllables.length !== simp.length) {
      push(errors, "pinyin_alignment", `${path}.py`, `line has ${simp.length} characters but ${spoken.syllables.length} syllables`);
    }

    const cells = [];
    let fi = 0;
    for (const ch of [...zh]) {
      if (isHan(ch)) {
        const info = flat[fi++];
        if (!info) continue;
        cells.push({ ...info, pz: "" });
      } else if (/\s/u.test(ch)) continue;
      else if (cells.length) cells[cells.length - 1].pz += ch;
      else push(errors, "malformed_field", `${path}.zh`, `punctuation ${ch} has no character to attach to`);
    }

    const audio = checkAudio(line.audio, `${path}.audio`, errors);
    if (audio) warnings.push({ code: "audio_optional", path: `${path}.audio`, message: "clips are copied through and are not generated. A missing file does not block the entry" });

    for (const word of words) {
      if (!word.simp || !word.en) continue;
      const prev = vocabBySimp.get(word.simp);
      if (!prev) {
        vocabBySimp.set(word.simp, word);
        vocab.push(word);
      } else if (prev.en !== word.en || prev.py !== word.py || prev.trad !== word.trad) {
        push(errors, "gloss_conflict", path, `${word.simp} is glossed as "${prev.en}" (${prev.py}) and also "${word.en}" (${word.py}). Use one gloss or split the entry`);
      }
    }

    lines.push({ id: lineId, zh, en, note, cells, words, audio });
  });

  if (errors.length || !date || !id || !title) return { ok: false, errors, warnings, value: null };

  return {
    ok: true,
    errors,
    warnings,
    value: { id, date: date.text, title, subtitle, short, focus, emoji, color, tags, lines, vocab },
  };
}
