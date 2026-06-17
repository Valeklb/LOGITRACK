import fs from 'fs';

const apiBase = (process.env.VITE_API_URL || process.env.RAILWAY_API_URL || '').replace(/\/$/, '');
const wsBase = (process.env.VITE_WS_URL || apiBase).replace(/\/$/, '');

if (apiBase) {
  const lines = [`VITE_API_URL=${apiBase}`];
  if (wsBase) lines.push(`VITE_WS_URL=${wsBase}`);
  fs.writeFileSync('.env.production.local', `${lines.join('\n')}\n`);
  console.log(`[vercel] API → ${apiBase}`);
} else {
  console.warn('[vercel] Defina RAILWAY_API_URL ou VITE_API_URL nas variáveis do Vercel');
}
