"use strict";

const STATUS_FINAIS = new Set(["entregue", "cancelado"]);
const ETAPAS_STATUS = Object.freeze({
    recebido: 1,
    preparando: 2,
    saiu_para_entrega: 3,
    entregue: 4,
    cancelado: 0
});

function nomeStatus(status) {
    const nomes = {
        recebido: "Pedido recebido",
        preparando: "Em preparação",
        saiu_para_entrega: "Saiu para entrega",
        entregue: "Pedido entregue",
        cancelado: "Pedido cancelado"
    };
    return nomes[status] || "Pedido recebido";
}

function iniciais(nome) {
    const partes = String(nome || "Usuário").trim().split(/\s+/).filter(Boolean);
    return (partes.length > 1 ? `${partes[0][0]}${partes.at(-1)[0]}` : partes[0]?.slice(0, 2) || "U").toUpperCase();
}

function renderizarAvatar(url, nome) {
    const avatar = document.getElementById("avatarUsuario");
    const fallback = () => avatar.replaceChildren(criar("span", "", iniciais(nome)));
    if (!url) { fallback(); return; }
    const imagem = document.createElement("img");
    imagem.src = url;
    imagem.alt = `Foto de perfil de ${nome}`;
    imagem.decoding = "async";
    imagem.referrerPolicy = "no-referrer";
    imagem.addEventListener("error", fallback, { once: true });
    avatar.replaceChildren(imagem);
}

function dataMembro(valor) {
    const data = valor ? new Date(valor) : null;
    if (!data || !Number.isFinite(data.getTime())) return "Cliente Delivery";
    return `Cliente desde ${data.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}`;
}

function criar(tag, classe, texto) {
    const elemento = document.createElement(tag);
    if (classe) elemento.className = classe;
    if (texto !== undefined) elemento.textContent = texto;
    return elemento;
}

function renderizarPedidoDestaque(pedidos) {
    const container = document.getElementById("pedidoDestaque");
    container.replaceChildren();

    if (!pedidos.length) {
        const vazio = criar("div", "pedido-vazio");
        const texto = criar("div");
        texto.append(
            criar("h3", "", "Seu próximo pedido começa aqui"),
            criar("p", "", "Explore os restaurantes disponíveis e encontre algo gostoso.")
        );
        const link = criar("a", "", "Ver restaurantes");
        link.href = "../index.html";
        vazio.append(texto, link);
        container.append(vazio);
        return;
    }

    const pedido = pedidos.find((item) => !STATUS_FINAIS.has(item.status)) || pedidos[0];
    const etapa = ETAPAS_STATUS[pedido.status] ?? 1;
    const atual = criar("div", "pedido-atual");
    const primeiraLinha = criar("div", "pedido-linha");
    const restaurante = criar("div", "pedido-restaurante");
    restaurante.append(
        criar("h3", "", pedido.empresa_nome || "Restaurante"),
        criar("p", "", `Pedido #${pedido.numero || String(pedido.id || "").slice(0, 8) || "—"}`)
    );
    const total = criar("div", "pedido-total");
    total.append(criar("span", "", "Total"), criar("strong", "", App.dinheiro(pedido.total)));
    primeiraLinha.append(restaurante, total);

    const etapas = criar("div", "etapas-pedido");
    etapas.setAttribute("aria-label", nomeStatus(pedido.status));
    for (let indice = 1; indice <= 4; indice += 1) {
        const marcador = criar("span", indice <= etapa ? "ativa" : "");
        etapas.append(marcador);
    }

    const rodape = criar("div", "pedido-status-linha");
    const status = criar("span", `pedido-status ${pedido.status || "recebido"}`, nomeStatus(pedido.status));
    const previsao = criar("span", "pedido-previsao");
    if (!STATUS_FINAIS.has(pedido.status)) {
        previsao.textContent = `Previsão: ${Number(pedido.previsao_min) || 25}–${Number(pedido.previsao_max) || 45} min`;
    } else if (pedido.created_at) {
        previsao.textContent = new Date(pedido.created_at).toLocaleDateString("pt-BR");
    }

    const acao = criar("a", "pedido-acao", STATUS_FINAIS.has(pedido.status) ? "Ver detalhes" : "Acompanhar pedido");
    acao.href = `acompanhamento.html?id=${encodeURIComponent(pedido.id)}`;
    rodape.append(status, previsao, acao);
    atual.append(primeiraLinha, etapas, rodape);
    container.append(atual);
}

