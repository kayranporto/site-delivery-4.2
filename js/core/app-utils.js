"use strict";

(() => {
    function lerJSON(chave, valorPadrao) {
        try {
            const valor = localStorage.getItem(chave);
            if (valor === null) return valorPadrao;
            const convertido = JSON.parse(valor);
            return convertido ?? valorPadrao;
        } catch (erro) {
            console.warn(`O dado local “${chave}” estava inválido e foi redefinido.`, erro);
            localStorage.removeItem(chave);
            return valorPadrao;
        }
    }

    function salvarJSON(chave, valor) {
        try {
            localStorage.setItem(chave, JSON.stringify(valor));
            return true;
        } catch (erro) {
            console.error(`Não foi possível salvar “${chave}” no navegador.`, erro);
            return false;
        }
    }

    const CHAVES_PRIVADAS = Object.freeze([
        "endereco",
        "enderecos",
        "pedidoAtual",
        "pedidosCache",
        "favoritos",
        "empresaLogada",
        "empresaAtual",
        "ultimaPaginaRestaurante",
        "redirect"
    ]);

    function limparDadosPrivados({ preservarCarrinho = false } = {}) {
        CHAVES_PRIVADAS.forEach((chave) => localStorage.removeItem(chave));
        if (!preservarCarrinho) {
            localStorage.removeItem("carrinho");
            localStorage.removeItem("carrinhoMeta");
        }
        sessionStorage.removeItem("enderecoTemporario");
        localStorage.removeItem("dadosUsuarioId");
    }

    function vincularUsuarioLocal(usuarioId) {
        const id = String(usuarioId || "").trim();
        if (!id) return;
        const anterior = localStorage.getItem("dadosUsuarioId");
        if (anterior && anterior !== id) limparDadosPrivados();
        localStorage.setItem("dadosUsuarioId", id);
    }

    function formatarEndereco(endereco) {
        if (!endereco || typeof endereco !== "object") return "";
        const primeiraLinha = [endereco.logradouro || endereco.rua, endereco.numero].filter(Boolean).join(", ");
        const segundaLinha = [endereco.complemento, endereco.bairro].filter(Boolean).join(" • ");
        const cidade = [endereco.cidade, endereco.uf || endereco.estado].filter(Boolean).join("/");
        const final = [cidade, endereco.cep ? `CEP ${endereco.cep}` : ""].filter(Boolean).join(" • ");
        return [primeiraLinha, segundaLinha, final].filter(Boolean).join(" — ");
    }

    function dinheiro(valor) {
        const numero = Number(valor);
        return (Number.isFinite(numero) ? numero : 0).toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL"
        });
    }

    function somenteNumeros(valor) {
        return String(valor || "").replace(/\D/g, "");
    }

    function validarCPF(valor) {
        const cpf = somenteNumeros(valor);
        if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

        const calcular = (tamanho) => {
            let soma = 0;
            for (let indice = 0; indice < tamanho; indice += 1) {
                soma += Number(cpf[indice]) * (tamanho + 1 - indice);
            }
            const resto = (soma * 10) % 11;
            return resto === 10 ? 0 : resto;
        };

        return calcular(9) === Number(cpf[9]) && calcular(10) === Number(cpf[10]);
    }

    function normalizarCNPJ(valor) {
        return String(valor || "").toUpperCase().replace(/[.\/\s-]/g, "");
    }

    function validarCNPJ(valor) {
        const cnpj = normalizarCNPJ(valor);
        if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;

        const calcular = (base, pesos) => {
            // Receita Federal: cada caractere vale seu código ASCII menos 48.
            const soma = [...base].reduce((total, digito, indice) => total + (digito.charCodeAt(0) - 48) * pesos[indice], 0);
            const resto = soma % 11;
            return resto < 2 ? 0 : 11 - resto;
        };
        const primeiro = calcular(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        const segundo = calcular(`${cnpj.slice(0, 12)}${primeiro}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
        return cnpj.endsWith(`${primeiro}${segundo}`);
    }

    function validarTelefone(valor) {
        const telefone = somenteNumeros(valor);
        return telefone.length === 10 || telefone.length === 11;
    }

    function destinoInterno(valor, padrao = "index.html") {
        if (typeof valor !== "string") return padrao;
        const destino = valor.trim();
        if (!destino || destino.startsWith("//") || /^[a-z][a-z\d+.-]*:/i.test(destino)) return padrao;

        try {
            const url = new URL(destino, window.location.href);
            if (url.origin !== window.location.origin) return padrao;
            const caminho = destino.split(/[?#]/, 1)[0].replace(/\\/g, "/");
            if (!/^(?:\.\.\/|html\/)?[\w.-]+\.html$/i.test(caminho)) return padrao;
            return `${caminho}${url.search}${url.hash}`;
        } catch {
            return padrao;
        }
    }

    function definirCarregando(botao, carregando, texto) {
        if (!botao) return;
        if (carregando) {
            botao.dataset.htmlOriginal = botao.innerHTML || "";
            botao.disabled = true;
            botao.setAttribute("aria-busy", "true");
            if (texto) botao.textContent = texto;
        } else {
            botao.disabled = false;
            botao.removeAttribute("aria-busy");
            if (botao.dataset.htmlOriginal !== undefined) {
                botao.innerHTML = botao.dataset.htmlOriginal;
                delete botao.dataset.htmlOriginal;
            }
        }
    }

    function mostrarErroPagina(mensagem) {
        let aviso = document.getElementById("erroAplicacao");
        if (!aviso) {
            aviso = document.createElement("div");
            aviso.id = "erroAplicacao";
            aviso.className = "erro-aplicacao";
            aviso.setAttribute("role", "alert");
            document.body.prepend(aviso);
        }
        aviso.textContent = mensagem;
    }

    function mensagemErro(erro, fallback = "Ocorreu um erro inesperado.") {
        if (!erro) return fallback;
        if (typeof erro === "string") return erro.trim() || fallback;

        const candidatos = [
            erro.message,
            erro.error_description,
            erro.details,
            erro.hint,
            erro.msg
        ];

        const mensagem = candidatos.find((valor) => typeof valor === "string" && valor.trim());
        if (mensagem) return mensagem.trim();

        if (typeof erro === "object") {
            try {
                const serializado = JSON.stringify(erro);
                if (serializado && serializado !== "{}") return serializado;
            } catch {
                // Ignora erros de serialização.
            }
        }

        return fallback;
    }

    window.App = Object.freeze({
        lerJSON,
        salvarJSON,
        limparDadosPrivados,
        vincularUsuarioLocal,
        formatarEndereco,
        dinheiro,
        somenteNumeros,
        validarCPF,
        normalizarCNPJ,
        validarCNPJ,
        validarTelefone,
        destinoInterno,
        definirCarregando,
        mostrarErroPagina,
        mensagemErro
    });
})();
