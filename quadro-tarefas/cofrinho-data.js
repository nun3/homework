/**
 * Estado partilhado do Minhas Tarefas (localStorage).
 * Abrir as páginas a partir do mesmo servidor (ex.: http://localhost:8000)
 * para tela1 e tela2 partilharem os dados.
 */
(function () {
  var STORAGE_KEY = "cofrinhoMagico_v2";

  var DEFAULT_SISTERS = [];

  var DEFAULT_CATALOG = [];

  function uid() {
    return "i_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function slugifyName(name) {
    return String(name || "crianca")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "crianca";
  }

  function normalizeTaskKey(title) {
    return String(title || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function newChildId(name) {
    return "child_" + slugifyName(name) + "_" + Date.now().toString(36);
  }

  function makeInstance(catalogItem, extra) {
    var inst = Object.assign({
      id: uid(),
      catalogId: catalogItem.id,
    }, extra || {});
    var minutes = Number(catalogItem.timeLimitMinutes) || 0;
    if (minutes > 0) {
      inst.dueAt = Date.now() + minutes * 60000;
    }
    return inst;
  }

  function normalizeChild(child) {
    if (!child.id) child.id = newChildId(child.name);
    if (!child.name) child.name = "Criança";
    child.age = Number(child.age) || 0;
    child.balanceBRL = Number(child.balanceBRL) || 0;
    child.goalLabel = child.goalLabel || "Meta do cofrinho";
    child.goalAmountBRL = Number(child.goalAmountBRL) || 100;
    child.weeklyBonusLabel = child.weeklyBonusLabel || "Bônus semanal";
    child.weeklyBonusCoins = Number(child.weeklyBonusCoins) || 0;
    child.borderColor = child.borderColor || "#94d5ab";
    child.badgeClass = child.badgeClass || "bg-primary-container text-on-primary-container";
    child.avatarUrl = child.avatarUrl || "";
    return child;
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        console.log('[Cofrinho] Estado carregado do localStorage:', parsed.sisters ? parsed.sisters.length + ' filhas' : 'nenhuma filha');
        return parsed;
      }
    } catch (e) {}
    console.log('[Cofrinho] Nenhum estado em localStorage');
    return null;
  }

  var FAMILY_ID = null;
  var syncDebounceTimer = null;
  var SYNC_DEBOUNCE_MS = 300; // Agrupar mudanças em 300ms
  var isSyncing = false;
  var pendingSyncState = null;

  function emitSyncEvent(name) {
    try {
      window.dispatchEvent(new CustomEvent(name));
    } catch (e) {}
  }

  function scheduleSync(state) {
    if (!window.supabaseClient || !FAMILY_ID) return;
    pendingSyncState = JSON.parse(JSON.stringify(state));
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = setTimeout(function() {
      if (!pendingSyncState) return;
      if (isSyncing) {
        scheduleSync(pendingSyncState);
        return;
      }

      var stateToSync = pendingSyncState;
      pendingSyncState = null;
      isSyncing = true;
      emitSyncEvent("cofrinho-sync-start");
      console.log('[Cofrinho] Sincronizando com Supabase...');

      window.supabaseClient.from('family_state').upsert({
        family_id: FAMILY_ID,
        data: stateToSync
      }).then(function(res) {
        if (res.error) {
          pendingSyncState = pendingSyncState || stateToSync;
          emitSyncEvent("cofrinho-sync-error");
          console.error('[Cofrinho] Sync Error:', res.error);
        } else {
          emitSyncEvent("cofrinho-sync-end");
          console.log('[Cofrinho] Sincronizado com sucesso');
        }
      }).catch(function(err) {
        pendingSyncState = pendingSyncState || stateToSync;
        emitSyncEvent("cofrinho-sync-error");
        console.error('[Cofrinho] Sync falhou:', err);
      }).finally(function() {
        isSyncing = false;
        if (pendingSyncState) scheduleSync(pendingSyncState);
      });
    }, SYNC_DEBOUNCE_MS);
  }

  function save(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent("cofrinho-changed"));
    try {
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: JSON.stringify(state) }));
    } catch (e) {}

    scheduleSync(state);
  }

  function initSync() {
    if (isSyncing) {
      console.log('[Cofrinho] initSync já em progresso, ignorando nova chamada');
      return Promise.resolve();
    }
    
    if (!window.supabaseClient) {
      console.log('[Cofrinho] Sem cliente Supabase, usando apenas localStorage');
      ensureState();
      return Promise.resolve();
    }

    isSyncing = true;
    emitSyncEvent("cofrinho-sync-start");
    console.log('[Cofrinho] Iniciando sincronização com Supabase...');

    return (async function() {
      try {
        var sessionData = await window.supabaseClient.auth.getSession();
        var session = sessionData.data.session;
        
        console.log('[Cofrinho] Session:', session ? 'autenticado' : 'não autenticado');
        
        var isIndex = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || window.location.pathname.endsWith('/');
        
        if (!session) {
          if (!isIndex) {
            console.log('[Cofrinho] Sem sessão, redirecionando para o início');
            window.location.href = './';
          }
          return;
        }
        
        FAMILY_ID = session.user.id;
        console.log('[Cofrinho] FAMILY_ID:', FAMILY_ID);
        
        // Fetch inicial (Carrega os dados mais recentes da nuvem ao abrir o app)
        var res = await window.supabaseClient.from('family_state').select('*').eq('family_id', FAMILY_ID).single();
        
        console.log('[Cofrinho] Resposta do Supabase:', res.error ? 'erro ' + (res.error.code || 'desconhecido') : 'sucesso');
        
        if (res.error && res.error.code === 'PGRST116') {
          // Não existe registro no Supabase ainda - criar com dados iniciais
          console.log('[Cofrinho] Registro não existe, criando novo...');
          var initialState = ensureState();
          var insertRes = await window.supabaseClient.from('family_state').insert({
            family_id: FAMILY_ID,
            data: initialState
          });
          if (!insertRes.error) {
            console.log('[Cofrinho] Registro criado com sucesso no Supabase');
            localStorage.setItem(STORAGE_KEY, JSON.stringify(initialState));
            window.dispatchEvent(new CustomEvent("cofrinho-changed"));
          } else {
            console.error('[Cofrinho] Erro ao criar registro:', insertRes.error);
          }
        } else if (res.data && res.data.data) {
          // Carregar dados do Supabase
          console.log('[Cofrinho] Dados carregados do Supabase:', res.data.data.sisters ? res.data.data.sisters.length + ' filhas' : 'nenhuma filha');
          localStorage.setItem(STORAGE_KEY, JSON.stringify(res.data.data));
          window.dispatchEvent(new CustomEvent("cofrinho-changed"));
        } else if (res.error) {
          // Erro na sincronização - usar dados locais
          console.warn('[Cofrinho] Erro na sincronização, usando localStorage:', res.error);
          ensureState();
        }
          
        // Assinatura em Tempo Real (Realtime) para sincronizar entre telas
        console.log('[Cofrinho] Inscrevendo em alterações em tempo real...');
        window.supabaseClient.channel('public:family_state')
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'family_state', filter: 'family_id=eq.' + FAMILY_ID },
            function(payload) {
              console.log('[Cofrinho] Alteração em tempo real recebida');
              if (payload.new && payload.new.data) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(payload.new.data));
                window.dispatchEvent(new CustomEvent("cofrinho-changed"));
              }
            }
          )
          .subscribe();
        
        console.log('[Cofrinho] Sincronização concluída com sucesso');
      } catch (err) {
        emitSyncEvent("cofrinho-sync-error");
        console.error('[Cofrinho] initSync failed:', err);
        ensureState();
      } finally {
        isSyncing = false;
        emitSyncEvent("cofrinho-sync-end");
        if (pendingSyncState) scheduleSync(pendingSyncState);
      }
    })();
  }

  function sisterById(state, id) {
    for (var i = 0; i < state.sisters.length; i++) {
      if (state.sisters[i].id === id) return state.sisters[i];
    }
    return null;
  }

  function catalogById(state, id) {
    for (var i = 0; i < state.catalog.length; i++) {
      if (state.catalog[i].id === id) return state.catalog[i];
    }
    return null;
  }

  function initialPoolFromCatalog(state) {
    var pool = [];
    for (var i = 0; i < state.catalog.length; i++) {
      if (state.catalog[i].archived) continue;
      if (state.catalog[i].isDraft) continue;
      pool.push(makeInstance(state.catalog[i]));
    }
    return pool;
  }

  function ensureState() {
    var state = load();
    if (!state || !state.sisters || !state.catalog) {
      console.log('[Cofrinho] Estado vazio, criando padrão com DEFAULT_SISTERS');
      state = {
        version: 2,
        sisters: JSON.parse(JSON.stringify(DEFAULT_SISTERS)),
        catalog: JSON.parse(JSON.stringify(DEFAULT_CATALOG)),
        family: {
          monthlyTargetBRL: 500,
          monthlyLabel: "Meta mensal da família",
          weeklyBonusLabel: "Noite de Cinema com Pipoca",
          weeklyBonusCoins: 50,
        },
        redemptions: [],
        completedAtByCatalog: {},
        available: [],
        doing: [],
        pending: [],
      };
      for (var ns = 0; ns < state.sisters.length; ns++) {
        normalizeChild(state.sisters[ns]);
      }
      state.available = initialPoolFromCatalog(state);
      save(state);
    } else {
      console.log('[Cofrinho] Estado encontrado com ' + (state.sisters ? state.sisters.length : 0) + ' filhas');
      if (!state.family) {
        state.family = {
          monthlyTargetBRL: 500,
          monthlyLabel: "Meta mensal da família",
          weeklyBonusLabel: "Noite de Cinema com Pipoca",
          weeklyBonusCoins: 50,
        };
      }
      if (!state.doing) state.doing = [];
      if (!state.pending) state.pending = [];
      if (!state.available) state.available = initialPoolFromCatalog(state);
      if (!state.redemptions) state.redemptions = [];
      if (!state.completedAtByCatalog) state.completedAtByCatalog = {};
      for (var s = 0; s < state.sisters.length; s++) {
        normalizeChild(state.sisters[s]);
      }
      for (var i = 0; i < state.catalog.length; i++) {
        if (!state.catalog[i].rewardType) {
          state.catalog[i].rewardType = (Number(state.catalog[i].valueBRL) || 0) > 0 ? "extra" : "diario";
        }
        if (state.catalog[i].rewardType === "obrigacao") state.catalog[i].rewardType = "diario";
        if (state.catalog[i].rewardType === "diario") state.catalog[i].valueBRL = 0;
        if (state.catalog[i].archived == null) state.catalog[i].archived = false;
        state.catalog[i].isDraft = !!state.catalog[i].isDraft;
        state.catalog[i].timeLimitMinutes = Number(state.catalog[i].timeLimitMinutes) || 0;
      }
      state.available = state.available.filter(function (x) {
        var item = catalogById(state, x.catalogId);
        return item && !item.archived && !item.isDraft;
      });
      state.doing = state.doing.filter(function (x) {
        var item = catalogById(state, x.catalogId);
        return item && !item.archived && !item.isDraft;
      });
      state.pending = state.pending.filter(function (x) {
        var item = catalogById(state, x.catalogId);
        return item && !item.archived && !item.isDraft;
      });
      var timerChanged = false;
      for (var ai = 0; ai < state.available.length; ai++) {
        var availableCat = catalogById(state, state.available[ai].catalogId);
        if (!availableCat || !availableCat.timeLimitMinutes || state.available[ai].dueAt) continue;
        if (isTaskBlockedByRecurrence(state, availableCat.id, Date.now())) continue;
        state.available[ai].dueAt = Date.now() + Number(availableCat.timeLimitMinutes) * 60000;
        timerChanged = true;
      }
      if (timerChanged) save(state);
    }
    return state;
  }

  function persist(state) {
    save(state);
  }

  function resetBoard(state) {
    try {
      if (!state) state = ensureState();
      if (!state || !state.catalog) {
        return { ok: false, message: "Estado inválido para reset." };
      }
      state.available = initialPoolFromCatalog(state);
      state.doing = [];
      state.pending = [];
      state.completedAtByCatalog = {};
      persist(state);
      return { ok: true };
    } catch (err) {
      console.error("resetBoard failed:", err);
      return { ok: false, message: err && err.message ? err.message : "Erro desconhecido." };
    }
  }

  function fmtBRL(n) {
    return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }

  function totalFamilySaved(state) {
    var t = 0;
    for (var i = 0; i < state.sisters.length; i++) {
      t += Number(state.sisters[i].balanceBRL) || 0;
    }
    return t;
  }

  function monthlyPercent(state) {
    var target = Number(state.family.monthlyTargetBRL) || 1;
    var cur = totalFamilySaved(state);
    return Math.min(100, Math.round((cur / target) * 100));
  }

  function dayKey(ts) {
    var d = new Date(ts);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function weekKey(ts) {
    var d = new Date(ts);
    var day = d.getDay() || 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - day);
    var yearStart = new Date(d.getFullYear(), 0, 1);
    var weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return d.getFullYear() + "-W" + String(weekNo).padStart(2, "0");
  }

  function isTaskBlockedByRecurrence(state, catalogId, nowTs) {
    var cat = catalogById(state, catalogId);
    if (!cat) return false;
    var now = nowTs || Date.now();
    var d = new Date(now);

    if (cat.isScheduled) {
      var currentDay = d.getDay();
      var scheduledDays = Array.isArray(cat.scheduledDays) ? cat.scheduledDays.map(function(day) {
        return parseInt(day, 10);
      }).filter(function(day) {
        return Number.isFinite(day);
      }) : [];
      if (scheduledDays.length > 0 && scheduledDays.indexOf(currentDay) === -1) {
        return true;
      }
      var currentHour = d.getHours();
      var currentMin = d.getMinutes();
      var timeParts = String(cat.scheduledTime || "").split(":");
      if (timeParts.length === 2) {
        var schedHour = parseInt(timeParts[0], 10);
        var schedMin = parseInt(timeParts[1], 10);
        if (Number.isFinite(schedHour) && Number.isFinite(schedMin) && (currentHour < schedHour || (currentHour === schedHour && currentMin < schedMin))) {
          return true;
        }
      }
    }

    var last = state.completedAtByCatalog && state.completedAtByCatalog[catalogId];
    if (!last) return false;
    if (cat.frequency === "unica") return true;
    if (cat.frequency === "semanal") return weekKey(last) === weekKey(now);
    return dayKey(last) === dayKey(now);
  }

  function isTaskCompletedInPeriod(state, catalogId, nowTs) {
    var cat = catalogById(state, catalogId);
    if (!cat) return false;
    var last = state.completedAtByCatalog && state.completedAtByCatalog[catalogId];
    if (!last) return false;
    var now = nowTs || Date.now();
    if (cat.frequency === "unica") return true;
    if (cat.frequency === "semanal") return weekKey(last) === weekKey(now);
    return dayKey(last) === dayKey(now);
  }

  function findPending(state, instanceId) {
    for (var i = 0; i < state.pending.length; i++) {
      if (state.pending[i].id === instanceId) return i;
    }
    return -1;
  }

  function removeInstance(arr, instanceId) {
    for (var i = arr.length - 1; i >= 0; i--) {
      if (arr[i].id === instanceId) arr.splice(i, 1);
    }
  }

  function isCatalogOnBoard(state, catalogId) {
    return state.available.some(function(x){ return x.catalogId === catalogId; }) ||
           state.doing.some(function(x){ return x.catalogId === catalogId; }) ||
           state.pending.some(function(x){ return x.catalogId === catalogId; });
  }

  function findReusableCatalog(state, row) {
    var targetTitle = normalizeTaskKey(row.title);
    var targetSister = row.sisterId || (state.sisters[0] && state.sisters[0].id) || "child";
    if (!targetTitle) return null;
    for (var i = 0; i < state.catalog.length; i++) {
      var item = state.catalog[i];
      if (item.sisterId !== targetSister) continue;
      if (normalizeTaskKey(item.title) !== targetTitle) continue;
      if (row.frequency && item.frequency !== row.frequency) continue;
      return item;
    }
    return null;
  }

  window.CofrinhoMagico = {
    STORAGE_KEY: STORAGE_KEY,
    ensureState: ensureState,
    fmtBRL: fmtBRL,
    totalFamilySaved: totalFamilySaved,
    monthlyPercent: monthlyPercent,
    isTaskBlockedByRecurrence: function(catalogId, nowTs) {
      var state = ensureState();
      return isTaskBlockedByRecurrence(state, catalogId, nowTs);
    },
    isTaskCompletedInPeriod: function(stateOrId, catalogId) {
      var state = typeof stateOrId === "object" && stateOrId !== null ? stateOrId : ensureState();
      var id = typeof stateOrId === "string" ? stateOrId : catalogId;
      return isTaskCompletedInPeriod(state, id);
    },
    initSync: initSync,

    getState: function () {
      return ensureState();
    },

    refresh: function () {
      persist(ensureState());
    },

    /** Criança: da lista do menu para Fazendo */
    startTask: function (instanceId) {
      var state = ensureState();
      var a = state.available;
      var found = null;
      for (var i = 0; i < a.length; i++) {
        if (a[i].id === instanceId) {
          found = a.splice(i, 1)[0];
          break;
        }
      }
      if (!found) return;
      if (isTaskBlockedByRecurrence(state, found.catalogId, Date.now())) return;
      state.doing.push({ id: found.id, catalogId: found.catalogId, startedAt: Date.now(), dueAt: found.dueAt || 0 });
      persist(state);
    },

    /** Criança: concluiu — vai para Check dos Pais (sem dinheiro ainda) */
    submitForApproval: function (instanceId) {
      var state = ensureState();
      var d = state.doing;
      var found = null;
      for (var i = 0; i < d.length; i++) {
        if (d[i].id === instanceId) {
          found = d.splice(i, 1)[0];
          break;
        }
      }
      if (!found) return;
      state.pending.push({
        id: found.id,
        catalogId: found.catalogId,
        submittedAt: Date.now(),
        dueAt: found.dueAt || 0,
      });
      persist(state);
    },

    /** Pais: aprovar — credita e devolve tarefa ao menu */
    approve: function (instanceId) {
      var state = ensureState();
      var ix = findPending(state, instanceId);
      if (ix < 0) return;
      var item = state.pending[ix];
      var cat = catalogById(state, item.catalogId);
      state.pending.splice(ix, 1);
      if (cat) {
        var sis = sisterById(state, cat.sisterId);
        if (sis && cat.rewardType === "extra") {
          sis.balanceBRL = (Number(sis.balanceBRL) || 0) + Number(cat.valueBRL);
        }
        state.completedAtByCatalog[item.catalogId] = Date.now();
      }
      if (cat) state.available.push({ id: uid(), catalogId: item.catalogId });
      persist(state);
    },

    /** Pais: rejeitar — volta ao menu sem pagar, com possível feedback */
    reject: function (instanceId, feedbackMsg) {
      var state = ensureState();
      var ix = findPending(state, instanceId);
      if (ix < 0) return;
      var item = state.pending[ix];
      state.pending.splice(ix, 1);
      var cat = catalogById(state, item.catalogId);
      if (cat) state.available.push(makeInstance(cat, { feedback: feedbackMsg }));
      persist(state);
    },

    updateFamilyFields: function (fields) {
      var state = ensureState();
      if (fields.monthlyTargetBRL != null) state.family.monthlyTargetBRL = Number(fields.monthlyTargetBRL);
      if (fields.monthlyLabel != null) state.family.monthlyLabel = String(fields.monthlyLabel);
      if (fields.weeklyBonusLabel != null) state.family.weeklyBonusLabel = String(fields.weeklyBonusLabel);
      if (fields.weeklyBonusCoins != null) state.family.weeklyBonusCoins = Number(fields.weeklyBonusCoins);
      if (fields.parentAvatarUrl != null) state.family.parentAvatarUrl = String(fields.parentAvatarUrl);
      if (fields.parentPin != null) state.family.parentPin = String(fields.parentPin);
      persist(state);
    },

    upsertChild: function (row) {
      var state = ensureState();
      var child = normalizeChild({
        id: row.id || "",
        name: row.name,
        age: row.age,
        balanceBRL: row.balanceBRL,
        goalLabel: row.goalLabel,
        goalAmountBRL: row.goalAmountBRL,
        weeklyBonusLabel: row.weeklyBonusLabel,
        weeklyBonusCoins: row.weeklyBonusCoins,
        borderColor: row.borderColor,
        badgeClass: row.badgeClass,
        avatarUrl: row.avatarUrl || "",
      });

      if (row.id) {
        for (var i = 0; i < state.sisters.length; i++) {
          if (state.sisters[i].id === row.id) {
            state.sisters[i] = Object.assign({}, state.sisters[i], child);
            persist(state);
            return row.id;
          }
        }
      }

      state.sisters.push(child);
      persist(state);
      return child.id;
    },

    deleteChild: function (childId) {
      var state = ensureState();
      if (state.sisters.length <= 1) {
        return { ok: false, message: "Cadastre outra criança antes de remover esta." };
      }
      if (!sisterById(state, childId)) {
        return { ok: false, message: "Criança não encontrada." };
      }

      var removedCatalogIds = {};
      state.catalog = state.catalog.filter(function (c) {
        if (c.sisterId === childId) {
          removedCatalogIds[c.id] = true;
          return false;
        }
        return true;
      });
      state.available = state.available.filter(function (x) { return !removedCatalogIds[x.catalogId]; });
      state.doing = state.doing.filter(function (x) { return !removedCatalogIds[x.catalogId]; });
      state.pending = state.pending.filter(function (x) { return !removedCatalogIds[x.catalogId]; });
      state.redemptions = (state.redemptions || []).filter(function (r) { return r.sisterId !== childId; });
      for (var catalogId in removedCatalogIds) {
        if (Object.prototype.hasOwnProperty.call(removedCatalogIds, catalogId)) {
          delete state.completedAtByCatalog[catalogId];
        }
      }
      state.sisters = state.sisters.filter(function (s) { return s.id !== childId; });
      persist(state);
      return { ok: true };
    },

    resetBoard: function () {
      var state = ensureState();
      return resetBoard(state);
    },

    upsertCatalogRow: function (row) {
      var state = ensureState();
      if (row.id) {
        for (var i = 0; i < state.catalog.length; i++) {
          if (state.catalog[i].id === row.id) {
            state.catalog[i] = Object.assign({}, state.catalog[i], row);
            if (!state.catalog[i].rewardType) state.catalog[i].rewardType = "extra";
            if (state.catalog[i].rewardType === "obrigacao") state.catalog[i].rewardType = "diario";
            if (state.catalog[i].rewardType === "diario") state.catalog[i].valueBRL = 0;
            state.catalog[i].isDraft = !!state.catalog[i].isDraft;
            state.catalog[i].timeLimitMinutes = Number(state.catalog[i].timeLimitMinutes) || 0;
            persist(state);
            return row.id;
          }
        }
      }
      var reusable = findReusableCatalog(state, row);
      if (reusable) {
        reusable.sisterId = row.sisterId || reusable.sisterId;
        reusable.title = row.title || reusable.title;
        reusable.subtitle = row.subtitle != null ? row.subtitle : reusable.subtitle;
        reusable.valueBRL = row.rewardType === "diario" ? 0 : Number(row.valueBRL != null ? row.valueBRL : reusable.valueBRL) || 1;
        reusable.frequency = row.frequency || reusable.frequency || "diario";
        reusable.icon = row.icon || reusable.icon || "task";
        reusable.rewardType = row.rewardType || reusable.rewardType || "extra";
        if (reusable.rewardType === "obrigacao") reusable.rewardType = "diario";
        if (reusable.rewardType === "diario") reusable.valueBRL = 0;
        reusable.isScheduled = !!row.isScheduled;
        reusable.scheduledDays = row.scheduledDays || reusable.scheduledDays || [];
        reusable.scheduledTime = row.scheduledTime || reusable.scheduledTime || "";
        reusable.timeLimitMinutes = Number(row.timeLimitMinutes) || 0;
        reusable.archived = false;
        if (row.isDraft != null) reusable.isDraft = !!row.isDraft;
        persist(state);
        return reusable.id;
      }
      var id = row.id || "cat_" + uid();
      state.catalog.push({
        id: id,
        sisterId: row.sisterId || (state.sisters[0] && state.sisters[0].id) || "child",
        title: row.title || "Nova tarefa",
        subtitle: row.subtitle || "",
        valueBRL: Number(row.valueBRL) || 1,
        frequency: row.frequency || "diario",
        icon: row.icon || "task",
        rewardType: row.rewardType || "extra",
        isScheduled: !!row.isScheduled,
        scheduledDays: row.scheduledDays || [],
        scheduledTime: row.scheduledTime || "",
        timeLimitMinutes: Number(row.timeLimitMinutes) || 0,
        archived: !!row.archived,
        isDraft: !!row.isDraft,
      });
      if (state.catalog[state.catalog.length - 1].rewardType === "obrigacao") {
        state.catalog[state.catalog.length - 1].rewardType = "diario";
      }
      if (state.catalog[state.catalog.length - 1].rewardType === "diario") {
        state.catalog[state.catalog.length - 1].valueBRL = 0;
      }
      if (!state.catalog[state.catalog.length - 1].isDraft && row.frequency !== "unica") {
        state.available.push(makeInstance(state.catalog[state.catalog.length - 1]));
      }
      persist(state);
      return id;
    },

    deleteCatalog: function (catalogId) {
      var state = ensureState();
      state.catalog = state.catalog.filter(function (c) {
        return c.id !== catalogId;
      });
      state.available = state.available.filter(function (x) {
        return x.catalogId !== catalogId;
      });
      state.doing = state.doing.filter(function (x) {
        return x.catalogId !== catalogId;
      });
      state.pending = state.pending.filter(function (x) {
        return x.catalogId !== catalogId;
      });
      if (state.completedAtByCatalog) {
        delete state.completedAtByCatalog[catalogId];
      }
      persist(state);
    },

    archiveCatalog: function (catalogId, archived) {
      var state = ensureState();
      var item = catalogById(state, catalogId);
      if (!item) return { ok: false, message: "Tarefa nao encontrada." };
      item.archived = archived !== false;
      state.available = state.available.filter(function (x) {
        return x.catalogId !== catalogId;
      });
      state.doing = state.doing.filter(function (x) {
        return x.catalogId !== catalogId;
      });
      state.pending = state.pending.filter(function (x) {
        return x.catalogId !== catalogId;
      });
      if (!item.archived && !item.isDraft && item.frequency !== "unica") {
        state.available.push(makeInstance(item));
      }
      persist(state);
      return { ok: true };
    },

    publishTask: function(catalogId) {
      var state = ensureState();
      var item = catalogById(state, catalogId);
      if (!item || item.archived) return;
      item.isDraft = false;
      if (item.frequency === "unica") {
        state.available = state.available.filter(function(x) { return x.catalogId !== catalogId; });
        if (state.completedAtByCatalog) delete state.completedAtByCatalog[catalogId];
      }
      var exists = isCatalogOnBoard(state, catalogId);
      if (exists) return;
      state.available.push(makeInstance(item));
      persist(state);
    },

    reuseCatalogRow: function(row) {
      var state = ensureState();
      var reusable = findReusableCatalog(state, row);
      var id = reusable ? reusable.id : this.upsertCatalogRow(row);
      state = ensureState();
      var item = catalogById(state, id);
      if (!item) return { ok: false, message: "Tarefa nao encontrada." };

      item.archived = false;
      item.isDraft = false;
      if (row.subtitle != null) item.subtitle = row.subtitle;
      if (row.valueBRL != null) item.valueBRL = Number(row.valueBRL) || 0;
      if (row.rewardType) item.rewardType = row.rewardType;
      if (row.frequency) item.frequency = row.frequency;
      if (row.icon) item.icon = row.icon;
      if (row.timeLimitMinutes != null) item.timeLimitMinutes = Number(row.timeLimitMinutes) || 0;
      if (item.rewardType === "diario") item.valueBRL = 0;

      if (item.frequency === "unica") {
        state.available = state.available.filter(function(x) { return x.catalogId !== id; });
        if (state.completedAtByCatalog) delete state.completedAtByCatalog[id];
      }
      if (isCatalogOnBoard(state, id)) {
        persist(state);
        return { ok: true, id: id, reused: !!reusable, published: false, message: "Tarefa ja esta no board." };
      }
      state.available.push(makeInstance(item));
      persist(state);
      return { ok: true, id: id, reused: !!reusable, published: true };
    },

    redeemFromPiggyBank: function (sisterId, amountBRL, description) {
      var state = ensureState();
      var sis = sisterById(state, sisterId);
      var amount = Number(amountBRL);
      if (!sis) return { ok: false, message: "Criança não encontrada." };
      if (!Number.isFinite(amount) || amount <= 0) {
        return { ok: false, message: "Valor de resgate inválido." };
      }
      if ((Number(sis.balanceBRL) || 0) < amount) {
        return { ok: false, message: "Saldo insuficiente para este resgate." };
      }
      sis.balanceBRL = (Number(sis.balanceBRL) || 0) - amount;
      state.redemptions.unshift({
        id: uid(),
        sisterId: sisterId,
        amountBRL: amount,
        description: description || "Resgate no cofrinho",
        createdAt: Date.now(),
      });
      state.redemptions = state.redemptions.slice(0, 30);
      persist(state);
      return { ok: true };
    },

    onChange: function (fn) {
      window.addEventListener("cofrinho-changed", fn);
      window.addEventListener("storage", function (e) {
        if (e.key === STORAGE_KEY) fn();
      });
    },

    /** Reinicia completamente o app: limpa localStorage e Supabase */
    resetAll: function () {
      var emptyState = {
        version: 2,
        sisters: [],
        catalog: [],
        family: {
          monthlyTargetBRL: 500,
          monthlyLabel: "Meta mensal da família",
          weeklyBonusLabel: "Noite de Cinema com Pipoca",
          weeklyBonusCoins: 50,
        },
        redemptions: [],
        completedAtByCatalog: {},
        available: [],
        doing: [],
        pending: [],
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyState));
      window.dispatchEvent(new CustomEvent("cofrinho-changed"));
      // Sincroniza reset com Supabase
      if (window.supabaseClient && FAMILY_ID) {
        emitSyncEvent("cofrinho-sync-start");
        window.supabaseClient.from('family_state').upsert({
          family_id: FAMILY_ID,
          data: emptyState
        }).then(function(res) {
          if (res.error) {
            emitSyncEvent("cofrinho-sync-error");
            console.error('Supabase resetAll Error:', res.error);
          } else {
            emitSyncEvent("cofrinho-sync-end");
            console.log('[Cofrinho] resetAll sincronizado com Supabase');
          }
        }).catch(function(err) {
          emitSyncEvent("cofrinho-sync-error");
          console.error('Supabase resetAll Error:', err);
        });
      }
      return { ok: true };
    },
  };
})();
