"use strict";

// CSV UTF-8, sem dependências. Aspas, separadores e quebras de linha são preservados.
((root) => {
    const COLUNAS = ["nome", "categoria", "preco", "descricao", "promocao", "disponivel", "controle_estoque", "estoque", "estoque_minimo", "imagem"];
    const normalizar = (valor) => String(valor || "").trim().toLowerCase();
    const cabecalho = (valor) => normalizar(valor).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const chave = (nome, categoria) => JSON.stringify([normalizar(nome), normalizar(categoria)]);

    function lerCSV(texto) {
        texto = String(texto || "").replace(/^\uFEFF/, "");
        if (texto.length > 1024 * 1024) throw new Error("O arquivo deve ter até 1 MB.");
        const primeira = texto.split(/\r?\n/, 1)[0];
        const separador = primeira.includes(";") ? ";" : ",";
        const linhas = [];
        let campos = [], campo = "", aspas = false, fechado = false, numero = 1, inicio = 1;
        const fecharLinha = () => {
            campos.push(campo);
            if (campos.some((valor) => valor.trim())) linhas.push({ linha: inicio, campos });
            if (linhas.length > 501) throw new Error("Importe no máximo 500 produtos por arquivo.");
            campos = []; campo = ""; fechado = false;
        };
        for (let i = 0; i < texto.length; i += 1) {
            const c = texto[i];
            if (aspas) {
                if (c === '"') {
                    if (texto[i + 1] === '"') { campo += '"'; i += 1; }
                    else { aspas = false; fechado = true; }
                } else {
                    campo += c;
                    if (c === "\n") numero += 1;
                }
            } else if (c === separador) {
                campos.push(campo); campo = ""; fechado = false;
            } else if (c === "\n" || c === "\r") {
                if (c === "\r" && texto[i + 1] === "\n") i += 1;
                fecharLinha(); numero += 1; inicio = numero;
            } else if (c === '"' && campo === "" && !fechado) {
                aspas = true;
            } else {
                if (fechado || c === '"') throw new Error(`Linha ${numero}: aspas fora do formato CSV.`);
                campo += c;
            }
        }
        if (aspas) throw new Error(`Linha ${inicio}: faltou fechar as aspas.`);
        fecharLinha();
        return linhas;
    }

    function validarCSV(texto, existentes = [], categorias = []) {
        const linhas = lerCSV(texto);
        if (!linhas.length) throw new Error("O arquivo está vazio.");
        const nomes = linhas.shift().campos.map(cabecalho);
        if (new Set(nomes).size !== nomes.length) throw new Error("Há colunas repetidas no cabeçalho.");
        const desconhecidas = nomes.filter((nome) => !COLUNAS.includes(nome));
        if (desconhecidas.length) throw new Error(`Colunas desconhecidas: ${desconhecidas.join(", ")}. Use o arquivo modelo.`);
        if (!["nome", "preco"].every((nome) => nomes.includes(nome))) throw new Error("O cabeçalho precisa ter nome e preco.");
        if (!linhas.length) throw new Error("Inclua pelo menos um produto após o cabeçalho.");
        const categoriasPorId = new Map(categorias.map((c) => [String(c.id), c.nome]));
        const vistos = new Set(existentes.map((p) => chave(p.nome, categoriasPorId.get(String(p.categoria_id)) || "")));
        const resultados = linhas.map(({ linha, campos }) => {
            const erros = [];
            const row = Object.fromEntries(nomes.map((nome, i) => [nome, (campos[i] || "").trim()]));
            if (campos.length !== nomes.length) erros.push("Quantidade de colunas diferente do cabeçalho.");
            const moeda = (valor, nome, opcional = false) => {
                if (opcional && !valor) return null;
                if (!/^\d+(?:[.,]\d{1,2})?$/.test(valor || "")) { erros.push(`${nome}: use 19,90 ou 19.90, sem símbolo ou separador de milhar.`); return null; }
                const numero = Number(valor.replace(",", "."));
                if (numero > 99999999.99) erros.push(`${nome}: valor muito alto.`);
                return numero;
            };
            const inteiro = (valor, nome, padrao) => {
                if (!valor) return padrao;
                if (!/^\d{1,9}$/.test(valor)) { erros.push(`${nome}: use um inteiro a partir de zero, com até 9 dígitos.`); return 0; }
                return Number(valor);
            };
            const booleano = (valor, nome, padrao) => {
                if (!valor) return padrao;
                if (["sim", "true", "1"].includes(normalizar(valor))) return true;
                if (["não", "nao", "false", "0"].includes(normalizar(valor))) return false;
                erros.push(`${nome}: use sim ou nao.`); return padrao;
            };
            const produto = {
                nome: row.nome || "", categoria: row.categoria || "", descricao: row.descricao || "",
                preco: moeda(row.preco, "Preço"), promocao: moeda(row.promocao, "Promoção", true),
                disponivel: booleano(row.disponivel, "Disponível", true),
                controle_estoque: booleano(row.controle_estoque, "Controle de estoque", false),
                estoque: inteiro(row.estoque, "Estoque", 0), estoque_minimo: inteiro(row.estoque_minimo, "Estoque mínimo", 5),
                imagem: row.imagem || ""
            };
            if (!produto.nome || produto.nome.length > 120) erros.push("Nome obrigatório, com até 120 caracteres.");
            if (produto.categoria.length > 80) erros.push("Categoria com até 80 caracteres.");
            if (produto.descricao.length > 500) erros.push("Descrição com até 500 caracteres.");
            if (produto.promocao !== null && (produto.promocao <= 0 || produto.promocao >= produto.preco)) erros.push("Promoção deve ser maior que zero e menor que o preço.");
            if (produto.imagem) {
                try {
                    const url = new URL(produto.imagem);
                    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || /\s/.test(produto.imagem) || produto.imagem.length > 2048) throw new Error();
                } catch { erros.push("Imagem: informe um link HTTP ou HTTPS válido."); }
            }
            const id = chave(produto.nome, produto.categoria);
            if (vistos.has(id)) erros.push("Produto repetido no arquivo ou já cadastrado nesta categoria e unidade.");
            vistos.add(id);
            return { linha, produto, erros };
        });
        return { linhas: resultados, produtos: resultados.map((r) => r.produto), valido: resultados.every((r) => !r.erros.length) };
    }

    const api = Object.freeze({ lerCSV, validarCSV, COLUNAS });
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    else root.ProductImport = api;
})(typeof window !== "undefined" ? window : globalThis);
