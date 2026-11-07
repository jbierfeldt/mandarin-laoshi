/** Tone-mark pinyin checks for conversation authoring. One syllable per character. */

const RAW = `
a ai an ang ao
ba bai ban bang bao bei ben beng bi bian biao bie bin bing bo bu
pa pai pan pang pao pei pen peng pi pian piao pie pin ping po pou pu
ma mai man mang mao me mei men meng mi mian miao mie min ming miu mo mou mu
fa fan fang fei fen feng fo fou fu
da dai dan dang dao de dei den deng di dia dian diao die ding diu dong dou du duan dui dun duo
ta tai tan tang tao te teng ti tian tiao tie ting tong tou tu tuan tui tun tuo
na nai nan nang nao ne nei nen neng ni nian niang niao nie nin ning niu nong nou nu nuan nve nuo nv nve
la lai lan lang lao le lei leng li lia lian liang liao lie lin ling liu lo long lou lu luan lve lun luo lv lve
ga gai gan gang gao ge gei gen geng gong gou gu gua guai guan guang gui gun guo
ka kai kan kang kao ke kei ken keng kong kou ku kua kuai kuan kuang kui kun kuo
ha hai han hang hao he hei hen heng hong hou hu hua huai huan huang hui hun huo
za zai zan zang zao ze zei zen zeng zha zhai zhan zhang zhao zhe zhei zhen zheng zhi zhong zhou zhu zhua zhuai zhuan zhuang zhui zhun zhuo zi zong zou zu zuan zui zun zuo
ca cai can cang cao ce cen ceng cha chai chan chang chao che chen cheng chi chong chou chu chua chuai chuan chuang chui chun chuo ci cong cou cu cuan cui cun cuo
sa sai san sang sao se sen seng sha shai shan shang shao she shei shen sheng shi shou shu shua shuai shuan shuang shui shun shuo si song sou su suan sui sun suo
ya yan yang yao ye yi yin ying yo yong you yu yuan yue yun
wa wai wan wang wei wen weng wo wu
ji jia jian jiang jiao jie jin jing jiong jiu ju juan jue jun
qi qia qian qiang qiao qie qin qing qiong qiu qu quan que qun
xi xia xian xiang xiao xie xin xing xiong xiu xu xuan xue xun
r ran rang rao re ren reng ri rong rou ru rua ruan rui run ruo
o ou e ei en eng er n ng m hm hng
`;

/** ü spellings stored as v in the set above (nv, lv, nve, lve) are also accepted as ü. */
const SYLLABLES = new Set(RAW.trim().split(/\s+/));
for (const syl of [...SYLLABLES]) {
  if (syl.includes("v")) SYLLABLES.add(syl.replaceAll("v", "ü"));
}

const TONE_BASE = {
  "ā": "a", "á": "a", "ǎ": "a", "à": "a",
  "ē": "e", "é": "e", "ě": "e", "è": "e",
  "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
  "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
  "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
  "ǖ": "ü", "ǘ": "ü", "ǚ": "ü", "ǜ": "ü",
  "ń": "n", "ň": "n", "ǹ": "n", "ḿ": "m",
};
const TONE_NUM = {
  "ā": 1, "á": 2, "ǎ": 3, "à": 4,
  "ē": 1, "é": 2, "ě": 3, "è": 4,
  "ī": 1, "í": 2, "ǐ": 3, "ì": 4,
  "ō": 1, "ó": 2, "ǒ": 3, "ò": 4,
  "ū": 1, "ú": 2, "ǔ": 3, "ù": 4,
  "ǖ": 1, "ǘ": 2, "ǚ": 3, "ǜ": 4,
  "ń": 2, "ň": 3, "ǹ": 4, "ḿ": 2,
};

