# Wavy Data Exporter

Outil gratuit et open-source permettant aux gérants de salons de coiffure d'exporter leurs données depuis Wavy.co.

## Fonctionnalités

- Export complet des données : clients, rendez-vous, services, produits, ventes, etc.
- Interface utilisateur élégante avec barre de progression
- Conversion automatique en fichiers CSV
- Compression ZIP pour un téléchargement facile
- 100% local : aucune donnée n'est envoyée à un serveur tiers

## Structure du projet

```
wavy-exporter/
├── index.html      # Page tutoriel avec le bookmarklet
├── exporter.js     # Script principal d'extraction
└── README.md       # Ce fichier
```

## Déploiement

### Netlify (Recommandé)

Le projet est configuré pour être hébergé sur `wavy-exporter.netlify.app`.

1. **Créez un repository GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/VOTRE-USERNAME/wavy-exporter.git
   git push -u origin main
   ```

2. **Connectez à Netlify**
   - Allez sur [netlify.com](https://netlify.com)
   - Cliquez sur "Add new site" > "Import an existing project"
   - Sélectionnez votre repository GitHub

3. **Configuration Netlify**
   - Build command : *(laisser vide)*
   - Publish directory : `.`

4. **Configurez le nom du site**
   - Site settings > Domain management > Custom domains
   - Changez le nom en `wavy-exporter` pour obtenir `wavy-exporter.netlify.app`

5. **Votre site est accessible à**
   ```
   https://wavy-exporter.netlify.app
   ```

> **Note** : Si vous utilisez un autre nom de domaine, mettez à jour l'URL du bookmarklet dans `index.html` :
> ```javascript
> s.src='https://VOTRE-SITE.netlify.app/exporter.js?v='+Date.now();
> ```

### Option alternative : GitHub Pages

1. Activez GitHub Pages dans Settings > Pages
2. Mettez à jour l'URL dans `index.html` :
   ```javascript
   s.src='https://VOTRE-USERNAME.github.io/wavy-exporter/exporter.js?v='+Date.now();
   ```

### Option alternative : Serveur personnel

Placez simplement les fichiers sur n'importe quel serveur web statique (Apache, Nginx, etc.).

```bash
# Exemple avec un simple serveur Python
python -m http.server 8000
```

## Configuration des Endpoints

Le fichier `exporter.js` contient un tableau `ENDPOINTS` facilement modifiable :

```javascript
const ENDPOINTS = [
    { name: 'Clients', url: '/customers', key: 'data' },
    { name: 'Rendez-vous', url: '/appointments', key: 'data' },
    // Ajoutez vos propres endpoints ici
];
```

Pour chaque endpoint :
- `name` : Nom affiché dans l'interface et nom du fichier CSV
- `url` : Chemin de l'API (sans le domaine)
- `key` : Clé JSON contenant les données (généralement `data`)

## Personnalisation

### Modifier le délai entre les requêtes

```javascript
const DELAY_BETWEEN_REQUESTS = 200; // Augmentez si vous êtes bloqué
```

### Modifier les couleurs

```javascript
const TEAL_COLOR = '#00d1b2'; // Couleur principale
```

## Sécurité

- Le script s'exécute entièrement dans le navigateur de l'utilisateur
- Les requêtes sont faites directement vers l'API Wavy avec les cookies de session
- Aucune donnée n'est transmise à un serveur tiers
- Le code source est ouvert et vérifiable

## Conformité RGPD

Cet outil aide les utilisateurs à exercer leur droit à la portabilité des données (Article 20 du RGPD). Il permet de récupérer les données personnelles dans un format structuré, couramment utilisé et lisible par machine.

## Dépendances externes

- [JSZip](https://stuk.github.io/jszip/) - Chargée dynamiquement depuis CDNJS pour la compression ZIP
- [Tailwind CSS](https://tailwindcss.com/) - Utilisée via CDN pour la page tutoriel

## Contribution

Les contributions sont les bienvenues ! N'hésitez pas à :

1. Forker le projet
2. Créer une branche (`git checkout -b feature/amelioration`)
3. Commiter vos changements (`git commit -m 'Ajout d'une fonctionnalité'`)
4. Pusher (`git push origin feature/amelioration`)
5. Ouvrir une Pull Request

## Licence

MIT License - Voir le fichier [LICENSE](LICENSE) pour plus de détails.

## Disclaimer

Cet outil n'est pas affilié à Wavy.co. Il s'agit d'un projet indépendant créé pour aider les utilisateurs à récupérer leurs propres données. L'utilisation de cet outil est sous la responsabilité de l'utilisateur.

## Support

Si vous rencontrez des problèmes :

1. Vérifiez que vous êtes connecté sur [backoffice.wavy.fr](https://backoffice.wavy.fr)
2. Ouvrez la console développeur (F12) pour voir les erreurs
3. [Ouvrez une issue](https://github.com/VOTRE-USERNAME/wavy-exporter/issues) sur GitHub
