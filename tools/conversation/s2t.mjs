/**
 * Simplified → traditional for the fast authoring path.
 * Identical characters are not listed: they are copied through.
 * Ambiguous characters fail until the author supplies `trad`.
 * Override any mapping by supplying `trad` on the line or the word.
 */

function pairs(text) {
  const out = {};
  for (const token of text.trim().split(/\s+/)) {
    const chars = [...token];
    if (chars.length !== 2) throw new Error(`s2t pair must be two characters: ${token}`);
    if (chars[0] === chars[1]) throw new Error(`s2t pair is identical: ${token}`);
    if (out[chars[0]]) throw new Error(`duplicate simplified character: ${chars[0]}`);
    out[chars[0]] = chars[1];
  }
  return out;
}

export const UNAMBIGUOUS = pairs(`
爱愛 罢罷 摆擺 败敗 办辦 帮幫 宝寶 报報 贝貝 备備 笔筆 毕畢 闭閉 边邊 变變 标標 宾賓 补補
参參 残殘 仓倉 层層 产產 长長 尝嘗 车車 彻徹 陈陳 称稱 诚誠 惩懲 迟遲 齿齒 虫蟲 处處 触觸
传傳 创創 辞辭 词詞 从從 错錯 达達 带帶 单單 担擔 党黨 导導 灯燈 点點 电電 东東 动動 断斷
对對 队隊 儿兒 尔爾 烦煩 饭飯 飞飛 费費 纷紛 丰豐 风風 妇婦 负負 该該 盖蓋 赶趕 刚剛 个個
给給 沟溝 构構 购購 够夠 顾顧 关關 观觀 馆館 广廣 归歸 贵貴 国國 过過 还還 汉漢 号號 红紅
护護 华華 画畫 话話 换換 黄黃 会會 机機 积積 极極 级級 记記 计計 价價 见見 将將 讲講 较較
节節 结結 仅僅 进進 经經 净淨 开開 课課 来來 乐樂 类類 礼禮 两兩 刘劉 龙龍 楼樓 录錄 陆陸
虑慮 乱亂 论論 罗羅 妈媽 马馬 吗嗎 买買 卖賣 麦麥 满滿 猫貓 么麼 没沒 门門 们們 梦夢 难難
脑腦 内內 鸟鳥 宁寧 农農 浓濃 欧歐 盘盤 齐齊 气氣 钱錢 亲親 请請 庆慶 穷窮 区區 权權 劝勸
却卻 确確 让讓 热熱 认認 荣榮 伞傘 杀殺 闪閃 伤傷 烧燒 绍紹 设設 谁誰 审審 声聲 胜勝 师師
诗詩 时時 实實 识識 适適 书書 属屬 术術 树樹 数數 双雙 顺順 说說 丝絲 诉訴 苏蘇 虽雖 随隨
岁歲 孙孫 态態 谈談 弹彈 汤湯 讨討 题題 体體 条條 铁鐵 听聽 厅廳 头頭 图圖 团團 脱脫 万萬
网網 为為 围圍 伟偉 卫衛 温溫 闻聞 问問 无無 务務 误誤 习習 袭襲 戏戲 细細 鲜鮮 闲閒 显顯
现現 线線 乡鄉 响響 项項 销銷 写寫 谢謝 兴興 许許 续續 选選 学學 寻尋 压壓 亚亞 颜顏 验驗
阳陽 杨楊 养養 样樣 药藥 爷爺 业業 页頁 医醫 亿億 义義 艺藝 议議 异異 译譯 阴陰 银銀 饮飲
应應 营營 赢贏 优優 邮郵 鱼魚 渔漁 娱娛 与與 语語 预預 园園 员員 圆圓 远遠 愿願 约約 运運
杂雜 灾災 暂暫 责責 择擇 泽澤 战戰 张張 涨漲 这這 针針 阵陣 镇鎮 争爭 证證 织織 职職 执執
纸紙 质質 众眾 诸諸 猪豬 专專 转轉 装裝 壮壯 状狀 总總 组組 钻鑽 终終
`);

export const AMBIGUOUS = {
  "发": ["發", "髮"],
  "干": ["干", "幹", "乾"],
  "面": ["面", "麵"],
  "后": ["后", "後"],
  "里": ["里", "裡", "裏"],
  "只": ["只", "隻"],
  "制": ["制", "製"],
  "表": ["表", "錶"],
  "台": ["台", "臺", "颱"],
  "松": ["松", "鬆"],
  "谷": ["谷", "穀"],
  "丑": ["丑", "醜"],
  "余": ["余", "餘"],
  "历": ["歷", "曆"],
  "复": ["復", "複", "覆"],
  "系": ["系", "係", "繫"],
  "云": ["云", "雲"],
  "游": ["游", "遊"],
  "签": ["簽", "籤"],
  "征": ["征", "徵"],
  "汇": ["匯", "彙"],
  "斗": ["斗", "鬥"],
  "曲": ["曲", "麴"],
  "范": ["范", "範"],
  "姜": ["姜", "薑"],
  "种": ["種", "种"],
  "折": ["折", "摺"],
  "舍": ["舍", "捨"],
  "准": ["準", "准"],
  "划": ["划", "劃"],
  "困": ["困", "睏"],
  "当": ["當", "噹"],
  "尽": ["盡", "儘"],
  "冲": ["沖", "衝"],
  "脏": ["髒", "臟"],
  "钟": ["鍾", "鐘"],
  "间": ["間", "閒"],
  "着": ["著", "着"],
  "周": ["周", "週"],
  "注": ["注", "註"],
  "几": ["几", "幾"],
  "于": ["于", "於"],
  "获": ["獲", "穫"],
  "并": ["并", "並", "併"],
  "布": ["布", "佈"],
  "胡": ["胡", "鬍"],
  "借": ["借", "藉"],
  "郁": ["郁", "鬱"],
  "欲": ["欲", "慾"],
};

const tradOnly = new Set();
for (const [simp, trad] of Object.entries(UNAMBIGUOUS)) {
  if (AMBIGUOUS[simp]) throw new Error(`character is both mapped and ambiguous: ${simp}`);
  if (trad !== simp) tradOnly.add(trad);
}
for (const [simp, options] of Object.entries(AMBIGUOUS)) {
  if (!Array.isArray(options) || options.length < 2) throw new Error(`ambiguous entry needs choices: ${simp}`);
  for (const opt of options) if (opt !== simp) tradOnly.add(opt);
}

export function isTraditionalOnly(ch) {
  return tradOnly.has(ch);
}

export function convertChar(ch) {
  if (AMBIGUOUS[ch]) return { ambiguous: AMBIGUOUS[ch] };
  if (UNAMBIGUOUS[ch]) return { trad: UNAMBIGUOUS[ch] };
  return { trad: ch };
}
