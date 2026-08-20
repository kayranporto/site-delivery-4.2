"use strict";

const SUPABASE_URL = "https://wzxsjxdbxonrmlmzufpv.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MY-SAdXYgtX0euNoW4arHw_zlnZ3pcx";
const SUPABASE_PROJECT_REF = "wzxsjxdbxonrmlmzufpv";

(() => {
    if (window.db) return;

    const mensagem = "Não foi possível conectar ao serviço de dados. Verifique a internet e tente novamente.";

    function clienteIndisponivel() {
        const resultado = () => ({ data: null, error: new Error(mensagem), count: 0 });
        let consulta;
        consulta = new Proxy({}, {
            get(_alvo, propriedade) {
                if (propriedade === "then") {
                    return (resolver) => Promise.resolve(resultado()).then(resolver);
                }
                return () => consulta;
            }
        });

        const respostaAuth = async () => resultado();
        return {
            indisponivel: true,
            from: () => consulta,
            rpc: respostaAuth,
            functions: { invoke: respostaAuth },
            auth: {
                getUser: async () => ({ data: { user: null }, error: new Error(mensagem) }),
                getSession: async () => ({ data: { session: null }, error: new Error(mensagem) }),
                signUp: respostaAuth,
                signInWithPassword: respostaAuth,
                signOut: respostaAuth,
                resetPasswordForEmail: respostaAuth,
                updateUser: respostaAuth
            }
        };
    }

    try {
        if (!window.supabase?.createClient) throw new Error("Biblioteca do Supabase não carregada.");
        if (!SUPABASE_URL.includes(`://${SUPABASE_PROJECT_REF}.supabase.co`)) {
            throw new Error("A URL do Supabase não corresponde ao projeto configurado.");
        }
        window.db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
    } catch (erro) {
        console.error(erro);
        window.db = clienteIndisponivel();
        window.App?.mostrarErroPagina(mensagem);
    }
})();
