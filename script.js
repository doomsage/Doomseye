const platformPatterns = [
  { key: 'instagram', name: 'Instagram', icon: '📸', url: 'https://instagram.com/{u}' },
  { key: 'facebook', name: 'Facebook', icon: '📘', url: 'https://facebook.com/{u}' },
  { key: 'twitter', name: 'Twitter/X', icon: '🐦', url: 'https://twitter.com/{u}' },
  { key: 'github', name: 'GitHub', icon: '💻', url: 'https://github.com/{u}' },
  { key: 'reddit', name: 'Reddit', icon: '👽', url: 'https://reddit.com/user/{u}' },
  { key: 'pinterest', name: 'Pinterest', icon: '📌', url: 'https://pinterest.com/{u}' },
  { key: 'tiktok', name: 'TikTok', icon: '🎵', url: 'https://tiktok.com/@{u}' },
  { key: 'linkedin', name: 'LinkedIn', icon: '🔗', url: 'https://linkedin.com/in/{u}' },
  { key: 'telegram', name: 'Telegram', icon: '✈️', url: 'https://t.me/{u}' },
  { key: 'youtube', name: 'YouTube', icon: '▶️', url: 'https://youtube.com/@{u}' },
  { key: 'medium', name: 'Medium', icon: '✍️', url: 'https://medium.com/@{u}' },
  { key: 'stackoverflow', name: 'StackOverflow', icon: '🧱', url: 'https://stackoverflow.com/users/{u}' },
  { key: 'twitch', name: 'Twitch', icon: '🟣', url: 'https://twitch.tv/{u}' },
  { key: 'deviantart', name: 'DeviantArt', icon: '🎨', url: 'https://deviantart.com/{u}' },
  { key: 'soundcloud', name: 'SoundCloud', icon: '🎧', url: 'https://soundcloud.com/{u}' },
];

const state = {
  report: { module: 'username', generatedAt: null, summary: {}, results: [] },
  usernameCache: [],
};

const tabs = document.querySelectorAll('.tab-btn');
const modules = document.querySelectorAll('.module');
const consoleEl = document.getElementById('scan-console');
const summaryGrid = document.getElementById('summary-grid');
const scoreFilter = document.getElementById('score-filter');
const scoreFilterValue = document.getElementById('score-filter-value');

const logs = {
  username: [
    'Initializing Doomseye scanner...',
    'Loading live platform connectors...',
    'Validating exact usernames...',
    'Checking username variations...',
    'Compiling evidence-backed report...',
  ],
  phone: [
    'Initializing telecom intelligence module...',
    'Normalizing phone input...',
    'Generating verifiable OSINT pivots...',
    'Building web-trace query set...',
  ],
  email: [
    'Initializing email intelligence module...',
    'Extracting mailbox and domain data...',
    'Running live DNS intelligence lookup...',
    'Generating pivot usernames and links...',
  ],
};

function switchTab(target) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === target));
  modules.forEach((mod) => mod.classList.toggle('active', mod.id === `${target}-module`));
}

tabs.forEach((tab) => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));

function logLine(text) {
  const ts = new Date().toLocaleTimeString();
  consoleEl.textContent += `[${ts}] ${text}\n`;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulatedLogSequence(lines) {
  for (const line of lines) {
    logLine(line);
    await delay(220);
  }
}

function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/^@/, '');
}

function generateUsernameVariations(base) {
  const b = normalizeUsername(base);
  const out = new Set([
    b,
    `${b}_`,
    `${b}.dev`,
    `${b}_official`,
    `${b}01`,
    `${b}123`,
    b.replace(/\./g, '_'),
    b.replace(/_/g, '.'),
    b.replace(/a/g, '4').replace(/o/g, '0'),
  ]);
  if (b.length > 3) out.add(`${b.slice(0, -1)}_`);
  return [...out].filter(Boolean).slice(0, 12);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + c);
    }
  }
  return dp[a.length][b.length];
}

function similarityScore(origin, candidate) {
  if (origin === candidate) return 100;
  const dist = levenshtein(origin, candidate);
  return Math.max(0, Math.round((1 - dist / Math.max(origin.length, candidate.length, 1)) * 100));
}

