# Phrasebook index

`phrasebook/index.json` is a static list of the words and phrases already in this site. It is not a database, an account, or a dictionary of all Chinese. Nothing in it records how well a word is known.

The search page is `#/phrasebook`. Lesson pages stay on `#/lesson/<id>`. Conversation entries stay on `#/practice/<id>`.

## Regenerate

From the repository root, after a lesson or conversation entry changes:

```
node phrasebook/build.mjs
```

Check that the committed file still matches the sources:

```
node phrasebook/build.mjs --check
```

`node --test test/phrasebook.test.mjs` runs that check plus the search tests. The site has no build step on GitHub Pages, so the committed `phrasebook/index.json` is what the page loads. Run the command before committing a new lesson or conversation.

## What is read

Lessons, from `lessons/index.json` and `lessons/<id>/lesson.json`:

- `sections` whose `type` is `vocab` or `lines`
- cells: `ch` (traditional when a simplified form is also stored), `s` (simplified when it differs), `py`, `pz`
- vocab `grp`, `en`, `note`, `id`, `audio`
- a vocab group that starts with "Phrase" is a phrase; a group that starts with "Word" is a word; other groups are words unless the gloss is a sentence

Conversation entries, from `conversations/index.json` `entries[]` and `conversations/<id>/entry.json`:

- `kind` `conversation` and `script` (the Nov 7 entry is `hans`)
- `sections` whose `type` is `vocab` (words) or `lines` (phrases)
- the same cell fields
- `words[]` on a sentence: `t` traditional, `s` simplified when it differs, `py`, `en`
- sentence `py`, `en`, `note`, `id`, `audio`

`phrasebook/adapters/conversation.mjs` is the only place those conversation fields are read. New entries are published with `node tools/conversation/publish.mjs path/to/entry.json --apply`, described in `tools/conversation/RUNBOOK.md`. That command writes the entry and then runs this generator. A dry run of the publisher writes nothing and only reports whether this file would change. This generator does not define a second conversation schema.

`node phrasebook/build.mjs --check` is the staleness check for lesson edits, which the publisher does not write. Run `node phrasebook/build.mjs` after changing a lesson file.

Drills are skipped when they repeat a vocab item or a line. A line whose English or note starts with `Incorrect` is not a phrasebook entry and is not used as an example. `我是累` is that kind of line. The practice page still shows it, with a banner that says not to learn it. Hints and grammar cards are not entries. The standalone HTML copy of a conversation is not read.

If `conversations/index.json` is missing, the generator still builds the lesson index and does not guess at entries.

## Entry identity

The same simplified headword and the same tone-less pinyin merge into one entry. `台灣` and `臺灣` merge. `什麼` from three lessons is one entry with three sources.

Different English glosses stay as separate senses on that entry. `在` keeps both "at/in" and the "currently doing" gloss. Sources are not rewritten into a new definition.

The id is `pb-` plus hyphenated tone-less syllables plus `-` plus the simplified headword, for example `pb-shen-me-什么`. It does not change when a new lesson mentions the same word. Punctuation is not part of the id.

`kind` is `word` or `phrase`. A vocab item marked as a word stays a word even if a dialogue line uses the same characters.

## Fields

Top level: `schema` (1), `title`, `regen`, `description`, `counts`, `inputs`, `charMapConflicts`, `sources`, `charMap`, `entries`.

`charMap` is traditional to simplified for pairs that actually occur in the sources. Search uses it so either form matches.

Each entry:

- `id`, `kind` (`word` or `phrase`)
- `trad`, `simp` (simplified is what the page shows first; traditional is shown when it differs)
- `pinyin` with tone marks, as written in the source when the source has a `py` line
- `pinyinPlain` for search (no tones, no spaces, no numbers)
- `senses[]`: `id`, `gloss`, `sources[]`
- `words[]` when a sentence brought a word breakdown: `trad`, `simp`, `pinyin`, `en`
- `examples[]` up to three other sentences that contain the headword, copied from the lessons, not written for this index
- `audio` or `null`: `src`, `label`, `real`. Missing audio is left out. Search does not need it.

Each source:

- `origin` `lesson` or `conversation`
- `id`, `kind` (`textbook`, `podcast`, or `conversation`), `title`, `short`, `source`, `date`
- `href` `#/lesson/<id>` or `#/practice/<id>`
- `script` (`hans` on the Nov 7 conversation, otherwise empty)
- `sectionType`, `sectionTitle`, `itemId`, `group`, `note`

## Search

The box on `#/phrasebook` matches:

- English, any case, as a substring (`brother` finds "younger brother")
- pinyin with tone marks, without them, with or without spaces, and with tone numbers (`hǎo`, `hao`, `hao3`, `ni3 hao3`)
- simplified or traditional characters

Filters: All / Words / Phrases, and one source lesson or conversation. An empty search browses the current filter. Audio is a play button only when the source file exists.
