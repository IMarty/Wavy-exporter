/**
 * Wavy Data Exporter
 * Outil open-source pour exporter les données depuis l'API Wavy.co
 * https://github.com/votre-repo/wavy-exporter
 */

(async function WavyExporter() {
    'use strict';

    // ============================================
    // CONFIGURATION DES ENDPOINTS
    // ============================================
    const ENDPOINTS = [
        { name: 'Clients', url: '/customers', key: 'data' },
        { name: 'Rendez-vous', url: '/appointments', key: 'data' },
        { name: 'Services', url: '/services', key: 'data' },
        { name: 'Produits', url: '/products', key: 'data' },
        { name: 'Collaborateurs', url: '/staff', key: 'data' },
        { name: 'Catégories', url: '/categories', key: 'data' },
        { name: 'Ventes', url: '/sales', key: 'data' },
        { name: 'Paiements', url: '/payments', key: 'data' },
        { name: 'Avis clients', url: '/reviews', key: 'data' },
        { name: 'Promotions', url: '/promotions', key: 'data' }
    ];

    const API_BASE_URL = 'https://api.wavy.fr';
    const DELAY_BETWEEN_REQUESTS = 200; // ms
    const TEAL_COLOR = '#00d1b2';

    // ============================================
    // INJECTION DE L'INTERFACE UTILISATEUR
    // ============================================
    function createUI() {
        // Supprime une ancienne instance si elle existe
        const existingOverlay = document.getElementById('wavy-exporter-overlay');
        if (existingOverlay) existingOverlay.remove();

        // Styles CSS
        const styles = document.createElement('style');
        styles.textContent = `
            #wavy-exporter-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            }
            #wavy-exporter-popup {
                background: #ffffff;
                border-radius: 16px;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                width: 90%;
                max-width: 500px;
                overflow: hidden;
                animation: wavy-slide-in 0.3s ease-out;
            }
            @keyframes wavy-slide-in {
                from { opacity: 0; transform: translateY(-20px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
            }
            #wavy-exporter-header {
                background: linear-gradient(135deg, ${TEAL_COLOR} 0%, #00b89c 100%);
                color: white;
                padding: 24px;
                text-align: center;
            }
            #wavy-exporter-header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 700;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 10px;
            }
            #wavy-exporter-header p {
                margin: 8px 0 0;
                opacity: 0.9;
                font-size: 14px;
            }
            #wavy-exporter-body {
                padding: 24px;
            }
            #wavy-exporter-progress-container {
                background: #f3f4f6;
                border-radius: 100px;
                height: 24px;
                overflow: hidden;
                margin-bottom: 12px;
                position: relative;
            }
            #wavy-exporter-progress-bar {
                background: linear-gradient(90deg, ${TEAL_COLOR} 0%, #00e6c8 100%);
                height: 100%;
                width: 0%;
                border-radius: 100px;
                transition: width 0.3s ease;
                position: relative;
            }
            #wavy-exporter-progress-bar::after {
                content: '';
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: linear-gradient(
                    90deg,
                    transparent,
                    rgba(255,255,255,0.3),
                    transparent
                );
                animation: wavy-shimmer 1.5s infinite;
            }
            @keyframes wavy-shimmer {
                0% { transform: translateX(-100%); }
                100% { transform: translateX(100%); }
            }
            #wavy-exporter-percentage {
                text-align: center;
                font-size: 32px;
                font-weight: 700;
                color: ${TEAL_COLOR};
                margin-bottom: 16px;
            }
            #wavy-exporter-status {
                text-align: center;
                color: #6b7280;
                font-size: 14px;
                margin-bottom: 16px;
            }
            #wavy-exporter-logs {
                background: #1f2937;
                border-radius: 8px;
                padding: 16px;
                max-height: 200px;
                overflow-y: auto;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 12px;
                line-height: 1.6;
            }
            #wavy-exporter-logs::-webkit-scrollbar {
                width: 6px;
            }
            #wavy-exporter-logs::-webkit-scrollbar-track {
                background: #374151;
                border-radius: 3px;
            }
            #wavy-exporter-logs::-webkit-scrollbar-thumb {
                background: #6b7280;
                border-radius: 3px;
            }
            .wavy-log-entry {
                margin-bottom: 4px;
            }
            .wavy-log-info { color: #60a5fa; }
            .wavy-log-success { color: #34d399; }
            .wavy-log-error { color: #f87171; }
            .wavy-log-warning { color: #fbbf24; }
            #wavy-exporter-close {
                position: absolute;
                top: 16px;
                right: 16px;
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                cursor: pointer;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: background 0.2s;
            }
            #wavy-exporter-close:hover {
                background: rgba(255,255,255,0.3);
            }
            #wavy-exporter-footer {
                padding: 16px 24px;
                background: #f9fafb;
                border-top: 1px solid #e5e7eb;
                text-align: center;
            }
            #wavy-exporter-download-btn {
                background: linear-gradient(135deg, ${TEAL_COLOR} 0%, #00b89c 100%);
                color: white;
                border: none;
                padding: 12px 32px;
                border-radius: 8px;
                font-size: 16px;
                font-weight: 600;
                cursor: pointer;
                transition: transform 0.2s, box-shadow 0.2s;
                display: none;
            }
            #wavy-exporter-download-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(0, 209, 178, 0.4);
            }
            #wavy-exporter-download-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }
        `;
        document.head.appendChild(styles);

        // Structure HTML
        const overlay = document.createElement('div');
        overlay.id = 'wavy-exporter-overlay';
        overlay.innerHTML = `
            <div id="wavy-exporter-popup">
                <div id="wavy-exporter-header" style="position: relative;">
                    <button id="wavy-exporter-close">×</button>
                    <h1>
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                            <polyline points="7 10 12 15 17 10"/>
                            <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                        Wavy Data Exporter
                    </h1>
                    <p>Export de vos données en cours...</p>
                </div>
                <div id="wavy-exporter-body">
                    <div id="wavy-exporter-percentage">0%</div>
                    <div id="wavy-exporter-progress-container">
                        <div id="wavy-exporter-progress-bar"></div>
                    </div>
                    <div id="wavy-exporter-status">Initialisation...</div>
                    <div id="wavy-exporter-logs"></div>
                </div>
                <div id="wavy-exporter-footer">
                    <button id="wavy-exporter-download-btn">
                        📦 Télécharger le ZIP
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        // Bouton fermer
        document.getElementById('wavy-exporter-close').addEventListener('click', () => {
            overlay.remove();
        });

        return {
            setProgress: (percent) => {
                document.getElementById('wavy-exporter-progress-bar').style.width = `${percent}%`;
                document.getElementById('wavy-exporter-percentage').textContent = `${Math.round(percent)}%`;
            },
            setStatus: (text) => {
                document.getElementById('wavy-exporter-status').textContent = text;
            },
            log: (message, type = 'info') => {
                const logsContainer = document.getElementById('wavy-exporter-logs');
                const entry = document.createElement('div');
                entry.className = `wavy-log-entry wavy-log-${type}`;
                const timestamp = new Date().toLocaleTimeString('fr-FR');
                const icons = { info: 'ℹ️', success: '✅', error: '❌', warning: '⚠️' };
                entry.textContent = `[${timestamp}] ${icons[type] || ''} ${message}`;
                logsContainer.appendChild(entry);
                logsContainer.scrollTop = logsContainer.scrollHeight;
            },
            showDownloadButton: (blob, filename) => {
                const btn = document.getElementById('wavy-exporter-download-btn');
                btn.style.display = 'inline-block';
                btn.addEventListener('click', () => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                });
            },
            close: () => overlay.remove()
        };
    }

    // ============================================
    // UTILITAIRES
    // ============================================

    /**
     * Pause l'exécution pour un temps donné
     */
    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Transforme un objet imbriqué en objet plat
     * Ex: { user: { name: 'John' } } => { 'user.name': 'John' }
     */
    function flattenJSON(obj, prefix = '') {
        const result = {};

        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;

            const newKey = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];

            if (value === null || value === undefined) {
                result[newKey] = '';
            } else if (typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
                Object.assign(result, flattenJSON(value, newKey));
            } else if (Array.isArray(value)) {
                // Convertit les tableaux en chaîne JSON
                result[newKey] = JSON.stringify(value);
            } else if (value instanceof Date) {
                result[newKey] = value.toISOString();
            } else {
                result[newKey] = value;
            }
        }

        return result;
    }

    /**
     * Échappe les valeurs CSV
     */
    function escapeCSV(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    /**
     * Convertit un tableau d'objets en CSV
     */
    function convertToCSV(data) {
        if (!data || data.length === 0) return '';

        // Aplatit tous les objets
        const flatData = data.map(item => flattenJSON(item));

        // Collecte toutes les colonnes uniques
        const columns = new Set();
        flatData.forEach(item => {
            Object.keys(item).forEach(key => columns.add(key));
        });
        const headers = Array.from(columns).sort();

        // Génère le CSV
        const lines = [];
        lines.push(headers.map(escapeCSV).join(','));

        flatData.forEach(item => {
            const row = headers.map(header => escapeCSV(item[header] ?? ''));
            lines.push(row.join(','));
        });

        return lines.join('\n');
    }

    /**
     * Charge JSZip dynamiquement depuis un CDN
     */
    async function loadJSZip() {
        if (window.JSZip) return window.JSZip;

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
            script.integrity = 'sha512-XMVd28F1oH/O71fzwBnV7HucLxVwtxf26XV8P4wPk26EDxuGZ91N8bsOttmnomcCD3CS5ZMRL50H0GgOHvegtg==';
            script.crossOrigin = 'anonymous';
            script.onload = () => resolve(window.JSZip);
            script.onerror = () => reject(new Error('Impossible de charger JSZip'));
            document.head.appendChild(script);
        });
    }

    /**
     * Effectue une requête API avec les bons headers
     */
    async function fetchAPI(endpoint) {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'rid': 'anti-csrf'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
    }

    /**
     * Récupère toutes les données paginées d'un endpoint
     */
    async function fetchAllPages(endpoint, ui) {
        const allData = [];
        let page = 1;
        let hasMore = true;
        const separator = endpoint.url.includes('?') ? '&' : '?';

        while (hasMore) {
            try {
                const url = `${endpoint.url}${separator}page=${page}&per_page=100`;
                const response = await fetchAPI(url);

                // Extrait les données selon la clé configurée
                const data = endpoint.key ? response[endpoint.key] : response;

                if (Array.isArray(data) && data.length > 0) {
                    allData.push(...data);
                    ui.log(`${endpoint.name}: ${allData.length} éléments récupérés (page ${page})`, 'info');
                    page++;

                    // Vérifie s'il y a encore des pages
                    if (data.length < 100) {
                        hasMore = false;
                    } else {
                        await sleep(DELAY_BETWEEN_REQUESTS);
                    }
                } else if (typeof data === 'object' && !Array.isArray(data)) {
                    // Si c'est un objet unique, on le met dans un tableau
                    allData.push(data);
                    hasMore = false;
                } else {
                    hasMore = false;
                }
            } catch (error) {
                // Si c'est une erreur 404 sur la page 1, l'endpoint n'existe peut-être pas
                if (page === 1) {
                    throw error;
                }
                // Sinon, on a probablement atteint la fin
                hasMore = false;
            }
        }

        return allData;
    }

    // ============================================
    // FONCTION PRINCIPALE
    // ============================================
    async function main() {
        const ui = createUI();

        try {
            ui.log('Démarrage de Wavy Data Exporter...', 'info');
            ui.setStatus('Chargement des dépendances...');

            // Charge JSZip
            const JSZip = await loadJSZip();
            ui.log('JSZip chargé avec succès', 'success');

            const zip = new JSZip();
            const results = {
                success: [],
                failed: []
            };

            const totalEndpoints = ENDPOINTS.length;

            // Parcourt chaque endpoint
            for (let i = 0; i < ENDPOINTS.length; i++) {
                const endpoint = ENDPOINTS[i];
                const progress = ((i / totalEndpoints) * 100);

                ui.setProgress(progress);
                ui.setStatus(`Export de: ${endpoint.name}...`);
                ui.log(`Récupération de ${endpoint.name}...`, 'info');

                try {
                    const data = await fetchAllPages(endpoint, ui);

                    if (data.length > 0) {
                        const csv = convertToCSV(data);
                        const filename = `${endpoint.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}.csv`;
                        zip.file(filename, csv);
                        ui.log(`${endpoint.name}: ${data.length} éléments exportés`, 'success');
                        results.success.push({ name: endpoint.name, count: data.length });
                    } else {
                        ui.log(`${endpoint.name}: Aucune donnée trouvée`, 'warning');
                        results.success.push({ name: endpoint.name, count: 0 });
                    }
                } catch (error) {
                    ui.log(`${endpoint.name}: Erreur - ${error.message}`, 'error');
                    results.failed.push({ name: endpoint.name, error: error.message });
                }

                // Pause entre les requêtes
                if (i < ENDPOINTS.length - 1) {
                    await sleep(DELAY_BETWEEN_REQUESTS);
                }
            }

            ui.setProgress(100);
            ui.setStatus('Génération du fichier ZIP...');
            ui.log('Compression des fichiers...', 'info');

            // Génère le rapport de synthèse
            const report = {
                exportDate: new Date().toISOString(),
                totalEndpoints: totalEndpoints,
                successful: results.success.length,
                failed: results.failed.length,
                details: {
                    success: results.success,
                    failed: results.failed
                }
            };
            zip.file('_rapport_export.json', JSON.stringify(report, null, 2));

            // Crée le ZIP
            const blob = await zip.generateAsync({
                type: 'blob',
                compression: 'DEFLATE',
                compressionOptions: { level: 9 }
            });

            // Nom du fichier avec date
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const filename = `export_wavy_${date}.zip`;

            ui.log('Export terminé avec succès!', 'success');
            ui.log(`${results.success.length}/${totalEndpoints} endpoints exportés`, 'info');

            if (results.failed.length > 0) {
                ui.log(`${results.failed.length} endpoints ont échoué`, 'warning');
            }

            ui.setStatus(`Export terminé! ${results.success.length} fichiers créés.`);
            ui.showDownloadButton(blob, filename);

        } catch (error) {
            ui.log(`Erreur fatale: ${error.message}`, 'error');
            ui.setStatus('Erreur lors de l\'export');
            console.error('Wavy Data Exporter Error:', error);
        }
    }

    // Lance l'export
    main();
})();
