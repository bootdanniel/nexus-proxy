import express from 'express';
import { request } from 'undici';

const app = express();
const PORT = process.env.PORT || 8080;

app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.get('/proxy', async (req, res) => {
  const { url, ref, orig } = req.query;
  if (!url) return res.status(400).send('url obrigatoria');
  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
      'Range': req.headers.range || '',
    };
    if (ref) headers['Referer'] = ref;
    if (orig) headers['Origin'] = orig;
    const r = await request(url, { headers, maxRedirections: 5 });
    res.status(r.statusCode);
    ['content-type','content-range','content-length','accept-ranges'].forEach(k => {
      const v = r.headers[k];
      if (v) res.set(k, v);
    });
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Accept-Ranges', 'bytes');
    r.body.pipe(res);
  } catch (e) {
    res.status(502).send('proxy error: ' + e.message);
  }
});

app.get('/', (req, res) => res.send('<h1>nexus-proxy OK</h1>'));

app.listen(PORT, '0.0.0.0', () => console.log('listening ' + PORT));
