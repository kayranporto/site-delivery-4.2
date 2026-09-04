"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Home usa horário real no filtro Aberto agora", () => {
    const home = read("js/pages/home.js");
    assert.match(home, /rpc\("empresa_disponibilidade"/);
    assert.match(home, /abertaAgora:\s*data\?\.aberto\s*===\s*true/);
    assert.match(home, /!filtros\.abertoAgora\s*\|\|\s*empresa\.abertaAgora\s*===\s*true/);
    assert.match(read("index.html"), /js\/pages\/home\.js\?v=4\.5\.1/);
    assert.match(read("sw.js"), /js\/pages\/home\.js\?v=4\.5\.1/);
});

test("robots bloqueia as rotas privadas reais em html", () => {
    const robots = read("robots.txt");
    for (const rota of [
        "/html/admin.html",
        "/html/checkout.html",
        "/html/dados.html",
        "/html/entregador.html",
        "/html/empresa-dashboard.html",
        "/html/empresa-colaborador.html",
        "/html/empresa-equipe.html",
        "/html/enderecos.html",
        "/html/favoritos.html",
        "/html/meus-pedidos.html",
        "/html/perfil.html",
        "/html/acompanhamento.html",
        "/html/pedido-sucesso.html",
        "/html/nova-senha.html"
    ]) {
        assert.match(robots, new RegExp(`^Disallow: ${rota.replaceAll(".", "\\.")}$`, "m"), `${rota} deve ficar fora de indexação`);
    }
});
