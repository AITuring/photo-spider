const fs = require('fs');

// Read new.json
const newJsonPath = '/Users/lishengyu/Desktop/picture/new.json';
const newJson = JSON.parse(fs.readFileSync(newJsonPath, 'utf8'));

// Dynasties and Categories regex
const dynasties = [
  { name: '先秦', regex: /商|周|春秋|战国|夏|二里头/ },
  { name: '汉', regex: /汉代|西汉|东汉|秦汉|^汉$/ },
  { name: '魏晋南北朝', regex: /魏|晋|南北朝|北齐|北魏|东魏|西魏|北周|南朝|北朝/ },
  { name: '唐', regex: /唐代|大唐|武则天|唐朝|^唐$/ },
  { name: '五代十国', regex: /五代|十国|后梁|后唐|后晋|后汉|后周/ },
  { name: '宋', regex: /宋代|北宋|南宋|宋朝|^宋$/ },
  { name: '辽', regex: /辽/ },
  { name: '元', regex: /元代|元朝|^元$/ },
  { name: '明', regex: /明代|明朝|^明$/ },
  { name: '清', regex: /清代|清朝|^清$/ },
  { name: '民国/近现代', regex: /民国|近现代/ },
];

const categories = [
  { name: '书法', regex: /帖|碑|隶书|楷书|行书|草书|篆书|^书$/ },
  { name: '绘画', regex: /图|画|卷|轴|壁画/ },
  { name: '青铜', regex: /铜|鼎|尊|爵|钺|剑|戈|钟/ },
  { name: '陶瓷', regex: /陶|瓷|釉|瓶|碗|罐|枕/ },
  { name: '石刻', regex: /石|像|雕|刻|造像/ },
  { name: '漆器', regex: /漆|剔红|剔犀/ },
  { name: '玉器', regex: /玉|璧|环|佩/ },
  { name: '金银器', regex: /金|银/ },
  { name: '古建筑', regex: /寺|塔|殿|陵/ },
];

const dynastyGroups = {};
dynasties.forEach(d => dynastyGroups[d.name] = []);
const categoryGroups = {};
categories.forEach(c => categoryGroups[c.name] = []);
const unclassified = [];

newJson.items.forEach(item => {
  const text = item.text || '';
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) return;

  const firstLine = lines[0];

  // Filter out non-artifact posts
  if (firstLine.startsWith('#') || firstLine.includes('No ') || firstLine.length > 50) {
     unclassified.push(item);
     return;
  }

  const title = firstLine;
  const link = `https://m.weibo.cn/detail/${item.id}`;

  // Determine Dynasty
  let dynasty = null;
  let specificDynasty = '';
  // Look in the first 3 lines
  const searchContextLines = lines.slice(0, 3);
  const searchContext = searchContextLines.join(' ');
  
  for (const d of dynasties) {
    if (d.regex.test(searchContext)) {
      dynasty = d.name;
      // Try to find specific dynasty string
      for (const l of searchContextLines) {
          const match = l.match(d.regex);
          if (match) {
              specificDynasty = l; // Use the whole line if short
              if (l.length > 10) specificDynasty = match[0]; // Use match if line is long
              break;
          }
      }
      break; 
    }
  }

  // Determine Category
  let category = null;
  // Look in Title primarily
  for (const c of categories) {
    if (c.regex.test(title)) {
      category = c.name;
      break;
    }
  }
  // Fallback: Check search context
  if (!category) {
       for (const c of categories) {
        if (c.regex.test(searchContext)) {
            category = c.name;
            break;
        }
      }
  }

  // Add to groups
  let added = false;
  
  if (dynasty) {
    dynastyGroups[dynasty].push({ title, link, specificDynasty });
    added = true;
  }
  
  if (category) {
    categoryGroups[category].push({ title, link });
    added = true;
  }

  if (!added) {
    unclassified.push(item);
  }
});

// Generate Output
let output = '';

output += '按朝代分类\n';
dynasties.forEach(d => {
  output += `${d.name}\n`;
  dynastyGroups[d.name].forEach(item => {
    let extra = item.specificDynasty;
    if (extra && (item.title.includes(extra) || extra === d.name)) extra = '';
    // If extra is just "汉" and group is "汉", skip
    if (extra === '汉' || extra === '唐' || extra === '宋' || extra === '元' || extra === '明' || extra === '清') extra = '';
    
    output += `- ${item.title}${extra ? ' ' + extra : ''}（${item.link}）\n`;
  });
  output += '\n';
});

output += '按种类分类\n';
categories.forEach(c => {
  output += `${c.name}\n`;
  categoryGroups[c.name].forEach(item => {
    output += `- ${item.title}（${item.link}）\n`;
  });
  output += '\n';
});

output += '未归类\n';
unclassified.forEach(item => {
   const text = item.text || '';
   const title = text.split('\n')[0].substring(0, 40).replace(/\n/g, ' ');
   const link = `https://m.weibo.cn/detail/${item.id}`;
   output += `- ${title} （${link}）\n`;
});

console.log(output);