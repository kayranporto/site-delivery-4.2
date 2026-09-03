"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { validarCSV, lerCSV } = require("../js/core/product-import.js");
const sandbox = { window: {}, console, URL };
vm.runInNewContext(fs.readFileSync(require.resolve("../js/core/app-utils.js"), "utf8"), sandbox);
const App = sandbox.window.App;

test("CNPJ aceita o exemplo oficial alfanumérico, minúsculas e o formato numérico", () => {
    for (const cnpj of ["12.ABC.345/01DE-35", "12abc34501de35", "11.222.333/0001-81", "11222333000181"]) assert.equal(App.validarCNPJ(cnpj), true, cnpj);
    for (const cnpj of ["12ABC34501DE34", "12ABC34501DE3A", "00000000000000", "11.222.333/0001-81!", "12ÁBC34501DE35", "12ABC34501DE351", ""]) assert.equal(App.validarCNPJ(cnpj), false, cnpj);
    assert.equal(App.normalizarCNPJ("12.abc.345/01de-35"), "12ABC34501DE35");
});

test("endereços antigos mantêm rua e estado no texto exibido", () => {
    assert.equal(App.formatarEndereco({ rua: "Rua Um", numero: "8", bairro: "Centro", cidade: "Recife", estado: "PE" }), "Rua Um, 8 — Centro — Recife/PE");
});

test("CSV modelo importa os valores decimais, categorias e controles de estoque", () => {
    const resultado = validarCSV(fs.readFileSync(require.resolve("../assets/modelo-produtos.csv"), "utf8"));
    assert.equal(resultado.valido, true);
    assert.equal(resultado.produtos.length, 2);
    assert.equal(resultado.produtos[0].preco, 39.9);
    assert.equal(resultado.produtos[1].promocao, 8.9);
    assert.equal(resultado.produtos[1].controle_estoque, true);
});

test("CSV preserva aspas, delimitadores, BOM e quebras dentro da descrição", () => {
    const r = validarCSV('\uFEFFnome;preco;descricao\r\n"Pizza; grande";19,90;"Duas linhas\ncom ""aspas"""\r\nSuco;8;Natural');
    assert.equal(r.valido, true);
    assert.equal(r.produtos[0].nome, "Pizza; grande");
    assert.equal(r.produtos[0].descricao, 'Duas linhas\ncom "aspas"');
    assert.equal(r.linhas[1].linha, 4);
    assert.equal(validarCSV('nome,preco\nSuco,8.90').valido, true);
});

test("CSV identifica duplicados por nome, categoria e unidade consultada", () => {
    const r = validarCSV("nome;preco;categoria\nSuco;8;Bebidas\nsuco;9;bebidas\nSuco;8;Especial", [{nome:"SUCO",categoria_id:"c"}], [{id:"c",nome:"Bebidas"}]);
    assert.equal(r.valido, false);
    assert.match(r.linhas[0].erros.join(), /repetido/);
    assert.match(r.linhas[1].erros.join(), /repetido/);
    assert.deepEqual(r.linhas[2].erros, []);
});

test("CSV rejeita arquivo malformado, preço inválido, promoção e estoque fracionário", () => {
    assert.throws(() => lerCSV('nome;preco\n"incompleto;2'), /aspas/);
    assert.throws(() => validarCSV("nome;nome;preco\nA;B;2"), /repetidas/);
    assert.throws(() => validarCSV("nome;preco;preço\nA;2;3"), /repetidas/);
    assert.throws(() => validarCSV("nome;preco;errada\nA;2;3"), /desconhecidas/);
    assert.throws(() => validarCSV("categoria;preco\nA;2"), /nome/);
    for (const csv of ["nome;preco\nSuco;-2", "nome;preco\nSuco;1e3", "nome;preco\nSuco;1,234", "nome;preco;promocao\nSuco;8;9", "nome;preco;estoque\nSuco;8;2.5", "nome;preco;disponivel\nSuco;8;talvez", "nome;preco;imagem\nSuco;8;javascript:alert(1)", "nome;preco\nSuco;8;extra"]) assert.equal(validarCSV(csv).valido, false, csv);
});

test("CSV respeita limite de 500 produtos e 1 MB", () => {
    const rows = Array.from({length:500},(_,i)=>`Produto ${i};1`).join("\n");
    assert.equal(validarCSV(`nome;preco\n${rows}`).produtos.length, 500);
    assert.throws(() => validarCSV(`nome;preco\n${rows}\nOutro;1`), /500/);
    assert.throws(() => lerCSV("a".repeat(1024*1024+1)), /1 MB/);
});

test("login redireciona ao catálogo, preserva o checkout e recusa destino externo", async () => {
    async function login(redirect) {
        const storage = new Map(redirect ? [["redirect",redirect]] : []);
        let submit, destino;
        const input = (value) => ({value,addEventListener(){},removeAttribute(){}});
        const elementos = { email:input("cliente@example.invalid"), senha:input("teste1234"), loginSecurityStatus:{classList:{toggle(){}}}, loginForm:{querySelector:()=>({}),addEventListener:(_name,fn)=>{submit=fn;}} };
        const local = {getItem:(k)=>storage.get(k)||null,removeItem:(k)=>storage.delete(k)};
        const s = { console, URL, document:{getElementById:(id)=>elementos[id]}, localStorage:local, window:{DeliveryCaptcha:{validar:()=>true,getToken:()=>null,reset(){}},location:{href:"https://exemplo.test/html/login.html",origin:"https://exemplo.test",replace:(v)=>{destino=v;}},db:{auth:{signInWithPassword:async()=>({data:{user:{id:"u"}},error:null})}}} };
        vm.runInNewContext(fs.readFileSync(require.resolve("../js/core/app-utils.js"),"utf8"),s);
        s.App={...s.window.App,lerJSON:()=>({}),salvarJSON(){},definirCarregando(){},vincularUsuarioLocal:()=>storage.delete("redirect")};
        vm.runInNewContext(fs.readFileSync(require.resolve("../js/pages/login.js"),"utf8"),s);
        await submit({preventDefault(){}});
        return destino;
    }
    assert.equal(await login(), "../index.html#restaurantes");
    assert.equal(await login("checkout.html"), "checkout.html");
    assert.equal(await login("https://outro.test"), "../index.html#restaurantes");
});