function createCard(html) {
  const card = document.createElement('article');
  card.className = 'result-card';
  card.innerHTML = html;
  return card;
}

function updateSummary(summary) {
  const entries = [summary.platformsChecked, summary.exactMatches, summary.similarMatches, summary.identities, `${summary.scanTimeMs} ms`];
  [...summaryGrid.querySelectorAll('strong')].forEach((el, i) => { el.textContent = entries[i] ?? 0; });
}

function renderUsernameResults(results) {
  const container = document.getElementById('username-results');
  const meta = document.getElementById('username-meta');
  container.innerHTML = '';

  const threshold = Number(scoreFilter.value);
  const filtered = results.filter((r) => r.matchScore >= threshold);

  filtered.forEach((r) => {
    container.appendChild(createCard(`
      <h4>${r.icon} ${r.platform}</h4>
      <span class="badge">Match ${r.matchScore}% • ${r.confidence} confidence</span>
      <p><strong>Detected Username:</strong> ${r.detectedUsername}</p>
      <p><strong>Status:</strong> ${r.exists ? 'Profile reachable' : 'Not found'}</p>
      <p><strong>Profile URL:</strong> <a target="_blank" rel="noopener" href="${r.url}">${r.url}</a></p>
      <button class="copy-btn" data-copy="${r.url}">Copy URL</button>
    `));
  });

  meta.textContent = `Live verified results: ${filtered.length} / ${results.length} (min score ${threshold}%)`;
}

async function checkProfile(platform, username) {
  const q = new URLSearchParams({ platform: platform.key, username }).toString();
  const resp = await fetch(`/api/check-profile?${q}`);
  return resp.json();
}

async function runUsernameScan(input, options = { append: false }) {
  const started = performance.now();
  const username = normalizeUsername(input);
  if (!username) return;

  await simulatedLogSequence(logs.username);

  const variations = generateUsernameVariations(username);
  const checks = [];

  for (const platform of platformPatterns) {
    for (const variant of variations) {
      const apiResult = await checkProfile(platform, variant);
      if (apiResult.exists) {
        checks.push({
          platform: platform.name,
          icon: platform.icon,
          detectedUsername: variant,
          matchScore: similarityScore(username, variant),
          url: apiResult.url,
          exists: true,
          confidence: apiResult.confidence || 'medium',
        });
      }
      if (variant === username) break;
    }
  }

  checks.sort((a, b) => b.matchScore - a.matchScore);

  if (!options.append) {
    state.usernameCache = checks;
  } else {
    state.usernameCache = [...state.usernameCache, ...checks].filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i).sort((a, b) => b.matchScore - a.matchScore);
  }

  renderUsernameResults(state.usernameCache);

  const summary = {
    platformsChecked: platformPatterns.length,
    exactMatches: state.usernameCache.filter((r) => r.matchScore === 100).length,
    similarMatches: state.usernameCache.filter((r) => r.matchScore < 100).length,
    identities: new Set(state.usernameCache.map((r) => r.detectedUsername)).size,
    scanTimeMs: Math.round(performance.now() - started),
  };
  updateSummary(summary);

  state.report = { module: 'username', generatedAt: new Date().toISOString(), input: username, variations, summary, results: state.usernameCache };
}

function detectCountry(number) {
  const map = [['+1', 'United States/Canada'], ['+44', 'United Kingdom'], ['+91', 'India'], ['+61', 'Australia'], ['+81', 'Japan'], ['+49', 'Germany'], ['+33', 'France'], ['+971', 'UAE']];
  return map.find(([prefix]) => number.startsWith(prefix))?.[1] || 'Unknown';
}