async function atualizarResumo(pedidos) {
    const favoritos = window.FavoritesSync ? await window.FavoritesSync.ready() : App.lerJSON("favoritos", []);
    const listaFavoritos = Array.isArray(favoritos) ? [...new Set(favoritos.map(String).filter(Boolean))] : [];
    const andamento = pedidos.filter((pedido) => !STATUS_FINAIS.has(pedido.status)).length;
    const economia = pedidos.reduce((total, pedido) => total + Math.max(0, Number(pedido.desconto) || 0), 0);

    document.getElementById("totalPedidosPerfil").textContent = String(pedidos.length);
    document.getElementById("pedidosAndamentoPerfil").textContent = String(andamento);
    document.getElementById("totalFavoritosPerfil").textContent = String(listaFavoritos.length);
    document.getElementById("economiaPerfil").textContent = App.dinheiro(economia);
}

function atualizarProgresso(usuario, user, totalEnderecos) {
    const verificacoes = [
        Boolean(usuario?.nome),
        Boolean(usuario?.sobrenome),
        App.validarTelefone(usuario?.telefone),
        App.validarCPF(usuario?.cpf),
        Boolean(usuario?.avatar_url),
        Boolean(user?.email),
        totalEnderecos > 0
    ];
    const completos = verificacoes.filter(Boolean).length;
    const percentual = Math.round((completos / verificacoes.length) * 100);
    const progresso = document.getElementById("progressoPerfil");
    progresso.setAttribute("aria-valuenow", String(percentual));
    document.getElementById("progressoBarra").style.width = `${percentual}%`;
    document.getElementById("progressoValor").textContent = `${percentual}%`;
    document.getElementById("progressoMensagem").textContent = percentual === 100
        ? "Tudo certo! Seu cadastro está completo para receber pedidos sem atrasos."
        : `Faltam ${verificacoes.length - completos} informações para deixar seus pedidos mais rápidos.`;
}

async function carregarFidelidade() {
    const container = document.getElementById("fidelidadePerfil");
    const { data: saldos, error } = await window.db.rpc("meus_beneficios_fidelidade");
    if (error) {
        container.replaceChildren(criar("p", "loyalty-empty", "Os pontos serão exibidos após ativar a migração operacional."));
        return;
    }
    const ids = (saldos || []).map((item) => item.empresa_id);
    const { data: empresas } = ids.length ? await window.db.from("empresas_catalogo").select("id,nome").in("id", ids) : { data: [] };
    const nomes = new Map((empresas || []).map((item) => [String(item.id), item.nome]));
    const total = (saldos || []).reduce((soma, item) => soma + Number(item.pontos || 0), 0);
    const meta = Math.max(2000, Math.ceil((total + 1) / 2000) * 2000);
    const faltantes = Math.max(0, meta - total);
    document.getElementById("totalPontosPerfil").textContent = total.toLocaleString("pt-BR");
    document.getElementById("cashbackPerfil").textContent = App.dinheiro(total / 100);
    document.getElementById("proximaRecompensaPerfil").textContent = meta.toLocaleString("pt-BR");
    document.getElementById("pontosFaltantesPerfil").textContent = `${faltantes.toLocaleString("pt-BR")} pontos`;
    document.getElementById("fidelidadeBarraPerfil").style.width = `${Math.min(100, (total / meta) * 100)}%`;
    container.replaceChildren();
    if (!saldos?.length) return container.append(criar("p", "loyalty-empty", "Quando um restaurante oferecer fidelidade, seus pedidos entregues acumularão pontos aqui."));
    saldos.forEach((saldo) => {
        const linha = criar("article", "loyalty-row");
        const texto = criar("div"); texto.append(criar("strong", "", nomes.get(String(saldo.empresa_id)) || "Restaurante"), criar("small", "", `${saldo.pontos_para_beneficio} pontos valem ${App.dinheiro(saldo.valor_beneficio)}`));
        const pontos = criar("div", "loyalty-points"); pontos.append(criar("b", "", String(saldo.pontos || 0)), criar("span", "", "pontos"));
        if (Number(saldo.pontos || 0) >= Number(saldo.pontos_para_beneficio || 0)) {
            const resgatar = criar("button", "loyalty-redeem", "Resgatar"); resgatar.type = "button";
            resgatar.addEventListener("click", async () => {
                if (!confirm(`Trocar ${saldo.pontos_para_beneficio} pontos por ${App.dinheiro(saldo.valor_beneficio)} em desconto?`)) return;
                App.definirCarregando(resgatar, true, "Resgatando...");
                const { data: codigo, error: erroResgate } = await window.db.rpc("resgatar_beneficio_fidelidade", { p_empresa_id: saldo.empresa_id });
                App.definirCarregando(resgatar, false);
                if (erroResgate) return window.AppToast?.("Não foi possível resgatar", App.mensagemErro(erroResgate), "error");
                try { await navigator.clipboard.writeText(codigo); } catch { /* O código também aparece na mensagem. */ }
                window.AppToast?.("Benefício resgatado", `Cupom ${codigo} copiado. Ele vale por 30 dias.`, "success", 9000);
                carregarFidelidade();
            });
            pontos.append(resgatar);
        }
        linha.append(texto, pontos); container.append(linha);
    });
}

