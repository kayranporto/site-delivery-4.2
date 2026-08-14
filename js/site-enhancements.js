"use strict";
(() => {
  const mobileCss = document.createElement("link");
  mobileCss.rel = "stylesheet";
  mobileCss.href = "css/mobile-pwa-4.2.6.css?v=4.2.6";
  document.head.append(mobileCss);

  if (/empresa-dashboard\.html$/i.test(location.pathname)) {
    const operacaoCss = document.createElement("link");
    operacaoCss.rel = "stylesheet";
    operacaoCss.href = "css/operacao-restaurante-4.2.7.css?v=4.2.7";
    document.head.append(operacaoCss);
    const operacaoJs = document.createElement("script");
    operacaoJs.src = "js/operacao-restaurante-4.2.7.js?v=4.2.7";
    operacaoJs.defer = true;
    document.head.append(operacaoJs);

    const nav = document.querySelector(".dashboard-sidebar nav");
    if (nav && !nav.querySelector('a[href="empresa-equipe.html"]')) {
      const link = document.createElement("a");
      link.href = "empresa-equipe.html";
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "♟";
      link.append(icon, document.createTextNode(" Equipe"));
      nav.append(link);
    }

    const unidadesJs = document.createElement("script");
    unidadesJs.src = "js/empresa-unidades-4.3.js?v=4.3.0";
    unidadesJs.async = false;
    document.body.append(unidadesJs);
  }

  if (/restaurante\.html$/i.test(location.pathname)) {
    const unidadesPublicasJs = document.createElement("script");
    unidadesPublicasJs.src = "js/restaurante-unidades-4.3.js?v=4.3.0";
    unidadesPublicasJs.async = false;
    document.body.append(unidadesPublicasJs);
  }

  if (/checkout\.html$/i.test(location.pathname)) {
    const checkoutUnidadeJs = document.createElement("script");
    checkoutUnidadeJs.src = "js/checkout-unidade-4.3.js?v=4.3.0";
    checkoutUnidadeJs.async = false;
    document.body.append(checkoutUnidadeJs);
  }

  const region=document.createElement("div");
  region.className="app-toast-region";
  region.setAttribute("aria-live","polite");
  region.setAttribute("aria-relevant","additions");
  document.body.append(region);

  function toast(titulo,mensagem="",tipo="info",tempo=4500){
    const tipos=new Set(["success","error","warning","info"]);
    const tipoNormalizado=tipos.has(tipo)?tipo:"info";
    const icones={success:"✓",error:"!",warning:"!",info:"i"};
    const cores={success:"#168821",error:"#c62828",warning:"#a96300",info:"#315ca8"};
    const fundos={success:"#edf8ef",error:"#fff0f1",warning:"#fff6e7",info:"#eef4ff"};

    const el=document.createElement("div");
    el.className=`app-toast ${tipoNormalizado}`;
    el.setAttribute("role",tipoNormalizado==="error"||tipoNormalizado==="warning"?"alert":"status");
    el.style.borderLeftColor=cores[tipoNormalizado];

    const icon=document.createElement("span");
    icon.className="app-toast-icon";
    icon.setAttribute("aria-hidden","true");
    icon.textContent=icones[tipoNormalizado];
    icon.style.cssText=`display:grid;width:30px;height:30px;flex:0 0 30px;place-items:center;border-radius:10px;background:${fundos[tipoNormalizado]};color:${cores[tipoNormalizado]};font-size:14px;font-weight:900`;

    const box=document.createElement("div");
    box.className="app-toast-copy";
    box.style.cssText="min-width:0;flex:1;padding-top:1px";
    const strong=document.createElement("strong");
    strong.textContent=titulo;
    const p=document.createElement("p");
    p.textContent=mensagem;
    box.append(strong);
    if(mensagem)box.append(p);

    const close=document.createElement("button");
    close.type="button";
    close.className="app-toast-close";
    close.setAttribute("aria-label","Fechar aviso");
    close.textContent="×";

    let timer=null;
    const remover=()=>{if(timer)clearTimeout(timer);el.remove()};
    close.addEventListener("click",remover);
    el.append(icon,box,close);
    region.append(el);
    if(tempo)timer=setTimeout(remover,tempo);
    return el;
  }
  window.AppToast=toast;

  const paginasComAlertasLegados=/(?:acompanhamento|admin|empresa-dashboard|empresa-colaborador)\.html$/i;
  if(paginasComAlertasLegados.test(location.pathname)){
    const alertaNativo=window.alert.bind(window);
    window.alert=(mensagem)=>{
      if(!window.AppToast){alertaNativo(mensagem);return;}
      const texto=String(mensagem??"").trim()||"A operação não pôde ser concluída.";
      const pareceErro=/não foi possível|erro|falha|inválid|indisponível|negad|expirad/i.test(texto);
      window.AppToast(pareceErro?"Não foi possível concluir":"Aviso",texto,pareceErro?"error":"info",6500);
    };
  }

  function confirmar({
    titulo="Confirmar ação",
    mensagem="Deseja continuar?",
    confirmar="Confirmar",
    cancelar="Voltar",
    perigoso=false,
    icone="?",
    etiqueta="Confirmação",
    nota=""
  }={}){
    return new Promise((resolve)=>{
      const focoAnterior=document.activeElement;
      const fundo=document.createElement("div");
      fundo.className="app-confirm";
      const painel=document.createElement("section");
      painel.className="app-confirm-panel";
      painel.setAttribute("role","dialog");
      painel.setAttribute("aria-modal","true");

      const uid=`app-confirm-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
      const tituloId=`${uid}-titulo`;
      const mensagemId=`${uid}-mensagem`;
      painel.setAttribute("aria-labelledby",tituloId);
      painel.setAttribute("aria-describedby",mensagemId);

      const corpo=document.createElement("div");
      corpo.className="app-confirm-body";
      const icon=document.createElement("div");
      icon.className=`app-confirm-icon${perigoso?" danger":""}`;
      icon.setAttribute("aria-hidden","true");
      icon.textContent=icone;
      const eyebrow=document.createElement("div");
      eyebrow.className="app-confirm-eyebrow";
      eyebrow.textContent=etiqueta;
      const h=document.createElement("h2");
      h.id=tituloId;
      h.textContent=titulo;
      const p=document.createElement("p");
      p.id=mensagemId;
      p.className="app-confirm-copy";
      p.textContent=mensagem;
      corpo.append(icon,eyebrow,h,p);

      if(nota){
        const detalhe=document.createElement("div");
        detalhe.className="app-confirm-note";
        const marcador=document.createElement("span");
        marcador.setAttribute("aria-hidden","true");
        marcador.textContent="i";
        const texto=document.createElement("span");
        texto.textContent=nota;
        detalhe.append(marcador,texto);
        corpo.append(detalhe);
      }

      const acoes=document.createElement("div");
      acoes.className="app-confirm-actions";
      const cancelarBtn=document.createElement("button");
      cancelarBtn.type="button";
      cancelarBtn.className="secondary";
      cancelarBtn.textContent=cancelar;
      const aceitar=document.createElement("button");
      aceitar.type="button";
      aceitar.textContent=confirmar;
      aceitar.className=perigoso?"danger":"primary";
      acoes.append(cancelarBtn,aceitar);
      painel.append(corpo,acoes);
      fundo.append(painel);

      let encerrado=false;
      function fechar(valor){
        if(encerrado)return;
        encerrado=true;
        fundo.remove();
        focoAnterior?.focus?.();
        resolve(valor);
      }
      cancelarBtn.addEventListener("click",()=>fechar(false));
      aceitar.addEventListener("click",()=>fechar(true));
      fundo.addEventListener("click",(event)=>{if(event.target===fundo)fechar(false)});
      fundo.addEventListener("keydown",(event)=>{
        if(event.key==="Escape"){
          event.preventDefault();
          fechar(false);
          return;
        }
        if(event.key!=="Tab")return;
        const botoes=[cancelarBtn,aceitar].filter((botao)=>!botao.disabled);
        const primeiro=botoes[0];
        const ultimo=botoes.at(-1);
        if(event.shiftKey&&document.activeElement===primeiro){event.preventDefault();ultimo.focus()}
        else if(!event.shiftKey&&document.activeElement===ultimo){event.preventDefault();primeiro.focus()}
      });

      document.body.append(fundo);
      cancelarBtn.focus();
    });
  }
  window.AppConfirm=confirmar;

  const net=document.createElement("div");net.className="network-banner";net.setAttribute("role","status");document.body.append(net);
  function status(online,initial=false){net.textContent=online?"Conexão restabelecida":"Você está offline. Alguns dados podem estar desatualizados.";net.className=`network-banner show${online?" online":""}`;if(online&&!initial)setTimeout(()=>net.classList.remove("show"),2600);}
  addEventListener("online",()=>status(true));addEventListener("offline",()=>status(false));if(!navigator.onLine)status(false,true);

  const update=document.createElement("div");update.className="pwa-update";update.setAttribute("role","status");const updateCopy=document.createElement("div");const updateTitle=document.createElement("strong");updateTitle.textContent="Nova versão disponível";const updateText=document.createElement("small");updateText.textContent="Atualize para carregar as melhorias mais recentes.";updateCopy.append(updateTitle,updateText);const updateButton=document.createElement("button");updateButton.type="button";updateButton.textContent="Atualizar";update.append(updateCopy,updateButton);document.body.append(update);
  let waitingWorker=null;
  function mostrarAtualizacao(worker){if(!worker)return;waitingWorker=worker;update.classList.add("show")}
  updateButton.addEventListener("click",()=>{if(waitingWorker)waitingWorker.postMessage({type:"SKIP_WAITING"});else location.reload()});

  if("serviceWorker" in navigator && location.protocol!=="file:") addEventListener("load",async()=>{
    try{
      const registro=await navigator.serviceWorker.register("./sw.js?v=4.2.8",{updateViaCache:"none"});
      if(registro.waiting)mostrarAtualizacao(registro.waiting);
      registro.addEventListener("updatefound",()=>{const worker=registro.installing;if(!worker)return;worker.addEventListener("statechange",()=>{if(worker.state==="installed"&&navigator.serviceWorker.controller)mostrarAtualizacao(worker)})});
      let refreshing=false;
      navigator.serviceWorker.addEventListener("controllerchange",()=>{if(refreshing)return;refreshing=true;location.reload()});
      await registro.update();
    }catch(err){console.warn("Service Worker:",err)}
  });

  let installPrompt=null;const install=document.createElement("button");install.className="install-app";install.type="button";install.hidden=true;install.textContent="Instalar Multi Delivery";document.body.append(install);
  const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;
  addEventListener("beforeinstallprompt",e=>{e.preventDefault();installPrompt=e;if(!standalone)install.hidden=false});
  install.onclick=async()=>{if(!installPrompt)return;installPrompt.prompt();const escolha=await installPrompt.userChoice;install.hidden=true;installPrompt=null;if(escolha?.outcome==="dismissed")toast("Instalação cancelada","Você pode instalar o aplicativo depois pelo navegador.","info")};
  addEventListener("appinstalled",()=>{install.hidden=true;toast("Aplicativo instalado","O Multi Delivery foi adicionado ao seu dispositivo.","success")});

  if(!document.querySelector(".skip-link")){const skip=document.createElement("a");skip.className="skip-link";skip.href="#conteudoPrincipal";skip.textContent="Pular para o conteúdo";skip.onclick=e=>{e.preventDefault();const main=document.querySelector("main,.page-main");if(!main)return;main.id=main.id||"conteudoPrincipal";main.setAttribute("tabindex","-1");main.focus()};document.body.prepend(skip)}
})();