async function runPhoneScan(input) {
  const started = performance.now();
  const clean = input.trim();
  const number = clean.startsWith('+') ? clean : `+${clean.replace(/^0+/, '')}`;
  const digits = number.replace(/\D/g, '');

  await simulatedLogSequence(logs.phone);

  const queries = [
    `"${number}"`,
    `"${number}" site:facebook.com`,
    `"${number}" site:linkedin.com`,
    `"${number}" site:twitter.com`,
    `"${number}" site:pastebin.com`,
  ];

  const links = [
    { title: 'Google Search', url: `https://www.google.com/search?q=${encodeURIComponent(number)}` },
    { title: 'DuckDuckGo Search', url: `https://duckduckgo.com/?q=${encodeURIComponent(number)}` },
    { title: 'WhatsApp Click-to-Chat', url: `https://wa.me/${digits}` },
    { title: 'Telegram Global Search', url: `https://t.me/s/${encodeURIComponent(number)}` },
    { title: 'Truecaller Web', url: `https://www.truecaller.com/search/in/${digits}` },
  ];

  const container = document.getElementById('phone-results');
  const meta = document.getElementById('phone-meta');
  container.innerHTML = '';

  container.appendChild(createCard(`
    <h4>📱 Phone Intelligence Snapshot (Real pivots only)</h4>
    <p><strong>Phone Number:</strong> ${number}</p>
    <p><strong>Country:</strong> ${detectCountry(number)}</p>
    <p><strong>Digit Length:</strong> ${digits.length}</p>
    <p><strong>Note:</strong> No guessed names/emails shown. Use links below for verifiable evidence.</p>
  `));

  container.appendChild(createCard(`
    <h4>🔎 Suggested OSINT Queries</h4>
    ${queries.map((q) => `<p><code>${q}</code></p>`).join('')}
  `));

  container.appendChild(createCard(`
    <h4>🧭 Investigation Links</h4>
    ${links.map((l) => `<p><a target="_blank" rel="noopener" href="${l.url}">${l.title}</a></p>`).join('')}
  `));

  meta.textContent = 'Real-output mode: only direct search pivots and formatting intelligence.';

  const summary = { platformsChecked: links.length, exactMatches: 0, similarMatches: queries.length, identities: 0, scanTimeMs: Math.round(performance.now() - started) };
  updateSummary(summary);
  state.report = { module: 'phone', generatedAt: new Date().toISOString(), input: number, summary, result: { country: detectCountry(number), queries, links } };
}

function emailUserVariants(user) {
  const clean = user.toLowerCase().replace(/[^a-z0-9._]/g, '');
  return [...new Set([clean, clean.replace(/_/g, '.'), clean.replace(/\./g, '_'), `${clean}01`, `${clean}_official`])].filter(Boolean);
}

async function lookupDomain(domain) {
  const res = await fetch(`/api/domain-info?domain=${encodeURIComponent(domain)}`);
  return res.json();
}

async function runEmailScan(input) {
  const started = performance.now();
  const email = input.trim().toLowerCase();
  const [username, domain] = email.split('@');
  if (!username || !domain) return;

  await simulatedLogSequence(logs.email);

  const container = document.getElementById('email-results');
  const meta = document.getElementById('email-meta');
  container.innerHTML = '';

  const domainInfo = await lookupDomain(domain);
  const hash = md5(email);
  const whoisLink = `https://who.is/whois/${domain}`;
  const gravatarLink = `https://www.gravatar.com/avatar/${hash}?d=404`;
  const variants = emailUserVariants(username);

  container.appendChild(createCard(`
    <h4>📧 Email Intelligence Snapshot (Live data)</h4>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Extracted Username:</strong> ${username}</p>
    <p><strong>Domain:</strong> ${domain}</p>
    <p><strong>MX Records:</strong> ${(domainInfo.mxRecords || []).join(' | ') || 'None resolved'}</p>
    <p><strong>TXT Records:</strong> ${(domainInfo.txtRecords || []).slice(0, 3).join(' | ') || 'None resolved'}</p>
    <p><strong>WHOIS:</strong> <a target="_blank" rel="noopener" href="${whoisLink}">${whoisLink}</a></p>
    <p><strong>Gravatar Probe:</strong> <a target="_blank" rel="noopener" href="${gravatarLink}">${gravatarLink}</a></p>
  `));

  container.appendChild(createCard(`
    <h4>🧬 Username Pivots from Email</h4>
    ${variants.map((v) => `<p>${v}</p>`).join('')}
  `));

  meta.textContent = 'Real-output mode: DNS + public pivot links, no fabricated personal details.';

  state.usernameCache = [];
  for (const v of variants.slice(0, 3)) {
    await runUsernameScan(v, { append: true });
  }

  const summary = {
    platformsChecked: platformPatterns.length,
    exactMatches: state.usernameCache.filter((r) => r.matchScore === 100).length,
    similarMatches: state.usernameCache.filter((r) => r.matchScore < 100).length,
    identities: new Set(state.usernameCache.map((r) => r.detectedUsername)).size,
    scanTimeMs: Math.round(performance.now() - started),
  };
  updateSummary(summary);

  state.report = {
    module: 'email',
    generatedAt: new Date().toISOString(),
    input: email,
    summary,
    result: { username, domain, domainInfo, whoisLink, gravatarLink, variants, usernameResults: state.usernameCache },
  };
}