async function carregarPerfil() {
    try {
        const { data: { user }, error } = await window.db.auth.getUser();
        if (error || !user) {
            localStorage.setItem("redirect", "perfil.html");
            window.location.replace("login.html");
            return;
        }
        App.vincularUsuarioLocal(user.id);

        const [resUsuario, resPedidos, resEnderecos, resAdmin] = await Promise.all([
            window.db.from("usuarios").select("nome,sobrenome,telefone,cpf,avatar_url").eq("id", user.id).maybeSingle(),
            window.db.from("pedidos")
                .select("id,numero,empresa_id,empresa_nome,status,total,desconto,created_at")
                .eq("usuario_id", user.id)
                .order("created_at", { ascending: false })
                .limit(100),
            window.db.from("enderecos").select("id").eq("usuario_id", user.id),
            window.db.rpc("usuario_eh_admin")
        ]);

        if (resUsuario.error) console.error("Erro ao carregar dados do perfil:", resUsuario.error);
        if (resPedidos.error) console.error("Erro ao carregar resumo dos pedidos:", resPedidos.error);
        if (resEnderecos.error) console.error("Erro ao carregar endereços:", resEnderecos.error);

        const usuario = resUsuario.data || null;
        const pedidos = resPedidos.error ? [] : (resPedidos.data || []);
        const nome = [usuario?.nome, usuario?.sobrenome].filter(Boolean).join(" ")
            || user.user_metadata?.nome
            || "Usuário";

        document.getElementById("nomeUsuario").textContent = nome;
        document.getElementById("primeiroNome").textContent = nome.split(/\s+/)[0];
        document.getElementById("emailUsuario").textContent = user.email || "E-mail não informado";
        renderizarAvatar(usuario?.avatar_url, nome);
        document.getElementById("membroDesde").textContent = dataMembro(user.created_at);

        await Promise.all([atualizarResumo(pedidos), carregarFidelidade()]);
        renderizarPedidoDestaque(pedidos);
        atualizarProgresso(usuario, user, resEnderecos.error ? 0 : (resEnderecos.data || []).length);
        document.getElementById("adminLink").hidden = resAdmin.error || resAdmin.data !== true;
    } catch (erro) {
        console.error("Erro ao carregar perfil:", erro);
        App.mostrarErroPagina("Não foi possível carregar sua área do cliente agora.");
        await atualizarResumo([]);
        renderizarPedidoDestaque([]);
    }
}

