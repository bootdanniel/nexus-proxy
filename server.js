import express from 'express';
import { request } from 'undici';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'nexus-teste-2026';

const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 11; SM-A307GT) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';

let canaisCache = null;
function getCanais() {
  if (canaisCache) return canaisCache;
  const raw = fs.readFileSync(path.join(__dirname, 'canais.json'), 'utf8');
  canaisCache = JSON.parse(raw);
  return canaisCache;
}

function hmac(msg) {
  return crypto.createHmac('sha256', TOKEN_SECRET).update(msg).digest('base64url');
}

// ---------- ESTÁTICOS ----------
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders(res, fp) {
    if (fp.endsWith('.json')) res.setHeader('Cache-Control', 'public, max-age=300');
  }
}));

// ---------- API: lista de canais ----------
app.get('/api/canais', (req, res) => {
  try {
    const canais = getCanais();
    const pub = canais.map(c => ({
      id: c.id,
      nome: c.nome,
      categoria: c.categoria || 'Outros',
      logo: c.logo || null,
      qtd_servidores: (c.servidores || []).length
    }));
    res.set('Cache-Control', 'public, max-age=300');
    res.json(pub);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- API: gerar token ----------
app.get('/api/token/:id', (req, res) => {
  const { id } = req.params;
  const canais = getCanais();
  if (!canais.find(c => c.id === id)) return res.status(404).json({ error: 'canal não encontrado' });
  const exp = Date.now() + 5 * 60 * 1000;
  const payload = `${id}:${exp}`;
  const token = Buffer.from(`${payload}:${hmac(payload)}`).toString('base64');
  res.json({ token, expires: exp });
});

// ---------- API: resolver URL de watch ----------
app.get('/api/watch/:id', (req, res) => {
  const { id } = req.params;
  const t = req.query.t;
  const s = parseInt(req.query.s || '0', 10);
  if (!t) return res.status(401).json({ error: 'token ausente' });

  let decoded;
  try { decoded = Buffer.from(t, 'base64').toString('utf8'); }
  catch { return res.status(401).json({ error: 'token malformado' }); }

  const parts = decoded.split(':');
  if (parts.length < 3) return res.status(401).json({ error: 'token inválido' });
  const [tokenId, expiresAt, ...rest] = parts;
  const sig = rest.join(':');
  if (tokenId !== id) return res.status(401).json({ error: 'token de outro canal' });
  if (Date.now() > parseInt(expiresAt, 10)) return res.status(401).json({ error: 'token expirado' });
  if (sig !== hmac(`${tokenId}:${expiresAt}`)) return res.status(401).json({ error: 'assinatura inválida' });

  const canais = getCanais();
  const canal = canais.find(c => c.id === id);
  if (!canal) return res.status(404).json({ error: 'canal não encontrado' });

  const servidor = (canal.servidores || [])[s];
  if (!servidor) return res.status(404).json({ error: 'servidor indisponível' });

  let urlFinal = servidor.url;
  let usarProxy = false;

  if (servidor.nome === '2') {
    const urlParts = servidor.url.split('/');
    const fileName = urlParts[urlParts.length - 1];
    urlFinal = `/api/stream/${id}/${fileName}`;
    usarProxy = true;
  }

  res.json({
    url: urlFinal,
    proxy: usarProxy,
    referer: usarProxy ? '' : (servidor.referer || ''),
    origin: usarProxy ? '' : (servidor.origin || ''),
    nome: servidor.nome
  });
});

// ---------- PROXY EmbedCanais (HLS) ----------
app.get('/api/stream/:id/*', async (req, res) => {
  const { id } = req.params;
  const file = req.params[0];
  const canais = getCanais();
  const canal = canais.find(c => c.id === id);
  if (!canal) return res.status(404).send('canal não encontrado');

  const servidor = (canal.servidores || []).find(s => s.nome === '2');
  if (!servidor) return res.status(404).send('servidor 2 indisponível');

  const urlParts = servidor.url.split('/');
  const fileName = urlParts[urlParts.length - 1];
  const urlBase = servidor.url.substring(0, servidor.url.lastIndexOf('/'));
  const urlFinal = file === fileName ? servidor.url : `${urlBase}/${file}`;

  const referer = servidor.referer || '';
  const origin = servidor.origin || '';

  try {
    const r = await request(urlFinal, {
      headers: {
        'Referer': referer,
        'Origin': origin,
        'User-Agent': UA_MOBILE
      },
      maxRedirections: 5
    });

    if (r.statusCode >= 400) return res.status(r.statusCode).send('erro do servidor upstream');

    const isPlaylist = urlFinal.endsWith('.m3u8') || file.endsWith('.m3u8');
    res.set('Content-Type', isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cache-Control', isPlaylist ? 'public, max-age=2' : 'public, max-age=86400, immutable');
    r.body.pipe(res);
  } catch (e) {
    res.status(502).send('proxy erro: ' + e.message);
  }
});

// ---------- API: Play (Pobreflix scraper) ----------
const playCache = new Map();
app.get('/api/play/:id', async (req, res) => {
  const { id } = req.params;
  const titulo = req.query.t || 'Filme';

  const cached = playCache.get(id);
  if (cached && cached.expira > Date.now()) {
    return res.json({ url: cached.url, cache: true });
  }

  const BASE = 'https://pobreflix30.life';
  try {
    const url1 = `${BASE}/player/index.php?id=${id}&t=${encodeURIComponent(titulo)}&audio=dub`;
    const r1 = await request(url1, {
      headers: {
        'User-Agent': UA_MOBILE,
        'Referer': `${BASE}/`,
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'pt-BR,pt;q=0.9'
      },
      maxRedirections: 5
    });
    if (r1.statusCode !== 200) return res.status(502).json({ error: 'player index falhou' });

    const setCookies = r1.headers['set-cookie'];
    const cookieHeader = Array.isArray(setCookies) ? setCookies.map(c => c.split(';')[0]).join('; ') : (setCookies ? setCookies.split(';')[0] : '');
    const html = await r1.body.text();

    const m = html.match(/sourcesToken\s*:\s*"([a-f0-9]{20,64})"/) || html.match(/"([a-f0-9]{32})"/);
    if (!m) return res.status(502).json({ error: 'token não encontrado' });
    const token = m[1];

    const h2 = {
      'User-Agent': UA_MOBILE,
      'Referer': url1,
      'X-Requested-With': 'XMLHttpRequest',
      'Accept': 'application/json, text/plain, */*'
    };
    if (cookieHeader) h2['Cookie'] = cookieHeader;

    const r2 = await request(`${BASE}/player/sources.php?token=${token}`, { headers: h2 });
    if (r2.statusCode !== 200) return res.status(502).json({ error: 'sources falhou' });
    const data = await r2.body.json();
    const src = (data.sources || [])[0];
    if (!src) return res.status(502).json({ error: 'sem sources' });

    const ehAssinada = /[?&](exp|sig)=/.test(src.file) || !/r2\.dev/.test(src.file);
    let urlFinal = src.file;
    let ttlMs = 12 * 60 * 60 * 1000;
    if (ehAssinada) {
      urlFinal = '/api/proxy-video?url=' + encodeURIComponent(src.file);
      const mExp = src.file.match(/[?&]exp=(\d+)/);
      if (mExp) {
        ttlMs = Math.max(60 * 1000, (parseInt(mExp[1], 10) * 1000) - Date.now() - (5 * 60 * 1000));
        ttlMs = Math.min(ttlMs, 6 * 60 * 60 * 1000);
      } else {
        ttlMs = 30 * 60 * 1000;
      }
    }

    playCache.set(id, { url: urlFinal, expira: Date.now() + ttlMs });
    res.json({ url: urlFinal, cache: false, proxy: ehAssinada });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---------- PROXY MP4 (Range) ----------
app.get('/api/proxy-video', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('url obrigatoria');

  const headers = { 'User-Agent': UA_MOBILE };
  if (req.headers.range) headers['Range'] = req.headers.range;
  try { headers['Referer'] = new URL(url).origin + '/'; } catch {}

  try {
    const r = await request(url, { headers, maxRedirections: 5 });
    res.status(r.statusCode);
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Accept-Ranges', 'bytes');
    ['content-type','content-range','content-length'].forEach(k => {
      const v = r.headers[k];
      if (v) res.set(k, v);
    });
    r.body.pipe(res);
  } catch (e) {
    res.status(502).send('erro: ' + e.message);
  }
});

// ---------- HEALTH ----------
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now(), canais: (getCanais() || []).length }));

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`nexus-proxy on :${PORT}`));
