"use strict";

(() => {
  const CLIENT_PAGES = new Set([
    "index.html",
    "restaurante.html",
    "checkout.html",
    "pedido-sucesso.html",
    "meus-pedidos.html",
    "acompanhamento.html",
    "favoritos.html",
    "perfil.html",
    "enderecos.html",
    "dados.html",
    "suporte.html",
    "privacidade.html"
  ]);
  const CLIENT_NAV_PAGES = new Set(["index.html", "meus-pedidos.html", "favoritos.html", "perfil.html"]);
  const lastPathSegment = location.pathname.split("/").filter(Boolean).at(-1)?.toLowerCase() || "";
  const currentPage = lastPathSegment.endsWith(".html") ? lastPathSegment : "index.html";

  if (!CLIENT_PAGES.has(currentPage)) return;

  const assetRoot = /\/html\/[^/]+\.html$/i.test(location.pathname) ? "../" : "";
  document.body.classList.add("client-mobile-shell");
  document.body.dataset.clientPage = currentPage.replace(/\.html$/i, "") || "index";
  document.documentElement.dataset.clientMobile = "true";

  let savedTheme = null;
  try {
    const value = localStorage.getItem("multi-delivery-theme");
    if (value === "light" || value === "dark") savedTheme = value;
  } catch (error) {
    console.warn("Mobile do cliente: preferência de tema indisponível", error);
  }
  const initialTheme = savedTheme || "dark";
  document.documentElement.dataset.theme = initialTheme;
  document.documentElement.style.colorScheme = initialTheme;
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    meta.content = initialTheme === "dark" ? "#090b0d" : "#ea1d2c";
  });

  if (!CLIENT_NAV_PAGES.has(currentPage)) return;

  const navItems = [
    { key: "home", label: "Início", href: `${assetRoot}index.html`, icon: '<path d="M3 10.8 12 3l9 7.8V21a1 1 0 0 1-1 1h-5.5v-7h-5v7H4a1 1 0 0 1-1-1Z"/>' },
    { key: "search", label: "Buscar", href: `${assetRoot}index.html#buscar`, icon: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>' },
    { key: "orders", label: "Pedidos", href: `${assetRoot}html/meus-pedidos.html`, icon: '<path d="M6 3h12v19l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/>' },
    { key: "favorites", label: "Favoritos", href: `${assetRoot}html/favoritos.html`, icon: '<path d="M20.8 4.7a5.5 5.5 0 0 0-7.8 0L12 5.8l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.4 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>' },
    { key: "profile", label: "Perfil", href: `${assetRoot}html/perfil.html`, icon: '<circle cx="12" cy="8" r="4"/><path d="M4 22a8 8 0 0 1 16 0"/>' }
  ];
  const routeKey = {
    "index.html": "home",
    "meus-pedidos.html": "orders",
    "favoritos.html": "favorites",
    "perfil.html": "profile"
  };
  const mobileNav = document.createElement("nav");
  mobileNav.className = "client-bottom-nav";
  mobileNav.setAttribute("aria-label", "Navegação principal do cliente");

  navItems.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.dataset.navKey = item.key;
    link.setAttribute("aria-label", item.label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = item.icon;
    const label = document.createElement("span");
    label.textContent = item.label;
    link.append(svg, label);
    mobileNav.append(link);
  });
  document.body.append(mobileNav);

  function updateClientNav() {
    const activeKey = currentPage === "index.html" && location.hash === "#buscar" ? "search" : routeKey[currentPage];
    mobileNav.querySelectorAll("a").forEach((link) => {
      const active = link.dataset.navKey === activeKey;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function focusHomeSearch() {
    if (currentPage !== "index.html" || location.hash !== "#buscar") return;
    const search = document.getElementById("campoBusca");
    if (!search) return;
    requestAnimationFrame(() => {
      search.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      search.focus({ preventScroll: true });
    });
  }

  addEventListener("hashchange", () => {
    updateClientNav();
    focusHomeSearch();
  });
  updateClientNav();
  focusHomeSearch();
})();
