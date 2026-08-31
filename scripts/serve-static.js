"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const host = "127.0.0.1";
const port = Number(process.env.E2E_PORT || 4173);

const mimeTypes = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".ico", "image/x-icon"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".txt", "text/plain; charset=utf-8"],
    [".webmanifest", "application/manifest+json; charset=utf-8"],
    [".webp", "image/webp"]
]);

function responder(res, status, body, type = "text/plain; charset=utf-8") {
    res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store"
    });
    res.end(body);
}

function caminhoSeguro(url) {
    const pathname = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
    const relativo = pathname.replace(/^\/+/, "") || "index.html";
    const destino = path.resolve(root, relativo);
    if (destino !== root && !destino.startsWith(`${root}${path.sep}`)) return null;
    return destino;
}

const server = http.createServer((req, res) => {
    if (!req.url || !["GET", "HEAD"].includes(req.method || "")) {
        responder(res, 405, "Method Not Allowed");
        return;
    }

    let arquivo;
    try {
        arquivo = caminhoSeguro(req.url);
    } catch {
        responder(res, 400, "Bad Request");
        return;
    }

    if (!arquivo) {
        responder(res, 403, "Forbidden");
        return;
    }

    fs.stat(arquivo, (erro, info) => {
        if (erro || !info.isFile()) {
            responder(res, 404, "Not Found");
            return;
        }

        const tipo = mimeTypes.get(path.extname(arquivo).toLowerCase()) || "application/octet-stream";
        res.writeHead(200, {
            "Content-Type": tipo,
            "Cache-Control": "no-store"
        });
        if (req.method === "HEAD") {
            res.end();
            return;
        }
        fs.createReadStream(arquivo).pipe(res);
    });
});

server.listen(port, host, () => {
    console.log(`E2E static server: http://${host}:${port}`);
});

function encerrar() {
    server.close(() => process.exit(0));
}

process.on("SIGINT", encerrar);
process.on("SIGTERM", encerrar);
