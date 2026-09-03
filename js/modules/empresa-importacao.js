"use strict";

(() => {
    const form = document.getElementById("importacaoForm");
    if (!form) return;
    const arquivo = document.getElementById("importacaoArquivo");
    const botao = document.getElementById("importacaoConfirmar");
    const previa = document.getElementById("importacaoPrevia");
    const status = document.getElementById("importacaoStatus");
    let texto = "", contexto = null, resultado = null, revisao = 0, enviando = false;
    const unidadeAtual = () => document.getElementById("unidadePainelSelect")?.value || "";
    const informar = (mensagem, erro = false) => {
        status.textContent = mensagem;
        status.dataset.tipo = erro ? "error" : "info";
    };
    const limpar = () => {
        revisao += 1; contexto = null; resultado = null; botao.disabled = true; previa.replaceChildren();
    };

    async function analisar() {
        limpar();
        const atual = revisao;
        const empresaId = typeof empresa !== "undefined" ? empresa?.id : null;
        const unidadeId = unidadeAtual();
        if (!empresaId || !unidadeId) return informar("Aguarde o painel carregar e selecione uma unidade.", true);
        informar("Conferindo produtos e categorias...");
        try {
            const [resProdutos, resCategorias] = await Promise.all([
                window.db.from("produtos").select("nome,categoria_id").eq("empresa_id", empresaId).eq("unidade_id", unidadeId),
                window.db.from("categorias").select("id,nome").eq("empresa_id", empresaId).eq("unidade_id", unidadeId)
            ]);
            if (atual !== revisao || unidadeAtual() !== unidadeId) return;
            if (resProdutos.error || resCategorias.error) throw resProdutos.error || resCategorias.error;
            resultado = window.ProductImport.validarCSV(texto, resProdutos.data || [], resCategorias.data || []);
            contexto = { empresaId: String(empresaId), unidadeId };
            const tabela = document.createElement("table");
            const head = document.createElement("thead");
            const titulos = document.createElement("tr");
            ["Linha", "Produto", "Categoria", "Preço", "Conferência"].forEach((titulo) => {
                const th = document.createElement("th"); th.textContent = titulo; titulos.append(th);
            });
            head.append(titulos); tabela.append(head);
            const body = document.createElement("tbody");
            resultado.linhas.forEach(({ linha, produto, erros }) => {
                const tr = document.createElement("tr");
                if (erros.length) tr.className = "importacao-erro";
                [linha, produto.nome, produto.categoria || "Sem categoria", produto.preco === null ? "—" : App.dinheiro(produto.preco), erros.join(" ") || "Pronto para importar"].forEach((valor) => {
                    const td = document.createElement("td"); td.textContent = String(valor); tr.append(td);
                });
                body.append(tr);
            });
            tabela.append(body); previa.append(tabela);
            const erros = resultado.linhas.filter((linha) => linha.erros.length).length;
            const unidadeNome = document.getElementById("unidadePainelSelect").selectedOptions[0]?.textContent || "unidade selecionada";
            informar(erros ? `${erros} linha(s) com erro. Corrija o arquivo e selecione novamente. Nenhum produto foi importado.` : `${resultado.produtos.length} produto(s) para ${unidadeNome}. Confira a prévia e confirme a importação.`, Boolean(erros));
            botao.disabled = !resultado.valido;
        } catch (erro) { informar(App.mensagemErro(erro), true); }
    }

    arquivo.addEventListener("change", async () => {
        limpar(); texto = "";
        const atual = revisao;
        const file = arquivo.files?.[0];
        if (!file) return informar("Selecione um arquivo CSV para conferir os produtos.");
        if (!/\.csv$/i.test(file.name) || file.size > 1024 * 1024) return informar("Selecione um CSV de até 1 MB.", true);
        try {
            const conteudo = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
            if (atual !== revisao) return;
            texto = conteudo;
            await analisar();
        } catch { informar("Não foi possível ler o arquivo. Exporte a planilha como CSV UTF-8.", true); }
    });

    document.addEventListener("change", (event) => {
        if (event.target.id === "unidadePainelSelect" && !enviando && texto) analisar();
    });
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (enviando || !resultado?.valido || !contexto) return;
        if (contexto.unidadeId !== unidadeAtual()) { await analisar(); return; }
        enviando = true;
        const unidade = document.getElementById("unidadePainelSelect");
        const unidadeDesabilitada = unidade.disabled;
        unidade.disabled = true; arquivo.disabled = true;
        App.definirCarregando(botao, true, "Importando...");
        try {
            const { data, error } = await window.db.rpc("importar_produtos_csv", {
                p_empresa_id: contexto.empresaId, p_unidade_id: contexto.unidadeId, p_produtos: resultado.produtos
            });
            if (error) throw error;
            limpar(); texto = ""; arquivo.value = "";
            informar(`${data} produto(s) importado(s) com sucesso.`);
            // Recarrega a unidade pelo fluxo já existente do painel.
            unidade.dispatchEvent(new Event("change", { bubbles: true }));
        } catch (erro) {
            informar(`Não foi possível concluir: ${App.mensagemErro(erro)} Confira novamente o arquivo antes de reenviar.`, true);
            resultado = null; contexto = null;
        } finally {
            enviando = false; unidade.disabled = unidadeDesabilitada; arquivo.disabled = false;
            App.definirCarregando(botao, false); botao.disabled = true;
        }
    });
})();
