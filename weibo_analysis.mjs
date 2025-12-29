import fs from 'fs';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { file: '', out: '', excludeTags: '' };
  for (const a of args) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) opts[m[1]] = m[2];
  }
  return opts;
}

function parseDate(s) {
  try {
    if (!s) return null;
    if (/\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.replace(/\./g, '-'));
    return new Date(s);
  } catch (_) { return null; }
}

function cleanText(s) { return String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); }

function extractTitle(text) {
  const t = cleanText(text);
  const m1 = t.match(/《([^》]{1,60})》/);
  if (m1) return m1[1].trim();
  const suf = '(图卷|画卷|图|画|卷|碑|鼎|钟|瓦当|俑|像|璧|佩|环|璋|琮|简|镜|杯|盏|壶|瓶|碗|罐|盘|函|簪|扇|轴|帖)';
  const m2 = t.match(new RegExp('([\\u4e00-\\u9fa5]{2,20})' + suf));
  if (m2) return m2[0];
  const lines = t.split(/\n+/).map(x => x.trim()).filter(Boolean);
  if (lines.length) return lines[0].slice(0, 40);
  return t.slice(0, 40);
}

function detectDynasty(text) {
  const t = cleanText(text);
  const rules = [
    { key: '先秦', rx: /(夏代|商代|西周|东周|春秋|战国)/ },
    { key: '秦', rx: /(秦代|秦朝)/ },
    { key: '汉', rx: /(汉代|西汉|东汉)/ },
    { key: '魏晋南北朝', rx: /(魏晋|两晋|南北朝|北朝|南朝|三国)/ },
    { key: '隋', rx: /(隋代|隋朝)/ },
    { key: '唐', rx: /(唐代|唐朝|大唐)/ },
    { key: '五代十国', rx: /(五代|十国)/ },
    { key: '宋', rx: /(宋代|宋朝|北宋|南宋)/ },
    { key: '辽', rx: /(辽代)/ },
    { key: '金', rx: /(金代)/ },
    { key: '西夏', rx: /(西夏)/ },
    { key: '元', rx: /(元代|元朝)/ },
    { key: '明', rx: /(明代|明朝)/ },
    { key: '清', rx: /(清代|清朝)/ },
    { key: '民国/近现代', rx: /(民国|近代|现代)/ }
  ];
  for (const r of rules) { if (r.rx.test(t)) return r.key; }
  return '未知朝代';
}

function detectTypes(text, topics) {
  const t = cleanText(text);
  const joined = (Array.isArray(topics) ? topics.join(' ') : '');
  const src = t + ' ' + joined;
  const rules = [
    { key: '书法', rx: /(书法|法帖|帖|墨迹|行书|楷书|草书|隶书|篆书)/ },
    { key: '绘画', rx: /(绘画|画卷|图卷|壁画|手卷|册页|扇面|设色|人物画|山水|花鸟)/ },
    { key: '青铜', rx: /(青铜器|青铜|铜器|鼎|壶|盘|簋|卣|罍|尊|豆|戈|矛|戟|镞|钟|铙)/ },
    { key: '陶瓷', rx: /(陶瓷|瓷器|陶器|瓷|瓶|碗|罐|盏|杯|尊|壶|盘|盆)/ },
    { key: '石刻', rx: /(石刻|碑刻|石雕|石像|石碑|墓志|拓片)/ },
    { key: '漆器', rx: /(漆器|髹漆|漆)/ },
    { key: '玉器', rx: /(玉器|玉|璧|佩|环|璋|琮|珮|玉雕|玉环)/ },
    { key: '金银器', rx: /(金银器|金器|银器|金银|金简|金饰)/ },
    { key: '古建筑', rx: /(古建筑|殿|寺|塔|亭|楼|庙|祠|桥)/ }
  ];
  const out = [];
  for (const r of rules) { if (r.rx.test(src)) out.push(r.key); }
  return out.length ? out : ['其他'];
}

function buildPostLink(uid, bid, id, existing) {
  if (uid && bid) return `https://weibo.com/${uid}/${bid}`;
  if (id) return `https://m.weibo.cn/detail/${id}`;
  return existing || (uid ? `https://weibo.com/${uid}/` : '');
}

function main() {
  const { file, out } = parseArgs();
  if (!file) throw new Error('请提供 --file= 目标JSON');
  const raw = fs.readFileSync(file, 'utf-8');
  const j = JSON.parse(raw);
  const items = (j && j.items) || [];
  const uid = (j && j.user && j.user.uid) || '';
  const excludeTagsStr = opts.excludeTags || '';
  const exSet = new Set(excludeTagsStr.split(',').map(s => s.replace(/^#|#$/g, '').trim()).filter(Boolean));
  const filteredItems = items.filter(x => {
    const ts = (x && x.topics) ? x.topics.map(t => String(t).trim()) : [];
    if (ts.some(t => exSet.has(t))) return false;
    const text = String(x.text || '');
    for (const tag of exSet) {
      if (new RegExp(`#${tag}#`).test(text)) return false;
    }
    return true;
  });
  const enriched = filteredItems.map(x => ({
    id: x.id,
    bid: x.bid,
    text: String(x.text || ''),
    link: buildPostLink(uid, x.bid, x.id, x.link),
    created_at: x.created_at || '',
    date: parseDate(x.created_at || ''),
    topics: x.topics || []
  })).filter(x => !!x.text);
  const byDyn = new Map();
  const byType = new Map();
  const seen = new Set();
  for (const p of enriched) {
    const key = p.link || String(p.id || '');
    if (seen.has(key)) continue;
    seen.add(key);
    const title = extractTitle(p.text);
    const dKey = detectDynasty(p.text);
    const tKeys = detectTypes(p.text, p.topics);
    const item = { title, link: p.link, date: p.date };
    if (!byDyn.has(dKey)) byDyn.set(dKey, []);
    byDyn.get(dKey).push(item);
    for (const tk of tKeys) {
      if (!byType.has(tk)) byType.set(tk, []);
      byType.get(tk).push(item);
    }
  }
  const orderDyn = ['先秦','秦','汉','魏晋南北朝','隋','唐','五代十国','宋','辽','金','西夏','元','明','清','民国/近现代','未知朝代'];
  const orderType = ['书法','绘画','青铜','陶瓷','石刻','漆器','玉器','金银器','古建筑','其他'];
  const lines = [];
  lines.push('按朝代分类');
  for (const k of orderDyn) {
    const arr = (byDyn.get(k) || []).sort((a,b)=> (a.date||0) - (b.date||0));
    if (!arr.length) continue;
    lines.push(k);
    for (const it of arr) lines.push(`- ${it.title}（${it.link}）`);
    lines.push('');
  }
  lines.push('按种类分类');
  for (const k of orderType) {
    const arr = (byType.get(k) || []).sort((a,b)=> (a.date||0) - (b.date||0));
    if (!arr.length) continue;
    lines.push(k);
    for (const it of arr) lines.push(`- ${it.title}（${it.link}）`);
    lines.push('');
  }
  const outPath = out || `weibo_${uid || 'unknown'}_analysis_${Date.now()}.txt`;
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`已生成 ${outPath}`);
}

main();
