import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const baseUrl = process.env.RAILWAY_API_URL;
  if (!baseUrl) {
    return res.status(503).json({
      error: 'RAILWAY_API_URL não configurada. Adicione a URL do Railway nas variáveis do Vercel.',
    });
  }

  const pathParam = req.query.path;
  const subPath = Array.isArray(pathParam) ? pathParam.join('/') : pathParam ?? '';

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(req.query)) {
    if (key === 'path') continue;
    if (Array.isArray(value)) {
      value.forEach((entry) => query.append(key, entry));
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }

  const qs = query.toString();
  const targetUrl = `${baseUrl.replace(/\/$/, '')}/api/${subPath}${qs ? `?${qs}` : ''}`;

  const headers: Record<string, string> = {};
  if (req.headers['content-type']) {
    headers['Content-Type'] = req.headers['content-type'] as string;
  }

  const init: RequestInit = {
    method: req.method,
    headers,
  };

  if (req.method && !['GET', 'HEAD'].includes(req.method) && req.body !== undefined) {
    init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.status(upstream.status).send(await upstream.text());
  } catch {
    res.status(502).json({ error: 'Falha ao conectar com a API no Railway' });
  }
}
