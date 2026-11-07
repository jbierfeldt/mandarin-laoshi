# Conversation entries, content only

The player on `main` (`a70ce244`) already renders a conversation. A new entry is JSON plus one catalog row. It does not need an app change.

| Piece | Path |
| --- | --- |
| Catalog | `conversations/index.json` → `entries[]` |
| Entry | `conversations/<id>/entry.json` |
| Route | `#/practice/<id>` |
| Shape | `schema` 1, `kind` `conversation`, `script` `hans` |
| Line | `py`, `en`, optional `note`, `words[]` of `{t, py, en, s?}`, `cells[]` one syllable `{ch, py, t, s?, pz?}` |

`ch` / `words[].t` are traditional. `s` is simplified and is omitted when the two scripts match. `script: hans` opens the page in simplified. Grey traditional and the flip stay on the existing Options drawer. Flashcards are the existing `drill` sections (recall and flip). This tool does not generate HTML.

`cp_2026_11_07` is already published. The tool refuses that id and does not open its files. Textbook and podcast lessons are not inputs or outputs.

Search is `phrasebook/index.json`, opened at `#/phrasebook`. A dry run only reports whether that file would change. `--apply` rebuilds it from the lessons and every conversation entry, including the one just written, so search cannot stay stale. The dry run writes nothing. Lines whose English or note starts with `Incorrect` are left out of the phrasebook. On the practice page they stay visible with a red "Incorrect. Do not learn this sentence." banner.

Audio is optional. Leave it off and publish the text. Add clip metadata later; this command never synthesizes speech. A synthetic clip must use `"real": false` and the word `synthetic` in `label`.

## Command

From the repo root:

```bash
node tools/conversation/publish.mjs tools/conversation/fixtures/sample-entry.json
node --test tools/conversation/publish.test.mjs
```

The first command is a dry run. Exit 0 means the plan is valid. It writes nothing, pushes nothing, and deploys nothing.

```bash
node tools/conversation/publish.mjs path/to/entry.json --apply
```

`--apply` writes `conversations/<id>/entry.json` and inserts or replaces that id in `conversations/index.json`. Running it again with the same file does not add a second card. A changed file updates the same id. `--root dir` writes into a scratch copy instead of this repo.

There is no flag that pushes or deploys. GitHub Pages serves `main`. Shipping an entry is still a normal pull request into `main`. Do not force-push.

## Authoring file

Simplified characters, tone-mark pinyin (not `ni3`), English, and every word:

```json
{
  "id": "cp_2026_01_15_tea",
  "date": "2026-01-15T12:00:00-05:00",
  "title": "Ordering tea",
  "lines": [
    {
      "zh": "我想喝茶。",
      "py": "Wǒ xiǎng hē chá.",
      "en": "I want to drink tea.",
      "words": [
        { "zh": "我", "py": "wǒ", "en": "I; me" },
        { "zh": "想", "py": "xiǎng", "en": "to want" },
        { "zh": "喝", "py": "hē", "en": "to drink" },
        { "zh": "茶", "py": "chá", "en": "tea" }
      ]
    }
  ]
}
```

The id date must match the calendar date in `date`. Optional fields: `subtitle`, `short`, `focus`, `emoji`, `color`, `tags`, line `note`, line or word `trad`, line `audio`. Spaces between syllables are the reliable form. `duōshǎo` is accepted when it has only one syllable break. `v` and `u:` are read as `ü`.

Same-script characters are copied. Common simplified characters are converted (`请` → `請`). If a character has more than one traditional form (`后` → `后` or `後`), the command fails until you set `trad`.

## Failures

| Code | Meaning |
| --- | --- |
| `missing_english` / `missing_gloss` / `missing_chinese` / `missing_words` / `missing_lines` | Required text is absent |
| `malformed_pinyin` | Not tone-mark pinyin, or not a syllable |
| `ambiguous_pinyin` | Add spaces between syllables |
| `pinyin_alignment` | Syllables do not match the characters, or the line and the words disagree |
| `token_alignment` | Word characters do not join back into the line |
| `ambiguous_traditional` | Supply `trad` |
| `traditional_alignment` | `trad` length or slice does not match |
| `gloss_conflict` | The same word has two glosses or two readings |
| `malformed_date` / `malformed_id` / `id_date_mismatch` | Bad date or id |
| `reserved_id` | `cp_2026_11_07` |
| `index_collision` | Id already used by a lesson, or the catalog already contains a duplicate id |
| `audio_label` | Synthetic clips must say synthetic. Real clips must say REAL |
| `unknown_field` | A typo in a field name |

`traditional_in_simplified` is a warning. The entry still plans. Fix `zh` if you meant simplified.

## What is already done, and what is not

Done on `main`: the practice route, the score cards, the drawer, the player, and the Nov 7 entry.

Done here: validate, fill the fixed template, update the catalog idempotently, dry-run by default.

Not done here: generating audio, editing `cp_2026_11_07`, or deploying. After `--apply`, commit the conversation JSON and `phrasebook/index.json`, then open a normal pull request. A lesson change is not published by this command. Regenerate the same index with `node phrasebook/build.mjs` and commit it. `node phrasebook/build.mjs --check` fails when the file is stale.
