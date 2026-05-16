(function () {
  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function ensureUi() {
    if (!document.getElementById("sync-progress")) {
      var bar = document.createElement("div");
      bar.id = "sync-progress";
      bar.setAttribute("aria-hidden", "true");
      document.body.appendChild(bar);
    }

    if (!document.getElementById("app-shell-toast")) {
      var toast = document.createElement("div");
      toast.id = "app-shell-toast";
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }
  }

  function injectStyles() {
    if (document.getElementById("app-shell-styles")) return;
    var style = document.createElement("style");
    style.id = "app-shell-styles";
    style.textContent = [
      "*{touch-action:manipulation}",
      "input,select,textarea{font-size:16px}",
      "button,[role='button'],a{ -webkit-tap-highlight-color: transparent; }",
      "button:active,[role='button']:active,a:active{transform:scale(.98)}",
      "@media (prefers-reduced-motion:no-preference){body{animation:appShellEnter .22s ease-out both}body.app-shell-exit{animation:appShellExit .18s ease-in both}@keyframes appShellEnter{from{opacity:.01;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}@keyframes appShellExit{to{opacity:.01;transform:translateY(8px)}}}",
      "#sync-progress{position:fixed;top:0;left:0;height:3px;width:0;background:linear-gradient(90deg,#146c2e,#94f990);z-index:9999;transition:width .2s ease,opacity .2s ease;opacity:0}",
      "#sync-progress.is-active{opacity:1;width:42%}",
      "#sync-progress.is-finishing{opacity:1;width:100%}",
      "#app-shell-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translate(-50%,16px);z-index:9998;max-width:min(92vw,420px);padding:12px 16px;border-radius:14px;background:#ffffff;color:#1b1c1c;box-shadow:0 12px 30px rgba(0,0,0,.18);font:700 13px/18px Quicksand,system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .2s ease,transform .2s ease;text-align:center}",
      "#app-shell-toast.is-visible{opacity:1;transform:translate(-50%,0)}",
      "#app-shell-toast.is-warning{background:#fff7ed;color:#9a3412}",
      "#app-shell-toast.is-error{background:#ffdad6;color:#93000a}",
      "#app-shell-toast.is-success{background:#dcfce7;color:#166534}"
    ].join("");
    document.head.appendChild(style);
  }

  function showToast(message, kind) {
    var toast = document.getElementById("app-shell-toast");
    if (!toast) return;
    toast.className = "";
    if (kind) toast.classList.add("is-" + kind);
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  function startSyncProgress() {
    var bar = document.getElementById("sync-progress");
    if (!bar) return;
    bar.classList.remove("is-finishing");
    bar.classList.add("is-active");
  }

  function finishSyncProgress() {
    var bar = document.getElementById("sync-progress");
    if (!bar) return;
    bar.classList.remove("is-active");
    bar.classList.add("is-finishing");
    window.setTimeout(function () {
      bar.classList.remove("is-finishing");
      bar.style.width = "";
    }, 260);
  }

  function setupServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("./sw.js", { updateViaCache: "none" })
      .then(function (registration) {
        registration.update();
      })
      .catch(function (err) {
        console.warn("[AppShell] Service worker registration failed:", err);
      });
  }

  function setupNavigationTransitions() {
    document.addEventListener("click", function (event) {
      var link = event.target.closest && event.target.closest("a[href]");
      if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (link.target && link.target !== "_self") return;

      var url = new URL(link.getAttribute("href"), window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname && url.hash) return;
      if (!/\.html$|\/$|\/tela1$|\/tela2$/.test(url.pathname)) return;

      if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && /\/tela[12]$/.test(url.pathname)) {
        url.pathname += ".html";
      }

      event.preventDefault();
      document.body.classList.add("app-shell-exit");
      window.setTimeout(function () {
        window.location.href = url.href;
      }, 160);
    });
  }

  ready(function () {
    injectStyles();
    ensureUi();
    setupServiceWorker();
    setupNavigationTransitions();

    window.addEventListener("cofrinho-sync-start", startSyncProgress);
    window.addEventListener("cofrinho-sync-end", finishSyncProgress);
    window.addEventListener("cofrinho-sync-error", function () {
      finishSyncProgress();
      if (navigator.onLine) showToast("Sincronizacao falhou. Os dados ficaram salvos neste aparelho.", "error");
    });
    window.addEventListener("online", function () {
      showToast("Conexao restaurada. Sincronizando...", "success");
      if (window.CofrinhoMagico && typeof window.CofrinhoMagico.initSync === "function") {
        window.CofrinhoMagico.initSync();
      }
    });
    window.addEventListener("offline", function () {
      showToast("Modo offline: suas alteracoes ficam salvas no aparelho.", "warning");
    });
  });
})();
