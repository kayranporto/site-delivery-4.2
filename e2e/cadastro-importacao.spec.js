"use strict";
const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
    await page.route("https://**/*", (route) => route.abort());
    await page.addInitScript(() => {
        const user = { id: "usuario-qa", email: "qa@example.invalid", created_at: "2026-08-01T12:00:00Z" };
        const empresa = { id: "empresa-qa", usuario_id: user.id, nome: "Restaurante QA", status: true, publicado: true, taxa_entrega: 5, pedido_minimo: 0 };
        const unidade = { id: "unidade-qa", empresa_id: empresa.id, nome: "Principal", ativa: true, principal: true };
        const tabelas = {
            empresas: [empresa], empresas_catalogo: [empresa], empresa_unidades: [unidade],
            usuarios: [{ id: user.id, nome: "Cliente QA" }], produtos: [], categorias: [],
            enderecos: [{id:"endereco-qa",usuario_id:user.id,apelido:"Casa",logradouro:"Rua QA",numero:"10",bairro:"Centro",cidade:"Recife",uf:"PE",principal:true}]
        };
        window.qaChamadas = [];
        window.db = {
            from(tabela) {
                let unico = false; const filtros = [];
                const consulta = new Proxy({}, { get(_alvo, metodo) {
                    if (metodo === "then") return (resolve) => {
                        const dados = (tabelas[tabela] || []).filter((item) => filtros.every(([key,value]) => String(item[key]) === String(value)));
                        return Promise.resolve({data:unico ? (dados[0] || null) : dados,error:null,count:dados.length}).then(resolve);
                    };
                    return (...args) => {
                        if (metodo === "eq") filtros.push(args);
                        if (metodo === "single" || metodo === "maybeSingle") unico = true;
                        return consulta;
                    };
                }});
                return consulta;
            },
            rpc: async (nome, params) => {
                window.qaChamadas.push({nome,params});
                if (nome === "importar_produtos_csv") {
                    tabelas.produtos.push(...params.p_produtos.map((p,i)=>({...p,id:`produto-${i}`,empresa_id:empresa.id,unidade_id:unidade.id})));
                    return {data:params.p_produtos.length,error:null};
                }
                if (nome === "endereco_salvar") return {data:null,error:{message:"Falha simulada ao salvar"}};
                if (nome === "endereco_selecionar") return {data:params.p_endereco_id,error:null};
                if (nome === "usuario_eh_admin") return {data:false,error:null};
                if (nome.includes("disponibilidade")) return {data:{aberto:true},error:null};
                if (nome.includes("calcular_entrega")) return {data:{atendido:true,aberto:true,taxa_entrega:5},error:null};
                return {data:[],error:null};
            },
            auth: {
                getUser: async () => ({data:{user},error:null}), getSession: async()=>({data:{session:{user}},error:null}),
                signOut:async()=>({error:null}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})
            },
            channel: () => { const canal={on:()=>canal,subscribe:()=>canal}; return canal; },
            removeChannel:async()=>{},functions:{invoke:async()=>({data:[],error:null})}
        };
    });
});

test("perfil oferece tema no menu e persiste a escolha nas outras páginas", async ({ page }) => {
    await page.goto("/html/perfil.html");
    const botao=page.getByRole("button",{name:"Ativar modo escuro",exact:true});
    await expect(page.locator("[data-theme-preferences]").getByRole("button")).toBeVisible();
    await expect(botao).toHaveCSS("position","static");
    await botao.click();
    await page.goto("/html/checkout.html");
    await expect(page.locator("html")).toHaveAttribute("data-theme","dark");
    await expect(page.getByRole("button",{name:"Ativar modo claro",exact:true})).toHaveCSS("position","static");
});

test("cadastro formata letras e números no CNPJ", async ({ page }) => {
    await page.goto("/html/empresa-cadastro.html");
    const cnpj=page.getByLabel("CNPJ",{exact:true});
    await cnpj.fill("12abc34501de35");
    await expect(cnpj).toHaveValue("12.ABC.345/01DE-35");
    await cnpj.fill("11222333000181");
    await expect(cnpj).toHaveValue("11.222.333/0001-81");
});

test("endereço salvo com erro mantém a tela e a seleção anterior", async ({ page }) => {
    await page.goto("/html/enderecos.html?redirect=checkout.html");
    await expect(page.getByText("Casa • Principal",{exact:true})).toBeVisible();
    for (const [id,valor] of Object.entries({cep:"01001000",logradouro:"Rua Nova",numero:"2",bairro:"Centro",cidade:"São Paulo",uf:"SP"})) await page.locator(`#${id}`).fill(valor);
    await page.locator("#enderecoForm button[type=submit]").click();
    await expect(page.getByText("Falha simulada ao salvar",{exact:true})).toBeVisible();
    await expect(page).toHaveURL(/enderecos\.html\?redirect=checkout.html/);
    await expect(page.getByText("Casa • Principal",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"Entregar aqui",exact:true}).click();
    await expect(page).toHaveURL(/checkout\.html$/);
});

test("painel confere CSV e importa só depois de confirmar", async ({ page }) => {
    await page.goto("/html/empresa-dashboard.html#cardapio");
    await expect(page.locator("#unidadePainelSelect")).toHaveValue("unidade-qa");
    await page.locator("#importacaoArquivo").setInputFiles({name:"produtos.csv",mimeType:"text/csv",buffer:Buffer.from("nome;categoria;preco\nPizza QA;Pizzas;39,90\nSuco QA;Bebidas;9,90")});
    await expect(page.locator("#importacaoStatus")).toContainText("2 produto(s)");
    await expect(page.locator("#importacaoPrevia tbody tr")).toHaveCount(2);
    expect(await page.evaluate(()=>window.qaChamadas.filter(c=>c.nome==="importar_produtos_csv"))).toHaveLength(0);
    await page.getByRole("button",{name:"Confirmar importação",exact:true}).click();
    await expect(page.locator("#importacaoStatus")).toHaveText("2 produto(s) importado(s) com sucesso.");
    expect(await page.evaluate(()=>window.qaChamadas.filter(c=>c.nome==="importar_produtos_csv"))).toHaveLength(1);
});

test("painel bloqueia CSV inválido e permite cidade inteira sem preencher bairro", async ({ page }) => {
    await page.goto("/html/empresa-dashboard.html#cardapio");
    await expect(page.locator("#unidadePainelSelect")).toHaveValue("unidade-qa");
    await page.locator("#importacaoArquivo").setInputFiles({name:"produtos.csv",mimeType:"text/csv",buffer:Buffer.from("nome;preco\nSuco;-1")});
    await expect(page.locator("#importacaoStatus")).toContainText("1 linha(s) com erro");
    await expect(page.locator("#importacaoConfirmar")).toBeDisabled();
    await page.goto("/html/empresa-dashboard.html#operacao");
    await expect(page.locator("#unidadePainelSelect")).toHaveValue("unidade-qa");
    await page.getByLabel("Atender todos os bairros desta cidade").check();
    await expect(page.locator("#regiaoBairro")).toBeDisabled();
    await page.getByLabel("Atender todos os bairros desta cidade").uncheck();
    await expect(page.locator("#regiaoBairro")).toBeEnabled();
});
