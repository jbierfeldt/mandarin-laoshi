#!/usr/bin/env python3
"""Build the Nov 7, 2026 conversation-practice entry, synthetic clips, and standalone HTML.

Run from the repo root:
  PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_conversation.py
  PYTHONDONTWRITEBYTECODE=1 python3 scripts/build_conversation.py --html-only
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY_ID = "cp_2026_11_07"
ENTRY_DIR = ROOT / "conversations" / ENTRY_ID
AUDIO_DIR = ENTRY_DIR / "audio"
VOICE = "zh-TW-HsiaoChenNeural"
DATE = "2026-11-07T12:00:00-05:00"
PAUSE = "，。？！、"
TONE_RE = re.compile(r"[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]", re.I)

P1 = ["p1", "1", "#C92A2A"]
P2 = ["p2", "2", "#C92A2A"]
P3 = ["p3", "3", "#C92A2A"]
PUFF = ["puff", "ʰ", "#E67700"]
NOPUFF = ["nopuff", "°", "#E67700"]
HMARK = ["h", "~", "#E67700"]
HALF = ["half", "↓", "#3B5BDB"]
S33 = ["33", "↗", "#17A398"]
YI = ["yi", "↗", "#17A398"]
BU = ["bu", "↗", "#17A398"]

BASE_MAP = str.maketrans({
    "ā": "a", "á": "a", "ǎ": "a", "à": "a", "Ā": "a", "Á": "a", "Ǎ": "a", "À": "a",
    "ē": "e", "é": "e", "ě": "e", "è": "e", "Ē": "e", "É": "e", "Ě": "e", "È": "e",
    "ī": "i", "í": "i", "ǐ": "i", "ì": "i", "Ī": "i", "Í": "i", "Ǐ": "i", "Ì": "i",
    "ō": "o", "ó": "o", "ǒ": "o", "ò": "o", "Ō": "o", "Ó": "o", "Ǒ": "o", "Ò": "o",
    "ū": "u", "ú": "u", "ǔ": "u", "ù": "u", "Ū": "u", "Ú": "u", "Ǔ": "u", "Ù": "u",
    "ǖ": "v", "ǘ": "v", "ǚ": "v", "ǜ": "v", "Ǖ": "v", "Ǘ": "v", "Ǚ": "v", "Ǜ": "v",
})
TO2 = str.maketrans({"ǎ": "á", "ě": "é", "ǐ": "í", "ǒ": "ó", "ǔ": "ú", "ǚ": "ǘ",
                     "Ǎ": "á", "Ě": "é", "Ǐ": "í", "Ǒ": "ó", "Ǔ": "ú", "Ǚ": "ǘ"})


def base_py(py: str) -> str:
    return py.translate(BASE_MAP).lower()


def to_second(py: str) -> str:
    return py.translate(TO2).lower()


def cue(sym, col, kind, text):
    return {"sym": sym, "col": col, "kind": kind, "cue": text}


def MC(key, arr, sym, col, kind, text):
    return (key, arr, cue(sym, col, kind, text))


WANT = {
    "wo": {"fc": [("uo", "uo", "‘oo’ opening to ‘aw’ (wǒ ≈ ‘waw’, no r)")]},
    "lei": {"fc": [("ei", "ei", "ei like ‘vein’")]},
    "hen": {"mk": MC("h", HMARK, "~", "#E67700", "h", "light scratch at the back"),
            "fc": [("n", "-n", "tip ends on the ridge behind top teeth (ban)")]},
    "shi": {"mk": MC("p2", P2, "2", "#C92A2A", "p2", "Position 2: tip up · shi ≈ ‘shrr’"),
            "fc": [("buzz", "i = buzz", "not ‘ee’ — hold the consonant and voice through it")]},
    "xin": {"mk": MC("p1", P1, "1", "#C92A2A", "p1", "Position 1: tip behind bottom teeth"),
            "fc": [("n", "-n", "tip ends on the ridge behind top teeth (ban)")]},
    "xie": {"mk": MC("p1", P1, "1", "#C92A2A", "p1", "Position 1: tip behind bottom teeth"),
            "fc": [("ie", "ie", "ie: ‘ye’ as in yet")]},
    "xi": {"mk": MC("p1", P1, "1", "#C92A2A", "p1", "Position 1: tip behind bottom teeth")},
    "zong": {"mk": MC("p3", P3, "3", "#C92A2A", "p3", "Position 3: tip on top teeth")},
    "se": {"fc": [("euh", "e = uh", "e: ‘uh’ as in duh")]},
    "zi": {"mk": MC("p3", P3, "3", "#C92A2A", "p3", "Position 3: tip on top teeth"),
           "fc": [("buzz", "i = buzz", "not ‘ee’ — hold the consonant and voice through it")]},
    "jiao": {"mk": MC("p1", P1, "1", "#C92A2A", "p1", "Position 1: tip behind bottom teeth"),
             "fc": [("iao", "iao", "iao: one syllable, like ‘yow’")]},
    "dui": {"mk": MC("nopuff", NOPUFF, "°", "#E67700", "nopuff", "no puff, no voice: sPin"),
            "fc": [("ei", "ei", "ei like ‘vein’"),
                   ("uei", "u(e)i", "-ui = u(e)i, -iu = i(o)u, -un = u(e)n")]},
    "ke": {"mk": MC("puff", PUFF, "ʰ", "#E67700", "puff", "big puff of air (hand test)")},
    "huan": {"mk": MC("h", HMARK, "~", "#E67700", "h", "light scratch at the back"),
             "fc": [("n", "-n", "tip ends on the ridge behind top teeth (ban)")]},
    "zhen": {"mk": MC("p2", P2, "2", "#C92A2A", "p2", "Position 2: tip up · shi ≈ ‘shrr’"),
             "fc": [("n", "-n", "tip ends on the ridge behind top teeth (ban)")]},
    "bang": {"mk": MC("nopuff", NOPUFF, "°", "#E67700", "nopuff", "no puff, no voice: sPin"),
             "fc": [("ng", "-ng", "back of tongue up, out through the nose (sing)")]},
    "bi": {"mk": MC("nopuff", NOPUFF, "°", "#E67700", "nopuff", "no puff, no voice: sPin")},
    "mei": {"fc": [("ei", "ei", "ei like ‘vein’")]},
    "wei": {"fc": [("ei", "ei", "ei like ‘vein’")]},
    "ba": {"mk": MC("nopuff", NOPUFF, "°", "#E67700", "nopuff", "no puff, no voice: sPin")},
    "jian": {"mk": MC("p1", P1, "1", "#C92A2A", "p1", "Position 1: tip behind bottom teeth"),
             "fc": [("n", "-n", "tip ends on the ridge behind top teeth (ban)")]},
    "dao": {"mk": MC("nopuff", NOPUFF, "°", "#E67700", "nopuff", "no puff, no voice: sPin")},
    "jiu": {"mk": MC("p1", P1, "1", "#C92A2A", "p1", "Position 1: tip behind bottom teeth"),
            "fc": [("iu", "iu", "-iu = i(o)u, a hidden o")]},
    "hui": {"mk": MC("h", HMARK, "~", "#E67700", "h", "light scratch at the back"),
            "fc": [("uei", "u(e)i", "-ui = u(e)i, -iu = i(o)u, -un = u(e)n")]},
    "huang": {"mk": MC("h", HMARK, "~", "#E67700", "h", "light scratch at the back"),
              "fc": [("ng", "-ng", "back of tongue up, out through the nose (sing)")]},
    "zen": {"mk": MC("p3", P3, "3", "#C92A2A", "p3", "Position 3: tip on top teeth"),
            "fc": [("n", "-n", "tip ends on the ridge behind top teeth (ban)"),
                   ("euh", "e = uh", "en: quick ‘uh’, as in the last syllable of banana")]},
    "zhi": {"mk": MC("p2", P2, "2", "#C92A2A", "p2", "Position 2: tip up · shi ≈ ‘shrr’")},
    "mao": {"fc": [("ao", "ao", "ao: ‘ow’ as in cow")]},
    "hai": {"mk": MC("h", HMARK, "~", "#E67700", "h", "light scratch at the back")},
    "tun": {"fc": [("uen", "u(e)n", "-un = u(e)n, a hidden e")]},
    "he": {"mk": MC("h", HMARK, "~", "#E67700", "h", "light scratch at the back")},
    "zhe": {"mk": MC("p2", P2, "2", "#C92A2A", "p2", "Position 2: tip up · shi ≈ ‘shrr’"),
            "fc": [("euh", "e = uh", "e: ‘uh’ as in duh")]},
    "ting": {"mk": MC("puff", PUFF, "ʰ", "#E67700", "puff", "big puff of air (hand test)"),
             "fc": [("ng", "-ng", "back of tongue up, out through the nose (sing)")]},
    "ju": {"mk": MC("p1", P1, "1", "#C92A2A", "p1", "Position 1: tip behind bottom teeth"),
           "fc": [("u-umlaut", "ü", "say ‘ee’, then round the lips. After j q x y the dots are not written")]},
    "guai": {"mk": MC("nopuff", NOPUFF, "°", "#E67700", "nopuff", "no puff, no voice: sPin"),
             "fc": [("uai", "uai", "uai: a w-glide plus ‘eye’")]},
    "hao": {"mk": MC("h", HMARK, "~", "#E67700", "h", "light scratch at the back")},
}


def C(trad, py, tone, simp=None, pz=None):
    cell = {"ch": trad, "py": py, "t": tone}
    if simp and simp != trad:
        cell["s"] = simp
    if pz:
        cell["pz"] = pz
    return cell


def W(trad, py, en, simp=None):
    word = {"t": trad, "py": py, "en": en}
    if simp and simp != trad:
        word["s"] = simp
    return word


def groups(cells):
    group, out = [], []
    for cell in cells:
        if "pu" in cell:
            if any(p in cell["pu"] for p in PAUSE) and group:
                out.append(group)
                group = []
            continue
        if "ch" not in cell:
            continue
        group.append(cell)
        if any(p in cell.get("pz", "") for p in PAUSE):
            out.append(group)
            group = []
    if group:
        out.append(group)
    return out


def apply_sandhi(cells):
    for group in groups(cells):
        i = 0
        while i < len(group):
            if group[i]["t"] != 3:
                i += 1
                continue
            j = i
            while j < len(group) and group[j]["t"] == 3:
                j += 1
            run = group[i:j]
            for k, cell in enumerate(run):
                last = k == len(run) - 1
                if not last:
                    cell["mk"] = S33
                    cell["said"] = to_second(cell["py"])
                elif j < len(group):
                    cell["mk"] = HALF
            i = j
        for i, cell in enumerate(group):
            nxt = group[i + 1] if i + 1 < len(group) else None
            if not nxt or "mk" in cell:
                continue
            b = base_py(cell["py"])
            if b == "yi" and cell["t"] == 1:
                if nxt["t"] == 4:
                    cell["mk"] = YI
                    cell["said"] = "yí"
                elif nxt["t"] in (1, 2, 3):
                    cell["mk"] = YI
                    cell["said"] = "yì"
            elif b == "bu" and cell["t"] == 4 and nxt["t"] == 4:
                cell["mk"] = BU
                cell["said"] = "bú"


def decorate(cells, seen):
    cues = []
    for cell in cells:
        if "py" not in cell:
            continue
        mk = cell.get("mk")
        if mk and mk[0] == "33":
            cues.append(cue("↗", "#17A398", "33", f"3rd tones in a row: say {cell['said']} (dictionary tone {cell['py']})"))
            cues[-1]["lab"] = cell["said"]
        elif mk and mk[0] == "half":
            cues.append(cue("↓", "#3B5BDB", "half", "half-third: stay low, no rise"))
            cues[-1]["lab"] = cell["py"]
        elif mk and mk[0] in ("yi", "bu"):
            cues.append(cue("↗", "#17A398", mk[0], f"say {cell['said']} (dictionary tone {cell['py']})"))
            cues[-1]["lab"] = cell["said"]
        spec = WANT.get(base_py(cell["py"]))
        if not spec:
            continue
        mk_spec = spec.get("mk")
        if mk_spec and "mk" not in cell and mk_spec[0] not in seen:
            seen.add(mk_spec[0])
            cell["mk"] = mk_spec[1]
            extra = dict(mk_spec[2])
            extra["lab"] = cell["py"]
            cues.append(extra)
        for key, chip, text in spec.get("fc", []):
            if key in seen:
                continue
            seen.add(key)
            cell.setdefault("fc", []).append([chip, text])
            cues.append({"chip": chip, "lab": cell["py"], "cue": text})
    return cues


def simp_text(cells) -> str:
    out = []
    for cell in cells:
        if "pu" in cell:
            out.append(cell["pu"])
            continue
        out.append(cell.get("s") or cell["ch"])
        if cell.get("pz"):
            out.append(cell["pz"])
    return "".join(out)


def trad_text(cells) -> str:
    return "".join(cell["ch"] for cell in cells if "ch" in cell)


def check_item(item):
    chars = trad_text(item["cells"])
    words = "".join(w["t"] for w in item["words"])
    if chars != words:
        raise SystemExit(f"{item['id']}: cells {chars} != words {words}")
    for cell in item["cells"]:
        if "ch" not in cell:
            continue
        if len(cell["ch"]) != 1:
            raise SystemExit(f"{item['id']}: {cell['ch']} is not one character")
        if not cell.get("py") or any(ch.isspace() for ch in cell["py"]):
            raise SystemExit(f"{item['id']}: bad pinyin on {cell['ch']}")
        marked = bool(TONE_RE.search(cell["py"]))
        if cell["t"] == 5 and marked:
            raise SystemExit(f"{item['id']}: neutral syllable has a tone mark: {cell['py']}")
        if cell["t"] != 5 and not marked:
            raise SystemExit(f"{item['id']}: missing tone mark: {cell['py']}")
    for word in item["words"]:
        if not word.get("en") or not word.get("py") or not word.get("t"):
            raise SystemExit(f"{item['id']}: incomplete word {word}")
    if not item.get("en") or not item.get("py") or not item.get("note"):
        raise SystemExit(f"{item['id']}: missing English, pinyin, or note")
    if not TONE_RE.search(item["py"]) and any(c.get("t") != 5 for c in item["cells"] if "ch" in c):
        raise SystemExit(f"{item['id']}: sentence pinyin has no tone mark")


JOBS = []


def audio_obj(file_id, say):
    return [{"src": f"audio/{file_id}.mp3", "label": f"{say} · synthetic", "real": False, "voice": "HsiaoChen"}]


def add_line(bucket, seen, lid, cells, words, en, py, note):
    apply_sandhi(cells)
    item = {
        "id": lid,
        "en": en,
        "py": py,
        "note": note,
        "cells": cells,
        "words": words,
        "cues": decorate(cells, seen),
        "audio": audio_obj(lid, simp_text(cells)),
    }
    check_item(item)
    bucket.append(item)
    JOBS.append((lid, simp_text(cells), AUDIO_DIR / f"{lid}.mp3"))
    bits = []
    for cell in cells:
        if "ch" not in cell:
            continue
        flag = ""
        if cell.get("said"):
            flag = "→" + cell["said"]
        elif cell.get("mk") and cell["mk"][0] == "half":
            flag = "↓"
        bits.append((cell.get("s") or cell["ch"]) + cell["py"] + flag)
    print(lid, " ".join(bits))
    return item


def add_vocab(bucket, seen, vid, grp, trad, py, en, note, cells, simp=None):
    apply_sandhi(cells)
    item = {
        "id": vid,
        "grp": grp,
        "en": en,
        "py": py,
        "note": note,
        "cells": cells,
        "words": [W(trad, py, en, simp)],
        "cues": decorate(cells, seen),
        "audio": audio_obj(vid, simp_text(cells)),
    }
    check_item(item)
    bucket.append(item)
    JOBS.append((vid, simp_text(cells), AUDIO_DIR / f"{vid}.mp3"))
    return item


def build_lines():
    a, b, c, d = [], [], [], []
    sa, sb, sc, sd = set(), set(), set(), set()
    add_line(a, sa, "s01",
             [C("我", "Wǒ", 3), C("累", "lèi", 4), C("了", "le", 5, pz="。")],
             [W("我", "wǒ", "I; me"), W("累", "lèi", "tired"),
              W("了", "le", "change-of-state particle: a new situation, not English “have”")],
             "I'm tired. / I've gotten tired.",
             "Wǒ lèi le",
             "Change of state. 了 le says the situation is new: you have gotten tired. It does not mean English “have”. 我 is a low half-third before 累 (4th). 了 is neutral, and it sits light and low after a 4th tone.")
    add_line(a, sa, "s02",
             [C("我", "Wǒ", 3), C("很", "hěn", 3), C("累", "lèi", 4, pz="。")],
             [W("我", "wǒ", "I; me"), W("很", "hěn", "very; the usual link before an adjective"), W("累", "lèi", "tired")],
             "I'm tired.",
             "Wǒ hěn lèi",
             "A state: I'm tired. An adjective does not take 是. Say 我很累. The next card shows the form to avoid. 很 is the usual link before an adjective. Here it can be light, not a strong “very”. 我很 are two 3rd tones, so this page marks 我 as wó, and 很 stays low before 累.")
    add_line(a, sa, "s03",
             [C("我", "Wǒ", 3), C("是", "shì", 4), C("累", "lèi", 4, pz="。")],
             [W("我", "wǒ", "I; me"), W("是", "shì", "is; the verb “to be”"), W("累", "lèi", "tired")],
             "Incorrect form. Do not say this for “I'm tired.”",
             "Wǒ shì lèi",
             "Incorrect. Do not use 是 before an adjective. 我是累 is not how you say “I'm tired”. Use 我很累 or 我累了. 是 is for nouns: names, identity, and categories.")
    add_line(a, sa, "s04",
             [C("我", "Wǒ", 3), C("有", "yǒu", 3), C("點", "diǎn", 3, "点"), C("累", "lèi", 4, pz="。")],
             [W("我", "wǒ", "I; me"),
              W("有點", "yǒudiǎn", "a little; a bit (one chunk, not “have tired”)", "有点"),
              W("累", "lèi", "tired")],
             "I'm a little tired.",
             "Wǒ yǒu diǎn lèi",
             "I'm a little tired. 有点 is one chunk, “a little”. It does not mean “have” plus “tired”. The syllable that can sound like English “you” is 有 yǒu. It is not 你 nǐ. This chat did not use 一. A separate podcast page uses 有一点 for the same idea. Dictionary tones: Wǒ yǒu diǎn lèi. The marks on this card follow one 3rd-tone reading: wó yóu diǎn lèi.")
    add_line(a, sa, "s05",
             [C("但", "Dàn", 4), C("是", "shì", 4), C("我", "wǒ", 3), C("有", "yǒu", 3), C("新", "xīn", 1), C("鞋", "xié", 2, pz="。")],
             [W("但是", "dànshì", "but (one word; the 是 inside it is not the verb “to be”)"),
              W("我", "wǒ", "I; me"), W("有", "yǒu", "have"), W("新", "xīn", "new"), W("鞋", "xié", "shoe; shoes")],
             "But I have new shoes.",
             "Dànshì wǒ yǒu xīn xié",
             "但是 is one word, “but”. Do not translate the 是 inside it as “is”. 有 here really means “have”. 鞋 is shoe or shoes; Chinese does not mark a plural. Some speakers say 是 in 但是 with a neutral tone (dànshi). This card keeps the full 4th, shì, the form you were given.")
    add_line(a, sa, "s06",
             [C("棕", "zōng", 1), C("色", "sè", 4)],
             [W("棕色", "zōngsè", "brown")],
             "brown",
             "Zōngsè",
             "Brown. 棕 plus 色, “color”. 色 is citation sè, 4th tone. It can sound a little lighter inside 棕色. This card keeps sè.")
    add_line(a, sa, "s07",
             [C("棕", "zōng", 1), C("色", "sè", 4), C("的", "de", 5), C("鞋", "xié", 2)],
             [W("棕色", "zōngsè", "brown"), W("的", "de", "connector from a description to a noun"), W("鞋", "xié", "shoe; shoes")],
             "brown shoes",
             "Zōngsè de xié",
             "Brown shoes. 的 connects the description 棕色 to the noun 鞋. 的 is neutral.")
    add_line(a, sa, "s08",
             [C("新", "xīn", 1), C("的", "de", 5), C("棕", "zōng", 1), C("色", "sè", 4), C("鞋", "xié", 2), C("子", "zi", 5)],
             [W("新", "xīn", "new"), W("的", "de", "connector from a description to a noun"),
              W("棕色", "zōngsè", "brown"), W("鞋", "xié", "shoe"),
              W("子", "zi", "noun suffix, neutral; 鞋子 means shoes")],
             "new brown shoes",
             "Xīn de zōngsè xiézi",
             "New brown shoes. 的 connects a description to a noun. It is not a rigid rule that every adjective needs 的: 新鞋 and 新的鞋 both occur. A longer description such as 棕色 usually keeps 的. 子 is a neutral noun suffix.")
    add_line(b, sb, "s09",
             [C("但", "Dàn", 4), C("是", "shì", 4), C("你", "nǐ", 3), C("有", "yǒu", 3), C("腳", "jiǎo", 3, "脚", pz="。")],
             [W("但是", "dànshì", "but"), W("你", "nǐ", "you"), W("有", "yǒu", "have"),
              W("腳", "jiǎo", "foot; feet", "脚")],
             "But you have feet.",
             "Dànshì nǐ yǒu jiǎo",
             "Playful reply: But you have feet. 脚 is foot or feet. This card is language practice.")
    add_line(b, sb, "s10",
             [C("對", "Duì", 4, "对", pz="，"), C("我", "wǒ", 3), C("有", "yǒu", 3, pz="。")],
             [W("對", "duì", "yes; correct", "对"), W("我", "wǒ", "I; me"),
              W("有", "yǒu", "have (脚, feet, is understood from the line before)")],
             "Yes, I do.",
             "Duì, wǒ yǒu",
             "Yes, I do. 对 here means yes, or that's right. 有 means have. The thing you have, 脚, is understood from the line before. It is not stated again.")
    add_line(b, sb, "s11",
             [C("你", "Nǐ", 3), C("也", "yě", 3), C("有", "yǒu", 3), C("腳", "jiǎo", 3, "脚", pz="。")],
             [W("你", "nǐ", "you"), W("也", "yě", "also; too"), W("有", "yǒu", "have"),
              W("腳", "jiǎo", "foot; feet", "脚")],
             "You have feet too.",
             "Nǐ yě yǒu jiǎo",
             "You have feet too. 也 means also or too, and it goes before the verb 有. Dictionary tones: nǐ yě yǒu jiǎo. One reading for this row of 3rd tones: ní yé yóu jiǎo.")
    add_line(b, sb, "s12",
             [C("你", "Nǐ", 3), C("的", "de", 5), C("腳", "jiǎo", 3, "脚"), C("很", "hěn", 3), C("好", "hǎo", 3), C("看", "kàn", 4, pz="。")],
             [W("你", "nǐ", "you"), W("的", "de", "possession marker; 你的 = your"),
              W("腳", "jiǎo", "foot; feet", "脚"), W("很", "hěn", "degree link before an adjective"),
              W("好看", "hǎokàn", "good-looking")],
             "Your feet look nice.",
             "Nǐ de jiǎo hěn hǎokàn",
             "Your feet look nice. 你的 means your. 的 marks possession. 好看 is one word, good-looking. No 是. This is a playful compliment, stored as a sentence pattern.")
    add_line(b, sb, "s13",
             [C("腳", "Jiǎo", 3, "脚"), C("可", "kě", 3), C("以", "yǐ", 3), C("換", "huàn", 4, "换"), C("鞋", "xié", 2, pz="。")],
             [W("腳", "jiǎo", "foot; feet", "脚"), W("可以", "kěyǐ", "can; may"),
              W("換", "huàn", "to change; to swap", "换"), W("鞋", "xié", "shoe; shoes")],
             "Feet can change shoes.",
             "Jiǎo kěyǐ huàn xié",
             "Playful line: Feet can change shoes. 可以 means can. 换 means to change or to swap. It is a joke about shoes coming on and off.")
    add_line(b, sb, "s14",
             [C("我", "Wǒ", 3), C("喜", "xǐ", 3), C("歡", "huan", 5, "欢"), C("我", "wǒ", 3), C("的", "de", 5),
              C("新", "xīn", 1), C("棕", "zōng", 1), C("色", "sè", 4), C("鞋", "xié", 2), C("子", "zi", 5, pz="。")],
             [W("我", "wǒ", "I; me"), W("喜歡", "xǐhuan", "to like (second syllable neutral)", "喜欢"),
              W("我", "wǒ", "me; my"), W("的", "de", "possession marker; 我的 = my"),
              W("新", "xīn", "new"), W("棕色", "zōngsè", "brown"), W("鞋", "xié", "shoe"),
              W("子", "zi", "noun suffix, neutral; 鞋子 means shoes")],
             "I like my new brown shoes.",
             "Wǒ xǐhuan wǒ de xīn zōngsè xiézi",
             "I like my new brown shoes. In 喜欢 the second syllable 欢 is neutral: xǐhuan. Do not give it a full first tone. 我的 means my.")
    add_line(b, sb, "s15",
             [C("你", "Nǐ", 3), C("也", "yě", 3), C("喜", "xǐ", 3), C("歡", "huan", 5, "欢"), C("嗎", "ma", 5, "吗", pz="？")],
             [W("你", "nǐ", "you"), W("也", "yě", "also; too"),
              W("喜歡", "xǐhuan", "to like (the shoes are understood, not repeated)", "喜欢"),
              W("嗎", "ma", "yes/no question particle", "吗")],
             "Do you like them too?",
             "Nǐ yě xǐhuan ma?",
             "Question pattern: Do you like them too? The shoes are the object, and they are understood. 吗 sits at the end and makes a yes/no question. Word order stays subject 你, then 也, then 喜欢, then 吗. This asks whether you like them. The message that was actually sent is the next card, a statement, with no 吗.")
    add_line(b, sb, "s16",
             [C("你", "Nǐ", 3), C("也", "yě", 3), C("喜", "xǐ", 3), C("歡", "huan", 5, "欢", pz="！")],
             [W("你", "nǐ", "you (the subject)"), W("也", "yě", "also; too"),
              W("喜歡", "xǐhuan", "to like (them; the object is understood)", "喜欢")],
             "You like them too!",
             "Nǐ yě xǐhuan!",
             "This is the line that was sent. Meaning: You like them too. 你 is the subject. The sentence that means “I like you too” is 我也喜欢你, on the next card. In that sentence 你 comes after 喜欢 and is the object. It was a different sentence, added here for comparison.")
    add_line(b, sb, "s17",
             [C("我", "Wǒ", 3), C("也", "yě", 3), C("喜", "xǐ", 3), C("歡", "huan", 5, "欢"), C("你", "nǐ", 3, pz="。")],
             [W("我", "wǒ", "I; me"), W("也", "yě", "also; too"), W("喜歡", "xǐhuan", "to like", "喜欢"),
              W("你", "nǐ", "you (the object, after the verb)")],
             "I like you too.",
             "Wǒ yě xǐhuan nǐ",
             "Added for comparison. This was not the message that was sent. 我也喜欢你 means “I like you too”: subject 我, verb 喜欢, object 你 after the verb. 你也喜欢 means “You like them too”. Word order decides who likes whom. The card is here so the two patterns stay distinct. The tone of the chat was playful. These cards teach the words.")
    add_line(c, sc, "s18",
             [C("你", "Nǐ", 3), C("真", "zhēn", 1), C("棒", "bàng", 4, pz="。")],
             [W("你", "nǐ", "you"), W("真", "zhēn", "really; truly"), W("棒", "bàng", "great; awesome")],
             "You're awesome. / You did great.",
             "Nǐ zhēn bàng",
             "A clean, friendly compliment: You're awesome, or You did great. 真 means really. 棒 means great. No 是.")
    add_line(c, sc, "s19",
             [C("牛", "niú", 2), C("逼", "bī", 1)],
             [W("牛", "niú", "cow; in slang, impressive"),
              W("逼", "bī", "in 牛逼, a written stand-in for vulgar 屄; not the ordinary verb “to force / compel”")],
             "Vulgar slang: fucking awesome / badass.",
             "Niúbī",
             "Casual and vulgar: “fucking awesome” or “badass”. 牛 is “cow”, and in slang “impressive”. 逼 in this compound is a euphemistic written substitute for the vulgar character 屄. It is not the ordinary dictionary meaning of 逼, which is “to force” or “to compel”. Cleaner choices are 牛 alone, and 你真棒.")
    add_line(c, sc, "s20",
             [C("牛", "niú", 2)],
             [W("牛", "niú", "cow; cleaner slang for awesome or impressive")],
             "Awesome / impressive (cleaner slang).",
             "Niú",
             "Added as the cleaner slang. 牛 alone can mean awesome or impressive, without the vulgar second syllable of 牛逼.")
    add_line(d, sd, "s21",
             [C("我", "Wǒ", 3), C("沒", "méi", 2, "没"), C("有", "yǒu", 3), C("腳", "jiǎo", 3, "脚", pz="。")],
             [W("我", "wǒ", "I; me"), W("沒有", "méiyǒu", "do not have (the negative of 有; not 不有)", "没有"),
              W("腳", "jiǎo", "foot; feet", "脚")],
             "I don't have feet.",
             "Wǒ méiyǒu jiǎo",
             "Later playful reply. The message opened with laughter, hahaha. The laughter is not a Chinese sentence, so it is not a study line. 我没有脚 means “I don't have feet”. 没有 is the negative of 有. Use 没 to negate 有. 不有 is not the pattern.")
    add_line(d, sd, "s22",
             [C("我", "Wǒ", 3), C("有", "yǒu", 3), C("尾", "wěi", 3), C("巴", "ba", 5, pz="。")],
             [W("我", "wǒ", "I; me"), W("有", "yǒu", "have"), W("尾巴", "wěiba", "tail (巴 is neutral)")],
             "I have a tail.",
             "Wǒ yǒu wěiba",
             "Playful: I have a tail. 尾巴 means tail. 巴 is neutral. The next card is a fragment that describes this tail. Read them together.")
    add_line(d, sd, "s23",
             [C("見", "Jiàn", 4, "见"), C("到", "dào", 4), C("你", "nǐ", 3), C("就", "jiù", 4),
              C("會", "huì", 4, "会"), C("晃", "huàng", 4), C("的", "de", 5), C("尾", "wěi", 3), C("巴", "ba", 5)],
             [W("見到", "jiàndào", "to see (到 marks the seeing as achieved)", "见到"),
              W("你", "nǐ", "you"), W("就", "jiù", "then; as soon as"), W("會", "huì", "will; tends to", "会"),
              W("晃", "huàng", "to wag; to sway"), W("的", "de", "attaches this description to the noun"),
              W("尾巴", "wěiba", "tail (巴 is neutral)")],
             "Fragment: a tail that wags when [I] see you.",
             "Jiàn dào nǐ jiù huì huàng de wěiba",
             "Fragment. It connects to the previous card, 我有尾巴. Together: I have a tail, a tail that wags when [I] see you. The subject “I” is understood from that line. It is not repeated. 见到 means see. 就 means then, or as soon as. 会 means will, or tends to. 晃 huàng, 4th tone, means wag or sway. 的 attaches the description to 尾巴.")
    add_line(d, sd, "s24",
             [C("你", "Nǐ", 3), C("怎", "zěn", 3), C("麼", "me", 5, "么"), C("知", "zhī", 1), C("道", "dào", 4),
              C("我", "wǒ", 3), C("喜", "xǐ", 3), C("不", "bù", 4), C("喜", "xǐ", 3), C("歡", "huan", 5, "欢")],
             [W("你", "nǐ", "you"), W("怎麼", "zěnme", "how", "怎么"), W("知道", "zhīdào", "to know"),
              W("我", "wǒ", "I; me"),
              W("喜不喜歡", "xǐ bu xǐhuan", "whether [I] like (A-not-A: like or not, inside the sentence)", "喜不喜欢")],
             "How do you know whether I like… (first of two messages)",
             "Nǐ zěnme zhīdào wǒ xǐ bu xǐhuan",
             "First of two split messages. Read it with the next card. Together they mean: How do you know whether I like your new shoes? 喜不喜欢 is the A-not-A pattern, “like or not”, set inside the sentence to mean “whether [I] like”. It does not use 吗. 不 stays bù because the next syllable 喜 is 3rd tone. 不 changes to bú only before a 4th tone. 怎么 means how. 知道 means know. The split is only how the two messages were sent.")
    add_line(d, sd, "s25",
             [C("你", "Nǐ", 3), C("的", "de", 5), C("新", "xīn", 1), C("鞋", "xié", 2)],
             [W("你", "nǐ", "you"), W("的", "de", "possession marker; 你的 = your"),
              W("新", "xīn", "new"), W("鞋", "xié", "shoe; shoes")],
             "your new shoes (second message; the object of 喜欢)",
             "Nǐ de xīn xié",
             "Second message, split from the previous one. 你的新鞋 is the object of 喜欢. Read together with the previous card: How do you know whether I like your new shoes? The split does not add a new grammar pattern.")
    add_line(d, sd, "s26",
             [C("我", "Wǒ", 3), C("喜", "xǐ", 3), C("歡", "huan", 5, "欢"), C("貓", "māo", 1, "猫", pz="、"),
              C("海", "hǎi", 3), C("豚", "tún", 2, pz="、"), C("棕", "zōng", 1), C("色", "sè", 4), C("的", "de", 5),
              C("新", "xīn", 1), C("鞋", "xié", 2), C("和", "hé", 2), C("你", "nǐ", 3, pz="。")],
             [W("我", "wǒ", "I; me"), W("喜歡", "xǐhuan", "to like", "喜欢"), W("貓", "māo", "cat; cats", "猫"),
              W("海豚", "hǎitún", "dolphin; dolphins"), W("棕色", "zōngsè", "brown"),
              W("的", "de", "connector from a description to a noun"), W("新", "xīn", "new"),
              W("鞋", "xié", "shoe; shoes"), W("和", "hé", "and"), W("你", "nǐ", "you")],
             "I like cats, dolphins, new brown shoes, and you.",
             "Wǒ xǐhuan māo, hǎitún, zōngsè de xīn xié hé nǐ",
             "Anonymized wording. A personal name in the source sentence was replaced with 我 at the start and 你 at the end. Study the list. 和 means and, and it stands before the last item. 棕色的新鞋 means new brown shoes: brown, then 的, then new, then shoes. The tone of the chat was playful. This card teaches the list pattern.")
    add_line(d, sd, "s27",
             [C("這", "Zhè", 4, "这"), C("個", "ge", 5, "个"), C("句", "jù", 4), C("子", "zi", 5),
              C("聽", "tīng", 1, "听"), C("起", "qǐ", 3), C("來", "lai", 5, "来"), C("很", "hěn", 3), C("怪", "guài", 4, pz="。")],
             [W("這個", "zhège", "this (个 is usually neutral; citation tone gè)", "这个"),
              W("句子", "jùzi", "sentence (子 is neutral)"),
              W("聽起來", "tīng qǐlai", "sounds; seems when heard (来 is usually neutral; not the verb “get up”)", "听起来"),
              W("很", "hěn", "very"), W("怪", "guài", "strange; odd")],
             "This sentence sounds very strange.",
             "Zhège jùzi tīng qǐlai hěn guài",
             "This sentence sounds very strange. 这个: 个 is usually neutral in speech. Its citation tone is gè. 句子: 子 is neutral. The u in 句 is ü: say “ee”, then round the lips. After j, q, x, and y the two dots are not written. 听起来 means “sounds”, the impression when you hear something. Do not read 起来 here as the verb “get up”. 来 in this pattern is usually neutral. Citation tone of 来 is lái. 怪 means strange. No 是 before 怪.")
    return a, b, c, d


def build_vocab():
    v, seen = [], set()
    rows = [
        ("v01", "Tired", "累", "lèi", "tired", "4th tone. ei as in vein.", [C("累", "lèi", 4)]),
        ("v02", "Tired", "了", "le", "change-of-state particle", "Neutral. In 我累了 it marks a new situation. It does not mean English “have”.", [C("了", "le", 5)]),
        ("v03", "Tired", "很", "hěn", "very; link before an adjective", "Often light, not a strong “very”. Adjective sentences use 很, not 是.", [C("很", "hěn", 3)]),
        ("v04", "Tired", "有點", "yǒudiǎn", "a little; a bit", "One chunk. Not “have tired”. yǒu can remind an English ear of “you”. It is 有, not 你.", [C("有", "yǒu", 3), C("點", "diǎn", 3, "点")], "有点"),
        ("v05", "Tired", "是", "shì", "to be (am / is / are)", "Use with nouns. Do not put 是 before an adjective such as 累.", [C("是", "shì", 4)]),
        ("v06", "People", "我", "wǒ", "I; me", "3rd tone. Low half-third before most other tones. uo as in waw, with no r.", [C("我", "wǒ", 3)]),
        ("v07", "People", "你", "nǐ", "you", "Everyday “you”. 3rd tone.", [C("你", "nǐ", 3)]),
        ("v08", "Shoes", "但是", "dànshì", "but", "One conjunction. The 是 inside it is not the verb “to be”.", [C("但", "dàn", 4), C("是", "shì", 4)]),
        ("v09", "Shoes", "有", "yǒu", "to have", "Real possession in 我有新鞋. Inside 有点 it is part of the chunk “a little”.", [C("有", "yǒu", 3)]),
        ("v10", "Shoes", "新", "xīn", "new", "1st tone. x is Position 1: tongue tip behind the bottom teeth.", [C("新", "xīn", 1)]),
        ("v11", "Shoes", "鞋", "xié", "shoe; shoes", "2nd tone. No plural marker. x is Position 1. ie as in yet.", [C("鞋", "xié", 2)]),
        ("v12", "Shoes", "棕色", "zōngsè", "brown", "棕 plus 色, color. 色 is citation 4th tone.", [C("棕", "zōng", 1), C("色", "sè", 4)]),
        ("v13", "Connectors", "的", "de", "description / possession connector", "Neutral. 棕色的鞋, 我的, 你的. Not required on every short adjective. 新鞋 can omit it.", [C("的", "de", 5)]),
        ("v14", "Connectors", "子", "zi", "noun suffix", "Neutral. 鞋子 shoes, 句子 sentence. The i is a buzz, not “ee”.", [C("子", "zi", 5)]),
        ("v15", "Shoes", "鞋子", "xiézi", "shoes", "鞋 plus neutral 子.", [C("鞋", "xié", 2), C("子", "zi", 5)]),
        ("v16", "Play", "腳", "jiǎo", "foot; feet", "3rd tone. j is Position 1. iao is one syllable.", [C("腳", "jiǎo", 3, "脚")], "脚"),
        ("v17", "Play", "對", "duì", "yes; correct", "Here, “yes / that's right”, in 对，我有.", [C("對", "duì", 4, "对")], "对"),
        ("v18", "Play", "也", "yě", "also; too", "Stands before the verb: 你也有, 你也喜欢.", [C("也", "yě", 3)]),
        ("v19", "Play", "好看", "hǎokàn", "good-looking", "One word. No 是. 好 is 3rd and stays low before 看, 4th.", [C("好", "hǎo", 3), C("看", "kàn", 4)]),
        ("v20", "Play", "可以", "kěyǐ", "can; may", "Two 3rd tones. This page says ké yǐ when the word stands alone.", [C("可", "kě", 3), C("以", "yǐ", 3)]),
        ("v21", "Play", "換", "huàn", "to change; to swap", "4th tone. In 脚可以换鞋, shoes get swapped.", [C("換", "huàn", 4, "换")], "换"),
        ("v22", "Like", "喜歡", "xǐhuan", "to like", "Second syllable 欢 is neutral. Say xǐhuan, not a full first tone on 欢.", [C("喜", "xǐ", 3), C("歡", "huan", 5, "欢")], "喜欢"),
        ("v23", "Like", "嗎", "ma", "yes/no question particle", "Neutral. End of the sentence: 你也喜欢吗. The words stay in statement order.", [C("嗎", "ma", 5, "吗")], "吗"),
        ("v24", "Register", "真", "zhēn", "really; truly", "1st tone. zh is Position 2.", [C("真", "zhēn", 1)]),
        ("v25", "Register", "棒", "bàng", "great; awesome", "4th tone. Clean compliment with 真: 你真棒.", [C("棒", "bàng", 4)]),
        ("v26", "Register", "真棒", "zhēn bàng", "really great; awesome", "你真棒: You're awesome / You did great. No 是.", [C("真", "zhēn", 1), C("棒", "bàng", 4)]),
        ("v27", "Register", "牛", "niú", "cow; slang for impressive", "Cleaner slang than 牛逼. 牛 alone can mean awesome.", [C("牛", "niú", 2)]),
        ("v28", "Register", "牛逼", "niúbī", "vulgar: fucking awesome / badass", "Casual and vulgar. 逼 here stands in for 屄. Ordinary 逼 means to force or compel. Prefer 牛 or 你真棒.", [C("牛", "niú", 2), C("逼", "bī", 1)]),
        ("v29", "Later", "沒有", "méiyǒu", "do not have", "Negative of 有. Not 不有.", [C("沒", "méi", 2, "没"), C("有", "yǒu", 3)], "没有"),
        ("v30", "Later", "尾巴", "wěiba", "tail", "巴 is neutral.", [C("尾", "wěi", 3), C("巴", "ba", 5)]),
        ("v31", "Later", "見到", "jiàndào", "to see", "到 marks the result: the seeing happens.", [C("見", "jiàn", 4, "见"), C("到", "dào", 4)], "见到"),
        ("v32", "Later", "就", "jiù", "then; as soon as", "Pairs with a condition: when X, then Y.", [C("就", "jiù", 4)]),
        ("v33", "Later", "會", "huì", "will; tends to", "4th tone. In the fragment: the tail will wag.", [C("會", "huì", 4, "会")], "会"),
        ("v34", "Later", "晃", "huàng", "to wag; to sway", "4th tone for this meaning. h is a light scratch. Ends in -ng.", [C("晃", "huàng", 4)]),
        ("v35", "Later", "怎麼", "zěnme", "how", "么 is neutral. z is Position 3.", [C("怎", "zěn", 3), C("麼", "me", 5, "么")], "怎么"),
        ("v36", "Later", "知道", "zhīdào", "to know", "知 1st, 道 4th. zh is Position 2.", [C("知", "zhī", 1), C("道", "dào", 4)]),
        ("v37", "Later", "喜不喜歡", "xǐ bu xǐhuan", "whether [someone] likes", "A-not-A inside the sentence. No 吗. 不 stays bù before 3rd-tone 喜.", [C("喜", "xǐ", 3), C("不", "bù", 4), C("喜", "xǐ", 3), C("歡", "huan", 5, "欢")], "喜不喜欢"),
        ("v38", "List", "貓", "māo", "cat; cats", "1st tone. No plural marker.", [C("貓", "māo", 1, "猫")], "猫"),
        ("v39", "List", "海豚", "hǎitún", "dolphin; dolphins", "海 is 3rd and stays low before 豚, 2nd.", [C("海", "hǎi", 3), C("豚", "tún", 2)]),
        ("v40", "List", "和", "hé", "and", "Before the last item in a list.", [C("和", "hé", 2)]),
        ("v41", "Comment", "這個", "zhège", "this", "个 is usually neutral. Citation tone of 个 is gè.", [C("這", "zhè", 4, "这"), C("個", "ge", 5, "个")], "这个"),
        ("v42", "Comment", "句子", "jùzi", "sentence", "子 is neutral. The u in 句 is ü.", [C("句", "jù", 4), C("子", "zi", 5)]),
        ("v43", "Comment", "聽起來", "tīng qǐlai", "sounds; seems when heard", "Not the verb “get up”. 来 is usually neutral here. Citation lái.", [C("聽", "tīng", 1, "听"), C("起", "qǐ", 3), C("來", "lai", 5, "来")], "听起来"),
        ("v44", "Comment", "怪", "guài", "strange; odd", "Adjective. 很怪, with no 是.", [C("怪", "guài", 4)]),
    ]
    for row in rows:
        simp = row[7] if len(row) == 8 else None
        vid, grp, trad, py, en, note, cells = row[:7]
        add_vocab(v, seen, vid, grp, trad, py, en, note, cells, simp)
    return v


def hint(word_t, py, hint_text, audio, word_s=None):
    item = {"word": {"t": word_t}, "py": py, "hint": hint_text}
    if word_s and word_s != word_t:
        item["word"]["s"] = word_s
    if audio:
        item["audio"] = audio
    return item


def build_entry(lines_a, lines_b, lines_c, lines_d, vocab):
    by_id = {item["id"]: item for item in vocab}
    def aud(vid):
        return by_id[vid]["audio"]
    phrase_src = [ln for group in (lines_a, lines_b, lines_c, lines_d) for ln in group if not ln["note"].startswith("Incorrect")]
    def drills(kind, tag, sources, lead):
        items = []
        for src in sources:
            items.append({
                "kind": kind,
                "tag": tag,
                "prompt": src["en"],
                "en": src["en"],
                "py": src["py"],
                "note": src.get("note") or "",
                "cells": src["cells"],
                "words": src["words"],
                "audio": src.get("audio") or [],
            })
        return {"type": "drill", "title": tag, "lead": lead, "items": items}
    entry = {
        "schema": 1,
        "id": ENTRY_ID,
        "kind": "conversation",
        "script": "hans",
        "source": "Conversation Practice",
        "title": "New shoes & playful replies",
        "short": "Nov 7 · New shoes",
        "subtitle": "Nov 7, 2026 · tired, new brown shoes, playful replies",
        "date": DATE,
        "emoji": "👟",
        "color": "#0B7285",
        "kick": "Nov 7, 2026 · a chat turned into study cards · names removed · playful language practice",
        "focus": "了 as a new situation · no 是 before adjectives · 有点 · 的 · 也 / 吗 / word order · xǐhuan · 喜不喜欢",
        "key": '<span class="syn">synthetic</span> = a computer voice (edge-tts, Taiwan HsiaoChen), not a person and not a recording from the chat. Tap a card to play it. The bar at the bottom moves with ⟲10 and 10⟳. Simplified characters are the main script on this page. Grey characters are traditional. ☰ Options flips the script and can hide pinyin or English. The pinyin line under the English is the dictionary reading, with tone marks. Teal ↗ and “said …” mark a tone change: in a row of 3rd tones, every one except the last rises. Blue ↓ is a half-third, low, with no rise. One reading is marked. Speakers also group by word, so a voice may differ. The marks are a rule of thumb, not a measurement. <a href="standalone/2026-11-07-new-shoes.html">Single-file copy of this entry</a>.',
        "foot": "Study cards from a chat on Nov 7, 2026. Personal names, contact details, and screenshots are not included. An English joke that used a wingman and a screenshot is described only in general, in the cards below. Synthetic clips are computer speech. Tone changes are by rule, not measured from a voice.",
        "sections": [
            {"type": "lines", "title": "Tired, then new shoes",
             "kick": "The exchange starts here, with “I'm tired”. These are not class notes and not the podcast page.",
             "items": lines_a},
            {"type": "lines", "title": "Feet, shoes, and 喜欢",
             "kick": "Playful replies, as study cards.",
             "items": lines_b},
            {"type": "lines", "title": "Awesome, clean and vulgar",
             "kick": "A friendly compliment, then a register warning.",
             "items": lines_c},
            {"type": "lines", "title": "Tail, whether, and a strange sentence",
             "kick": "Later messages. One line is a fragment. Two messages are one question.",
             "items": lines_d},
            {"type": "vocab", "title": "Vocabulary", "zh": {"t": "生詞", "s": "生词"},
             "kick": "Tap a word. The badge says synthetic: computer voice, Taiwan HsiaoChen.",
             "items": vocab},
            {"type": "cards", "title": "Grammar in plain English",
             "kick": "Each sentence above already has a word-by-word breakdown.",
             "items": [
                 ["Three tired sentences", "我累了 Wǒ lèi le means you have gotten tired. 了 marks a new situation. It does not mean English “have”. 我很累 Wǒ hěn lèi means “I'm tired”, and an adjective takes no 是. 我有点累 Wǒ yǒu diǎn lèi means “I'm a little tired”. 有点 is one chunk. yǒu can sound a bit like English “you”. It is 有, not 你."],
                 ["是 is for nouns", "我是累 is on a card above so it can be avoided. Save 是 for identity and categories. For adjectives, use 很, or 了 when the state is new."],
                 ["的 connects", "的 de, neutral, links a description to a noun (棕色的鞋, 新的鞋子) and marks possession (我的, 你的). A short phrase can drop it: 新鞋. A longer description usually keeps it. There is no rule that every adjective must have 的."],
                 ["也, 吗, and word order", "也 yě means also or too and stands before the verb. 吗 ma makes a yes/no question and stands at the end. 你也喜欢吗 asks “Do you like them too?” The object can be left out. 你也喜欢！ states “You like them too!” That is the message that was sent. 我也喜欢你 means “I like you too”, because 你 follows 喜欢 and is the object. The chat sent 你也喜欢, and the object sentence was added on this page for comparison."],
                 ["喜不喜欢, said in two messages", "喜不喜欢 xǐ bu xǐhuan puts “like or not” inside the sentence: whether someone likes something. It does not use 吗. 不 stays bù before 喜, which is 3rd tone. 不 becomes bú only before a 4th tone. The question arrived as two messages: 你怎么知道我喜不喜欢 and then 你的新鞋. Together: How do you know whether I like your new shoes?"],
                 ["没有, 就, 会, 晃", "没有 méiyǒu means “don't have”. Negate 有 with 没. 就 jiù means then, or as soon as. 会 huì means will, or tends to. 晃 huàng, 4th tone, means wag or sway. 见到你就会晃的尾巴 is a fragment on 我有尾巴: a tail that wags when I see you."],
                 ["Clean compliment and vulgar slang", "你真棒 Nǐ zhēn bàng is “You're awesome” or “You did great”. 真 is really. 棒 is great. 牛 niú alone is casual slang for impressive. 牛逼 niúbī is casual and vulgar: “fucking awesome” or “badass”. In that slang word, 逼 is a written stand-in for 屄. Ordinary 逼 means “to force” or “to compel”. Prefer 你真棒 or 牛 when you want the clean wording."],
                 ["What was left off the page", "The list sentence is anonymized wording. A personal name was replaced with 我 and with 你. An English joke in the chat used a wingman and a screenshot. The personal wording is not stored here. No photos and no contact details are on this page. The playful lines are language study."],
                 ["How the tone marks are chosen", "Dictionary tones are the pinyin with tone marks. Where several 3rd tones sit together, this page raises every 3rd except the last. The last 3rd stays low when another tone follows, and it can dip at a pause. 喜欢 is xǐhuan, with 欢 neutral. A speaker may group the words another way. Copy the marks, then trust your ear."],
             ]},
            {"type": "hints", "title": "Sounds to watch",
             "kick": "Tap a card. The voice is synthetic.",
             "items": [
                 hint("了", "le", "Neutral tone, light and low after the 4th in 累了. Meaning: a new situation. Not English “have”.", aud("v02")),
                 hint("有點", "yǒudiǎn", "One chunk, “a little”. yǒu is 有. It can sound like English “you”. It is not 你 nǐ.", aud("v04"), "有点"),
                 hint("鞋", "xié", "x is Position 1, tip behind the bottom teeth. ie as in yet. Shoe or shoes, with no plural marker.", aud("v11")),
                 hint("的", "de", "Neutral. Connects a description (棕色的鞋) or marks possession (我的, 你的). Short phrases can omit it.", aud("v13")),
                 hint("子", "zi", "Neutral suffix. z is Position 3. The i is a buzz, not “ee”. 鞋子 shoes, 句子 sentence.", aud("v14")),
                 hint("腳", "jiǎo", "j is Position 1. iao is one smooth syllable. Foot or feet.", aud("v16"), "脚"),
                 hint("喜歡", "xǐhuan", "Second syllable neutral. Say xǐhuan. x is Position 1.", aud("v22"), "喜欢"),
                 hint("嗎", "ma", "Neutral yes/no particle at the end. Statement word order, then 吗.", aud("v23"), "吗"),
                 hint("牛逼", "niúbī", "Both syllables keep a full tone. Casual and vulgar. 逼 here stands in for 屄, not the verb “to force”. The b has no puff.", aud("v28")),
                 hint("晃", "huàng", "4th tone when it means wag or sway. h is a light scratch. -ng goes out through the nose.", aud("v34")),
                 hint("句", "jù", "The u is ü. Say “ee”, then round the lips. After j, q, x, and y the dots are not written.", aud("v42")),
                 hint("怎麼", "zěnme", "z is Position 3. en is a quick “uh”. 么 is neutral.", aud("v35"), "怎么"),
                 hint("這個", "zhège", "个 is usually neutral. zh is Position 2. The e in 这 is “uh”.", aud("v41"), "这个"),
                 hint("聽起來", "tīng qǐlai", "Means “sounds”. 来 is usually neutral. This is not the verb “get up”. t in 听 has a puff of air.", aud("v43"), "听起来"),
             ],
             "cards": []},
            drills("en", "Vocabulary recall", vocab, "Read the English. Say the Chinese. Then reveal characters, pinyin, and the meaning."),
            drills("zh", "Vocabulary flip", vocab, "Read the characters. Say the English. Then reveal. ☰ Options can hide pinyin if you want a stricter pass."),
            drills("en", "Phrase recall", phrase_src, "Read the English. Say the sentence. Then reveal the score, the dictionary pinyin, and each word."),
            drills("zh", "Phrase flip", phrase_src, "Read the characters. Say the English. Then reveal. The incorrect 是 card is left out of the drills so it is not the form you practice."),
        ],
    }
    return entry


def validate(entry):
    blob = json.dumps(entry, ensure_ascii=False)
    lines = []
    for section in entry["sections"]:
        if section["type"] == "lines":
            lines.extend(section["items"])
    trad = "\n".join(trad_text(ln["cells"]) for ln in lines)
    simp = "\n".join(simp_text(ln["cells"]) for ln in lines)
    folded = blob.casefold()
    required = [
        "i'm tired", "gotten tired", "change of state", "a little", "yǒu",
        "but i have new shoes", "brown shoes", "new brown shoes", "but you have feet",
        "yes, i do", "you have feet too", "your feet look nice", "feet can change shoes",
        "i like my new brown shoes", "do you like them too", "you like them too",
        "i like you too", "you did great", "badass", "屄", "i don't have feet",
        "i have a tail", "fragment", "wag", "whether", "how do you know",
        "anonymized wording", "dolphins", "sounds very strange", "wingman",
        "synthetic", "xǐhuan", "as soon as", "to force",
    ]
    missing = [s for s in required if s not in folded]
    trad_need = [
        "我有點累", "但是你有腳", "你也有腳", "你的腳很好看", "腳可以換鞋",
        "我喜歡我的新棕色鞋子", "你也喜歡嗎", "我也喜歡你", "我沒有腳",
        "見到你就會晃的尾巴", "你怎麼知道我喜不喜歡", "這個句子聽起來很怪",
        "新的棕色鞋子", "棕色的鞋", "我喜歡貓",
    ]
    simp_need = [
        "我累了", "我很累", "我有点累", "但是我有新鞋", "棕色的鞋", "新的棕色鞋子",
        "但是你有脚", "对，我有", "你也有脚", "你的脚很好看", "脚可以换鞋",
        "我喜欢我的新棕色鞋子", "你也喜欢吗", "你也喜欢！", "我也喜欢你",
        "你真棒", "牛逼", "我没有脚", "我有尾巴", "见到你就会晃的尾巴",
        "你怎么知道我喜不喜欢", "你的新鞋", "我喜欢猫、海豚、棕色的新鞋和你",
        "这个句子听起来很怪",
    ]
    missing += [s for s in trad_need if s not in trad]
    missing += [s for s in simp_need if s not in simp]
    if missing:
        raise SystemExit("missing teaching points: " + " | ".join(missing))
    forbidden = ["田佳森", "佳森", "Chunhua", "Gloria", "王明文", "@", "http://", "https://", ".png", ".jpg", ".jpeg", ".webp", ".gif"]
    found = [s for s in forbidden if s in blob]
    if found:
        raise SystemExit("private or external material in entry: " + " ".join(found))
    lines = []
    for section in entry["sections"]:
        if section["type"] == "lines":
            lines.extend(section["items"])
    if simp_text(lines[0]["cells"]) != "我累了。":
        raise SystemExit("entry does not start at 我累了")
    drills = [s for s in entry["sections"] if s["type"] == "drill"]
    kinds = {(s["items"][0]["kind"], s["items"][0]["tag"]) for s in drills}
    if ("en", "Vocabulary recall") not in kinds or ("zh", "Phrase flip") not in kinds:
        raise SystemExit(f"drills missing: {kinds}")
    for section in drills:
        for item in section["items"]:
            if item["note"].startswith("Incorrect"):
                raise SystemExit("incorrect sentence leaked into drills")
            if not item["words"] or not item["cells"] or not item["en"]:
                raise SystemExit("drill item incomplete")
    huan_cells = [c for section in entry["sections"] if section["type"] in ("lines", "vocab") for item in section["items"] for c in item["cells"] if c.get("ch") == "歡"]
    if not huan_cells or any(c["t"] != 5 or c["py"] != "huan" for c in huan_cells):
        raise SystemExit("欢 must be neutral huan")
    if entry["script"] != "hans" or entry["kind"] != "conversation":
        raise SystemExit("script/kind")
    print(f"validated {len(lines)} sentences, {len(JOBS)} clips")


INDEX = {
    "entries": [{
        "id": ENTRY_ID,
        "title": "New shoes & playful replies",
        "subtitle": "Nov 7, 2026 · tired, new brown shoes, playful replies",
        "short": "Nov 7 · New shoes",
        "source": "Conversation Practice",
        "kind": "conversation",
        "date": DATE,
        "emoji": "👟",
        "color": "#0B7285",
        "tags": ["conversation", "2026-11-07"],
    }]
}


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


async def synth():
    import edge_tts
    manifest_path = AUDIO_DIR / "manifest.json"
    manifest = {}
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    sem = asyncio.Semaphore(5)

    async def one(file_id, text, path: Path):
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        if path.exists() and path.stat().st_size > 800 and manifest.get(file_id) == digest:
            return file_id, digest
        last = None
        async with sem:
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(text, VOICE).save(str(path))
                    if path.stat().st_size < 800:
                        raise RuntimeError("short file")
                    head = path.read_bytes()[:3]
                    if head != b"ID3" and head[0] != 0xFF:
                        raise RuntimeError("not an mp3")
                    print("tts", file_id, path.stat().st_size)
                    return file_id, digest
                except Exception as exc:  # network or decode
                    last = exc
                    await asyncio.sleep(0.8 * (attempt + 1))
        raise RuntimeError(f"{file_id}: {last}")

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    results = await asyncio.gather(*(one(*job) for job in JOBS))
    manifest_path.write_text(json.dumps(dict(results), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def safe_js(text: str) -> str:
    return text.replace("</", "<\\/")


def build_standalone(entry):
    css = (ROOT / "viewer.css").read_text(encoding="utf-8") + "\n" + (ROOT / "app.css").read_text(encoding="utf-8")
    legend = (ROOT / "legend.js").read_text(encoding="utf-8")
    app = (ROOT / "app.js").read_text(encoding="utf-8")
    audio = {}
    for path in sorted(AUDIO_DIR.glob("*.mp3")):
        audio[f"audio/{path.name}"] = "data:audio/mpeg;base64," + base64.b64encode(path.read_bytes()).decode("ascii")
    embed = {
        "conversations/index.json": INDEX,
        "conversations/cp_2026_11_07/entry.json": entry,
        "lessons/index.json": {"lessons": []},
    }
    shell = (ROOT / "index.html").read_text(encoding="utf-8")
    body = shell.split("<body>", 1)[1].split("<script", 1)[0]
    html = f"""<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow,noarchive">