function md5(input) {
  const hc = '0123456789abcdef';
  function rh(n) { let s = ''; for (let j = 0; j <= 3; j++) s += hc.charAt((n >> (j * 8 + 4)) & 0x0f) + hc.charAt((n >> (j * 8)) & 0x0f); return s; }
  function ad(x, y) { const l = (x & 0xffff) + (y & 0xffff); const m = (x >> 16) + (y >> 16) + (l >> 16); return (m << 16) | (l & 0xffff); }
  function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
  function cm(q, a, b, x, s, t) { return ad(rl(ad(ad(a, q), ad(x, t)), s), b); }
  function ff(a, b, c, d, x, s, t) { return cm((b & c) | ((~b) & d), a, b, x, s, t); }
  function gg(a, b, c, d, x, s, t) { return cm((b & d) | (c & (~d)), a, b, x, s, t); }
  function hh(a, b, c, d, x, s, t) { return cm(b ^ c ^ d, a, b, x, s, t); }
  function ii(a, b, c, d, x, s, t) { return cm(c ^ (b | (~d)), a, b, x, s, t); }
  function sb(x) { let i; const nblk = ((x.length + 8) >> 6) + 1; const blks = new Array(nblk * 16).fill(0); for (i = 0; i < x.length; i++) blks[i >> 2] |= x.charCodeAt(i) << ((i % 4) * 8); blks[i >> 2] |= 0x80 << ((i % 4) * 8); blks[nblk * 16 - 2] = x.length * 8; return blks; }
  let x = sb(unescape(encodeURIComponent(input))); let a = 0x67452301; let b = 0xefcdab89; let c = 0x98badcfe; let d = 0x10325476;
  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;
    a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586); c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426); c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417); c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101); c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
    a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632); c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083); c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690); c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784); c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
    a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463); c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353); c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222); c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835); c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
    a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415); c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606); c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744); c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379); c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
    a = ad(a, oa); b = ad(b, ob); c = ad(c, oc); d = ad(d, od);
  }
  return [a, b, c, d].map(rh).join('');
}

document.getElementById('username-form').addEventListener('submit', (e) => { e.preventDefault(); runUsernameScan(document.getElementById('username-input').value); });
document.getElementById('phone-form').addEventListener('submit', (e) => { e.preventDefault(); runPhoneScan(document.getElementById('phone-input').value); });
document.getElementById('email-form').addEventListener('submit', (e) => { e.preventDefault(); runEmailScan(document.getElementById('email-input').value); });

scoreFilter.addEventListener('input', () => {
  scoreFilterValue.textContent = `${scoreFilter.value}%`;
  renderUsernameResults(state.usernameCache);
});

document.body.addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.copy).then(() => logLine(`Copied URL: ${btn.dataset.copy}`));
});

document.getElementById('clear-console').addEventListener('click', () => { consoleEl.textContent = ''; });

document.getElementById('export-json').addEventListener('click', () => {
  const payload = JSON.stringify(state.report, null, 2);
  const blob = new Blob([payload], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `doomseye-${state.report.module}-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  logLine('Report exported as JSON.');
});

logLine('DoomsEye console booted in REAL-OUTPUT mode (no fabricated identity fields).');
