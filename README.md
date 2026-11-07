# Mandarin 老師
Personal Mandarin study player (no-build PWA). Open `#/` for the home list, `#/lesson/<id>` for a textbook or podcast lesson, `#/practice` for conversation practice, `#/practice/<id>` for one dated entry.
Each lesson is `lessons/<id>/lesson.json` + `lessons/<id>/audio/*.mp3`, listed in `lessons/index.json`.
Conversation entries are separate: `conversations/index.json` and `conversations/<id>/entry.json`. They use the same score cards, drawer, and player. They are not textbook or podcast lessons.
A single-file copy of the Nov 7, 2026 entry is `standalone/2026-11-07-new-shoes.html`.
Generated lesson pages come from mandarin_kit/app_convert.py; docs in mandarin_kit/APP.md. Personal study notes. Audio belongs to its respective owners. Conversation clips marked synthetic are computer speech.

## Phrasebook

`#/phrasebook` searches the words and phrases already in the lessons and conversation entries. The list is the static file `phrasebook/index.json`, not a database. Open it from the Words link in the header.

After a new lesson or conversation entry is added, regenerate that file:

```
node phrasebook/build.mjs
```

Confirm the file matches the sources:

```
node phrasebook/build.mjs --check
```

Fields, ids, and what the generator reads are in `phrasebook/SCHEMA.md`. Publishing a conversation (`scripts/build_conversation.py`) is separate. The phrasebook command only reads `lessons/` and `conversations/` and rewrites `phrasebook/index.json`.