<title>New shoes &amp; playful replies · Mandarin 老師</title>
<style>
{css}
</style>
</head>
<body>
{body}
<script>
window.AUDIO = {safe_js(json.dumps(audio, ensure_ascii=False))};
window.EMBED = {safe_js(json.dumps(embed, ensure_ascii=False))};
(function(){{
  var orig = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function(u, opt){{
    var key = String(u).split("#")[0].split("?")[0].replace(/^\\.\\//, "");
    if (Object.prototype.hasOwnProperty.call(window.EMBED, key)) {{
      return Promise.resolve(new Response(JSON.stringify(window.EMBED[key]), {{status:200, headers:{{"Content-Type":"application/json"}}}}));
    }}
    if (orig) return orig(u, opt);
    return Promise.reject(new Error("missing "+key));
  }};
  if (!location.hash || location.hash === "#" || location.hash === "#/") location.hash = "#/practice/cp_2026_11_07";
}})();
</script>
<script>
{safe_js(legend)}
</script>
<script>
{safe_js(app)}
</script>
</body>
</html>
"""
    out = ROOT / "standalone" / "2026-11-07-new-shoes.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"standalone {out} bytes {out.stat().st_size}")
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--html-only", action="store_true")
    parser.add_argument("--no-tts", action="store_true")
    args = parser.parse_args()
    if args.html_only:
        entry = json.loads((ENTRY_DIR / "entry.json").read_text(encoding="utf-8"))
        build_standalone(entry)
        return
    lines = build_lines()
    vocab = build_vocab()
    entry = build_entry(*lines, vocab)
    validate(entry)
    write_json(ROOT / "conversations" / "index.json", INDEX)
    write_json(ENTRY_DIR / "entry.json", entry)
    if not args.no_tts:
        asyncio.run(synth())
    missing = [job[0] for job in JOBS if not (AUDIO_DIR / f"{job[0]}.mp3").exists()]
    if missing:
        raise SystemExit("missing audio: " + " ".join(missing))
    build_standalone(entry)


if __name__ == "__main__":
    os.chdir(ROOT)
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(1)
