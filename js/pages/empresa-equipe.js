"use strict";

(() => {
    const $ = (id) => document.getElementById(id);
    const ROTULOS = { gerente: "Gerente", cozinha: "Cozinha", atendente: "Atendente", financeiro: "Financeiro" };
    let acesso = null;
    let equipe = [];

    function status(mensagem, tipo = "") {
        const elemento = $("equipeStatus");
        if (!elemento) return;
        elemento.hidden = !mensagem;
        elemento.textContent = mensagem || "";
        elemento.className = `team-status${tipo ? ` ${tipo}` : ""}`;
    }

    function criar(tag, classe, texto) {
        const elemento = document.createElement(tag);
        if (classe) elemento.className = classe;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    }

    async function rpc(nome, parametros = {}) {
        const resposta = await window.db.rpc(nome, parametros);
        if (resposta.error) throw resposta.error;
        return resposta.data;
    }

    function renderizar() {
        const container = $("equipeLista");
        if (!container) return;
        container.replaceChildren();
        if (!equipe.length) {
            container.append(criar("div", "empty-panel", "Nenhum funcionário vinculado ainda."));
            return;
        }

        equipe.forEach((membro) => {
            const card = criar("article", "member-card");
            const principal = criar("div", "member-main");
            principal.append(criar("strong", "", membro.nome || membro.email || "Usuário"));
            principal.append(criar("span", "", membro.email || "E-mail indisponível"));
            const meta = criar("div", "member-meta");
            meta.append(criar("span", `member-status${membro.ativo ? "" : " inactive"}`, membro.ativo ? "Ativo" : "Inativo"));
            meta.append(criar("span", "role-badge", ROTULOS[membro.papel] || membro.papel));
            principal.append(meta);

            const acoes = criar("div", "member-actions");
            const seletor = document.createElement("select");
            seletor.setAttribute("aria-label", `Papel de ${membro.nome || membro.email || "funcionário"}`);
            Object.entries(ROTULOS).forEach(([valor, rotulo]) => {
                const opcao = document.createElement("option");
                opcao.value = valor;
                opcao.textContent = rotulo;
                opcao.selected = valor === membro.papel;
                seletor.append(opcao);
            });
            seletor.disabled = !membro.ativo;
            seletor.addEventListener("change", async () => {
                const anterior = membro.papel;
                seletor.disabled = true;
                try {
                    await rpc("empresa_salvar_funcionario", {
                        p_empresa_id: acesso.empresa_id,
                        p_email: membro.email,
                        p_papel: seletor.value
                    });
                    membro.papel = seletor.value;
                    status("Papel atualizado com sucesso.", "success");
                    renderizar();
                } catch (erro) {
                    console.error("Erro ao alterar papel:", erro);
                    seletor.value = anterior;
                    seletor.disabled = false;
                    status(App.mensagemErro(erro), "error");
                }
            });
            acoes.append(seletor);

            const botao = criar("button", membro.ativo ? "team-button danger" : "team-button secondary", membro.ativo ? "Desativar" : "Reativar");
            botao.type = "button";
            botao.addEventListener("click", async () => {
                botao.disabled = true;
                try {
                    if (membro.ativo) {
                        await rpc("empresa_remover_funcionario", { p_empresa_id: acesso.empresa_id, p_usuario_id: membro.usuario_id });
                        membro.ativo = false;
                        status("Acesso do funcionário desativado.", "success");
                    } else {
                        await rpc("empresa_salvar_funcionario", { p_empresa_id: acesso.empresa_id, p_email: membro.email, p_papel: membro.papel });
                        membro.ativo = true;
                        status("Acesso do funcionário reativado.", "success");
                    }
                    renderizar();
                } catch (erro) {
                    console.error("Erro ao alterar acesso:", erro);
                    botao.disabled = false;
                    status(App.mensagemErro(erro), "error");
                }
            });
            acoes.append(botao);
            card.append(principal, acoes);
            container.append(card);
        });
    }

    async function carregarEquipe() {
        status("");
        const dados = await rpc("empresa_listar_funcionarios", { p_empresa_id: acesso.empresa_id });
        equipe = Array.isArray(dados) ? dados : [];
        renderizar();
    }

    async function carregarAcesso() {
        const { data: { user }, error } = await window.db.auth.getUser();
        if (error || !user) {
            window.location.replace("empresa-login.html");
            return false;
        }
        const acessos = await rpc("empresa_meu_acesso");
        acesso = (Array.isArray(acessos) ? acessos : []).find((item) => item.proprietario === true) || null;
        if (!acesso) {
            window.location.replace("empresa-login.html");
            return false;
        }
        $("equipeEmpresaNome").textContent = acesso.empresa_nome || "Restaurante";
        return true;
    }

    $("equipeForm")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!acesso) return;
        const form = event.currentTarget;
        const botao = form.querySelector("button[type='submit']");
        const email = $("equipeEmail").value.trim().toLowerCase();
        const papel = $("equipePapel").value;
        if (!email) return status("Informe o e-mail do funcionário.", "error");
        App.definirCarregando(botao, true, "Salvando...");
        try {
            await rpc("empresa_salvar_funcionario", { p_empresa_id: acesso.empresa_id, p_email: email, p_papel: papel });
            form.reset();
            $("equipePapel").value = "gerente";
            await carregarEquipe();
            status("Acesso salvo. O usuário já pode entrar pelo Portal do parceiro.", "success");
        } catch (erro) {
            console.error("Erro ao salvar funcionário:", erro);
            status(App.mensagemErro(erro), "error");
        } finally {
            App.definirCarregando(botao, false);
        }
    });

    $("equipeLogout")?.addEventListener("click", async () => {
        await window.db.auth.signOut();
        localStorage.removeItem("empresaAcesso");
        window.location.replace("empresa-login.html");
    });

    (async () => {
        try {
            if (await carregarAcesso()) await carregarEquipe();
        } catch (erro) {
            console.error("Erro ao carregar equipe:", erro);
            status(App.mensagemErro(erro), "error");
            $("equipeLista")?.replaceChildren(criar("div", "empty-panel", "Não foi possível carregar a equipe."));
        }
    })();
})();
