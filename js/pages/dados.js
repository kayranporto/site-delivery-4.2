"use strict";
(() => {
    const form = document.getElementById("dadosForm");
    const senhaForm = document.getElementById("senhaForm");
    const fotoInput = document.getElementById("fotoInput");
    const salvarFoto = document.getElementById("salvarFoto");
    const removerFoto = document.getElementById("removerFoto");
    const avatarImagem = document.getElementById("avatarImagem");
    const avatarIniciais = document.getElementById("avatarIniciais");
    const fotoStatus = document.getElementById("fotoStatus");
    let usuarioAtual = null;
    let perfilAtual = null;
    let fotoProcessada = null;
    let previewTemporario = null;

    function iniciais(nome) {
        const partes = String(nome || "Usuário").trim().split(/\s+/).filter(Boolean);
        return (partes.length > 1 ? `${partes[0][0]}${partes.at(-1)[0]}` : partes[0]?.slice(0, 2) || "U").toUpperCase();
    }

    function nomeCompleto() {
        return [document.getElementById("nome").value, document.getElementById("sobrenome").value].filter(Boolean).join(" ") || "Usuário";
    }

    function definirStatus(texto, tipo = "") {
        fotoStatus.textContent = texto;
        fotoStatus.className = `foto-status${tipo ? ` ${tipo}` : ""}`;
    }

    function notificar(titulo, mensagem, tipo = "info") {
        if (window.AppToast) window.AppToast(titulo, mensagem, tipo);
        else definirStatus(mensagem, tipo === "error" ? "erro" : tipo === "success" ? "sucesso" : "");
    }

    function exibirAvatar(url, nome = nomeCompleto()) {
        avatarIniciais.textContent = iniciais(nome);
        if (!url) {
            avatarImagem.hidden = true;
            avatarImagem.removeAttribute("src");
            avatarIniciais.hidden = false;
            return;
        }
        avatarImagem.hidden = false;
        avatarIniciais.hidden = true;
        avatarImagem.src = url;
        avatarImagem.onerror = () => {
            avatarImagem.hidden = true;
            avatarIniciais.hidden = false;
            definirStatus("Não foi possível carregar a foto", "erro");
        };
    }

    function carregarImagem(arquivo) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(arquivo);
            const imagem = new Image();
            imagem.onload = () => { URL.revokeObjectURL(url); resolve(imagem); };
            imagem.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível abrir esta imagem.")); };
            imagem.src = url;
        });
    }

    function canvasParaBlob(canvas, tipo, qualidade) {
        return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Não foi possível preparar a imagem.")), tipo, qualidade));
    }

    async function otimizarFoto(arquivo) {
        const permitidos = new Set(["image/jpeg", "image/png", "image/webp"]);
        if (!permitidos.has(arquivo.type)) throw new Error("Escolha uma imagem JPG, PNG ou WEBP.");
        if (arquivo.size > 8 * 1024 * 1024) throw new Error("A imagem original deve ter no máximo 8 MB.");
        const imagem = await carregarImagem(arquivo);
        const ladoOriginal = Math.min(imagem.naturalWidth, imagem.naturalHeight);
        if (!ladoOriginal) throw new Error("Esta imagem não possui dimensões válidas.");
        const tamanho = 512;
        const origemX = (imagem.naturalWidth - ladoOriginal) / 2;
        const origemY = (imagem.naturalHeight - ladoOriginal) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = tamanho; canvas.height = tamanho;
        const contexto = canvas.getContext("2d", { alpha: false });
        contexto.fillStyle = "#ffffff"; contexto.fillRect(0, 0, tamanho, tamanho);
        contexto.drawImage(imagem, origemX, origemY, ladoOriginal, ladoOriginal, 0, 0, tamanho, tamanho);
        let blob = await canvasParaBlob(canvas, "image/webp", .86);
        if (blob.size > 2 * 1024 * 1024) blob = await canvasParaBlob(canvas, "image/webp", .7);
        if (blob.size > 2 * 1024 * 1024) throw new Error("A foto continua muito grande após a otimização.");
        return blob;
    }

    async function carregarDados() {
        try {
            const { data: { user }, error: erroAuth } = await window.db.auth.getUser();
            if (erroAuth || !user) {
                localStorage.setItem("redirect", "dados.html");
                window.location.replace("login.html");
                return;
            }
            usuarioAtual = user;
            document.getElementById("email").value = user.email || "";
            const { data, error } = await window.db.from("usuarios").select("*").eq("id", user.id).maybeSingle();
            if (error) throw error;
            perfilAtual = data || { id: user.id };
            document.getElementById("nome").value = perfilAtual.nome || user.user_metadata?.nome || "";
            document.getElementById("sobrenome").value = perfilAtual.sobrenome || "";
            document.getElementById("telefone").value = perfilAtual.telefone || "";
            document.getElementById("cpf").value = perfilAtual.cpf || "";
            exibirAvatar(perfilAtual.avatar_url, nomeCompleto());
            removerFoto.hidden = !perfilAtual.avatar_url;
            definirStatus(perfilAtual.avatar_url ? "Foto adicionada" : "Sem foto", perfilAtual.avatar_url ? "sucesso" : "");
        } catch (erro) {
            console.error("Erro ao carregar dados:", erro);
            App.mostrarErroPagina("Não foi possível carregar os dados da conta.");
            definirStatus("Não foi possível carregar", "erro");
        }
    }

    fotoInput.addEventListener("change", async () => {
        const arquivo = fotoInput.files?.[0];
        if (!arquivo) return;
        salvarFoto.disabled = true;
        definirStatus("Preparando foto...");
        try {
            fotoProcessada = await otimizarFoto(arquivo);
            if (previewTemporario) URL.revokeObjectURL(previewTemporario);
            previewTemporario = URL.createObjectURL(fotoProcessada);
            exibirAvatar(previewTemporario);
            salvarFoto.disabled = false;
            definirStatus("Pronta para salvar", "sucesso");
        } catch (erro) {
            fotoProcessada = null;
            fotoInput.value = "";
            exibirAvatar(perfilAtual?.avatar_url || null);
            definirStatus("Imagem inválida", "erro");
            notificar("Não foi possível usar a foto", erro.message, "error");
        }
    });

    salvarFoto.addEventListener("click", async () => {
        if (!usuarioAtual || !fotoProcessada) return;
        App.definirCarregando(salvarFoto, true, "Enviando...");
        definirStatus("Enviando foto...");
        const caminho = `${usuarioAtual.id}/avatar`;
        try {
            const { error: erroUpload } = await window.db.storage.from("avatars").upload(caminho, fotoProcessada, {
                upsert: true,
                cacheControl: "3600",
                contentType: fotoProcessada.type || "image/webp"
            });
            if (erroUpload) throw erroUpload;
            const { data: urlData } = window.db.storage.from("avatars").getPublicUrl(caminho);
            if (!urlData?.publicUrl) throw new Error("Não foi possível gerar o endereço da foto.");
            const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;
            const { error: erroPerfil } = await window.db.from("usuarios").upsert({ id: usuarioAtual.id, avatar_url: avatarUrl, updated_at: new Date().toISOString() }, { onConflict: "id" });
            if (erroPerfil) throw erroPerfil;
            perfilAtual = { ...perfilAtual, avatar_url: avatarUrl };
            fotoProcessada = null; fotoInput.value = ""; salvarFoto.disabled = true; removerFoto.hidden = false;
            if (previewTemporario) { URL.revokeObjectURL(previewTemporario); previewTemporario = null; }
            exibirAvatar(avatarUrl);
            definirStatus("Foto salva", "sucesso");
            notificar("Foto atualizada", "Sua nova foto já aparece na área do cliente.", "success");
        } catch (erro) {
            console.error("Erro ao salvar foto:", erro);
            definirStatus("Erro ao salvar", "erro");
            const mensagem = /bucket|not found|row-level security|policy/i.test(erro.message || "")
                ? "Execute a migração 011_foto_perfil.sql no Supabase e tente novamente."
                : App.mensagemErro(erro);
            notificar("Não foi possível salvar a foto", mensagem, "error");
        } finally {
            App.definirCarregando(salvarFoto, false);
            salvarFoto.disabled = !fotoProcessada;
        }
    });

    removerFoto.addEventListener("click", async () => {
        if (!usuarioAtual || !confirm("Deseja remover sua foto de perfil?")) return;
        App.definirCarregando(removerFoto, true, "Removendo...");
        try {
            const caminho = `${usuarioAtual.id}/avatar`;
            const { error: erroStorage } = await window.db.storage.from("avatars").remove([caminho]);
            if (erroStorage && !/not found|not_found/i.test(erroStorage.message || "")) throw erroStorage;
            const { error } = await window.db.from("usuarios").update({ avatar_url: null, updated_at: new Date().toISOString() }).eq("id", usuarioAtual.id);
            if (error) throw error;
            perfilAtual = { ...perfilAtual, avatar_url: null };
            fotoProcessada = null; fotoInput.value = ""; salvarFoto.disabled = true; removerFoto.hidden = true;
            if (previewTemporario) { URL.revokeObjectURL(previewTemporario); previewTemporario = null; }
            exibirAvatar(null);
            definirStatus("Sem foto");
            notificar("Foto removida", "As iniciais do seu nome serão exibidas no perfil.", "success");
        } catch (erro) {
            definirStatus("Erro ao remover", "erro");
            notificar("Não foi possível remover a foto", App.mensagemErro(erro), "error");
        } finally {
            App.definirCarregando(removerFoto, false);
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!usuarioAtual) return;
        const cpf = App.somenteNumeros(document.getElementById("cpf").value);
        if (cpf && !App.validarCPF(cpf)) return notificar("CPF inválido", "Informe um CPF válido ou deixe o campo vazio.", "error");
        const telefone = document.getElementById("telefone").value.trim();
        if (telefone && !App.validarTelefone(telefone)) return notificar("Telefone inválido", "Informe um telefone com DDD e 10 ou 11 números.", "error");
        const botao = form.querySelector("button[type='submit']");
        App.definirCarregando(botao, true, "Salvando...");
        try {
            const payload = {
                id: usuarioAtual.id,
                nome: document.getElementById("nome").value.trim(),
                sobrenome: document.getElementById("sobrenome").value.trim(),
                telefone,
                cpf: cpf || null
            };
            if (!payload.nome) throw new Error("Informe seu nome.");
            const { error } = await window.db.from("usuarios").upsert(payload, { onConflict: "id" });
            if (error) throw error;
            perfilAtual = { ...perfilAtual, ...payload };
            if (!perfilAtual.avatar_url) exibirAvatar(null, nomeCompleto());
            notificar("Dados atualizados", "Suas informações foram salvas.", "success");
        } catch (erro) {
            notificar("Não foi possível atualizar os dados", App.mensagemErro(erro), "error");
        } finally {
            App.definirCarregando(botao, false);
        }
    });

    senhaForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const senha = document.getElementById("novaSenha").value;
        const confirmar = document.getElementById("confirmarNovaSenha").value;
        if (senha.length < 6) return notificar("Senha curta", "A senha deve ter ao menos 6 caracteres.", "error");
        if (senha !== confirmar) return notificar("Senhas diferentes", "As senhas informadas não coincidem.", "error");
        const botao = senhaForm.querySelector("button[type='submit']");
        App.definirCarregando(botao, true, "Atualizando...");
        try {
            const { error } = await window.db.auth.updateUser({ password: senha });
            if (error) throw error;
            senhaForm.reset();
            notificar("Senha atualizada", "Sua nova senha já está ativa.", "success");
        } catch (erro) {
            notificar("Não foi possível atualizar a senha", App.mensagemErro(erro), "error");
        } finally {
            App.definirCarregando(botao, false);
        }
    });


    async function exportarDadosPessoais() {
        if (!usuarioAtual) return;
        const botao = document.getElementById("exportarDados");
        const status = document.getElementById("privacidadeStatus");
        App.definirCarregando(botao, true, "Preparando...");
        status.textContent = "Preparando arquivo...";
        try {
            const consultas = await Promise.all([
                window.db.from("usuarios").select("*").eq("id", usuarioAtual.id).maybeSingle(),
                window.db.from("enderecos").select("*").eq("usuario_id", usuarioAtual.id).order("created_at"),
                window.db.from("pedidos").select("*,pedido_itens(*),historico_status_pedido(*)").eq("usuario_id", usuarioAtual.id).order("created_at"),
                window.db.from("favoritos").select("*").eq("usuario_id", usuarioAtual.id).order("created_at"),
                window.db.from("avaliacoes").select("*").eq("usuario_id", usuarioAtual.id).order("created_at"),
                window.db.from("chamados_suporte").select("*").eq("usuario_id", usuarioAtual.id).order("created_at"),
                window.db.from("notificacoes").select("*").eq("usuario_id", usuarioAtual.id).order("created_at")
            ]);
            const erro = consultas.find((resultado) => resultado.error)?.error;
            if (erro) throw erro;
            const pacote = {
                exportado_em: new Date().toISOString(),
                formato: "multi-delivery-account-export-v1",
                conta: { id: usuarioAtual.id, email: usuarioAtual.email, criado_em: usuarioAtual.created_at },
                perfil: consultas[0].data,
                enderecos: consultas[1].data || [],
                pedidos: consultas[2].data || [],
                favoritos: consultas[3].data || [],
                avaliacoes: consultas[4].data || [],
                chamados_suporte: consultas[5].data || [],
                notificacoes: consultas[6].data || []
            };
            const blob = new Blob([JSON.stringify(pacote, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `meus-dados-delivery-${new Date().toISOString().slice(0, 10)}.json`;
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            status.textContent = "Arquivo gerado. Guarde-o em local seguro.";
            notificar("Exportação concluída", "Seus dados foram reunidos em um arquivo JSON.", "success");
        } catch (erro) {
            status.textContent = "Não foi possível concluir a exportação.";
            notificar("Falha na exportação", App.mensagemErro(erro), "error");
        } finally {
            App.definirCarregando(botao, false);
        }
    }

    async function solicitarExclusaoConta() {
        if (!usuarioAtual) return;
        const confirmado = window.AppConfirm
            ? await window.AppConfirm({
                titulo: "Solicitar exclusão da conta",
                mensagem: "A solicitação será analisada. Registros que precisem ser mantidos por obrigação legal ou prevenção a fraudes poderão ser preservados pelo prazo aplicável.",
                confirmar: "Enviar solicitação"
            })
            : confirm("Enviar solicitação de exclusão da conta para análise?");
        if (!confirmado) return;
        const botao = document.getElementById("solicitarExclusao");
        const status = document.getElementById("privacidadeStatus");
        App.definirCarregando(botao, true, "Enviando...");
        try {
            const { data: existente, error: consultaError } = await window.db.from("chamados_suporte")
                .select("id,status").eq("usuario_id", usuarioAtual.id)
                .eq("categoria", "conta").ilike("assunto", "Exclusão de conta%")
                .in("status", ["aberto", "em_analise", "respondido"]).limit(1);
            if (consultaError) throw consultaError;
            if (existente?.length) {
                status.textContent = "Já existe uma solicitação de exclusão em análise.";
                return;
            }
            const { error } = await window.db.rpc("abrir_chamado_suporte", {
                p_categoria: "conta",
                p_assunto: "Exclusão de conta e dados pessoais",
                p_mensagem: "Solicito a exclusão ou anonimização dos dados pessoais vinculados à minha conta, observadas as retenções legais e de segurança aplicáveis.",
                p_pedido_id: null
            });
            if (error) throw error;
            status.textContent = "Solicitação enviada. Acompanhe a resposta na área de suporte.";
            notificar("Solicitação registrada", "A equipe analisará a exclusão e as retenções aplicáveis.", "success");
        } catch (erro) {
            status.textContent = "Não foi possível registrar a solicitação.";
            notificar("Falha na solicitação", App.mensagemErro(erro), "error");
        } finally {
            App.definirCarregando(botao, false);
        }
    }

    document.getElementById("exportarDados")?.addEventListener("click", exportarDadosPessoais);
    document.getElementById("solicitarExclusao")?.addEventListener("click", solicitarExclusaoConta);

    addEventListener("beforeunload", () => { if (previewTemporario) URL.revokeObjectURL(previewTemporario); });
    carregarDados();
})();
