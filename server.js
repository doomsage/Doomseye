const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 4173;
const ROOT = process.cwd();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const PLATFORMS = {
  instagram: { label: 'Instagram', url: 'https://instagram.com/{u}', notFound: ["sorry, this page isn't available", 'page not found'] },
  facebook: { label: 'Facebook', url: 'https://facebook.com/{u}', notFound: ['content not found', 'isn’t available'] },
  twitter: { label: 'Twitter/X', url: 'https://twitter.com/{u}', notFound: ["this account doesn't exist", "page doesn't exist"] },
  github: { label: 'GitHub', url: 'https://github.com/{u}', notFound: ['not found'] },
  reddit: { label: 'Reddit', url: 'https://reddit.com/user/{u}', notFound: ['page not found', 'nobody on reddit goes by that name'] },
  pinterest: { label: 'Pinterest', url: 'https://pinterest.com/{u}', notFound: ["sorry, we couldn't find that page"] },
  tiktok: { label: 'TikTok', url: 'https://tiktok.com/@{u}', notFound: ['couldn’t find this account', "couldn't find this account"] },
  linkedin: { label: 'LinkedIn', url: 'https://linkedin.com/in/{u}', notFound: ["this page doesn't exist", 'profile not found'] },
  telegram: { label: 'Telegram', url: 'https://t.me/{u}', notFound: ['if you have telegram, you can contact'] },
  youtube: { label: 'YouTube', url: 'https://youtube.com/@{u}', notFound: ["this page isn't available"] },
  medium: { label: 'Medium', url: 'https://medium.com/@{u}', notFound: ['page not found'] },
  stackoverflow: { label: 'StackOverflow', url: 'https://stackoverflow.com/users/{u}', notFound: ['page not found'] },
  twitch: { label: 'Twitch', url: 'https://twitch.tv/{u}', notFound: ['unless you’ve got a time machine'] },
  deviantart: { label: 'DeviantArt', url: 'https://deviantart.com/{u}', notFound: ['page not found'] },
  soundcloud: { label: 'SoundCloud', url: 'https://soundcloud.com/{u}', notFound: ["we can’t find that user", "we can't find that user"] },
};

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(data));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8500) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

async function checkProfile(platformKey, username) {
  const p = PLATFORMS[platformKey];
  if (!p) return { platform: platformKey, exists: null, reason: 'unknown_platform' };

  const profileUrl = p.url.replace('{u}', encodeURIComponent(username));
  try {
    const resp = await fetchWithTimeout(profileUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DoomsEye/2.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const text = (await resp.text()).toLowerCase();
    const markerHit = p.notFound.some((m) => text.includes(m.toLowerCase()));

    if (resp.status === 404 || markerHit) {
      return { platform: p.label, key: platformKey, username, exists: false, confidence: 'high', status: resp.status, url: profileUrl };
    }
    if (resp.ok || (resp.status >= 300 && resp.status < 400)) {
      return { platform: p.label, key: platformKey, username, exists: true, confidence: markerHit ? 'low' : 'medium', status: resp.status, url: profileUrl };
    }
    return { platform: p.label, key: platformKey, username, exists: null, confidence: 'low', status: resp.status, url: profileUrl };
  } catch (error) {
    return { platform: p.label, key: platformKey, username, exists: null, confidence: 'low', status: 0, url: profileUrl, reason: String(error.message || error) };
  }
}

function normalizePhone(raw) {
  const trim = String(raw || '').trim();
  const digits = trim.replace(/\D/g, '');
  if (!digits) return null;
  const e164 = trim.startsWith('+') ? `+${digits}` : `+${digits}`;
  return { input: trim, digits, e164 };
}

function countryFromE164(number) {
  const map = [
    ['+1', 'United States/Canada'], ['+44', 'United Kingdom'], ['+91', 'India'], ['+61', 'Australia'],
    ['+81', 'Japan'], ['+49', 'Germany'], ['+33', 'France'], ['+971', 'UAE'], ['+92', 'Pakistan'],
  ];
  return map.find(([cc]) => number.startsWith(cc))?.[1] || 'Unknown';
}

async function truecallerLookup(number, apiKey) {
  if (!apiKey) {
    return { enabled: false, source: 'disabled', message: 'No Truecaller API key supplied (optional).' };
  }

  // RapidAPI-compatible host (BYO key).
  const host = process.env.TRUECALLER_API_HOST || 'truecaller-data2.p.rapidapi.com';
  const url = `https://${host}/search/${encodeURIComponent(number)}`;
  try {
    const resp = await fetchWithTimeout(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': host,
      },
    }, 10000);

    const body = await resp.text();
    let parsed;
    try { parsed = JSON.parse(body); } catch { parsed = { raw: body.slice(0, 500) }; }

    return {
      enabled: true,
      source: host,
      status: resp.status,
      ok: resp.ok,
      data: parsed,
    };
  } catch (error) {
    return {
      enabled: true,
      source: host,
      ok: false,
      status: 0,
      error: String(error.message || error),
    };
  }
}

