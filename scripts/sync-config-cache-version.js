"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const version = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
const targets = [
  path.join(root, "index.html"),
  path.join(root, "sw.js"),
  ...fs.readdirSync(path.join(root, "html"))
    .filter((name) => name.endsWith(".html"))
    .map((name) => path.join(root, "html", name))
];

let changed = 0;
for (const file of targets) {
  const before = fs.readFileSync(file, "utf8");
  const after = before.replace(
    /((?:\.\.\/|\.\/)?js\/core\/config\.js\?v=)[\w.-]+/g,
    `$1${version}`
  );
  if (after !== before) {
    fs.writeFileSync(file, after);
    changed += 1;
    console.log(`Atualizado: ${path.relative(root, file)}`);
  }
}

console.log(`Sincronização concluída: ${changed} arquivo(s) alterado(s) para v=${version}.`);
