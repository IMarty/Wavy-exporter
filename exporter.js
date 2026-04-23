/**
 * Wavy Data Exporter — bookmarklet
 * https://github.com/IMarty/Wavy-exporter
 */

(async function WavyExporter() {
    'use strict';

    const API_BASE_URL  = 'https://api.wavy.fr';
    const DELAY         = 300; // ms entre les requêtes
    const TEAL          = '#00d1b2';

    // ─────────────────────────────────────────────
    // GROUPES DE DONNÉES
    // ─────────────────────────────────────────────
    const DATA_GROUPS = [
        {
            id: 'clients',
            name: 'Clients',
            icon: '👥',
            desc: 'Coordonnées, consentements RGPD et statistiques de visite',
            fields: 'prénom, nom, e-mail, téléphone, genre, ville, dépenses totales, nb visites…',
            defaultOn: true,
            fetch: (shopID, opts, onProgress) => fetchCorePaginated(`/v2/core/${shopID}/v1/clients`, 'rows', 'page', 'pageSize', 500, onProgress)
        },
        {
            id: 'visites',
            name: 'Visites',
            icon: '📅',
            desc: 'Visites passées : rendez-vous honorés, payés et annulés',
            fields: 'date, statut, client, prestataire, montant, mode de paiement, source…',
            defaultOn: true,
            requiresDateRange: true,
            fetch: (shopID, opts) => fetchFlat(`/v2/core/${shopID}/v1/visits/period?from=${encodeURIComponent(toIsoStart(opts.from))}&to=${encodeURIComponent(toIsoEnd(opts.to))}`)
        },
        {
            id: 'appointments',
            name: 'Rendez-vous à venir',
            icon: '📆',
            desc: 'Rendez-vous planifiés non encore réalisés (statut APPOINTMENT)',
            fields: 'date, durée, client, prestataire, service, source de réservation',
            defaultOn: true,
            requiresDateRange: true,
            futureMode: true,
            fetch: async (shopID, opts) => {
                const data = await fetchFlat(`/v2/core/${shopID}/v1/visits/period?from=${encodeURIComponent(toIsoStart(opts.from))}&to=${encodeURIComponent(toIsoEnd(opts.to))}`);
                return data.filter(v => v.status === 'APPOINTMENT');
            }
        },
        {
            id: 'articles',
            name: 'Articles & Forfaits',
            icon: '✂️',
            desc: 'Services, produits et forfaits du catalogue',
            fields: 'titre, type (service/produit/forfait), catégorie, durée, prix, TVA…',
            defaultOn: true,
            incremental: true,
            fetch:       (shopID, opts, onProgress)  => fetchFeathers(`/shops/${shopID}/items`, onProgress),
            fetchSince:  (shopID, since, onProgress) => fetchFeathersSince(`/shops/${shopID}/items`, since, onProgress)
        },
        {
            id: 'personnel',
            name: 'Personnel',
            icon: '👨‍💼',
            desc: 'Membres du personnel avec rôles et horaires',
            fields: 'prénom, nom, e-mail, rôle (gérant/manager/collaborateur), horaires…',
            defaultOn: true,
            fetch: (shopID) => fetchFlat(`/shops/${shopID}/staffs`)
        },
        {
            id: 'remises',
            name: 'Remises',
            icon: '🏷️',
            desc: 'Promotions et remises configurées dans le salon',
            fields: 'nom, type (absolu/pourcentage), valeur, articles concernés…',
            defaultOn: true,
            fetch: (shopID) => fetchFlat(`/shops/${shopID}/discounts`)
        },
        {
            id: 'fidelite',
            name: 'Programmes de fidélité',
            icon: '🎁',
            desc: 'Programmes de cashback et cartes cadeaux',
            fields: 'nom, type (jackpot/carte cadeau), valeur, unité, durée de validité…',
            defaultOn: true,
            fetch: (shopID) => fetchFlat(`/shops/${shopID}/loyalty`)
        },
        {
            id: 'credits',
            name: 'Crédits clients',
            icon: '💰',
            desc: 'Soldes de fidélité et historique de consommation par client',
            fields: 'client, programme, montant initial, solde restant, expiration…',
            defaultOn: true,
            incremental: true,
            fetch:       (shopID, opts, onProgress)  => fetchFeathers(`/shops/${shopID}/credits`, onProgress, 1000),
            fetchSince:  (shopID, since, onProgress) => fetchFeathersSince(`/shops/${shopID}/credits`, since, onProgress, 1000)
        },
        {
            id: 'caisses',
            name: 'Fermetures de caisse',
            icon: '🧾',
            desc: 'Récapitulatifs journaliers par mode de paiement',
            fields: 'date, statut (ouvert/fermé), total CB, total espèces, total chèques…',
            defaultOn: true,
            fetch: (shopID) => fetchFlat(`/v2/finances/${shopID}/v1/closures`)
        },
        {
            id: 'sms',
            name: 'Campagnes SMS',
            icon: '📱',
            desc: 'Campagnes marketing SMS et statistiques de retour sur investissement',
            fields: 'titre, message, destinataires, date envoi, coût, ROI, taux de conversion…',
            defaultOn: true,
            fetch: (shopID, opts, onProgress) => fetchCorePaginated(`/v2/marketing/${shopID}/v1/sms-campaigns`, 'rows', 'page', 'pageSize', 50, onProgress)
        }
    ];

    // ─────────────────────────────────────────────
    // UTILITAIRES
    // ─────────────────────────────────────────────
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    function dedupe(items) {
        const seen = new Set();
        return items.filter(item => {
            const id = item._id || item.id;
            if (!id) return true;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    function flattenJSON(obj, prefix = '') {
        const out = {};
        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
            const fullKey = prefix ? `${prefix}.${key}` : key;
            const val = obj[key];
            if (val === null || val === undefined) {
                out[fullKey] = '';
            } else if (Array.isArray(val)) {
                out[fullKey] = JSON.stringify(val);
            } else if (val instanceof Date) {
                out[fullKey] = val.toISOString();
            } else if (typeof val === 'object') {
                Object.assign(out, flattenJSON(val, fullKey));
            } else {
                out[fullKey] = val;
            }
        }
        return out;
    }

    function escapeCSV(v) {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return (s.includes(',') || s.includes('"') || s.includes('\n'))
            ? `"${s.replace(/"/g, '""')}"` : s;
    }

    function byteSize(str) {
        return new TextEncoder().encode(str).length;
    }

    function formatBytes(n) {
        if (n < 1024) return `${n} o`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} Ko`;
        return `${(n / (1024 * 1024)).toFixed(2)} Mo`;
    }

    function toCSV(data) {
        if (!data || !data.length) return '';
        const flat = data.map(r => flattenJSON(r));
        const cols = [...new Set(flat.flatMap(Object.keys))].sort();
        return [
            cols.map(escapeCSV).join(','),
            ...flat.map(r => cols.map(c => escapeCSV(r[c] ?? '')).join(','))
        ].join('\n');
    }

    function dateOffset(days) {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString().slice(0, 10);
    }

    function dateForward(days) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().slice(0, 10);
    }

    function todayISO() {
        return new Date().toISOString().slice(0, 10);
    }

    function toIsoStart(d) { return `${d}T00:00:00.000Z`; }
    function toIsoEnd(d)   { return `${d}T23:59:59.999Z`; }

    function presetToRange(preset, futureMode = false) {
        if (preset === 'all') {
            return futureMode
                ? { from: todayISO(), to: dateForward(365 * 5) }
                : { from: '2000-01-01', to: todayISO() };
        }
        const map = { '30d': 30, '90d': 90, '180d': 180, '365d': 365, '730d': 730 };
        const days = map[preset] || (futureMode ? 365 * 5 : 365);
        return futureMode
            ? { from: todayISO(), to: dateForward(days) }
            : { from: dateOffset(days), to: todayISO() };
    }

    function splitPeriod(from, to, chunk, reverse = false) {
        const periods = [];
        let cur = new Date(from);
        const end = new Date(to);
        while (cur <= end) {
            let pStart, pEnd, label;
            if (chunk === 'year') {
                const y = cur.getFullYear();
                pStart = `${y}-01-01`;
                pEnd   = `${y}-12-31`;
                label  = String(y);
                cur = new Date(y + 1, 0, 1);
            } else {
                const y = cur.getFullYear();
                const m = cur.getMonth();
                pStart = `${y}-${String(m + 1).padStart(2, '0')}-01`;
                pEnd   = new Date(y, m + 1, 0).toISOString().slice(0, 10);
                label  = `${y}-${String(m + 1).padStart(2, '0')}`;
                cur = new Date(y, m + 1, 1);
            }
            periods.push({
                from:  pStart < from ? from : pStart,
                to:    pEnd   > to   ? to   : pEnd,
                label
            });
        }
        return reverse ? periods.reverse() : periods;
    }

    // ─────────────────────────────────────────────
    // API
    // ─────────────────────────────────────────────
    async function apiGet(path) {
        const resp = await fetch(`${API_BASE_URL}${path}`, {
            method: 'GET',
            credentials: 'include',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', rid: 'anti-csrf' }
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        return resp.json();
    }

    async function fetchFlat(path) {
        const data = await apiGet(path);
        if (Array.isArray(data)) return data;
        if (data && typeof data === 'object') {
            if (Array.isArray(data.data)) return data.data;
            if (Array.isArray(data.rows)) return data.rows;
            return [data];
        }
        return [];
    }

    async function fetchFeathers(path, onProgress, limit = 200) {
        const all = [];
        let skip = 0;
        const sep = path.includes('?') ? '&' : '?';
        while (true) {
            const data = await apiGet(`${path}${sep}$limit=${limit}&$skip=${skip}`);
            const items = Array.isArray(data) ? data : (data.data || []);
            const total = !Array.isArray(data) && typeof data.total === 'number' ? data.total : null;
            all.push(...items);
            if (onProgress) onProgress(all.length, total);
            if (items.length < limit) break;
            skip += limit;
            await sleep(DELAY);
        }
        return dedupe(all);
    }

    async function fetchFeathersSince(path, sinceISO, onProgress, limit = 200) {
        const sep = path.includes('?') ? '&' : '?';
        return fetchFeathers(`${path}${sep}updatedAt[$gt]=${encodeURIComponent(sinceISO)}`, onProgress, limit);
    }

    async function fetchCorePaginated(path, rowKey = 'rows', pageKey = 'page', sizeKey = 'pageSize', pageSize = 500, onProgress) {
        const all = [];
        let page = 0;
        const sep = path.includes('?') ? '&' : '?';
        while (true) {
            const data = await apiGet(`${path}${sep}${pageKey}=${page}&${sizeKey}=${pageSize}`);
            const rows = data[rowKey] || (Array.isArray(data) ? data : []);
            all.push(...rows);
            const totalPages = data.totalPages != null ? data.totalPages : null;
            const totalItems = data.total != null ? data.total : (totalPages != null ? totalPages * pageSize : null);
            if (onProgress) onProgress(all.length, totalItems, page + 1, totalPages);
            const more = totalPages != null ? page + 1 < totalPages : rows.length >= pageSize;
            if (!more) break;
            page++;
            await sleep(DELAY);
        }
        return dedupe(all);
    }

    async function getShopInfo() {
        let resp;
        try {
            resp = await apiGet('/v2/auth/v1/users/me');
        } catch (e) {
            throw new Error('Impossible de récupérer les informations du compte. Êtes-vous connecté sur backoffice.wavy.fr ou app.wavy.co ?');
        }
        const shops = resp.shops || resp.user?.shops || [];
        if (!shops.length) throw new Error('Aucun salon associé à ce compte.');
        return { user: resp, shops };
    }

    // ─────────────────────────────────────────────
    // CACHE localStorage
    // ─────────────────────────────────────────────
    const CACHE_TTL = {
        clients:   3_600_000,           // 1h
        articles:  7 * 86_400_000,      // 7j
        personnel: 7 * 86_400_000,      // 7j
        remises:   7 * 86_400_000,      // 7j
        fidelite:  7 * 86_400_000,      // 7j
        credits:   3_600_000,           // 1h
        caisses:   86_400_000,          // 24h
        sms:       86_400_000,          // 24h
    };

    // Si le cache est expiré mais datant de moins que ce délai,
    // on tente une sync incrémentale (uniquement pour les groupes `incremental:true`)
    const INCREMENTAL_TTL = 30 * 86_400_000; // 30j

    function cacheKey(shopID, groupId, suffix = '') {
        return `wavy_${shopID}_${groupId}${suffix ? '_' + suffix : ''}`;
    }

    function saveToCache(key, data) {
        try {
            localStorage.setItem(key, JSON.stringify({ data, fetchedAt: Date.now(), count: data.length }));
        } catch (e) { /* quota exceeded */ }
    }

    function loadFromCache(key, ttlMs) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            if (ttlMs !== Infinity && Date.now() - entry.fetchedAt > ttlMs) return null;
            return entry;
        } catch (e) { return null; }
    }

    function loadFromCacheRaw(key) {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) { return null; }
    }

    function formatAge(ms) {
        const m = Math.floor(ms / 60_000);
        if (m < 1)  return 'à l\'instant';
        if (m < 60) return `${m}min`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h`;
        return `${Math.floor(h / 24)}j`;
    }

    function isPastChunk(label) {
        const now = new Date();
        const curYear  = now.getFullYear();
        const curMonth = `${curYear}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // Only cache indefinitely if strictly in the past (not current and not future)
        if (label.length === 4) return parseInt(label) < curYear;
        return label < curMonth;
    }

    // ─────────────────────────────────────────────
    // JSZip
    // ─────────────────────────────────────────────
    async function loadJSZip() {
        if (window.JSZip) return window.JSZip;
        return new Promise((ok, fail) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            s.integrity = 'sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==';
            s.crossOrigin = 'anonymous';
            s.onload = () => ok(window.JSZip);
            s.onerror = () => fail(new Error('Impossible de charger JSZip'));
            document.head.appendChild(s);
        });
    }

    // ─────────────────────────────────────────────
    // CSS PARTAGÉ
    // ─────────────────────────────────────────────
    function injectCSS() {
        if (document.getElementById('wavy-exp-css')) return;
        const el = document.createElement('style');
        el.id = 'wavy-exp-css';
        el.textContent = `
        #wavy-exp-overlay {
            position: fixed; top:0; left:0; width:100%; height:100%;
            background: rgba(0,0,0,.72); z-index:999999;
            display:flex; align-items:center; justify-content:center;
            font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        }
        #wavy-exp-box {
            background:#fff; border-radius:16px;
            box-shadow:0 25px 60px -12px rgba(0,0,0,.35);
            width:90%; max-width:560px; overflow:hidden;
            animation:wavy-pop .25s ease-out;
        }
        @keyframes wavy-pop { from{opacity:0;transform:translateY(-16px) scale(.97)} to{opacity:1;transform:none} }
        .wavy-head {
            background:linear-gradient(135deg,${TEAL} 0%,#00b89c 100%);
            color:#fff; padding:20px 24px; position:relative;
        }
        .wavy-head h1 { margin:0; font-size:20px; font-weight:700; display:flex; align-items:center; gap:8px; }
        .wavy-head p  { margin:6px 0 0; opacity:.85; font-size:13px; }
        .wavy-close {
            position:absolute; top:14px; right:14px;
            background:rgba(255,255,255,.2); border:none; color:#fff;
            width:28px; height:28px; border-radius:50%; cursor:pointer;
            font-size:17px; display:flex; align-items:center; justify-content:center;
            transition:background .15s;
        }
        .wavy-close:hover { background:rgba(255,255,255,.35); }
        .wavy-body { padding:20px 24px; max-height:70vh; overflow-y:auto; }
        .wavy-body::-webkit-scrollbar { width:5px; }
        .wavy-body::-webkit-scrollbar-thumb { background:#cbd5e1; border-radius:3px; }
        .wavy-footer { padding:14px 24px; background:#f9fafb; border-top:1px solid #e5e7eb; }

        /* Config phase */
        .wavy-shop-badge {
            display:inline-flex; align-items:center; gap:6px; font-size:13px;
            background:#f3f4f6; border-radius:8px; padding:6px 12px; margin-bottom:14px; color:#374151;
        }
        .wavy-shop-badge strong { color:#111827; }
        .wavy-shop-select {
            width:100%; padding:8px 10px; border:1px solid #d1d5db; border-radius:8px;
            font-size:14px; margin-bottom:14px; background:#fff;
        }
        .wavy-section-title {
            font-size:11px; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
            color:#6b7280; margin-bottom:8px; margin-top:4px;
        }
        .wavy-group-list { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; }
        .wavy-group-item {
            display:flex; align-items:center; gap:10px; padding:10px 12px;
            border:1.5px solid #e5e7eb; border-radius:10px; cursor:pointer;
            transition:border-color .15s, background .15s;
        }
        .wavy-group-item:hover { border-color:${TEAL}; background:#f0fdfb; }
        .wavy-group-item.checked { border-color:${TEAL}; background:#f0fdfb; }
        .wavy-group-item input[type=checkbox] { accent-color:${TEAL}; width:16px; height:16px; flex-shrink:0; cursor:pointer; }
        .wavy-group-icon { font-size:20px; flex-shrink:0; }
        .wavy-group-text { flex:1; min-width:0; }
        .wavy-group-name { font-weight:600; font-size:14px; color:#111827; display:flex; align-items:center; gap:6px; }
        .wavy-group-desc { font-size:12px; color:#6b7280; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .wavy-group-fields { font-size:11px; color:#9ca3af; margin-top:1px; }
        .wavy-cache-badge { font-size:10px; font-weight:500; padding:1px 6px; border-radius:4px; flex-shrink:0; }
        .wavy-cache-fresh { background:#d1fae5; color:#065f46; }
        .wavy-cache-stale { background:#f3f4f6; color:#9ca3af; }
        .wavy-ignore-cache-row { display:flex; align-items:center; gap:8px; margin-bottom:14px; font-size:12px; color:#6b7280; cursor:pointer; }
        .wavy-ignore-cache-row input { accent-color:${TEAL}; cursor:pointer; }

        .wavy-cache-mgr {
            border:1px solid #e5e7eb; border-radius:8px; margin-bottom:12px;
            background:#fafafa;
        }
        .wavy-cache-mgr summary {
            list-style:none; padding:9px 12px; cursor:pointer; font-size:12px;
            display:flex; align-items:center; gap:8px; user-select:none;
        }
        .wavy-cache-mgr summary::-webkit-details-marker { display:none; }
        .wavy-cache-mgr summary::before {
            content:'▸'; color:#9ca3af; font-size:10px; transition:transform .15s;
            display:inline-block;
        }
        .wavy-cache-mgr[open] summary::before { transform:rotate(90deg); }
        .wavy-cache-mgr-label { font-weight:600; color:#374151; flex:1; }
        .wavy-cache-mgr-stat { font-size:11px; color:#6b7280; }
        .wavy-cache-mgr-body {
            padding:0 12px 12px; border-top:1px solid #e5e7eb; background:#fff;
            border-radius:0 0 8px 8px;
        }
        .wavy-cache-mgr-empty { padding:12px 0; text-align:center; font-size:12px; color:#9ca3af; font-style:italic; }
        .wavy-cache-mgr-list { display:flex; flex-direction:column; gap:4px; padding-top:8px; }
        .wavy-cache-mgr-row {
            display:flex; align-items:center; gap:8px; padding:6px 8px;
            border-radius:6px; font-size:12px; background:#f9fafb;
        }
        .wavy-cache-mgr-row .cm-name { flex:1; color:#374151; }
        .wavy-cache-mgr-row .cm-name .cm-period { color:#6b7280; font-size:11px; margin-left:4px; }
        .wavy-cache-mgr-row .cm-meta { color:#9ca3af; font-size:11px; white-space:nowrap; }
        .wavy-cache-mgr-row .cm-clear {
            background:transparent; border:1px solid #e5e7eb; color:#6b7280;
            padding:3px 8px; border-radius:4px; cursor:pointer; font-size:11px;
        }
        .wavy-cache-mgr-row .cm-clear:hover { background:#fee2e2; color:#991b1b; border-color:#fca5a5; }
        .wavy-cache-mgr-clearall {
            margin-top:8px; width:100%; padding:7px; font-size:12px;
            border:1px solid #e5e7eb; background:#fff; color:#6b7280;
            border-radius:6px; cursor:pointer;
        }
        .wavy-cache-mgr-clearall:hover { background:#fee2e2; color:#991b1b; border-color:#fca5a5; }
        .wavy-date-block {
            margin-top:8px; margin-left:46px; padding:10px 12px;
            background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;
            display:none;
        }
        .wavy-date-block.visible { display:block; }
        .wavy-date-row { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
        .wavy-date-select, .wavy-date-input {
            padding:5px 8px; border:1px solid #d1d5db; border-radius:6px;
            font-size:12px; background:#fff;
        }
        .wavy-date-inputs { display:none; gap:6px; align-items:center; }
        .wavy-date-inputs.visible { display:flex; }
        .wavy-format-row { display:flex; gap:8px; margin-bottom:14px; }
        .wavy-fmt-btn {
            flex:1; padding:10px; border:1.5px solid #e5e7eb; border-radius:10px;
            text-align:center; cursor:pointer; font-size:13px; font-weight:500;
            color:#4b5563; background:#fff; transition:border-color .15s, background .15s;
        }
        .wavy-fmt-btn:hover { border-color:${TEAL}; background:#f0fdfb; }
        .wavy-fmt-btn.selected { border-color:${TEAL}; background:#f0fdfb; color:#065f46; }
        .wavy-fmt-btn .wavy-fmt-icon { font-size:20px; display:block; margin-bottom:4px; }
        .wavy-sel-row { display:flex; gap:8px; margin-bottom:16px; }
        .wavy-sel-btn {
            padding:5px 12px; font-size:12px; border:1px solid #d1d5db; border-radius:6px;
            background:#fff; cursor:pointer; color:#4b5563; transition:background .1s;
        }
        .wavy-sel-btn:hover { background:#f3f4f6; }
        .wavy-launch-btn {
            width:100%; padding:13px; background:linear-gradient(135deg,${TEAL} 0%,#00b89c 100%);
            color:#fff; border:none; border-radius:10px; font-size:15px; font-weight:600;
            cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;
            transition:transform .15s, box-shadow .15s;
        }
        .wavy-launch-btn:hover { transform:translateY(-1px); box-shadow:0 6px 18px rgba(0,209,178,.4); }
        .wavy-launch-btn:disabled { opacity:.5; cursor:not-allowed; transform:none; box-shadow:none; }

        /* Progress phase */
        .wavy-warning-banner {
            background:#fffbeb; border:1px solid #fcd34d; border-radius:8px;
            padding:9px 12px; margin-bottom:14px; font-size:12px; color:#92400e;
            display:flex; align-items:center; gap:8px; line-height:1.4;
        }
        .wavy-steps { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:6px; }
        .wavy-steps-label { font-size:12px; color:#6b7280; }
        .wavy-steps-count { font-size:13px; font-weight:700; color:${TEAL}; }
        .wavy-bar-track { background:#f3f4f6; border-radius:100px; height:14px; overflow:hidden; margin-bottom:6px; }
        .wavy-bar-fill {
            background:linear-gradient(90deg,${TEAL} 0%,#00e6c8 100%);
            height:100%; width:0%; border-radius:100px; transition:width .4s ease; position:relative;
        }
        .wavy-bar-fill::after {
            content:''; position:absolute; inset:0;
            background:linear-gradient(90deg,transparent,rgba(255,255,255,.28),transparent);
            animation:wavy-shimmer 1.4s infinite;
        }
        @keyframes wavy-shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(200%)} }
        .wavy-current-step {
            text-align:center; font-size:13px; font-weight:500; color:#374151; margin-bottom:4px;
        }
        .wavy-substep { text-align:center; font-size:11px; color:#9ca3af; margin-bottom:12px; min-height:16px; }
        .wavy-status { text-align:center; color:#6b7280; font-size:12px; margin-bottom:12px; }
        .wavy-logs {
            background:#1f2937; border-radius:8px; padding:12px; max-height:190px;
            overflow-y:auto; font-family:'Monaco','Menlo','Courier New',monospace; font-size:11.5px; line-height:1.6;
        }
        .wavy-logs::-webkit-scrollbar { width:5px; }
        .wavy-logs::-webkit-scrollbar-thumb { background:#4b5563; border-radius:3px; }
        .wavy-log { margin-bottom:3px; }
        .wavy-log-info    { color:#60a5fa; }
        .wavy-log-success { color:#34d399; }
        .wavy-log-error   { color:#f87171; }
        .wavy-log-warning { color:#fbbf24; }
        /* Summary table */
        .wavy-summary {
            background:#fff; border:1px solid #e5e7eb; border-radius:10px;
            overflow:hidden; margin-bottom:14px;
        }
        .wavy-summary-head {
            background:#f0fdfb; padding:10px 14px; border-bottom:1px solid #d1fae5;
            font-size:13px; font-weight:600; color:#065f46;
            display:flex; justify-content:space-between; align-items:center;
        }
        .wavy-summary-table { width:100%; border-collapse:collapse; }
        .wavy-summary-table th {
            text-align:left; padding:8px 14px; font-size:10px; font-weight:600;
            color:#9ca3af; text-transform:uppercase; letter-spacing:.05em;
            background:#fafafa; border-bottom:1px solid #e5e7eb;
        }
        .wavy-summary-table th.num, .wavy-summary-table td.num { text-align:right; }
        .wavy-summary-table td {
            padding:8px 14px; font-size:12px; color:#374151;
            border-bottom:1px solid #f3f4f6;
        }
        .wavy-summary-table tr:last-child td { border-bottom:none; }
        .wavy-summary-table tr.total td {
            font-weight:700; background:#f9fafb; color:#111827;
        }
        .wavy-summary-table .sm-icon { font-size:15px; margin-right:6px; }
        .wavy-summary-table .sm-cache-badge {
            display:inline-block; margin-left:6px; font-size:9px; padding:1px 5px;
            border-radius:3px; background:#d1fae5; color:#065f46; font-weight:500;
        }
        .wavy-summary-table .sm-empty { color:#9ca3af; font-style:italic; }

        .wavy-dl-btn {
            width:100%; padding:13px; background:linear-gradient(135deg,${TEAL} 0%,#00b89c 100%);
            color:#fff; border:none; border-radius:10px; font-size:15px; font-weight:600;
            cursor:pointer; display:none; align-items:center; justify-content:center; gap:8px;
            transition:transform .15s, box-shadow .15s;
        }
        .wavy-dl-btn:hover { transform:translateY(-1px); box-shadow:0 6px 18px rgba(0,209,178,.4); }
        `;
        document.head.appendChild(el);
    }

    // ─────────────────────────────────────────────
    // OVERLAY UTILITAIRES
    // ─────────────────────────────────────────────
    function clearOverlay() {
        document.getElementById('wavy-exp-overlay')?.remove();
    }

    function buildOverlay(headHtml, bodyHtml, footHtml) {
        clearOverlay();
        const ov = document.createElement('div');
        ov.id = 'wavy-exp-overlay';
        ov.innerHTML = `
            <div id="wavy-exp-box">
                <div class="wavy-head" style="position:relative">
                    <button class="wavy-close" id="wavy-exp-close">×</button>
                    ${headHtml}
                </div>
                <div class="wavy-body" id="wavy-exp-body">${bodyHtml}</div>
                <div class="wavy-footer" id="wavy-exp-foot">${footHtml}</div>
            </div>`;
        document.body.appendChild(ov);
        document.getElementById('wavy-exp-close').onclick = clearOverlay;
        return ov;
    }

    // ─────────────────────────────────────────────
    // PHASE 1 : CHARGEMENT
    // ─────────────────────────────────────────────
    function showLoading() {
        injectCSS();
        buildOverlay(
            `<h1>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Wavy Data Exporter
            </h1>
            <p>Connexion au compte Wavy...</p>`,
            `<div style="text-align:center; padding:20px 0;">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="${TEAL}" stroke-width="2" style="animation:wavy-spin 1s linear infinite">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="31.4" stroke-dashoffset="10"/>
                </svg>
                <p style="color:#6b7280;font-size:13px;margin-top:12px">Récupération des informations du salon…</p>
                <style>@keyframes wavy-spin{to{transform:rotate(360deg)}}</style>
            </div>`,
            ''
        );
    }

    function showError(msg) {
        const body = document.getElementById('wavy-exp-body');
        if (body) {
            body.innerHTML = `
                <div style="text-align:center;padding:16px 0;">
                    <div style="font-size:36px;margin-bottom:10px">⚠️</div>
                    <p style="color:#dc2626;font-weight:600;margin-bottom:8px">Erreur</p>
                    <p style="color:#6b7280;font-size:13px">${msg}</p>
                </div>`;
        }
    }

    // ─────────────────────────────────────────────
    // PHASE 2 : CONFIGURATION
    // ─────────────────────────────────────────────
    function showConfig(shopInfo) {
        return new Promise((resolve, reject) => {

            const shops = shopInfo.shops;
            const multiShop = shops.length > 1;

            // Sélecteur de salon
            const shopSelectHtml = multiShop
                ? `<select class="wavy-shop-select" id="wavy-shop-sel">
                    ${shops.map(s => `<option value="${s.shopID}">${s.name} (${s.role})</option>`).join('')}
                   </select>`
                : `<div class="wavy-shop-badge">🏪 <strong>${shops[0].name}</strong> — ${shops[0].role}</div>`;

            // Liste des groupes
            const groupsHtml = DATA_GROUPS.map(g => `
                <div class="wavy-group-item ${g.defaultOn ? 'checked' : ''}" data-id="${g.id}">
                    <input type="checkbox" id="wavy-chk-${g.id}" ${g.defaultOn ? 'checked' : ''}>
                    <span class="wavy-group-icon">${g.icon}</span>
                    <div class="wavy-group-text">
                        <div class="wavy-group-name">${g.name}<span class="wavy-cache-badge" id="wavy-cache-badge-${g.id}"></span></div>
                        <div class="wavy-group-desc">${g.desc}</div>
                        <div class="wavy-group-fields">${g.fields}</div>
                    </div>
                </div>
                ${g.requiresDateRange ? `
                <div class="wavy-date-block ${g.defaultOn ? 'visible' : ''}" id="wavy-date-${g.id}">
                    <div class="wavy-section-title">Période à exporter</div>
                    <div class="wavy-date-row">
                        <select class="wavy-date-select" id="wavy-preset-${g.id}">
                            ${g.futureMode ? `
                                <option value="all" selected>Tous les rendez-vous à venir (5 ans)</option>
                                <option value="30d">Prochains 30 jours</option>
                                <option value="90d">Prochains 3 mois</option>
                                <option value="180d">Prochains 6 mois</option>
                                <option value="365d">Prochaine année</option>
                                <option value="custom">Période personnalisée</option>
                            ` : `
                                <option value="all" selected>Tout l'historique (depuis 2000)</option>
                                <option value="30d">Derniers 30 jours</option>
                                <option value="90d">Derniers 3 mois</option>
                                <option value="180d">Derniers 6 mois</option>
                                <option value="365d">Dernière année</option>
                                <option value="730d">2 dernières années</option>
                                <option value="custom">Période personnalisée</option>
                            `}
                        </select>
                        <div class="wavy-date-inputs" id="wavy-custom-${g.id}">
                            <label style="font-size:12px;color:#6b7280">Du</label>
                            <input type="date" class="wavy-date-input" id="wavy-from-${g.id}" value="${g.futureMode ? todayISO() : dateOffset(365)}">
                            <label style="font-size:12px;color:#6b7280">au</label>
                            <input type="date" class="wavy-date-input" id="wavy-to-${g.id}" value="${g.futureMode ? dateForward(90) : todayISO()}">
                        </div>
                    </div>
                    <div class="wavy-date-row" style="margin-top:8px">
                        <label style="font-size:12px;color:#6b7280;flex-shrink:0">Découpage :</label>
                        <select class="wavy-date-select" id="wavy-chunk-${g.id}">
                            <option value="none">Fichier unique</option>
                            <option value="year">Par année</option>
                            <option value="month" selected>Par mois</option>
                        </select>
                    </div>
                </div>` : ''}
            `).join('');

            const bodyHtml = `
                ${shopSelectHtml}
                <div class="wavy-section-title">Données à exporter</div>
                <div class="wavy-sel-row">
                    <button class="wavy-sel-btn" id="wavy-all">Tout sélectionner</button>
                    <button class="wavy-sel-btn" id="wavy-none">Tout désélectionner</button>
                </div>
                <div class="wavy-group-list">${groupsHtml}</div>
                <details class="wavy-cache-mgr" id="wavy-cache-mgr">
                    <summary>
                        <span>🗂</span>
                        <span class="wavy-cache-mgr-label">Gérer le cache</span>
                        <span class="wavy-cache-mgr-stat" id="wavy-cache-mgr-stat">—</span>
                    </summary>
                    <div class="wavy-cache-mgr-body" id="wavy-cache-mgr-body"></div>
                </details>
                <label class="wavy-ignore-cache-row">
                    <input type="checkbox" id="wavy-ignore-cache">
                    Ignorer le cache et tout re-télécharger
                </label>
                <div style="font-size:11px;color:#6b7280;margin-top:8px">
                    Le format (CSV / JSON) sera choisi après la récupération des données.
                </div>`;

            const footHtml = `
                <button class="wavy-launch-btn" id="wavy-launch">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Lancer l'export
                </button>`;

            buildOverlay(
                `<h1>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Wavy Data Exporter
                </h1>
                <p>Choisissez les données à exporter</p>`,
                bodyHtml,
                footHtml
            );

            // ── Cache badges ──
            function renderCacheBadges(sid) {
                DATA_GROUPS.forEach(g => {
                    const badge = document.getElementById(`wavy-cache-badge-${g.id}`);
                    if (!badge) return;

                    if (g.requiresDateRange) {
                        // Chunked group — aggregate all per-period cache entries
                        const prefix = cacheKey(sid, g.id) + '_';
                        let totalCount = 0, newestFetchedAt = 0, chunkCount = 0;
                        for (let i = 0; i < localStorage.length; i++) {
                            const key = localStorage.key(i);
                            if (!key || !key.startsWith(prefix)) continue;
                            const raw = localStorage.getItem(key);
                            if (!raw) continue;
                            try {
                                const e = JSON.parse(raw);
                                totalCount += e.count || 0;
                                chunkCount++;
                                if (e.fetchedAt > newestFetchedAt) newestFetchedAt = e.fetchedAt;
                            } catch {}
                        }
                        if (chunkCount > 0) {
                            const age = formatAge(Date.now() - newestFetchedAt);
                            badge.textContent = `📦 ${totalCount.toLocaleString('fr-FR')} enregistrements (${chunkCount} période${chunkCount > 1 ? 's' : ''}) · dernière récupération il y a ${age}`;
                            badge.className = 'wavy-cache-badge wavy-cache-fresh';
                        } else {
                            badge.textContent = '';
                        }
                    } else {
                        const entry = loadFromCache(cacheKey(sid, g.id), CACHE_TTL[g.id] || 3_600_000);
                        if (entry) {
                            const age = formatAge(Date.now() - entry.fetchedAt);
                            badge.textContent = `📦 ${entry.count.toLocaleString('fr-FR')} enregistrements · dernière récupération il y a ${age}`;
                            badge.className = 'wavy-cache-badge wavy-cache-fresh';
                        } else {
                            badge.textContent = '';
                        }
                    }
                });
            }

            function scanCacheEntries(sid) {
                const prefix = `wavy_${sid}_`;
                const entries = [];
                let totalSize = 0;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || !key.startsWith(prefix)) continue;
                    const raw = localStorage.getItem(key);
                    if (!raw) continue;
                    let parsed;
                    try { parsed = JSON.parse(raw); } catch { continue; }
                    const size = raw.length * 2; // approx UTF-16 bytes
                    totalSize += size;
                    const suffix = key.slice(prefix.length);
                    const idx = suffix.indexOf('_');
                    const groupId = idx === -1 ? suffix : suffix.slice(0, idx);
                    const period  = idx === -1 ? '' : suffix.slice(idx + 1);
                    const grp = DATA_GROUPS.find(g => g.id === groupId);
                    entries.push({
                        key,
                        groupName: grp?.name || groupId,
                        icon: grp?.icon || '📦',
                        period,
                        count: parsed.count || (parsed.data ? parsed.data.length : 0),
                        fetchedAt: parsed.fetchedAt || 0,
                        size
                    });
                }
                entries.sort((a, b) => b.fetchedAt - a.fetchedAt);
                return { entries, totalSize };
            }

            function renderCacheMgr(sid) {
                const { entries, totalSize } = scanCacheEntries(sid);
                const stat = document.getElementById('wavy-cache-mgr-stat');
                const body = document.getElementById('wavy-cache-mgr-body');
                if (!stat || !body) return;

                if (entries.length === 0) {
                    stat.textContent = 'vide';
                    body.innerHTML = '<div class="wavy-cache-mgr-empty">Aucune donnée en cache pour ce salon.</div>';
                    return;
                }
                stat.textContent = `${entries.length} entrée${entries.length > 1 ? 's' : ''} · ${formatBytes(totalSize)}`;
                body.innerHTML = `
                    <div class="wavy-cache-mgr-list">
                        ${entries.map(e => `
                            <div class="wavy-cache-mgr-row">
                                <span style="flex-shrink:0">${e.icon}</span>
                                <span class="cm-name">
                                    ${e.groupName}
                                    ${e.period ? `<span class="cm-period">${e.period}</span>` : ''}
                                </span>
                                <span class="cm-meta">${e.count.toLocaleString('fr-FR')} · ${formatBytes(e.size)} · ${formatAge(Date.now() - e.fetchedAt)}</span>
                                <button class="cm-clear" data-key="${e.key}">Vider</button>
                            </div>
                        `).join('')}
                    </div>
                    <button class="wavy-cache-mgr-clearall">Tout vider (${entries.length})</button>
                `;

                body.querySelectorAll('.cm-clear').forEach(btn => {
                    btn.addEventListener('click', () => {
                        localStorage.removeItem(btn.dataset.key);
                        renderCacheMgr(sid);
                        renderCacheBadges(sid);
                    });
                });
                body.querySelector('.wavy-cache-mgr-clearall')?.addEventListener('click', () => {
                    if (!confirm(`Supprimer ${entries.length} entrée${entries.length > 1 ? 's' : ''} du cache ?`)) return;
                    entries.forEach(e => localStorage.removeItem(e.key));
                    renderCacheMgr(sid);
                    renderCacheBadges(sid);
                });
            }

            const defaultShopID = multiShop
                ? document.getElementById('wavy-shop-sel')?.value || shops[0].shopID
                : shops[0].shopID;
            renderCacheBadges(defaultShopID);
            renderCacheMgr(defaultShopID);
            if (multiShop) {
                document.getElementById('wavy-shop-sel')?.addEventListener('change', e => {
                    renderCacheBadges(e.target.value);
                    renderCacheMgr(e.target.value);
                });
            }

            // ── Interactions checkbox ──
            document.querySelectorAll('.wavy-group-item').forEach(item => {
                const id = item.dataset.id;
                const chk = document.getElementById(`wavy-chk-${id}`);
                const dateBlock = document.getElementById(`wavy-date-${id}`);

                item.addEventListener('click', e => {
                    if (e.target === chk) return;
                    chk.checked = !chk.checked;
                    item.classList.toggle('checked', chk.checked);
                    if (dateBlock) dateBlock.classList.toggle('visible', chk.checked);
                });
                chk.addEventListener('change', () => {
                    item.classList.toggle('checked', chk.checked);
                    if (dateBlock) dateBlock.classList.toggle('visible', chk.checked);
                });
            });

            // ── Tout / Aucun ──
            document.getElementById('wavy-all').onclick = () => {
                DATA_GROUPS.forEach(g => {
                    const chk = document.getElementById(`wavy-chk-${g.id}`);
                    const item = document.querySelector(`.wavy-group-item[data-id="${g.id}"]`);
                    const dateBlock = document.getElementById(`wavy-date-${g.id}`);
                    chk.checked = true;
                    item.classList.add('checked');
                    if (dateBlock) dateBlock.classList.add('visible');
                });
            };
            document.getElementById('wavy-none').onclick = () => {
                DATA_GROUPS.forEach(g => {
                    const chk = document.getElementById(`wavy-chk-${g.id}`);
                    const item = document.querySelector(`.wavy-group-item[data-id="${g.id}"]`);
                    const dateBlock = document.getElementById(`wavy-date-${g.id}`);
                    chk.checked = false;
                    item.classList.remove('checked');
                    if (dateBlock) dateBlock.classList.remove('visible');
                });
            };

            // ── Période personnalisée ──
            DATA_GROUPS.filter(g => g.requiresDateRange).forEach(g => {
                const sel = document.getElementById(`wavy-preset-${g.id}`);
                const customDiv = document.getElementById(`wavy-custom-${g.id}`);
                if (sel) {
                    sel.addEventListener('change', () => {
                        customDiv.classList.toggle('visible', sel.value === 'custom');
                    });
                }
            });

            // ── Lancer ──
            document.getElementById('wavy-launch').addEventListener('click', () => {
                const selectedGroups = DATA_GROUPS.filter(g => document.getElementById(`wavy-chk-${g.id}`)?.checked);
                if (!selectedGroups.length) {
                    alert('Sélectionnez au moins un type de données à exporter.');
                    return;
                }
                const shopID = multiShop
                    ? document.getElementById('wavy-shop-sel').value
                    : shops[0].shopID;
                const shopName = shops.find(s => s.shopID === shopID)?.name || 'salon';

                // Gather date ranges
                const dateRanges = {};
                DATA_GROUPS.filter(g => g.requiresDateRange).forEach(g => {
                    const preset = document.getElementById(`wavy-preset-${g.id}`)?.value || (g.futureMode ? '90d' : '365d');
                    const range = preset === 'custom'
                        ? { from: document.getElementById(`wavy-from-${g.id}`)?.value, to: document.getElementById(`wavy-to-${g.id}`)?.value }
                        : presetToRange(preset, g.futureMode);
                    const chunk = document.getElementById(`wavy-chunk-${g.id}`)?.value || 'none';
                    dateRanges[g.id] = { ...range, chunk };
                });

                const useCache = !document.getElementById('wavy-ignore-cache')?.checked;
                resolve({ shopID, shopName, selectedGroups, dateRanges, useCache });
            });
        });
    }

    // ─────────────────────────────────────────────
    // PHASE 3 : PROGRESSION
    // ─────────────────────────────────────────────
    function createProgressUI(shopName, total) {
        buildOverlay(
            `<h1>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                Wavy Data Exporter
            </h1>
            <p>Export en cours — ${shopName}</p>`,
            `<div class="wavy-warning-banner">
                <span style="font-size:18px;flex-shrink:0">⚠️</span>
                <span><strong>Ne fermez pas cette fenêtre</strong> pendant l'export.<br>
                La page Wavy doit rester ouverte pour que les requêtes fonctionnent.</span>
             </div>
             <div class="wavy-steps">
                <span class="wavy-steps-label" id="wavy-step-label">Démarrage…</span>
                <span class="wavy-steps-count" id="wavy-step-count">0 / ${total}</span>
             </div>
             <div class="wavy-bar-track"><div class="wavy-bar-fill" id="wavy-bar"></div></div>
             <div class="wavy-current-step" id="wavy-current-step">&nbsp;</div>
             <div class="wavy-substep" id="wavy-substep"></div>
             <div class="wavy-logs" id="wavy-logs"></div>`,
            ''
        );

        return {
            setProgress(pct, doneCount) {
                document.getElementById('wavy-bar').style.width = `${pct}%`;
                if (doneCount !== undefined) {
                    document.getElementById('wavy-step-count').textContent = `${doneCount} / ${total}`;
                }
            },
            setStep(name, icon = '') {
                document.getElementById('wavy-step-label').textContent = name;
                document.getElementById('wavy-current-step').textContent = icon ? `${icon} ${name}` : name;
                document.getElementById('wavy-substep').textContent = '';
            },
            setSubstep(txt) {
                document.getElementById('wavy-substep').textContent = txt;
            },
            setStatus(txt) {
                document.getElementById('wavy-step-label').textContent = txt;
            },
            log(msg, type = 'info') {
                // After showSummary replaces the body, the original #wavy-logs is gone and only
                // #wavy-logs-copy (inside the collapsible) remains. Write to whichever exists.
                const logs = document.getElementById('wavy-logs') || document.getElementById('wavy-logs-copy');
                if (!logs) return;
                const el = document.createElement('div');
                el.className = `wavy-log wavy-log-${type}`;
                const t = new Date().toLocaleTimeString('fr-FR');
                const icons = { info: 'ℹ', success: '✓', error: '✗', warning: '⚠', cache: '📦' };
                el.textContent = `[${t}] ${icons[type] || ''} ${msg}`;
                logs.appendChild(el);
                logs.scrollTop = logs.scrollHeight;
            },
            showSummary(stats, entries, onDownload) {
                const body = document.getElementById('wavy-exp-body');
                const totalRecords = stats.reduce((a, s) => a + s.count, 0);
                const totalFiles = stats.reduce((a, s) => a + s.files, 0);

                // Group entries by groupId to compute raw CSV/JSON sizes per group lazily in a worker-free pass
                const sizesByGroup = {};
                for (const e of entries) {
                    const s = sizesByGroup[e.groupId] || (sizesByGroup[e.groupId] = { csv: 0, json: 0 });
                    const csv = toCSV(e.data);
                    const json = JSON.stringify(e.data);
                    s.csv += byteSize(csv);
                    s.json += byteSize(json);
                }
                const totalCsv  = Object.values(sizesByGroup).reduce((a, s) => a + s.csv,  0);
                const totalJson = Object.values(sizesByGroup).reduce((a, s) => a + s.json, 0);

                body.innerHTML = `
                    <div class="wavy-warning-banner" style="background:#ecfdf5;border-color:#6ee7b7;color:#065f46">
                        <span style="font-size:18px;flex-shrink:0">✅</span>
                        <span><strong>Données récupérées</strong> — choisissez le format et téléchargez.</span>
                    </div>
                    <div class="wavy-summary">
                        <div class="wavy-summary-head">
                            <span>Contenu de l'archive</span>
                            <span style="font-weight:500;color:#047857">${totalFiles} fichier${totalFiles > 1 ? 's' : ''}</span>
                        </div>
                        <table class="wavy-summary-table">
                            <thead>
                                <tr>
                                    <th>Groupe</th>
                                    <th class="num">Enregistrements</th>
                                    <th class="num">Fichiers</th>
                                    <th class="num">CSV</th>
                                    <th class="num">JSON</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stats.map(s => {
                                    const sz = sizesByGroup[s.id] || { csv: 0, json: 0 };
                                    return `
                                        <tr>
                                            <td>
                                                <span class="sm-icon">${s.icon}</span>${s.name}
                                                ${s.cached ? '<span class="sm-cache-badge">cache</span>' : ''}
                                            </td>
                                            <td class="num ${s.count === 0 ? 'sm-empty' : ''}">${s.count === 0 ? 'aucun' : s.count.toLocaleString('fr-FR')}</td>
                                            <td class="num">${s.files}</td>
                                            <td class="num">${s.count === 0 ? '—' : formatBytes(sz.csv)}</td>
                                            <td class="num">${s.count === 0 ? '—' : formatBytes(sz.json)}</td>
                                        </tr>
                                    `;
                                }).join('')}
                                <tr class="total">
                                    <td>Total</td>
                                    <td class="num">${totalRecords.toLocaleString('fr-FR')}</td>
                                    <td class="num">${totalFiles}</td>
                                    <td class="num">${formatBytes(totalCsv)}</td>
                                    <td class="num">${formatBytes(totalJson)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="wavy-section-title" style="margin-top:14px">Télécharger</div>
                    <div class="wavy-format-row">
                        <button class="wavy-fmt-btn" data-dl="both" style="border:none;cursor:pointer;font:inherit;text-align:center">
                            <span class="wavy-fmt-icon">📦</span>
                            CSV + JSON
                            <div style="font-size:11px;color:#6b7280;margin-top:2px">${formatBytes(totalCsv + totalJson)} non compressé</div>
                        </button>
                        <button class="wavy-fmt-btn" data-dl="csv" style="border:none;cursor:pointer;font:inherit;text-align:center">
                            <span class="wavy-fmt-icon">📊</span>
                            CSV seul
                            <div style="font-size:11px;color:#6b7280;margin-top:2px">${formatBytes(totalCsv)} · Excel compatible</div>
                        </button>
                        <button class="wavy-fmt-btn" data-dl="json" style="border:none;cursor:pointer;font:inherit;text-align:center">
                            <span class="wavy-fmt-icon">📄</span>
                            JSON seul
                            <div style="font-size:11px;color:#6b7280;margin-top:2px">${formatBytes(totalJson)} · données brutes</div>
                        </button>
                    </div>
                    <details style="margin-top:12px">
                        <summary style="cursor:pointer;font-size:12px;color:#6b7280;user-select:none">
                            Afficher le journal détaillé
                        </summary>
                        <div class="wavy-logs" id="wavy-logs-copy" style="margin-top:8px">${document.getElementById('wavy-logs').innerHTML}</div>
                    </details>
                `;

                body.querySelectorAll('[data-dl]').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        const fmt = btn.dataset.dl;
                        const originalHtml = btn.innerHTML;
                        body.querySelectorAll('[data-dl]').forEach(b => { b.disabled = true; b.style.opacity = '0.4'; });
                        btn.style.opacity = '1';
                        btn.innerHTML = `
                            <div style="font-size:12px;font-weight:600;margin-bottom:6px" data-phase>Préparation…</div>
                            <div style="height:6px;background:#e5e7eb;border-radius:999px;overflow:hidden">
                                <div style="height:100%;background:${TEAL};width:0%;transition:width .15s" data-bar></div>
                            </div>
                            <div style="font-size:11px;color:#6b7280;margin-top:4px" data-pct>0 %</div>
                        `;
                        const phaseEl = btn.querySelector('[data-phase]');
                        const barEl   = btn.querySelector('[data-bar]');
                        const pctEl   = btn.querySelector('[data-pct]');
                        const phaseLabels = {
                            serialisation: 'Préparation des fichiers',
                            compression:   'Compression ZIP',
                            done:          'Prêt — téléchargement…'
                        };
                        const onProgress = (phase, pct) => {
                            phaseEl.textContent = phaseLabels[phase] || phase;
                            barEl.style.width = `${pct}%`;
                            pctEl.textContent = `${Math.round(pct)} %`;
                        };
                        try {
                            await onDownload(fmt, onProgress);
                        } finally {
                            setTimeout(() => {
                                btn.innerHTML = originalHtml;
                                body.querySelectorAll('[data-dl]').forEach(b => { b.disabled = false; b.style.opacity = ''; });
                            }, 800);
                        }
                    });
                });
            }
        };
    }

    // ─────────────────────────────────────────────
    // EXPORT
    // ─────────────────────────────────────────────
    async function runExport(config, ui) {
        const { shopID, shopName, selectedGroups, dateRanges, useCache } = config;

        const beforeUnloadHandler = e => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', beforeUnloadHandler);

        // Warm up JSZip early — compression runs later, on download click.
        loadJSZip().then(() => ui.log('JSZip chargé', 'success')).catch(() => {});

        const results = { ok: [], fail: [] };
        const stats = [];
        // Accumulated entries — one per file-to-write. ZIP is assembled lazily on download click.
        const entries = [];
        const total = selectedGroups.length;

        for (let i = 0; i < total; i++) {
            const grp = selectedGroups[i];
            ui.setProgress((i / total) * 95, i);
            ui.setStep(grp.name, grp.icon);
            ui.log(`→ ${grp.name}`, 'info');

            try {
                const opts = grp.requiresDateRange ? dateRanges[grp.id] : {};
                const slug = grp.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_');

                let groupRecords = 0, groupFiles = 0, groupFromCache = false;

                if (grp.requiresDateRange && opts.chunk && opts.chunk !== 'none') {
                    // Past mode: iterate backwards from most recent. Future mode: forward from today.
                    // Early termination after N consecutive empty periods (shop probably didn't exist yet / no more bookings ahead).
                    const periods = splitPeriod(opts.from, opts.to, opts.chunk, !grp.futureMode);
                    const emptyLimit = opts.chunk === 'year' ? 2 : 6;
                    let consecutiveEmpty = 0;
                    let stoppedEarly = false;

                    for (let p = 0; p < periods.length; p++) {
                        const period = periods[p];
                        const baseLabel = `${period.label} · ${p + 1} / ${periods.length} · ${groupRecords} récupérés`;
                        ui.setSubstep(baseLabel);
                        const chunkTTL = isPastChunk(period.label) ? Infinity : 3_600_000;
                        const ck = cacheKey(shopID, grp.id, period.label);
                        const cached = useCache ? loadFromCache(ck, chunkTTL) : null;
                        let unique;
                        if (cached) {
                            unique = cached.data;
                            groupFromCache = true;
                            ui.log(`  ${period.label} : ${unique.length} (cache)`, 'cache');
                        } else {
                            const t0 = Date.now();
                            const tick = setInterval(() => {
                                const s = Math.round((Date.now() - t0) / 1000);
                                ui.setSubstep(`${baseLabel} · ${s}s`);
                            }, 1000);
                            let data;
                            try { data = await grp.fetch(shopID, { from: period.from, to: period.to }); }
                            finally { clearInterval(tick); }
                            unique = dedupe(data);
                            saveToCache(ck, unique);
                            ui.log(`  ${period.label} : ${unique.length} enregistrements`, 'success');
                            await sleep(DELAY);
                        }
                        // Detect the "leakage" case: API returns a single record from outside the
                        // requested window (typical when querying past the shop's creation date, or
                        // past the last scheduled appointment). Treat as an unambiguous stop signal.
                        const leaking = unique.length === 1 && (() => {
                            const v = unique[0];
                            const iso = v?.appointment?.date || v?.date || v?.createdAt;
                            if (!iso) return false;
                            return iso < `${period.from}T00:00:00.000Z` || iso > `${period.to}T23:59:59.999Z`;
                        })();

                        if (leaking) {
                            stoppedEarly = true;
                            ui.log(`${grp.name} : arrêt — résultat hors période (fin des données atteinte)`, 'info');
                            break;
                        }

                        if (unique.length > 0) {
                            entries.push({ groupId: grp.id, baseName: `${slug}_${period.label}`, data: unique });
                            groupRecords += unique.length;
                            groupFiles += 1;
                            consecutiveEmpty = 0;
                        } else {
                            consecutiveEmpty++;
                            if (consecutiveEmpty >= emptyLimit) {
                                stoppedEarly = true;
                                ui.log(`${grp.name} : arrêt — ${emptyLimit} périodes vides consécutives`, 'info');
                                break;
                            }
                        }
                    }
                    ui.setSubstep('');
                    const suffix = stoppedEarly ? ' (arrêt anticipé)' : '';
                    ui.log(`${grp.name} : ${groupRecords} enregistrements (${groupFiles} fichiers)${suffix}`, 'success');
                    results.ok.push({ name: grp.name, count: groupRecords });
                } else {
                    const ck = cacheKey(shopID, grp.id);
                    const ttl = CACHE_TTL[grp.id] || 3_600_000;
                    let data;

                    // Unified ticker + progress: the ticker fills the "dead time" between pages
                    // with elapsed seconds. As soon as a real page arrives, it's replaced with the
                    // record count + current elapsed seconds, then the ticker restarts to count
                    // the gap before the next page.
                    let tick = null;
                    let tLabel = 'requête en cours';
                    const t0 = Date.now();
                    const secs = () => Math.round((Date.now() - t0) / 1000);
                    const renderTick = () => ui.setSubstep(`${tLabel}… ${secs()}s`);
                    const startTicker = (label) => {
                        tLabel = label;
                        if (tick) clearInterval(tick);
                        renderTick();
                        tick = setInterval(renderTick, 1000);
                        return tick;
                    };
                    const onProgress = (done, total) => {
                        tLabel = total != null ? `${done} / ${total} récupérés` : `${done} récupérés`;
                        renderTick();
                    };

                    if (useCache && !grp.requiresDateRange) {
                        const fresh = loadFromCache(ck, ttl);
                        if (fresh) {
                            data = fresh.data;
                            groupFromCache = true;
                            ui.log(`${grp.name} : ${data.length} enregistrements (cache)`, 'cache');
                        } else if (grp.incremental && grp.fetchSince) {
                            const raw = loadFromCacheRaw(ck);
                            const age = raw ? Date.now() - raw.fetchedAt : Infinity;
                            if (raw && age < INCREMENTAL_TTL) {
                                const tick = startTicker('sync incrémentale');
                                const since = new Date(raw.fetchedAt).toISOString();
                                let updates;
                                try { updates = await grp.fetchSince(shopID, since, onProgress); }
                                finally { clearInterval(tick); }
                                if (updates.length === 0) {
                                    data = raw.data;
                                    ui.log(`${grp.name} : ${data.length} enregistrements (cache · à jour)`, 'cache');
                                } else {
                                    data = dedupe([...updates, ...raw.data]);
                                    ui.log(`${grp.name} : +${updates.length} mises à jour (sync incrémentale)`, 'success');
                                }
                                saveToCache(ck, data);
                                groupFromCache = updates.length === 0;
                                ui.setSubstep('');
                            }
                        }
                    }

                    if (data === undefined) {
                        const tick = startTicker('requête en cours');
                        try { data = await grp.fetch(shopID, opts, onProgress); }
                        finally { clearInterval(tick); ui.setSubstep(''); }
                        if (!grp.requiresDateRange) saveToCache(ck, data);
                    }
                    if (data.length === 0) {
                        ui.log(`${grp.name} : aucune donnée`, 'warning');
                        results.ok.push({ name: grp.name, count: 0 });
                    } else {
                        entries.push({ groupId: grp.id, baseName: slug, data });
                        groupRecords = data.length;
                        groupFiles = 1;
                        if (!groupFromCache) ui.log(`${grp.name} : ${data.length} enregistrements`, 'success');
                        results.ok.push({ name: grp.name, count: data.length });
                    }
                }

                stats.push({
                    id: grp.id,
                    name: grp.name, icon: grp.icon,
                    count: groupRecords,
                    files: groupFiles,
                    cached: groupFromCache
                });
            } catch (err) {
                ui.log(`${grp.name} : erreur — ${err.message}`, 'error');
                results.fail.push({ name: grp.name, error: err.message });
            }

            if (i < total - 1) await sleep(DELAY);
        }

        window.removeEventListener('beforeunload', beforeUnloadHandler);

        ui.setProgress(100, total);

        if (results.fail.length) {
            ui.log(`${results.fail.length} erreur(s) — voir le rapport`, 'warning');
        }

        const totalRecords = stats.reduce((a, s) => a + s.count, 0);
        ui.log(`Récupération terminée : ${totalRecords.toLocaleString('fr-FR')} enregistrements`, 'success');

        const report = {
            salon: shopName,
            dateExport: new Date().toISOString(),
            reussis: results.ok,
            echecs: results.fail
        };
        const date = todayISO().replace(/-/g, '');

        const buildAndDownload = async (format, onProgress) => {
            const JSZip = await loadJSZip();
            ui.log(`Compression ZIP (${format})…`, 'info');
            const zip = new JSZip();
            // Serialisation phase: also report progress here since it dominates for large datasets.
            const serialisationSteps = entries.length * ((format === 'both') ? 2 : 1);
            let step = 0;
            for (const e of entries) {
                if (format === 'csv' || format === 'both') {
                    zip.file(`csv/${e.baseName}.csv`, toCSV(e.data));
                    step++;
                    if (onProgress) onProgress('serialisation', (step / serialisationSteps) * 30);
                }
                if (format === 'json' || format === 'both') {
                    zip.file(`json/${e.baseName}.json`, JSON.stringify(e.data, null, 2));
                    step++;
                    if (onProgress) onProgress('serialisation', (step / serialisationSteps) * 30);
                }
                // Yield back to the browser so the UI thread can paint progress updates.
                await new Promise(r => setTimeout(r, 0));
            }
            zip.file('_rapport.json', JSON.stringify({ ...report, format }, null, 2));

            const blob = await zip.generateAsync(
                { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } },
                (meta) => { if (onProgress) onProgress('compression', 30 + (meta.percent * 0.7)); }
            );
            if (onProgress) onProgress('done', 100);

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `export_wavy_${date}_${format}.zip`;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            ui.log(`Téléchargement lancé : ${a.download}`, 'success');
        };

        ui.showSummary(stats, entries, buildAndDownload);
    }

    // ─────────────────────────────────────────────
    // POINT D'ENTRÉE
    // ─────────────────────────────────────────────
    async function main() {
        showLoading();

        let shopInfo;
        try {
            shopInfo = await getShopInfo();
        } catch (e) {
            showError(e.message);
            return;
        }

        let config;
        try {
            config = await showConfig(shopInfo);
        } catch {
            return; // utilisateur a annulé
        }

        const ui = createProgressUI(config.shopName, config.selectedGroups.length);
        try {
            await runExport(config, ui);
        } catch (e) {
            ui.log(`Erreur fatale : ${e.message}`, 'error');
            ui.setStatus('Une erreur est survenue');
            console.error('[WavyExporter]', e);
        }
    }

    main();

})();
