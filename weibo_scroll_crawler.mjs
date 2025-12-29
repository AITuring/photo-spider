import puppeteer from 'puppeteer';
import fs from 'fs';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { pages: 5, delay: 1200, headless: false, max: 0, userDataDir: '', executablePath: '', mode: 'auto', noFallback: '', segments: '', mergeGlob: '', mergeOut: '' };
  for (const a of args) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) opts[m[1]] = m[2];
    else if (a === '--headless') opts.headless = true;
  }
  return opts;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function extractHashtags(text) {
  const r = [];
  if (!text) return r;
  const m = text.match(/#([^#]+)#/g) || [];
  for (const t of m) r.push(t.replace(/^#|#$/g, ''));
  return r;
}

function extractMentions(text) {
  const r = [];
  if (!text) return r;
  const m = text.match(/@([\u4e00-\u9fa5A-Za-z0-9_\-]+)/g) || [];
  for (const t of m) r.push(t.replace(/^@/, ''));
  return r;
}

function parseDate(s) {
  try {
    if (!s) return null;
    if (/\d{4}-\d{2}-\d{2}/.test(s)) return new Date(s.replace(/\./g, '-'));
    return new Date(s);
  } catch (_) { return null; }
}

function monthKey(d) {
  if (!d) return '未知';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function summarize(posts) {
  const total = posts.length;
  const dates = posts.map(x => x.date).filter(Boolean).sort((a, b) => a - b);
  const start = dates[0] || null;
  const end = dates[dates.length - 1] || null;
  const monthMap = new Map();
  for (const p of posts) {
    const k = monthKey(p.date);
    monthMap.set(k, (monthMap.get(k) || 0) + 1);
  }
  const months = Array.from(monthMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const byLikes = [...posts].sort((a, b) => b.attitudes - a.attitudes).slice(0, 5);
  const byComments = [...posts].sort((a, b) => b.comments - a.comments).slice(0, 5);
  const topicMap = new Map();
  const mentionMap = new Map();
  const kwMap = new Map();
  const stop = new Set(['的','了','和','是','就','都','而','及','与','呢','啊','吧','吗','在','也','被','很','这','那','一个','我们','你们','他们','但是','因为','所以']);
  for (const p of posts) {
    for (const t of p.topics) topicMap.set(t, (topicMap.get(t) || 0) + 1);
    for (const m of p.mentions) mentionMap.set(m, (mentionMap.get(m) || 0) + 1);
    const segCn = p.text.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    const segEn = (p.text.toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !stop.has(w));
    for (const w of segCn) {
      if (stop.has(w)) continue;
      kwMap.set(w, (kwMap.get(w) || 0) + 1);
    }
    for (const w of segEn) kwMap.set(w, (kwMap.get(w) || 0) + 1);
  }
  const topics = Array.from(topicMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const mentions = Array.from(mentionMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const keywords = Array.from(kwMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  return { total, start, end, months, byLikes, byComments, topics, mentions, keywords };
}

function fmtDate(d) { return d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '未知'; }

function truncate(text, n) { return text.length <= n ? text : text.slice(0, n) + '…'; }

function printSummary(user, sum) {
  console.log(`\n微博整理总结`);
  console.log(`用户: ${user.screen_name || ''} UID: ${user.uid || ''}`);
  console.log(`统计范围: ${fmtDate(sum.start)} ~ ${fmtDate(sum.end)} 共${sum.total}条`);
  console.log(`\n每月发帖数 Top`);
  for (const [m, c] of sum.months) console.log(`${m}  ${c}`);
  console.log(`\n点赞最高 Top5`);
  for (const p of sum.byLikes) console.log(`${p.created_at}  赞=${p.attitudes} 评论=${p.comments} 转发=${p.reposts}  ${truncate(p.text, 80)}  ${p.link}`);
  console.log(`\n评论最高 Top5`);
  for (const p of sum.byComments) console.log(`${p.created_at}  赞=${p.attitudes} 评论=${p.comments} 转发=${p.reposts}  ${truncate(p.text, 80)}  ${p.link}`);
  console.log(`\n话题 Top10`);
  for (const [t, c] of sum.topics) console.log(`#${t}#  ${c}`);
  console.log(`\n提及 Top10`);
  for (const [m, c] of sum.mentions) console.log(`@${m}  ${c}`);
  console.log(`\n关键词 Top20`);
  for (const [w, c] of sum.keywords) console.log(`${w}  ${c}`);
}

function parseCookieString(cookieStr) {
  if (!cookieStr) return [];
  return cookieStr.split(';').map(s => s.trim()).filter(Boolean).map(kv => {
    const i = kv.indexOf('=');
    if (i === -1) return null;
    const name = kv.slice(0, i);
    const value = kv.slice(i + 1);
    return { name, value, domain: '.weibo.com', path: '/', httpOnly: false, secure: true };
  }).filter(Boolean);
}

function filterPosts(posts, since, until, keywords) {
  const sDate = since ? new Date(since) : null;
  const uDate = until ? new Date(until) : null;
  const kws = (keywords || '').split(',').map(x => x.trim()).filter(Boolean);
  return posts.filter(p => {
    if (p && p.isRepost) return false;
    const okDate = (!sDate || (p.date && p.date >= sDate)) && (!uDate || (p.date && p.date <= uDate));
    if (!okDate) return false;
    if (!kws.length) return true;
    const t = (p.text || '').toLowerCase();
    return kws.some(k => t.includes(k.toLowerCase()));
  });
}

function buildSegments(since, until, unit) {
  const s = since ? new Date(since) : null;
  const u = until ? new Date(until) : null;
  if (!s || !u) return [];
  const segs = [];
  const cur = new Date(s.getTime());
  while (cur <= u) {
    let segEnd = new Date(cur.getTime());
    if (String(unit).toLowerCase() === 'quarter') {
      segEnd.setMonth(segEnd.getMonth() + 3);
    } else {
      segEnd.setMonth(segEnd.getMonth() + 1);
    }
    segEnd.setDate(0);
    if (segEnd > u) segEnd = new Date(u.getTime());
    segs.push([new Date(cur.getFullYear(), cur.getMonth(), 1), new Date(segEnd.getFullYear(), segEnd.getMonth(), segEnd.getDate())]);
    cur.setMonth(cur.getMonth() + (String(unit).toLowerCase() === 'quarter' ? 3 : 1));
  }
  return segs;
}

function dedupePosts(posts) {
  const map = new Map();
  for (const p of posts) {
    const key = String(p.id || '') + '|' + String(p.bid || '') + '|' + String(p.link || '').slice(-24);
    if (!map.has(key)) map.set(key, p);
  }
  return Array.from(map.values());
}

function saveJson(user, posts, since, until) {
  const ts = new Date();
  const name = `weibo_${user.uid || 'unknown'}_${fmtDate(since ? new Date(since) : null)}_${fmtDate(until ? new Date(until) : null)}_${ts.getTime()}.json`;
  const payload = posts.map(p => ({ id: p.id, bid: p.bid, created_at: p.created_at, text: p.text, attitudes: p.attitudes, comments: p.comments, reposts: p.reposts, pics: p.pics, hasVideo: p.hasVideo, link: p.link, topics: p.topics, mentions: p.mentions, isRepost: !!p.isRepost, repost_user: p.repost_user || '', repost_uid: p.repost_uid || '', repost_id: p.repost_id || '', repost_bid: p.repost_bid || '', repost_link: p.repost_link || '', repost_text_short: p.repost_text_short || '' }));
  fs.writeFileSync(name, JSON.stringify({ user, count: posts.length, since, until, items: payload }, null, 2));
  console.log(`已保存 ${name}`);
}

async function main() {
  const opts = parseArgs();
  const { uid, screenName, pages, delay, headless, cookie, max } = opts;
  const mergeGlob = opts.mergeGlob || '';
  const mergeOut = opts.mergeOut || '';
  const userDataDir = opts.userDataDir || './weibo-profile';
  const executablePath = opts.executablePath || undefined;
  const sinceArg = opts.since;
  const untilArg = opts.until;
  const kwArg = opts.keywords;
  const autoArg = opts.auto;
  let targetUrl = '';
  if (uid) targetUrl = `https://weibo.com/u/${uid}?tabType=feed`;
  else if (screenName) targetUrl = `https://weibo.com/${encodeURIComponent(screenName)}?tabType=feed`;
  else throw new Error('请提供 --uid= 或 --screenName=');
  // const userDataDir = opts.userDataDir || undefined;
  // const executablePath = opts.executablePath || undefined;

  if (mergeGlob) {
    const names = fs.readdirSync('.').filter(n => n.endsWith('.json') && n.includes(mergeGlob.replace(/\*/g, '')));
    const all = [];
    for (const n of names) {
      try {
        const j = JSON.parse(fs.readFileSync(n, 'utf-8'));
        const items = (j && j.items) || [];
        for (const x of items) {
          all.push({ id: x.id, bid: x.bid, created_at: x.created_at, text: x.text, attitudes: x.attitudes, comments: x.comments, reposts: x.reposts, pics: x.pics, hasVideo: x.hasVideo, link: x.link, topics: x.topics || [], mentions: x.mentions || [], date: parseDate(x.created_at) });
        }
      } catch (_) {}
    }
    const merged = dedupePosts(all).sort((a,b)=> (a.date||0) - (b.date||0));
    const sum = summarize(merged);
    printSummary({ uid: uid || '', screen_name: screenName || '' }, sum);
    const out = mergeOut || `weibo_${uid || 'unknown'}_${fmtDate(merged[0]?.date || null)}_${fmtDate(merged[merged.length-1]?.date || null)}_${Date.now()}_merged.json`;
    const payload = merged.map(p => ({ id: p.id, bid: p.bid, created_at: p.created_at, text: p.text, attitudes: p.attitudes, comments: p.comments, reposts: p.reposts, pics: p.pics, hasVideo: p.hasVideo, link: p.link, topics: p.topics, mentions: p.mentions }));
    fs.writeFileSync(out, JSON.stringify({ user: { uid, screen_name: screenName }, count: merged.length, items: payload }, null, 2));
    console.log(`已保存 ${out}`);
    return;
  }

  const browser = await puppeteer.launch({ headless: headless ? 'new' : false, defaultViewport: null, userDataDir, executablePath, args: ['--disable-blink-features=AutomationControlled'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });
  await page.evaluateOnNewDocument(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });

  const cookies = parseCookieString(cookie);
  if (cookies.length) await page.setCookie(...cookies);

  const collected = [];
  const seen = new Set();
  let userInfo = { uid: uid || '', screen_name: screenName || '' };
  let firstDataLoaded = false;
  let webSinceId = '';

  page.on('response', async res => {
    try {
      const u = res.url();
      if (u.includes('/ajax/profile/info?')) {
        const j = await res.json();
        const d = j && j.data && (j.data.user || j.data);
        if (d) userInfo = { uid: String(d.id || userInfo.uid || ''), screen_name: d.screen_name || userInfo.screen_name || '' };
      }
      if (u.includes('/ajax/statuses/mymblog')) {
        const j = await res.json();
        const list = (j && j.data && j.data.list) || [];
        if (j && j.data && j.data.since_id) {
          webSinceId = j.data.since_id;
        }
        if (list.length) firstDataLoaded = true;
        console.log('[拦截] mymblog list=', list.length, 'since_id=', webSinceId || '');
        
        // 尝试补全长微博
        for (const mb of list) {
          if (mb.isLongText) {
            try {
              const longText = await page.evaluate(async (id) => {
                try {
                  const r = await fetch(`https://weibo.com/ajax/statuses/longtext?id=${id}`);
                  const d = await r.json();
                  return d && d.data && d.data.longTextContent;
                } catch (_) { return null; }
              }, mb.id);
              if (longText) { mb.text_raw = longText; mb.text = longText; }
            } catch (_) {}
          }
        }

        for (const mb of list) {
          // 过滤转发和非原创
          if (mb.retweeted_status) continue;
          if (mb.promotion && mb.promotion.type === 'ad') continue;
          
          const id = String(mb.id);
          if (seen.has(id)) continue;
          seen.add(id);
          const text = mb.text_raw || mb.text || '';
          const d = parseDate(mb.created_at);
          const link = `https://weibo.com/${mb.user?.id || userInfo.uid}/${mb.bid || mb.mblogid || ''}`;
          const topics = extractHashtags(text);
          const mentions = extractMentions(text);
          const pics = Array.isArray(mb.pics) ? mb.pics.length : 0;
          const hasVideo = !!(mb.page_info && ((mb.page_info.media_info && mb.page_info.media_info.stream_url) || mb.page_info.type === 'video'));
          const rp = rp0;
          collected.push({ id, bid: mb.bid || mb.mblogid || null, created_at: mb.created_at, date: d, text, attitudes: mb.attitudes_count || 0, comments: mb.comments_count || 0, reposts: mb.reposts_count || 0, pics, hasVideo, link, topics, mentions, isRepost: rp.isRepost, repost_user: rp.repost_user, repost_uid: rp.repost_uid, repost_id: rp.repost_id, repost_bid: rp.repost_bid, repost_link: rp.repost_link, repost_text_short: rp.repost_text_short });
        }
      }
    } catch (_) {}
  });

  console.log('开始访问', targetUrl);
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  let logged = await page.evaluate(() => {
    try {
      const c = window.$CONFIG || {};
      if (c.uid || c.islogin === '1') return true;
    } catch (_) {}
    return /(^|; )SUB=/.test(document.cookie) || /(^|; )WBPSESS=/.test(document.cookie);
  });
  if (!logged) {
    await page.goto('https://weibo.com/login.php', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => {
      try { const c = window.$CONFIG || {}; if (c.uid || c.islogin === '1') return true; } catch (_) {}
      return /(^|; )SUB=/.test(document.cookie) || /(^|; )WBPSESS=/.test(document.cookie);
    }, { timeout: 10 * 60 * 1000 }).catch(() => {});
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  }
  await page.evaluate(() => {
    const dismissText = ['继续访问','我已了解','知道了','同意','允许','确认','关闭'];
    const clickByText = (text) => {
      const els = Array.from(document.querySelectorAll('button,a,div span'));
      const el = els.find(e => (e.textContent||'').includes(text));
      if (el) el.click();
    };
    dismissText.forEach(clickByText);
    const feedTab = document.querySelector('a[href*="tabType=feed"], a[role="tab"][href*="feed"], a[tabindex][href*="feed"]');
    if (feedTab) feedTab.click();
  });
  await sleep(800);

  for (let pn = 1; pn <= Math.min(5, Number(pages) || 5); pn++) {
    const list = await (async () => {
      try { return await (async function manualFetchPageImmediate(pageRef, uidVal, pnVal){
        const result = await pageRef.evaluate(async (uid, pn) => {
          function getCookieVal(name) {
            const m = document.cookie.match(new RegExp(name + '=([^;]+)'));
            return m ? decodeURIComponent(m[1]) : '';
          }
          const xsrf = getCookieVal('XSRF-TOKEN');
          const url = `https://weibo.com/ajax/statuses/mymblog?uid=${uid}&page=${pn}`;
          const resp = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf } });
          if (!resp.ok) return { ok: false };
          const j = await resp.json();
          const list = (j && j.data && j.data.list) || [];
          
          // 并行获取长微博全文
          await Promise.all(list.map(async (mb) => {
            if (mb.isLongText) {
              try {
                const r2 = await fetch(`https://weibo.com/ajax/statuses/longtext?id=${mb.id}`, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf } });
                if (r2.ok) {
                  const d2 = await r2.json();
                  if (d2 && d2.data && d2.data.longTextContent) {
                    mb.text_raw = d2.data.longTextContent;
                    mb.text = d2.data.longTextContent;
                  }
                }
              } catch (_) {}
            }
          }));

          return { ok: true, list };
        }, uidVal, pnVal);
        if (!result || !result.ok) return [];
        return result.list;
      })(page, userInfo.uid || uid, pn); } catch (_) { return []; }
    })();
    if (!list.length) break;
    for (const mb of list) {
      const id = String(mb.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const text = mb.text_raw || mb.text || '';
      const d = parseDate(mb.created_at);
      const link = `https://weibo.com/${mb.user?.id || userInfo.uid}/${mb.bid || ''}`;
      const topics = extractHashtags(text);
      const mentions = extractMentions(text);
      const pics = Array.isArray(mb.pics) ? mb.pics.length : 0;
      const hasVideo = !!(mb.page_info && ((mb.page_info.media_info && mb.page_info.media_info.stream_url) || mb.page_info.type === 'video'));
      collected.push({ id, bid: mb.bid || null, created_at: mb.created_at, date: d, text, attitudes: mb.attitudes_count || 0, comments: mb.comments_count || 0, reposts: mb.reposts_count || 0, pics, hasVideo, link, topics, mentions });
    }
    await sleep(1000);
  }

  await page.evaluate(() => {
    const a = document.querySelector('a[href*="tabType=feed"]');
    if (a) a.click();
    const b = document.querySelector('a[role="tab"][href*="feed"], a[tabindex][href*="feed"]');
    if (b) b.click();
  });
  await sleep(1000);
  await page.evaluate(() => { window.scrollBy(0, Math.floor(window.innerHeight * 0.9)); });
  await sleep(1000);

  let runtimeConfig = { since: sinceArg || '', until: untilArg || '', keywords: kwArg || '', pages: Number(pages), delay: Number(delay) };
  const needOverlay = !(sinceArg || untilArg || kwArg || autoArg);
  if (needOverlay) {
    await page.evaluate((def) => {
      const d = document.createElement('div');
      d.style.cssText = 'position:fixed;z-index:999999;top:20px;right:20px;background:#fff;border:1px solid #ddd;box-shadow:0 2px 12px rgba(0,0,0,.15);padding:12px;font-size:14px;line-height:1.6;';
      d.innerHTML = `<div style="font-weight:600;margin-bottom:6px;">采集设置</div>
        <div>开始日期：<input id="c_since" type="date" style="width:180px"/></div>
        <div>结束日期：<input id="c_until" type="date" style="width:180px"/></div>
        <div>关键词（逗号分隔）：<input id="c_keywords" type="text" style="width:180px" placeholder="例如：博物馆,plog"/></div>
        <div>滚动次数：<input id="c_pages" type="number" min="1" max="50" value="${def.pages}" style="width:80px"/></div>
        <div>每次等待(ms)：<input id="c_delay" type="number" min="500" max="5000" value="${def.delay}" style="width:100px"/></div>
        <div style="margin-top:8px;text-align:right"><button id="c_start" style="padding:6px 12px">开始采集</button></div>`;
      document.body.appendChild(d);
      const startBtn = d.querySelector('#c_start');
      startBtn.addEventListener('click', () => {
        const since = d.querySelector('#c_since').value;
        const until = d.querySelector('#c_until').value;
        const keywords = d.querySelector('#c_keywords').value;
        const pages = parseInt(d.querySelector('#c_pages').value || String(def.pages), 10);
        const delay = parseInt(d.querySelector('#c_delay').value || String(def.delay), 10);
        window._crawlerConfig = { since, until, keywords, pages, delay };
        window._crawlerConfigComplete = true;
        d.remove();
      });
    }, runtimeConfig);
    await page.waitForFunction(() => window._crawlerConfigComplete === true, { timeout: 5 * 60 * 1000 }).catch(() => {});
    const cfg = await page.evaluate(() => window._crawlerConfig || null);
    if (cfg) runtimeConfig = cfg;
  }

  const segmentUnit = String(opts.segments || '').toLowerCase();
  const doSegment = !!segmentUnit && runtimeConfig.since && runtimeConfig.until;
  if (doSegment) {
    const ranges = buildSegments(runtimeConfig.since, runtimeConfig.until, segmentUnit);
    const merged = [];
    for (let i = 0; i < ranges.length; i++) {
      const [segSince, segUntil] = ranges[i];
      console.log(`[分段] 第${i + 1}/${ranges.length}段 ${fmtDate(segSince)} ~ ${fmtDate(segUntil)}`);
      let stop = 0;
      const segItems = [];
      const segSeen = new Set();
      for (let step = 0; step < Number(runtimeConfig.pages || pages); step++) {
        const list = await manualFetchPage(step + 1, webSinceId || '');
        console.log(`[分段] step=${step + 1} 返回=${list.length} since_id=${webSinceId || ''}`);
        if (!list.length) { stop++; if (stop >= 3) break; }
        for (const mb of list) {
          const id = String(mb.id);
          const d = parseDate(mb.created_at);
          if (d && d >= segSince && d <= segUntil) {
            if (segSeen.has(id)) continue;
            segSeen.add(id);
            const text = mb.text_raw || mb.text || '';
            const link = `https://weibo.com/${mb.user?.id || userInfo.uid}/${mb.bid || mb.mblogid || ''}`;
            const topics = extractHashtags(text);
            const mentions = extractMentions(text);
            const pics = Array.isArray(mb.pics) ? mb.pics.length : 0;
            const hasVideo = !!(mb.page_info && ((mb.page_info.media_info && mb.page_info.media_info.stream_url) || mb.page_info.type === 'video'));
            const rp = buildRepost(mb);
            const item = { id, bid: mb.bid || mb.mblogid || null, created_at: mb.created_at, date: d, text, attitudes: mb.attitudes_count || 0, comments: mb.comments_count || 0, reposts: mb.reposts_count || 0, pics, hasVideo, link, topics, mentions, isRepost: rp.isRepost, repost_user: rp.repost_user, repost_uid: rp.repost_uid, repost_id: rp.repost_id, repost_bid: rp.repost_bid, repost_link: rp.repost_link, repost_text_short: rp.repost_text_short };
            segItems.push(item);
            merged.push(item);
          }
        }
        await sleep(Number(runtimeConfig.delay || delay));
        const oldestSeg = segItems.map(x => x.date).filter(Boolean).sort((a,b)=>a-b)[0];
        if (oldestSeg && oldestSeg <= segSince) break;
      }
    }
    const final = dedupePosts(merged).sort((a,b) => (a.date || 0) - (b.date || 0));
    const filtered = filterPosts(final, runtimeConfig.since, runtimeConfig.until, runtimeConfig.keywords);
    const sum = summarize(filtered);
    printSummary(userInfo, sum);
    saveJson(userInfo, filtered, runtimeConfig.since, runtimeConfig.until);
    await browser.close();
    return;
  }

  const usedWebOnly = (String(opts.mode || '').toLowerCase() === 'web') || (String(opts.noFallback || '') === '1');
  async function fetchWebFull(pageRef, uidVal, maxPagesVal, delayVal) {
    const out = [];
    let sinceId = webSinceId || '';
    for (let pn = 1; pn <= Number(maxPagesVal || 1); pn++) {
      const res = await pageRef.evaluate(async (uid, pn, sid) => {
        function getCookieVal(name) {
          const m = document.cookie.match(new RegExp(name + '=([^;]+)'));
          return m ? decodeURIComponent(m[1]) : '';
        }
        const xsrf = getCookieVal('XSRF-TOKEN');
        const url = `https://weibo.com/ajax/statuses/mymblog?uid=${uid}&page=${pn}` + (sid ? `&since_id=${sid}` : '');
        const resp = await fetch(url, { credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf, 'Referer': location.href } });
        if (!resp.ok) return { ok: false };
        const j = await resp.json();
        const list = (j && j.data && j.data.list) || [];
        const nextSid = (j && j.data && j.data.since_id) || '';
        return { ok: true, list, sid: nextSid };
      }, uidVal, pn, sinceId);
      console.log(`[WEB] 第${pn}页 返回${res && res.list ? res.list.length : 0} since_id=${res && res.sid ? res.sid : ''}`);
      if (!res || !res.ok) break;
      if (res.sid) sinceId = res.sid;
      if (!res.list.length) break;
      for (const mb of res.list) {
        out.push(mb);
      }
      await sleep(Number(delayVal || 0));
    }
    return out;
  }

  if (usedWebOnly) {
    let steps = Number(runtimeConfig.pages || pages) || 1;
    for (let step = 0; step < steps; step++) {
      const list = await manualFetchPage(step === 0 ? 1 : 1, webSinceId || '');
      console.log(`[WEB-only] step=${step+1} 返回=${list.length} since_id=${webSinceId || ''}`);
      if (!list.length) break;
      for (const mb of list) {
        // 过滤转发和非原创
      if (mb.retweeted_status) continue;
      if (mb.promotion && mb.promotion.type === 'ad') continue;

      const id = String(mb.id);
      if (seen.has(id)) continue;
      seen.add(id);
        const text = mb.text_raw || mb.text || '';
        const d = parseDate(mb.created_at);
        const link = `https://weibo.com/${mb.user?.id || userInfo.uid}/${mb.bid || mb.mblogid || ''}`;
        const topics = extractHashtags(text);
        const mentions = extractMentions(text);
        const pics = Array.isArray(mb.pics) ? mb.pics.length : 0;
        const hasVideo = !!(mb.page_info && ((mb.page_info.media_info && mb.page_info.media_info.stream_url) || mb.page_info.type === 'video'));
        const rp = rp0;
        collected.push({ id, bid: mb.bid || mb.mblogid || null, created_at: mb.created_at, date: d, text, attitudes: mb.attitudes_count || 0, comments: mb.comments_count || 0, reposts: mb.reposts_count || 0, pics, hasVideo, link, topics, mentions, isRepost: rp.isRepost, repost_user: rp.repost_user, repost_uid: rp.repost_uid, repost_id: rp.repost_id, repost_bid: rp.repost_bid, repost_link: rp.repost_link, repost_text_short: rp.repost_text_short });
      }
      await sleep(Number(runtimeConfig.delay || delay));
      const oldest = collected.map(x => x.date).filter(Boolean).sort((a,b)=>a-b)[0];
      if (runtimeConfig.since && oldest && oldest <= new Date(runtimeConfig.since)) break;
    }
  }

  async function manualFetchPage(pn, sinceId) {
    const result = await page.evaluate(async (uid, pn, sinceId) => {
      function getCookieVal(name) {
        const m = document.cookie.match(new RegExp(name + '=([^;]+)'));
        return m ? decodeURIComponent(m[1]) : '';
      }
      const xsrf = getCookieVal('XSRF-TOKEN');
      const url = `https://weibo.com/ajax/statuses/mymblog?uid=${uid}&page=${pn}` + (sinceId ? `&since_id=${sinceId}` : '');
      const resp = await fetch(url, {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf, 'Referer': location.href }
      });
      if (!resp.ok) return { ok: false };
      const j = await resp.json();
      const list = (j && j.data && j.data.list) || [];
      const sid = (j && j.data && j.data.since_id) || '';

      // 并行获取长微博全文
      await Promise.all(list.map(async (mb) => {
        if (mb.isLongText) {
          try {
            const r2 = await fetch(`https://weibo.com/ajax/statuses/longtext?id=${mb.id}`, { headers: { 'X-Requested-With': 'XMLHttpRequest', 'X-XSRF-TOKEN': xsrf } });
            if (r2.ok) {
              const d2 = await r2.json();
              if (d2 && d2.data && d2.data.longTextContent) {
                mb.text_raw = d2.data.longTextContent;
                mb.text = d2.data.longTextContent;
              }
            }
          } catch (_) {}
        }
      }));

      return { ok: true, list, since_id: sid };
    }, userInfo.uid || uid, pn, sinceId || (await page.evaluate(() => window._webSinceId || '')));
    if (!result || !result.ok) return [];
    if (result.since_id) webSinceId = result.since_id;
    return result.list;
  }
  let loops = 0;
  let lastCount = 0;
  const maxPages = Number(runtimeConfig.pages || pages);
  const maxItems = Number(max) || 0;
  let stale = 0;

  if (!usedWebOnly) {
    for (let pn = 1; pn <= maxPages; pn++) {
      const list = await manualFetchPage(pn, webSinceId);
      console.log(`[WEB接口] 第${pn}页 返回${list.length} since_id=${webSinceId || ''}`);
      if (!list.length) { stale++; if (stale >= 3) break; }
      for (const mb of list) {
        // 过滤转发和非原创
        if (mb.retweeted_status) continue;
        if (mb.promotion && mb.promotion.type === 'ad') continue;
        
        const id = String(mb.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const text = mb.text_raw || mb.text || '';
        const d = parseDate(mb.created_at);
        const link = `https://weibo.com/${mb.user?.id || userInfo.uid}/${mb.bid || mb.mblogid || ''}`;
        const topics = extractHashtags(text);
        const mentions = extractMentions(text);
        const pics = Array.isArray(mb.pics) ? mb.pics.length : 0;
        const hasVideo = !!(mb.page_info && ((mb.page_info.media_info && mb.page_info.media_info.stream_url) || mb.page_info.type === 'video'));
        const rp = rp0;
        collected.push({ id, bid: mb.bid || mb.mblogid || null, created_at: mb.created_at, date: d, text, attitudes: mb.attitudes_count || 0, comments: mb.comments_count || 0, reposts: mb.reposts_count || 0, pics, hasVideo, link, topics, mentions, isRepost: rp.isRepost, repost_user: rp.repost_user, repost_uid: rp.repost_uid, repost_id: rp.repost_id, repost_bid: rp.repost_bid, repost_link: rp.repost_link, repost_text_short: rp.repost_text_short });
      }
      await sleep(Number(runtimeConfig.delay || delay));
      const oldest = collected.map(x => x.date).filter(Boolean).sort((a,b)=>a-b)[0];
      if (runtimeConfig.since && oldest && oldest <= new Date(runtimeConfig.since)) break;
    }
  }

  if (!usedWebOnly) while (true) {
    await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
    await sleep(Number(runtimeConfig.delay || delay));
    loops++;
    if (collected.length > lastCount) { lastCount = collected.length; stale = 0; }
    else { stale++; if (stale >= 8) break; }
    if (maxPages && loops >= maxPages) break;
    if (maxItems && collected.length >= maxItems) break;
    const oldest = collected.map(x => x.date).filter(Boolean).sort((a,b)=>a-b)[0];
    if (runtimeConfig.since && oldest && oldest <= new Date(runtimeConfig.since)) break;
    console.log(`[滚动] 第${loops}次 累计=${collected.length}`);
  }

  if (!usedWebOnly) for (let i = 0; i < 20; i++) {
    const clicked = await page.evaluate(() => {
      const cands = Array.from(document.querySelectorAll('a,button'));
      const btn = cands.find(el => /更多|查看更多|下一页|更多微博/.test(el.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (clicked) console.log('[触发] 点击更多/查看更多');
    if (!clicked) break;
    await sleep(Number(runtimeConfig.delay || delay));
  }

  const oldestAfterScroll = collected.map(x => x.date).filter(Boolean).sort((a,b)=>a-b)[0];
  if (!usedWebOnly && !(runtimeConfig.since && oldestAfterScroll && oldestAfterScroll <= new Date(runtimeConfig.since))) {
    const mPage = await browser.newPage();
    await mPage.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1');
    await mPage.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });
    await mPage.goto(`https://m.weibo.cn/u/${userInfo.uid || uid}`, { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    let mobileSinceId = '';
    for (let pn = 1; pn <= Math.max(50, maxPages); pn++) {
      const pageRes = await mPage.evaluate(async (uid, pn, sinceId) => {
        const url = `https://m.weibo.cn/api/container/getIndex?type=uid&value=${uid}&containerid=107603${uid}&page=${pn}` + (sinceId ? `&since_id=${sinceId}` : '');
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) return { ok: false };
        const j = await resp.json();
        const cards = (j && j.data && j.data.cards) || [];
        const cardInfo = (j && j.data && j.data.cardlistInfo) || {};
        const list = [];
        for (const c of cards) {
          const mb = c.mblog || (c.card_group && c.card_group[0] && c.card_group[0].mblog);
          if (mb) list.push(mb);
        }

        // 并行获取移动端长微博全文
        await Promise.all(list.map(async (mb) => {
          if (mb.isLongText) {
            try {
              const r2 = await fetch(`https://m.weibo.cn/statuses/extend?id=${mb.id}`);
              if (r2.ok) {
                const d2 = await r2.json();
                if (d2 && d2.data && d2.data.longTextContent) {
                  mb.text = d2.data.longTextContent;
                  mb.text_raw = d2.data.longTextContent;
                }
              }
            } catch (_) {}
          }
        }));

        return { ok: true, list, since_id: cardInfo.since_id || '' };
      }, userInfo.uid || uid, pn, mobileSinceId);
      const list = (pageRes && pageRes.ok) ? pageRes.list : [];
      if (pageRes && pageRes.since_id) mobileSinceId = pageRes.since_id;
      console.log(`[移动] 第${pn}页 返回${list.length} since_id=${mobileSinceId || ''}`);
      if (!list.length) { stale++; if (stale >= 5) break; }
      for (const mb of list) {
        // 过滤转发和非原创
        if (mb.retweeted_status) continue;
        
        const id = String(mb.id);
        if (seen.has(id)) continue;
        seen.add(id);
        const text = mb.text_raw || mb.text || '';
        const d = parseDate(mb.created_at);
        const link = `https://m.weibo.cn/detail/${mb.id}`;
        const topics = extractHashtags(text);
        const mentions = extractMentions(text);
        const pics = Array.isArray(mb.pics) ? mb.pics.length : 0;
        const hasVideo = !!(mb.page_info && ((mb.page_info.media_info && mb.page_info.media_info.stream_url) || mb.page_info.type === 'video'));
        const rp = rp0;
        collected.push({ id, bid: mb.bid || mb.mblogid || null, created_at: mb.created_at, date: d, text, attitudes: mb.attitudes_count || 0, comments: mb.comments_count || 0, reposts: mb.reposts_count || 0, pics, hasVideo, link, topics, mentions, isRepost: rp.isRepost, repost_user: rp.repost_user, repost_uid: rp.repost_uid, repost_id: rp.repost_id, repost_bid: rp.repost_bid, repost_link: rp.repost_link, repost_text_short: rp.repost_text_short });
      }
      await sleep(Number(runtimeConfig.delay || delay));
      const oldest = collected.map(x => x.date).filter(Boolean).sort((a,b)=>a-b)[0];
      if (runtimeConfig.since && oldest && oldest <= new Date(runtimeConfig.since)) break;
    }
    await mPage.close();
  }

  const stillNotReachedSince = (() => {
    const oldest = collected.map(x => x.date).filter(Boolean).sort((a,b)=>a-b)[0];
    return !(runtimeConfig.since && oldest && oldest <= new Date(runtimeConfig.since));
  })();

  if (!usedWebOnly && stillNotReachedSince && userInfo.screen_name) {
    const sPage = await browser.newPage();
    await sPage.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await sPage.setExtraHTTPHeaders({ 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' });
    for (let pn = 1; pn <= Math.max(50, maxPages); pn++) {
      const url = `https://s.weibo.com/weibo?q=${encodeURIComponent('from:' + userInfo.screen_name)}&type=all&suball=1&timescope=custom:${runtimeConfig.since || ''}:${runtimeConfig.until || ''}&page=${pn}`;
      await sPage.goto(url, { waitUntil: 'domcontentloaded' });
      await sleep(Number(runtimeConfig.delay || delay));
      const list = await sPage.evaluate(() => {
        const items = [];
        document.querySelectorAll('div.card').forEach(card => {
          const txtEl = card.querySelector('p.txt');
          const timeEl = card.querySelector('p.from a.surl-text');
          const linkEl = card.querySelector('p.from a[href*="weibo.com/"]');
          const text = txtEl ? txtEl.innerText.trim() : '';
          const created_at = timeEl ? timeEl.innerText.trim() : '';
          const href = linkEl ? linkEl.getAttribute('href') : '';
          if (text) items.push({ text, created_at, href });
        });
        return items;
      });
      console.log(`[搜索] 第${pn}页 返回${list.length}`);
      if (!list.length) break;
      for (const it of list) {
        const idMatch = it.href && it.href.match(/\/(\w{8,})$/);
        const id = idMatch ? it.href : it.href || '';
        const d = it.created_at ? new Date(it.created_at.replace(/年|月/g,'-').replace('日','')) : null;
        const link = it.href ? (it.href.startsWith('http') ? it.href : 'https:' + it.href) : '';
        const text = it.text || '';
        if (!text) continue;
        const topics = (text.match(/#([^#]+)#/g) || []).map(s=>s.replace(/^#|#$/g,''));
        const mentions = (text.match(/@([\u4e00-\u9fa5A-Za-z0-9_\-]+)/g) || []).map(s=>s.replace(/^@/,''));
        const key = link || text.slice(0,50);
        if (seen.has(key)) continue;
        seen.add(key);
        const isRepost = /\/@/.test(text) || /转发微博/.test(text);
        if (isRepost) continue;
        collected.push({ id: key, bid: null, created_at: it.created_at || '', date: d, text, attitudes: 0, comments: 0, reposts: 0, pics: 0, hasVideo: false, link, topics, mentions, isRepost: false, repost_user: '', repost_uid: '', repost_id: '', repost_bid: '', repost_link: '', repost_text_short: '' });
      }
      const oldest = collected.map(x => x.date).filter(Boolean).sort((a,b)=>a-b)[0];
      if (runtimeConfig.since && oldest && oldest <= new Date(runtimeConfig.since)) break;
    }
    await sPage.close();
  }

  const filtered = filterPosts(collected, runtimeConfig.since, runtimeConfig.until, runtimeConfig.keywords);
  const sum = summarize(filtered);
  printSummary(userInfo, sum);
  saveJson(userInfo, filtered, runtimeConfig.since, runtimeConfig.until);
  await browser.close();
}

main().catch(err => { console.error('执行失败', err.message); process.exit(1); });
function buildRepost(mb) {
  const r = mb && mb.retweeted_status;
  const isRepost = !!r;
  const repost_user = r && r.user ? (r.user.screen_name || '') : '';
  const repost_uid = r && r.user ? String(r.user.id || '') : '';
  const repost_id = r ? String(r.id || '') : '';
  const repost_bid = r ? (r.bid || '') : '';
  const repost_link = r ? (`https://weibo.com/${repost_uid}/${repost_bid || ''}`) : '';
  const textRaw = r ? (r.text_raw || r.text || '') : '';
  const repost_text_short = truncate(textRaw, 80);
  return { isRepost, repost_user, repost_uid, repost_id, repost_bid, repost_link, repost_text_short };
}