async function phoneIntel(number, truecallerKey) {
  const normalized = normalizePhone(number);
  if (!normalized) return { error: 'invalid_phone' };

  const country = countryFromE164(normalized.e164);
  const queries = [
    `"${normalized.e164}"`,
    `"${normalized.e164}" site:facebook.com`,
    `"${normalized.e164}" site:linkedin.com`,
    `"${normalized.e164}" site:twitter.com`,
    `"${normalized.e164}" site:telegram.org`,
    `"${normalized.e164}" site:pastebin.com`,
    `"${normalized.e164}" site:github.com`,
  ];

  const links = [
    { title: 'Google', url: `https://www.google.com/search?q=${encodeURIComponent(normalized.e164)}` },
    { title: 'DuckDuckGo', url: `https://duckduckgo.com/?q=${encodeURIComponent(normalized.e164)}` },
    { title: 'WhatsApp click-to-chat', url: `https://wa.me/${normalized.digits}` },
    { title: 'Telegram search', url: `https://t.me/s/${encodeURIComponent(normalized.e164)}` },
    { title: 'IntelX phone search', url: `https://intelx.io/?s=${encodeURIComponent(normalized.e164)}` },
    { title: 'HaveIBeenPwned (manual)', url: 'https://haveibeenpwned.com/' },
  ];

  const tc = await truecallerLookup(normalized.e164, truecallerKey);

  return {
    normalized,
    country,
    queries,
    links,
    truecaller: tc,
  };
}

async function handleApi(req, res, urlObj) {
  if (req.method === 'GET' && urlObj.pathname === '/api/platforms') {
    return sendJson(res, 200, { platforms: Object.entries(PLATFORMS).map(([key, v]) => ({ key, name: v.label, pattern: v.url })) });
  }

  if (req.method === 'GET' && urlObj.pathname === '/api/check-profile') {
    const platform = (urlObj.searchParams.get('platform') || '').toLowerCase();
    const username = (urlObj.searchParams.get('username') || '').trim();
    if (!platform || !username) return sendJson(res, 400, { error: 'platform and username required' });
    const result = await checkProfile(platform, username);
    return sendJson(res, 200, result);
  }

  if (req.method === 'GET' && urlObj.pathname === '/api/domain-info') {
    const domain = (urlObj.searchParams.get('domain') || '').trim().toLowerCase();
    if (!domain) return sendJson(res, 400, { error: 'domain required' });
    try {
      const [mx, txt] = await Promise.all([
        fetchWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`).then((r) => r.json()),
        fetchWithTimeout(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=TXT`).then((r) => r.json()),
      ]);

      return sendJson(res, 200, {
        domain,
        mxRecords: (mx.Answer || []).map((x) => x.data),
        txtRecords: (txt.Answer || []).map((x) => x.data),
      });
    } catch {
      return sendJson(res, 200, { domain, mxRecords: [], txtRecords: [], error: 'lookup_failed' });
    }
  }

  if (req.method === 'GET' && urlObj.pathname === '/api/gravatar-hash') {
    const email = (urlObj.searchParams.get('email') || '').trim().toLowerCase();
    if (!email) return sendJson(res, 400, { error: 'email required' });
    const hash = crypto.createHash('md5').update(email).digest('hex');
    return sendJson(res, 200, { email, hash });
  }

  if (req.method === 'GET' && urlObj.pathname === '/api/phone-intel') {
    const number = (urlObj.searchParams.get('number') || '').trim();
    const truecallerKey = (urlObj.searchParams.get('truecallerKey') || '').trim();
    if (!number) return sendJson(res, 400, { error: 'number required' });
    const data = await phoneIntel(number, truecallerKey);
    return sendJson(res, 200, data);
  }

  return sendJson(res, 404, { error: 'not found' });
}

function serveFile(req, res, urlObj) {
  let filePath = urlObj.pathname === '/' ? '/index.html' : urlObj.pathname;
  filePath = path.normalize(filePath).replace(/^\.\.(\/|\\|$)/, '');
  const abs = path.join(ROOT, filePath);

  if (!abs.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(abs, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(abs)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  if (urlObj.pathname.startsWith('/api/')) return handleApi(req, res, urlObj);
  return serveFile(req, res, urlObj);
});

server.listen(PORT, () => {
  console.log(`DoomsEye server running on http://0.0.0.0:${PORT}`);
});
