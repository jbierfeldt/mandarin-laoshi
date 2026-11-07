# Mandarin 老師
Personal Mandarin study player (no-build PWA). Open `#/` for the home list, `#/lesson/<id>` for a textbook or podcast lesson, `#/practice` for conversation practice, `#/practice/<id>` for one dated entry.
Each lesson is `lessons/<id>/lesson.json` + `lessons/<id>/audio/*.mp3`, listed in `lessons/index.json`.
Conversation entries are separate: `conversations/index.json` and `conversations/<id>/entry.json`. They use the same score cards, drawer, and player. They are not textbook or podcast lessons.
A single-file copy of the Nov 7, 2026 entry is `standalone/2026-11-07-new-shoes.html`.
Generated lesson pages come from mandarin_kit/app_convert.py; docs in mandarin_kit/APP.md. Personal study notes. Audio belongs to its respective owners. Conversation clips marked synthetic are computer speech.
