const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = process.env.PORT || 4173;
const ROOT = process.cwd();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const PLATFORMS = {
  instagram: { label: 'Instagram', url: 'https://instagram.com/{u}', notFound: ["Sorry, this page isn't available", 'Page Not Found'] },
  facebook: { label: 'Facebook', url: 'https://facebook.com/{u}', notFound: ['content not found', 'isn’t available'] },
  twitter: { label: 'Twitter/X', url: 'https://twitter.com/{u}', notFound: ['This account doesn\'t exist', 'page doesn\'t exist'] },
  github: { label: 'GitHub', url: 'https://github.com/{u}', notFound: ['Not Found'] },
  reddit: { label: 'Reddit', url: 'https://reddit.com/user/{u}', notFound: ['page not found', 'nobody on reddit goes by that name'] },
  pinterest: { label: 'Pinterest', url: 'https://pinterest.com/{u}', notFound: ['Sorry, we couldn\'t find that page'] },
  tiktok: { label: 'TikTok', url: 'https://tiktok.com/@{u}', notFound: ['Couldn’t find this account', 'couldn\'t find this account'] },
  linkedin: { label: 'LinkedIn', url: 'https://linkedin.com/in/{u}', notFound: ['This page doesn\'t exist', 'profile not found'] },
  telegram: { label: 'Telegram', url: 'https://t.me/{u}', notFound: ['If you have Telegram, you can contact'] },
  youtube: { label: 'YouTube', url: 'https://youtube.com/@{u}', notFound: ['This page isn\'t available'] },
  medium: { label: 'Medium', url: 'https://medium.com/@{u}', notFound: ['Page not found'] },
  stackoverflow: { label: 'StackOverflow', url: 'https://stackoverflow.com/users/{u}', notFound: ['Page not found'] },
  twitch: { label: 'Twitch', url: 'https://twitch.tv/{u}', notFound: ['Sorry. Unless you’ve got a time machine'] },
  deviantart: { label: 'DeviantArt', url: 'https://deviantart.com/{u}', notFound: ['deviation not found', 'page not found'] },
  soundcloud: { label: 'SoundCloud', url: 'https://soundcloud.com/{u}', notFound: ['We can’t find that user'] },
};

function sendJson(res, code, data) {
  res.writeHead(code, { 'Content-Type': MIME['.json'] });
  res.end(JSON.stringify(data));
}

async function checkProfile(platformKey, username) {
  const p = PLATFORMS[platformKey];
  if (!p) return { platform: platformKey, exists: null, reason: 'unknown_platform' };
  const profileUrl = p.url.replace('{u}', encodeURIComponent(username));

  try {
    const resp = await fetch(profileUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DoomsEye/1.0; +https://localhost)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    const text = await resp.text();
    const lower = text.toLowerCase();
    const markerHit = p.notFound.some((m) => lower.includes(m.toLowerCase()));

    if (resp.status === 404 || markerHit) {
      return { platform: p.label, key: platformKey, username, exists: false, confidence: 'high', status: resp.status, url: profileUrl };
    }
    if (resp.ok || (resp.status >= 300 && resp.status < 400)) {
      return { platform: p.label, key: platformKey, username, exists: true, confidence: markerHit ? 'low' : 'medium', status: resp.status, url: profileUrl };
    }

    return { platform: p.label, key: platformKey, username, exists: null, confidence: 'low', status: resp.status, url: profileUrl };
  } catch (error) {
    return { platform: p.label, key: platformKey, username, exists: null, confidence: 'low', status: 0, url: profileUrl, reason: error.message };
  }
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
        fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`).then((r) => r.json()),
        fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=TXT`).then((r) => r.json()),
      ]);
      return sendJson(res, 200, {
        domain,
        mxRecords: (mx.Answer || []).map((x) => x.data),
        txtRecords: (txt.Answer || []).map((x) => x.data),
      });
    } catch (e) {
      return sendJson(res, 200, { domain, mxRecords: [], txtRecords: [], error: 'lookup_failed' });
    }
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
    const ext = path.extname(abs);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  if (urlObj.pathname.startsWith('/api/')) {
    return handleApi(req, res, urlObj);
  }
  return serveFile(req, res, urlObj);
});

server.listen(PORT, () => {
  console.log(`DoomsEye server running on http://0.0.0.0:${PORT}`);
});
