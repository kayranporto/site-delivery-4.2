"use strict";


window.AuthPolicy = Object.freeze({
    minLength: 8,
    validar(senha) {
        const valor = String(senha || "");
        const requisitos = {
            tamanho: valor.length >= 8,
            letra: /[A-Za-zÀ-ÿ]/.test(valor),
            numero: /\d/.test(valor)
        };
        return {
            valida: Object.values(requisitos).every(Boolean),
            requisitos,
            mensagem: "A senha precisa ter pelo menos 8 caracteres, incluindo letra e número."
        };
    }
});

(function iniciarInterfaceAutenticacao() {
    const eyeOpen = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
            <circle cx="12" cy="12" r="2.6"></circle>
        </svg>`;
    const eyeClosed = `
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m3 3 18 18"></path>
            <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6 0 9.5 6 9.5 6a16.9 16.9 0 0 1-2.1 2.8"></path>
            <path d="M6.2 6.2C3.9 7.8 2.5 12 2.5 12s3.5 6 9.5 6c1.5 0 2.8-.4 3.9-.9"></path>
            <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"></path>
        </svg>`;

    document.querySelectorAll("[data-toggle-password]").forEach((button) => {
        const inputId = button.getAttribute("data-toggle-password");
        const input = document.getElementById(inputId);
        if (!input) return;

        button.innerHTML = eyeOpen;
        button.addEventListener("click", () => {
            const mostrar = input.type === "password";
            input.type = mostrar ? "text" : "password";
            button.innerHTML = mostrar ? eyeClosed : eyeOpen;
            button.setAttribute("aria-label", mostrar ? "Ocultar senha" : "Mostrar senha");
            button.setAttribute("aria-pressed", String(mostrar));
        });
    });

    function formatarTelefone(valor) {
        const digitos = valor.replace(/\D/g, "").slice(0, 11);
        if (digitos.length <= 2) return digitos;
        if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
        if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
        return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
    }

    function formatarCPF(valor) {
        const d = valor.replace(/\D/g, "").slice(0, 11);
        return d
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d)/, "$1.$2")
            .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }

    function formatarCNPJ(valor) {
        const d = valor.replace(/\D/g, "").slice(0, 14);
        return d
            .replace(/^(\d{2})(\d)/, "$1.$2")
            .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
            .replace(/\.(\d{3})(\d)/, ".$1/$2")
            .replace(/(\d{4})(\d)/, "$1-$2");
    }

    document.querySelectorAll("[data-mask='phone']").forEach((input) => {
        input.addEventListener("input", () => {
            input.value = formatarTelefone(input.value);
        });
    });

    document.querySelectorAll("[data-mask='cpf']").forEach((input) => {
        input.addEventListener("input", () => {
            input.value = formatarCPF(input.value);
        });
    });

    document.querySelectorAll("[data-mask='cnpj']").forEach((input) => {
        input.addEventListener("input", () => {
            input.value = formatarCNPJ(input.value);
        });
    });

    document.querySelectorAll("[data-password-strength]").forEach((input) => {
        const meterId = input.getAttribute("data-password-strength");
        const meter = document.getElementById(meterId);
        if (!meter) return;
        const text = meter.querySelector(".auth-strength-text");

        const atualizar = () => {
            const value = input.value;
            let score = 0;
            if (value.length >= 8) score += 1;
            if (value.length >= 10) score += 1;
            if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
            if (/\d/.test(value) && /[^A-Za-z0-9]/.test(value)) score += 1;

            meter.dataset.level = String(value ? Math.max(1, score) : 0);
            const labels = [
                "Use 8 caracteres, com letra e número.",
                "Senha fraca",
                "Senha razoável",
                "Senha boa",
                "Senha forte"
            ];
            if (text) text.textContent = labels[value ? Math.max(1, score) : 0];
        };

        input.addEventListener("input", atualizar);
        atualizar();
    });

    document.querySelectorAll("[data-match-password]").forEach((input) => {
        const originalId = input.getAttribute("data-match-password");
        const original = document.getElementById(originalId);
        const hintId = input.getAttribute("aria-describedby");
        const hint = hintId ? document.getElementById(hintId) : null;
        if (!original || !hint) return;

        const atualizar = () => {
            hint.classList.remove("is-match", "is-error");
            if (!input.value) {
                hint.textContent = "Repita a mesma senha.";
                return;
            }
            if (input.value === original.value) {
                hint.textContent = "As senhas coincidem.";
                hint.classList.add("is-match");
            } else {
                hint.textContent = "As senhas ainda não coincidem.";
                hint.classList.add("is-error");
            }
        };

        input.addEventListener("input", atualizar);
        original.addEventListener("input", atualizar);
    });
})();
