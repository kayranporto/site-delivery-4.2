"use strict";

(function criarFavoritosSincronizados() {
    let usuario = null;
    let ids = new Set();
    let pronto = null;

    async function iniciar() {
        const local = window.App?.lerJSON("favoritos", []) || [];
        ids = new Set((Array.isArray(local) ? local : []).map(String).filter(Boolean));
        const { data } = await window.db.auth.getUser();
        usuario = data?.user || null;
        if (!usuario) return [...ids];
        const { data: salvos, error } = await window.db.from("favoritos").select("empresa_id").eq("usuario_id", usuario.id);
        if (error) {
            console.warn("Favoritos em nuvem indisponíveis:", error);
            return [...ids];
        }
        (salvos || []).forEach((item) => ids.add(String(item.empresa_id)));
        if (ids.size) {
            const registros = [...ids].slice(0, 200).map((empresa_id) => ({ usuario_id: usuario.id, empresa_id }));
            const { error: migracaoErro } = await window.db.from("favoritos").upsert(registros, { onConflict: "usuario_id,empresa_id", ignoreDuplicates: true });
            if (migracaoErro) console.warn("Não foi possível migrar favoritos locais:", migracaoErro);
        }
        window.App.salvarJSON("favoritos", [...ids]);
        return [...ids];
    }

    async function garantir() { if (!pronto) pronto = iniciar(); await pronto; return ids; }

    async function toggle(empresaId) {
        await garantir();
        const id = String(empresaId || "");
        if (!id) return false;
        const remover = ids.has(id);
        if (usuario) {
            const resposta = remover
                ? await window.db.from("favoritos").delete().eq("usuario_id", usuario.id).eq("empresa_id", id)
                : await window.db.from("favoritos").insert({ usuario_id: usuario.id, empresa_id: id });
            if (resposta.error && resposta.error.code !== "23505") throw resposta.error;
        }
        remover ? ids.delete(id) : ids.add(id);
        window.App.salvarJSON("favoritos", [...ids]);
        dispatchEvent(new CustomEvent("favoritos-atualizados", { detail: [...ids] }));
        return !remover;
    }

    window.FavoritesSync = {
        ready: async () => [...await garantir()],
        has: (id) => ids.has(String(id)),
        toggle
    };
})();
