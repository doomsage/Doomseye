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
  scanning: false,
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
    'Checking exact handles + variations...',
    'Running parallel profile verification...',
    'Compiling evidence-backed report...',
  ],
  phone: [
    'Initializing phone intelligence...',
    'Calling backend OSINT pivots...',
    'Applying real-data only policy...',
  ],
  email: [
    'Initializing email intelligence module...',
    'Collecting DNS & account pivots...',
    'Launching username recon from email local-part...',
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
    await delay(180);
  }
}

function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/^@/, '');
}

function generateUsernameVariations(base) {
  const b = normalizeUsername(base);
  const set = new Set([
    b,
    `${b}_`,
    `${b}.dev`,
    `${b}_official`,
    `${b}01`,
    `${b}123`,
    `${b}.x`,
    b.replace(/\./g, '_'),
    b.replace(/_/g, '.'),
    b.replace(/a/g, '4').replace(/o/g, '0'),
  ]);
  if (b.length > 3) {
    set.add(`${b.slice(0, -1)}_`);
    set.add(`${b.slice(0, -1)}1`);
  }
  return [...set].filter(Boolean).slice(0, 10);
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

  if (!filtered.length) {
    meta.textContent = 'No verified profile detected yet. Try another handle/variation.';
    return;
  }

  const openTopBtn = document.createElement('button');
  openTopBtn.className = 'ghost-btn';
  openTopBtn.textContent = 'Open Top 5 Results';
  openTopBtn.addEventListener('click', () => {
    filtered.slice(0, 5).forEach((item) => window.open(item.url, '_blank', 'noopener'));
  });
  container.appendChild(openTopBtn);

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

async function runWithConcurrency(tasks, limit = 6) {
  const out = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      try {
        out[i] = await tasks[i]();
      } catch (error) {
        out[i] = { exists: null, error: String(error.message || error) };
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

async function runUsernameScan(input, options = { append: false }) {
  if (state.scanning) {
    logLine('A scan is already running. Please wait...');
    return;
  }

  state.scanning = true;
  const started = performance.now();
  const username = normalizeUsername(input);
  if (!username) {
    state.scanning = false;
    return;
  }

  try {
    await simulatedLogSequence(logs.username);

    const variations = generateUsernameVariations(username);
    const tasks = [];

    for (const platform of platformPatterns) {
      for (const variant of variations) {
        tasks.push(async () => {
          const api = await checkProfile(platform, variant);
          if (!api.exists) return null;
          return {
            platform: platform.name,
            icon: platform.icon,
            detectedUsername: variant,
            matchScore: similarityScore(username, variant),
            url: api.url,
            exists: true,
            confidence: api.confidence || 'medium',
          };
        });
      }
    }

    const checks = (await runWithConcurrency(tasks, 8)).filter(Boolean).sort((a, b) => b.matchScore - a.matchScore);

    if (!options.append) {
      state.usernameCache = checks;
    } else {
      state.usernameCache = [...state.usernameCache, ...checks]
        .filter((r, i, arr) => arr.findIndex((x) => x.url === r.url) === i)
        .sort((a, b) => b.matchScore - a.matchScore);
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
    logLine(`Username scan complete: ${state.usernameCache.length} verified profile hits.`);
  } finally {
    state.scanning = false;
  }
}

function emailUserVariants(user) {
  const clean = user.toLowerCase().replace(/[^a-z0-9._]/g, '');
  return [...new Set([clean, clean.replace(/_/g, '.'), clean.replace(/\./g, '_'), `${clean}01`, `${clean}_official`])].filter(Boolean);
}

async function lookupDomain(domain) {
  const res = await fetch(`/api/domain-info?domain=${encodeURIComponent(domain)}`);
  return res.json();
}

async function runPhoneScan(input) {
  const started = performance.now();
  const number = input.trim();
  if (!number) return;

  await simulatedLogSequence(logs.phone);

  const truecallerKey = localStorage.getItem('doomseye_truecaller_key') || '';
  const params = new URLSearchParams({ number });
  if (truecallerKey) params.set('truecallerKey', truecallerKey);

  const res = await fetch(`/api/phone-intel?${params}`);
  const data = await res.json();

  const container = document.getElementById('phone-results');
  const meta = document.getElementById('phone-meta');
  container.innerHTML = '';

  if (data.error) {
    meta.textContent = 'Phone intelligence failed. Please enter a valid number.';
    return;
  }

  const saveKeyCard = createCard(`
    <h4>🔐 Optional Truecaller API</h4>
    <p>Paste your own API key (stored locally in your browser). This is optional.</p>
    <input id="truecaller-key-input" placeholder="Enter Truecaller/RapidAPI key" style="width:100%;margin:6px 0;padding:8px;background:#050505;border:1px solid #1d3f31;color:#00ff9f;" />
    <button id="save-tc-key" class="ghost-btn">Save Key</button>
  `);
  container.appendChild(saveKeyCard);

  container.appendChild(createCard(`
    <h4>📱 Real Phone Intelligence</h4>
    <p><strong>Input:</strong> ${data.normalized.input}</p>
    <p><strong>E.164:</strong> ${data.normalized.e164}</p>
    <p><strong>Country:</strong> ${data.country}</p>
    <p><strong>Truecaller:</strong> ${data.truecaller.enabled ? (data.truecaller.ok ? 'Response received' : `Lookup failed (${data.truecaller.error || data.truecaller.status})`) : 'Disabled (no key)'} </p>
  `));

  container.appendChild(createCard(`
    <h4>🔎 Suggested OSINT Queries</h4>
    ${data.queries.map((q) => `<p><code>${q}</code></p>`).join('')}
  `));

  container.appendChild(createCard(`
    <h4>🧭 Investigation Links (open in new tab)</h4>
    ${data.links.map((l) => `<p><a target="_blank" rel="noopener" href="${l.url}">${l.title}</a></p>`).join('')}
  `));

  if (data.truecaller.enabled && data.truecaller.ok) {
    container.appendChild(createCard(`
      <h4>📡 Truecaller Raw Result</h4>
      <pre style="white-space:pre-wrap;max-height:220px;overflow:auto;">${escapeHtml(JSON.stringify(data.truecaller.data, null, 2))}</pre>
    `));
  }

  meta.textContent = 'Phone recon complete. Results are real pivots + optional API-backed enrichment.';

  const summary = {
    platformsChecked: data.links.length,
    exactMatches: 0,
    similarMatches: data.queries.length,
    identities: data.truecaller.ok ? 1 : 0,
    scanTimeMs: Math.round(performance.now() - started),
  };
  updateSummary(summary);

  state.report = { module: 'phone', generatedAt: new Date().toISOString(), input: number, summary, result: data };

  const keyInput = document.getElementById('truecaller-key-input');
  const saveBtn = document.getElementById('save-tc-key');
  if (keyInput) keyInput.value = truecallerKey;
  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const value = (keyInput.value || '').trim();
      localStorage.setItem('doomseye_truecaller_key', value);
      logLine(value ? 'Truecaller key saved locally. Re-run phone scan.' : 'Truecaller key cleared.');
    });
  }
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
  const gh = await fetch(`/api/gravatar-hash?email=${encodeURIComponent(email)}`).then((r) => r.json()).catch(() => ({ hash: '' }));
  const hash = gh.hash || '';
  const whoisLink = `https://who.is/whois/${domain}`;
  const gravatarLink = `https://www.gravatar.com/avatar/${hash}?d=404`;
  const googleEmail = `https://www.google.com/search?q=${encodeURIComponent('"' + email + '"')}`;
  const variants = emailUserVariants(username);

  container.appendChild(createCard(`
    <h4>📧 Email Intelligence (Real signals)</h4>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Domain:</strong> ${domain}</p>
    <p><strong>MX Records:</strong> ${(domainInfo.mxRecords || []).join(' | ') || 'None resolved'}</p>
    <p><strong>TXT Records:</strong> ${(domainInfo.txtRecords || []).slice(0, 3).join(' | ') || 'None resolved'}</p>
    <p><strong>WHOIS:</strong> <a target="_blank" rel="noopener" href="${whoisLink}">${whoisLink}</a></p>
    <p><strong>Gravatar Probe:</strong> <a target="_blank" rel="noopener" href="${gravatarLink}">${gravatarLink}</a></p>
    <p><strong>Google Dork:</strong> <a target="_blank" rel="noopener" href="${googleEmail}">Search this email</a></p>
  `));

  container.appendChild(createCard(`
    <h4>🧬 Username Pivots from Email</h4>
    ${variants.map((v) => `<p><a target="_blank" rel="noopener" href="https://www.google.com/search?q=${encodeURIComponent(v)}">${v}</a></p>`).join('')}
  `));

  meta.textContent = 'Email recon complete. Links open in new tab for direct investigation.';

  state.usernameCache = [];
  for (const variant of variants.slice(0, 3)) {
    await runUsernameScan(variant, { append: true });
  }

  const summary = {
    platformsChecked: platformPatterns.length,
    exactMatches: state.usernameCache.filter((r) => r.matchScore === 100).length,
    similarMatches: state.usernameCache.filter((r) => r.matchScore < 100).length,
    identities: new Set(state.usernameCache.map((r) => r.detectedUsername)).size,
    scanTimeMs: Math.round(performance.now() - started),
  };

  updateSummary(summary);
  state.report = { module: 'email', generatedAt: new Date().toISOString(), input: email, summary, result: { username, domain, domainInfo, whoisLink, gravatarLink, variants, usernameResults: state.usernameCache } };
}

function escapeHtml(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
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

logLine('DoomsEye booted. Real OSINT mode enabled.');
