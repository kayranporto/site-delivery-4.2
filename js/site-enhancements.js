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
  }

  const region=document.createElement("div"); region.className="app-toast-region"; region.setAttribute("aria-live","polite"); document.body.append(region);
  function toast(titulo,mensagem="",tipo="info",tempo=4500){const el=document.createElement("div");el.className=`app-toast ${tipo}`;const box=document.createElement("div");const strong=document.createElement("strong");strong.textContent=titulo;const p=document.createElement("p");p.textContent=mensagem;box.append(strong);if(mensagem)box.append(p);const close=document.createElement("button");close.type="button";close.setAttribute("aria-label","Fechar aviso");close.textContent="×";close.onclick=()=>el.remove();el.append(box,close);region.append(el);if(tempo)setTimeout(()=>el.remove(),tempo);return el}
  window.AppToast=toast;

  const net=document.createElement("div");net.className="network-banner";net.setAttribute("role","status");document.body.append(net);
  function status(online,initial=false){net.textContent=online?"Conexão restabelecida":"Você está offline. Alguns dados podem estar desatualizados.";net.className=`network-banner show${online?" online":""}`;if(online&&!initial)setTimeout(()=>net.classList.remove("show"),2600);}
  addEventListener("online",()=>status(true));addEventListener("offline",()=>status(false));if(!navigator.onLine)status(false,true);

  const update=document.createElement("div");update.className="pwa-update";update.setAttribute("role","status");const updateCopy=document.createElement("div");const updateTitle=document.createElement("strong");updateTitle.textContent="Nova versão disponível";const updateText=document.createElement("small");updateText.textContent="Atualize para carregar as melhorias mais recentes.";updateCopy.append(updateTitle,updateText);const updateButton=document.createElement("button");updateButton.type="button";updateButton.textContent="Atualizar";update.append(updateCopy,updateButton);document.body.append(update);
  let waitingWorker=null;
  function mostrarAtualizacao(worker){if(!worker)return;waitingWorker=worker;update.classList.add("show")}
  updateButton.addEventListener("click",()=>{if(waitingWorker)waitingWorker.postMessage({type:"SKIP_WAITING"});else location.reload()});

  if("serviceWorker" in navigator && location.protocol!=="file:") addEventListener("load",async()=>{
    try{
      const registro=await navigator.serviceWorker.register("./sw.js?v=4.2.6",{updateViaCache:"none"});
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
