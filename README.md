# Mandarin 老師
Personal Mandarin study player (no-build PWA). Open `#/` for the home list, `#/lesson/<id>` for a textbook or podcast lesson, `#/practice` for conversation practice, `#/practice/<id>` for one dated entry.
Each lesson is `lessons/<id>/lesson.json` + `lessons/<id>/audio/*.mp3`, listed in `lessons/index.json`.
Conversation entries are separate: `conversations/index.json` and `conversations/<id>/entry.json`. They use the same score cards, drawer, and player. They are not textbook or podcast lessons.
A single-file copy of the Nov 7, 2026 entry is `standalone/2026-11-07-new-shoes.html`.
Generated lesson pages come from mandarin_kit/app_convert.py; docs in mandarin_kit/APP.md. Personal study notes. Audio belongs to its respective owners. Conversation clips marked synthetic are computer speech.

## Phrasebook

`#/phrasebook` searches the words and phrases already in the lessons and conversation entries. The list is the static file `phrasebook/index.json`, not a database. Open it from the Words link in the header.

Publishing a conversation is a dry run, then a write. The runbook is `tools/conversation/RUNBOOK.md`.

```
node tools/conversation/publish.mjs path/to/entry.json
node tools/conversation/publish.mjs path/to/entry.json --apply
```

The first command writes nothing. `--apply` writes the conversation files and rebuilds `phrasebook/index.json`. A lesson edit is not part of that command. After changing a lesson, run:

```
node phrasebook/build.mjs
node phrasebook/build.mjs --check
```

`--check` fails when the index does not match the lessons and conversations on disk. Fields are in `phrasebook/SCHEMA.md`.
