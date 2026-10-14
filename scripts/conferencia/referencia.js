// Servidor estatico do protótipo (Referencia): serve docs/suite-desktop/prototipo/ e uma pagina de estado
// que ocupa a janela inteira (o estado.html do prototipo tem 1440x900 fixos, o que corta em 1280x800).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PASTA = path.join(__dirname, '..', '..', 'docs', 'suite-desktop', 'prototipo');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

// Pagina do estado: igual a estado.html, mas com o quadro do tamanho da janela.
function paginaEstado() {
  const original = fs.readFileSync(path.join(PASTA, 'estado.html'), 'utf8');
  return original.replace('<div style="width:1440px;height:900px">', '<div style="width:100vw;height:100vh">')
    .replace('hint-size="1440px,900px"', 'hint-size="100vw,100vh"');
}

function iniciar(porta) {
  const servidor = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/_estado.html') {
      res.writeHead(200, { 'content-type': TIPOS['.html'] });
      return res.end(paginaEstado());
    }
    const arquivo = path.normalize(path.join(PASTA, decodeURIComponent(url.pathname)));
    if (!arquivo.startsWith(PASTA) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
      res.writeHead(404); return res.end('nao achei');
    }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(arquivo)] || 'application/octet-stream' });
    return fs.createReadStream(arquivo).pipe(res);
  });
  return new Promise((resolve) => servidor.listen(porta, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${porta}`,
    fechar: () => new Promise((r) => { servidor.closeAllConnections?.(); servidor.close(r); }),
  })));
}

module.exports = { iniciar };