function criarModalLogout() {
    const estilo = document.createElement("style");
    estilo.textContent = `
        .logout-dialog{width:min(440px,calc(100vw - 32px));max-width:440px;padding:0;border:0;border-radius:24px;background:transparent;color:#17171c}
        .logout-dialog::backdrop{background:rgba(17,17,22,.58);backdrop-filter:blur(4px)}
        .logout-dialog-card{overflow:hidden;border:1px solid rgba(232,232,236,.92);border-radius:24px;background:#fff;box-shadow:0 28px 80px rgba(16,16,20,.28);animation:logoutDialogIn .18s ease-out}
        .logout-dialog-body{display:grid;justify-items:center;padding:30px 30px 24px;text-align:center}
        .logout-dialog-icon{display:grid;width:58px;height:58px;place-items:center;margin-bottom:18px;border-radius:18px;background:#fff0f1;color:#d71928;font-size:25px;font-weight:800}
        .logout-dialog-eyebrow{margin:0 0 6px;color:#d71928;font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
        .logout-dialog h2{margin:0;color:#17171c;font-size:22px;line-height:1.25}
        .logout-dialog-copy{max-width:340px;margin:10px 0 0;color:#68686f;font-size:13px;line-height:1.65}
        .logout-dialog-note{display:flex;width:100%;align-items:flex-start;gap:10px;margin-top:20px;padding:13px 14px;border-radius:14px;background:#f7f7f9;color:#55555d;text-align:left;font-size:11px;line-height:1.5}
        .logout-dialog-note span:first-child{display:grid;width:22px;height:22px;flex:0 0 auto;place-items:center;border-radius:50%;background:#e9e9ed;color:#3c3c43;font-weight:800}
        .logout-dialog-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:18px 22px 22px;border-top:1px solid #eeeef1;background:#fbfbfc}
        .logout-dialog-actions button{min-height:46px;padding:10px 14px;border-radius:13px;cursor:pointer;font:700 12px Poppins,system-ui,sans-serif;transition:transform .16s ease,background .16s ease,border-color .16s ease,box-shadow .16s ease}
        .logout-dialog-actions button:hover{transform:translateY(-1px)}
        .logout-dialog-cancel{border:1px solid #dedee3;background:#fff;color:#303038}
        .logout-dialog-cancel:hover{border-color:#cfcfd5;background:#f5f5f7}
        .logout-dialog-confirm{border:1px solid #d71928;background:#d71928;color:#fff;box-shadow:0 8px 20px rgba(215,25,40,.18)}
        .logout-dialog-confirm:hover{border-color:#bd1623;background:#bd1623}
        .logout-dialog-actions button:focus-visible{outline:3px solid rgba(234,29,44,.22);outline-offset:2px}
        @keyframes logoutDialogIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
        @media(max-width:520px){.logout-dialog-body{padding:26px 22px 20px}.logout-dialog-actions{grid-template-columns:1fr;padding:14px 18px 18px}.logout-dialog-confirm{order:1}.logout-dialog-cancel{order:2}}
        @media(prefers-reduced-motion:reduce){.logout-dialog-card{animation:none}.logout-dialog-actions button{transition:none}}
    `;
    document.head.append(estilo);

    const dialog = document.createElement("dialog");
    dialog.className = "logout-dialog";
    dialog.setAttribute("aria-labelledby", "logoutDialogTitulo");
    dialog.setAttribute("aria-describedby", "logoutDialogDescricao");

    const card = criar("div", "logout-dialog-card");
    const body = criar("div", "logout-dialog-body");
    const icon = criar("div", "logout-dialog-icon", "↪");
    icon.setAttribute("aria-hidden", "true");
    const eyebrow = criar("p", "logout-dialog-eyebrow", "Encerrar sessão");
    const titulo = criar("h2", "", "Deseja sair da sua conta?");
    titulo.id = "logoutDialogTitulo";
    const descricao = criar("p", "logout-dialog-copy", "Você será desconectado deste dispositivo e voltará para a página inicial.");
    descricao.id = "logoutDialogDescricao";
    const nota = criar("div", "logout-dialog-note");
    nota.append(criar("span", "", "i"), criar("span", "", "Seus pedidos, favoritos e dados da conta continuarão salvos para o próximo acesso."));
    body.append(icon, eyebrow, titulo, descricao, nota);

    const actions = criar("div", "logout-dialog-actions");
    const cancelar = criar("button", "logout-dialog-cancel", "Continuar conectado");
    cancelar.type = "button";
    const confirmar = criar("button", "logout-dialog-confirm", "Sair da conta");
    confirmar.type = "button";
    actions.append(cancelar, confirmar);
    card.append(body, actions);
    dialog.append(card);
    document.body.append(dialog);

    cancelar.addEventListener("click", () => dialog.close("cancelar"));
    dialog.addEventListener("click", (evento) => {
        if (evento.target === dialog) dialog.close("cancelar");
    });

    return { dialog, confirmar };
}

const logout = document.getElementById("logout");
const modalLogout = criarModalLogout();

logout.addEventListener("click", () => {
    if (!modalLogout.dialog.open) modalLogout.dialog.showModal();
});

modalLogout.confirmar.addEventListener("click", async () => {
    modalLogout.confirmar.disabled = true;
    modalLogout.confirmar.textContent = "Saindo...";
    try {
        const { error } = await window.db.auth.signOut();
        if (error) throw error;
        App.limparDadosPrivados();
        window.location.replace("../index.html");
    } catch (erro) {
        modalLogout.dialog.close();
        window.AppToast?.("Não foi possível sair", App.mensagemErro(erro), "error");
    } finally {
        modalLogout.confirmar.disabled = false;
        modalLogout.confirmar.textContent = "Sair da conta";
    }
});

document.querySelector("[data-open-notifications]")?.addEventListener("click", () => {
    document.getElementById("notificationTrigger")?.click();
});

document.querySelector("[data-theme-toggle-profile]")?.addEventListener("click", () => {
    document.querySelector(".theme-toggle-profile")?.click();
});

carregarPerfil();
