"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("home oferece feedback visual para busca, filtros e cards", () => {
    const css = read("css/pages/home-4.2.1.css");
    assert.match(css, /\.search:focus-within/);
    assert.match(css, /\.search kbd\{white-space:nowrap\}/);
    assert.match(css, /\.filter-pill\[aria-pressed="true"\]/);
    assert.match(css, /\.card:focus-within/);
    assert.doesNotMatch(read("index.html"), /�/);
});

test("home adapta categorias e controles para toque no celular", () => {
    const css = read("css/pages/home-4.2.1.css");
    assert.match(css, /scroll-snap-type:x proximity/);
    assert.match(css, /\.filter-pill\{min-height:44px\}/);
    assert.match(read("index.html"), /home-4\.2\.1\.css\?v=4\.2\.1\.2/);
    assert.match(read("sw.js"), /home-4\.2\.1\.css\?v=4\.2\.1\.2/);
});