const SPLIT = /[\s。？！，、；：…—～「」『』（）()《》〈〉·,.!?;:'"“”‘’~\-]+/u;

export function syllableCount() {
  return SYLLABLES.size;
}

function fold(token) {
  return token.normalize("NFC").toLowerCase().replace(/u:/g, "ü").replace(/v/g, "ü");
}

/** @returns {{display:string, base:string, tone:number}|null} */
export function parseSyllable(token) {
  const display = fold(token);
  if (!display) return null;
  const marks = [...display].filter((c) => TONE_BASE[c]);
  if (marks.length > 1) return null;
  let base = "";
  for (const c of display) base += TONE_BASE[c] || c;
  if (!/^[a-zü]+$/u.test(base)) return null;
  if (!SYLLABLES.has(base)) return null;
  return { display, base, tone: marks.length ? TONE_NUM[marks[0]] : 5 };
}

function segmentToken(token, maxCount) {
  const s = fold(token);
  if (!s) return { found: [] };
  const found = [];
  let budget = 0;
  const walk = (i, acc) => {
    if (budget++ > 4000 || found.length > 8) return;
    if (maxCount != null && acc.length > maxCount) return;
    if (i === s.length) {
      found.push(acc.map((x) => ({ ...x })));
      return;
    }
    const max = Math.min(s.length, i + 7);
    for (let end = max; end > i; end--) {
      const syl = parseSyllable(s.slice(i, end));
      if (!syl) continue;
      acc.push(syl);
      walk(end, acc);
      acc.pop();
      if (found.length > 8) return;
    }
  };
  walk(0, []);
  return { found, exhausted: budget > 4000 };
}

/**
 * Split author pinyin into syllables.
 * A spaced token must be one syllable. An unspaced token is segmented.
 * When `expectedCount` is set, a split is kept only if it has that many syllables.
 * @returns {{syllables?: {display:string, base:string, tone:number}[], error?: {code:string, message:string}}}
 */
export function syllablesOf(py, expectedCount = null) {
  const raw = String(py ?? "").normalize("NFC").trim();
  if (!raw) return { error: { code: "missing_pinyin", message: "pinyin is required" } };
  if (/[0-9]/.test(raw)) {
    return { error: { code: "malformed_pinyin", message: "use tone marks (nǐ), not tone numbers (ni3)" } };
  }
  const tokens = raw.split(SPLIT).filter(Boolean);
  if (!tokens.length) return { error: { code: "malformed_pinyin", message: "pinyin has no syllables" } };
  const tokenAlts = [];
  for (const token of tokens) {
    const one = parseSyllable(token);
    if (one) {
      tokenAlts.push([[one]]);
      continue;
    }
    const seg = segmentToken(token, expectedCount);
    if (!seg.found.length) {
      return { error: { code: "malformed_pinyin", message: `"${token}" is not a tone-mark syllable` } };
    }
    tokenAlts.push(seg.found);
  }
  const chosen = [];
  const walk = (i, acc) => {
    if (chosen.length > 8) return;
    if (i === tokenAlts.length) {
      const flat = acc.flat();
      if (expectedCount == null || flat.length === expectedCount) chosen.push(flat);
      return;
    }
    for (const alt of tokenAlts[i]) {
      acc.push(alt);
      walk(i + 1, acc);
      acc.pop();
    }
  };
  walk(0, []);
  if (chosen.length === 1) return { syllables: chosen[0] };
  const sample = (chosen.length ? chosen : tokenAlts.flat()).slice(0, 4).map((path) => path.map((s) => s.display).join(" "));
  if (!chosen.length) {
    return {
      error: {
        code: "pinyin_alignment",
        message: expectedCount == null
          ? "pinyin did not split into syllables"
          : `pinyin does not split into ${expectedCount} syllable${expectedCount === 1 ? "" : "s"}`,
      },
    };
  }
  return {
    error: {
      code: "ambiguous_pinyin",
      message: `syllable break is ambiguous: ${sample.join(" | ")}. Put a space between syllables`,
    },
  };
}

export function sameReading(a, b) {
  return a.length === b.length && a.every((s, i) => s.base === b[i].base && s.tone === b[i].tone);
}

export function capFirst(display) {
  const chars = [...display];
  if (!chars.length) return display;
  chars[0] = chars[0].toUpperCase();
  return chars.join("");
}
