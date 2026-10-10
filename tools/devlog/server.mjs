// Coletor de diagnóstico do app em modo dev: recebe os eventos de voz dos aparelhos (POST /log)
// em /tmp/shenlong-devlog.log e, para inspeção, cópias dos clipes de fala (POST /clip) em
// /tmp/shenlong-clips. Fica só nesta máquina; o app de produção não envia nada.
//   node tools/devlog/server.mjs   (porta 8790)
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';

const FILE = '/tmp/shenlong-devlog.log';
const CLIPS = '/tmp/shenlong-clips';
const PORT = Number(process.env.DEVLOG_PORT ?? 8790);
mkdirSync(CLIPS, { recursive: true });

const log = (ip, msg) => {
  const t = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  const line = `${t} ${ip} ${msg}\n`;
  appendFileSync(FILE, line);
  process.stdout.write(line);
};

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (req.method !== 'POST' || (url.pathname !== '/log' && url.pathname !== '/clip')) {
    res.writeHead(404).end();
    return;
  }
  const ip = req.socket.remoteAddress?.replace('::ffff:', '') ?? '?';
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);
    if (url.pathname === '/log') {
      log(ip, body.toString('utf8').slice(0, 600));
    } else {
      const name = `${Date.now()}-${(url.searchParams.get('who') ?? 'x').replace(/[^\w.-]/g, '_')}.m4a`;
      writeFileSync(`${CLIPS}/${name}`, body);
      log(ip, `clipe salvo ${CLIPS}/${name} (${body.length} bytes)`);
    }
    res.writeHead(204).end();
  });
}).listen(PORT, '0.0.0.0', () => console.log(`devlog em :${PORT} → ${FILE}`));
