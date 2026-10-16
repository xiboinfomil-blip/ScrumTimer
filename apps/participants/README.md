# Infomil · Espace participants

Application Next.js App Router / React / TypeScript / Tailwind CSS v4 du **monorepo scrumTimer** : un dépôt, deux applications et un package partagé. L’application maître reste à la racine du dépôt pour préserver son projet Vercel existant ; le portail est dans ce dossier, avec le nom npm `@infomil/scrum-participants`. Aucun accès direct à une base de données.

Le dossier frère historique **scrumParticipants** est conservé intact comme **sauvegarde historique, pas comme source active**. Ce dossier est désormais la source du portail, dans le même dépôt que le maître ; aucun second dépôt Git ni dépôt imbriqué n’est nécessaire. Les dépendances installées, builds, métadonnées Git, lockfile autonome et fichiers incrémentaux de l’ancien dossier n’ont pas été copiés.

## Architecture et installation monorepo

Node **>=22.6** (tests TypeScript natifs), npm et accès à un registre autorisé. Ne pas contourner le proxy, TLS ou les restrictions du registre.

Les workspaces npm sont configurés dans le [manifeste racine](../../package.json) : maître à la racine `.` ([sources du maître](../../src)), portail dans ce dossier, [package partagé](../../packages/scrum-shared) dans le dossier des packages du monorepo. Exécuter **`npm install` à la racine du dépôt** pour installer les deux applications et lier le package partagé. Cette installation génère/met à jour l’unique [lockfile racine](../../package-lock.json), **versionné dans Git pour tout le monorepo** ; ne pas créer d’installation ou de lockfile autonome pour ce portail. La dépendance locale utilise la version `*`, compatible avec les workspaces npm, et non le protocole `workspace:`.

Les modules locaux de contrats, types, statistiques et UI sont des réexports de `@infomil/scrum-shared/contracts`, `/types`, `/statistics` et `/ui`. Le package centralise les **schémas de validation à l’exécution, types, helpers de dates/statistiques et UI**, avec également l’export `/daily-hints`. L’**export client `/ui` est séparé** des contrats et helpers purs et n’importe aucun module serveur ni dépendance de base de données. Next transpile ce package ; Tailwind analyse explicitement ses sources avec un chemin remontant quatre niveaux depuis le dossier des styles de l’application. Le proxy, les secrets et le module `server-only` restent propres au portail, jamais dans les exports partagés navigateur.

Le [schéma serveur canonique](../../src/db/schema.ts) et les [migrations Drizzle](../../drizzle) restent **uniquement à la racine, sous la responsabilité du maître** ; les schémas de validation partagés ne les remplacent pas. Le portail ne dépend d’aucun pilote ou schéma DB partagé, ne reçoit pas `DATABASE_URL` et ne lance aucune migration. Il accède aux données uniquement via l’API du maître.

Depuis la racine du dépôt :

| Maître | Portail participants | Usage |
| --- | --- | --- |
| `npm run dev` | `npm run dev:participants` | Développement, maître sur http://localhost:3000 et portail sur http://localhost:3002. |
| `npm run build` | `npm run build:participants` | Build de production de l’application ciblée. |
| `npm run start` | `npm run start:participants` | Servir un build existant, sur les mêmes ports par défaut. |
| `npm run lint` | `npm run lint:participants` | ESLint. |
| `npm run typecheck` | `npm run typecheck:participants` | TypeScript. |
| `npm run test` | `npm run test:participants` | Tests. |

Les variantes `:participants` délèguent au workspace `@infomil/scrum-participants`. Ne pas reconstruire sous un ancien serveur de production actif.

Scripts disponibles : `dev`, `build`, `start`, `lint`, `typecheck`, `test`. Aucun hook de copie d’assets ni outil de migration. Les overrides de dépendances se pilotent à la racine : npm n’applique pas ceux des workspaces comme des overrides racine.

## Périmètre et confiance

- `/` demande d’ouvrir le lien fourni par le scrum master. Aucun annuaire d’équipes.
- `/t/[token]` ouvre une seule équipe : notes du jour modifiables, statistiques et bilan terminé du jour en lecture seule. Ni humeur à choisir, ni présence à modifier, ni minuteur, ni gestion d’équipe.
- Le portail possède les vues complètes **Notes / Statistiques / Bilan**. Le maître n’a plus de pages autonomes `/daily-notes` ou `/statistics` : il conserve les pense-bêtes pendant la parole et les résumés de fin de tour/jour, ainsi que les API nécessaires au portail.
- **Aucune authentification personnelle.** Toute personne possédant le lien peut lire les données de l’équipe et écrire une note pour **n’importe quel participant**, absent inclus. Sélectionner un nom n’établit aucune identité. Ne présentez jamais cette interface comme un espace personnel ou privé par participant.
- Le lien est une capacité porteuse : ne pas le publier, le mettre dans un ticket public, une capture ou un outil d’analyse. Il figure nécessairement dans l’historique du navigateur et peut apparaître dans les logs d’infrastructure ; les en-têtes ne suppriment pas ces risques. Éviter les données sensibles dans les notes.
- Aucun cookie, localStorage, sessionStorage, IndexedDB, service worker, analytics, image/font/script distant. Les brouillons sont en mémoire dans l’onglet seulement et disparaissent si l’onglet est fermé malgré l’avertissement du navigateur.

### Environnement serveur uniquement

Créer localement un fichier d’environnement dans ce dossier, ignoré par Git, ou renseigner les variables dans les paramètres Vercel :

| Variable | Valeur |
| --- | --- |
| `SCRUM_MASTER_URL` | Origine HTTPS exacte du maître, par exemple `https://your-master-project.vercel.app` ; aucun chemin, identifiant, query ou fragment. HTTP autorisé uniquement pour `localhost`, `127.0.0.1` et `::1` en développement. |
| `PARTICIPANT_PORTAL_SECRET` | Même secret aléatoire que sur le maître, au moins 32 caractères sans espace ni contrôle, de préférence 32 octets aléatoires encodés en hex/base64url. Aucun préfixe `NEXT_PUBLIC_`. |

Aucun secret ni fichier d’environnement n’a été copié depuis le maître ou le portail source. Une configuration absente ou incorrecte produit un écran explicite et un HTTP 503 côté API, sans faire échouer le build. Sur le maître, configurer `PARTICIPANT_PORTAL_URL` avec l’origine finale du portail et le même `PARTICIPANT_PORTAL_SECRET`.

## Connexion au serveur maître (implémentée ; déploiement à configurer)

Le maître doit fournir **uniquement** `GET` et `PUT /api/participant-portal` et vérifier côté serveur :

1. `Authorization: Bearer <PARTICIPANT_PORTAL_SECRET>` par comparaison résistante au timing ; ne jamais journaliser ce header.
2. `X-Team-Link: <token>` : `base64url(JSON.stringify({v:1,teamId})) + '.' + base64url(HMAC-SHA256(secret, encodedPayload))`. Signer la chaîne encodée exacte, pas une seconde sérialisation JSON. Vérifier la signature, version, schéma strict et `teamId` canonique `/^[a-f0-9]{64}$/` ; vérifier l’existence de l’équipe. Aucun teamId supplémentaire fourni par le navigateur n’est accepté.
3. Le périmètre de lecture et d’écriture dérive exclusivement de l’équipe signée. La note doit viser un membre du roster, y compris absent. Vérifier le jour réel à Maurice, révision CAS, limite de texte et règles de nettoyage/expiration. Refuser les révisions concurrentes et jours périmés avec **409**. Révision 0 = absence de note.
4. Ne jamais exiger l’origine du portail sur la requête serveur-à-serveur : elle n’est pas transmise. L’API du maître est protégée par le secret ET le token ; le proxy navigateur impose lui-même Origin pour PUT. Si le maître a un middleware global same-origin, prévoir cette route serveur dédiée sans retirer les autres protections.

Le portail ne vérifie pas le HMAC lui-même et ne fabrique aucun lien : contrôle de forme uniquement, autorisation définitive par le maître. Le secret reste dans les modules serveur (`server-only`). Une rotation du secret invalide **tous** les anciens liens ; une révocation par équipe nécessite un mécanisme explicite côté maître, non prévu dans le format v1 sans expiration. Ne pas promettre de révocation individuelle ou de durée de validité automatique.

### Contrat GET

Réponse JSON : `{team:{id,name,roster:[{id,name,present}]},day:'YYYY-MM-DD',hints:[{participantId,hint,revision}],history:[{id,completedAt,people:[{id,name,mood,speakingSeconds,budgetSeconds,timeUp,score,meterTitle}]}]}`.

`completedAt` est un ISO 8601 avec fuseau, `mood` est 1–4 ou null, `score` est le score stocké 0–1000 ou null, `meterTitle` est une chaîne ou null. Roster et chaque liste de personnes limités à 100, historique à 100 bilans (normalement un daily par jour), hints à 100 ; noms participants 60 caractères, identifiants participants 100, titres 200. Le proxy recrée les objets autorisés et ne transmet pas les champs supplémentaires.

### Contrat PUT

Corps **exactement** `{participantId,hint,day,revision}` ; aucune clé de plus. Texte non vide après trim, 1–600 points de code Unicode, LF seul contrôle autorisé ; CR, tabulations et autres contrôles sont refusés par API. L’éditeur convertit les retours navigateur CRLF vers LF avant envoi. Révision entière entre 0 et 2147483646. Réponse succès `{day,hints}` complète pour l’équipe/journée. Pas de DELETE, pas d’écriture de statistiques ou d’historique.

Le navigateur appelle seulement `/api/team`, header `X-Team-Link`. Le proxy ajoute le Bearer secret, envoie à la destination fixe, refuse les redirections, désactive les caches, borne le corps entrant à 8 Kio réels et le JSON sortant à 2 Mio, et impose 12 s de délai upstream (16 s navigateur). Il ne transmet ni cookies, ni Origin utilisateur, ni erreurs upstream brutes. Les erreurs 401/403/404 du maître deviennent `INVALID_LINK`, 409 reste 409, les pannes restent génériques. Aucun retry automatique d’écriture, aucun CORS permissif, aucun chemin de proxy arbitraire. Prévoir des limites de débit à l’infrastructure et au maître avant exposition publique ; le lien ne remplace pas une politique de sécurité adaptée à des données sensibles.

## Comportement des notes et rafraîchissements

Les notes sont partagées jusqu’au prochain minuit **Indian/Mauritius / UTC+4**, sans heure d’été. L’expiration et le nettoyage durable appartiennent au maître ; le portail n’archive pas les notes. Lecture au montage, à la reprise d’onglet visible, au changement de journée et via Actualiser. Pas de polling permanent. Une lecture obsolète est annulée/gardée par génération ; une écriture invalide la lecture en vol. Les données affichées peuvent être anciennes en cas de panne et sont signalées.

Un éditeur inline garde un seul brouillon dans l’onglet. Les changements d’onglet Notes/Statistiques/Bilan ne démontent pas l’éditeur. Actualiser ne remplace jamais son texte. Une révision/journée différente ou un PUT 409 impose **Recharger pour comparer**, puis **Version examinée : conserver mon brouillon**, puis un nouvel enregistrement manuel. Le brouillon du jour précédent ne passe pas au lendemain sans ce choix explicite. Même un timeout peut avoir enregistré : tout résultat d’écriture incertain bloque un nouvel envoi jusqu’à comparaison. Le remplacement du brouillon par le serveur exige confirmation. Fermer un brouillon modifié exige confirmation ; le navigateur reçoit aussi beforeunload tant qu’un brouillon/enregistrement est en attente.

## Statistiques et bilan

- Période : cinq **jours calendaires UTC**, aujourd’hui inclus ; rejet des dates futures. Le bilan du jour est recherché sur la journée **mauricienne**, jamais le dernier résultat arbitraire.
- Moyenne des scores **stockés**, sans appliquer un nouveau barème. Seuls les passages avec score non null, durée >=1 seconde et budget >0 entrent dans les scores moyens. Moyenne arrondie à l’entier, ex æquo sur cette moyenne avec rangs 1,1,3, comme l’application maître. Les noms utilisent le passage retenu le plus récent par identifiant.
- Humeurs : contexte déclaré uniquement, aucune influence sur les scores. Ni vote ni note de performance d’humeur. Le bilan affiche les valeurs et titres archivés, sans récupérer d’image distante.
- Recherche insensible aux accents et pagination de huit résultats/participants pour les grandes équipes. Contrôles natifs >=44px, focus visible, rendu de noms en texte React, contraste bleu/orange et réduction des mouvements. L’accordéon des mesures peut défiler pour les 100 participants ; les listes principales sont paginées.

## Deux projets Vercel, un seul dépôt Git

1. Conserver le projet Vercel maître existant, avec sa **Root Directory `.` à la racine du dépôt**, framework **Next.js** et build **`npm run build` à la racine**. Ne pas déplacer son code et ne pas changer sa racine vers une application imbriquée.
2. Importer **le même dépôt Git** dans un second projet Vercel pour les participants. Framework **Next.js**, **Root Directory : `apps/participants`**, Node supporté >=22.6 (par exemple 24). Activer **Include source files outside of the Root Directory in the Build Step**, nécessaire au package partagé.
3. Utiliser l’installation automatique native monorepo/**npm workspaces depuis le lockfile racine versionné** ; laisser **Install Command sans surcharge**. Build du portail : **`npm run build` depuis sa Root Directory d’application**, et non le build du maître à la racine ; sortie Next standard. Ne pas ajouter de commande d’installation personnalisée contournant la détection avec `--prefix ../..`, de dépôt imbriqué ou de lockfile indépendant. Aucun fichier de configuration Vercel supplémentaire n’est nécessaire pour ces réglages de projet. Vérifier dans les logs que l’installation détecte bien le workspace, le lockfile racine et le package partagé.
4. Ajouter les variables serveur séparément sur les deux projets et pour chaque environnement Production / Preview / Development utilisé. Déployer le maître avec sa route avant de connecter le portail. Les URL Preview peuvent être protégées par Vercel : configurer une connexion serveur autorisée ; ne pas passer de bypass secret via le navigateur.
5. Redéployer après tout changement de variable. Vérifier domaine final, HTTPS, Origin sur PUT, lien signé réel, erreur de lien altéré, conflit simultané, panne maître, bascule minuit et absence d’accès inter-équipe. Ne pas publier de vrai token dans un test ou dans Git.
6. Garder les accès Vercel/Git restreints, configurer rétention/redaction des logs et aucune télémétrie contenant les URL porteuses. Ne pas mettre de liens externes ni ajouter scripts/font/images tiers sans réévaluer la confidentialité. Le portail n’a besoin ni de DB ni du corpus d’assets du maître.

## Sécurité et validations

Tous les chemins portent no-referrer, noindex/nofollow/noarchive/nosnippet, nosniff, DENY frame et une CSP limitée à la même origine ; scripts inline nécessaires au bootstrap Next, unsafe-eval seulement en dev. La CSP ne prétend pas être nonce-based. Robots est disallow-all ; ce n’est **pas** un contrôle d’autorisation. Cache-Control no-store est appliqué au proxy et aux pages dynamiques, aucun CDN cache intentionnel pour les données. Ne pas activer de cache public sur ces routes en aval.

Tests purs fournis : contrats et Unicode, schémas serveur, dates et UTC/Maurice, limites cinq jours, exclusion dates futures, scores archivés/ties/mesures, recherche/pagination 100 personnes, origine et destination fixe, JSON borné. Ils ne requièrent ni réseau ni DB et gardent leurs imports vers les réexports locaux.

### Résultats historiques du portail source, le 16 octobre 2026

Avant cette copie, installation réussie via le registre configuré après épinglage de Next/React/Tailwind et de la famille TypeScript ESLint aux versions disponibles. Lint, vérification TypeScript, **10 tests** et build réussis dans le dossier autonome. Le smoke navigateur a réussi **16 cas** : desktop 1366×768 et mobile 320×568, mouvement réduit et normal, notes/recherche/pagination/statistiques/bilan, enregistrement, conflit avec conservation du brouillon, comparaison explicite, rejet de lecture obsolète et erreurs 401/502. Toutes les API de ces tests navigateur étaient simulées, sans lecture ni écriture Neon réelle.

Le maître possède les routes de partage et de pont décrites ici, avec tests de signature et intégration PostgreSQL PGlite d’isolation/CAS. Avant cette copie et le retrait ultérieur de ses pages autonomes, ses tests navigateur de partage et d’ancienne consultation avaient passé à 320 et 1366px. Ce résultat historique ne décrit pas une page de notes encore disponible sur le maître.

### Résultats antérieurs au retrait des pages autonomes maître

Depuis l’intégration des workspaces et du package partagé, **lint, TypeScript et 81 tests racine, ainsi que lint, TypeScript et 10 tests portail ont réussi**. Les deux builds de production **`npm run build` et `npm run build:participants` ont également réussi** depuis la racine. Le smoke du portail déplacé a réussi ses **16 cas** (320/1366px, mouvements normal/réduit, notes/conflits/erreurs/lectures obsolètes), et celui du maître a revérifié le partage et la lecture seule à 320/1366px. Les API métier des tests navigateur étaient simulées ; aucun changement de données Neon réel.

Les deux déploiements Vercel, secrets réels et liaison bout en bout en hébergement restent à configurer et vérifier. Les essais simulés ne prouvent pas une intégration de production, un audit lecteur d’écran complet ou tous les cas réseau/multi-onglets. Cette opération documentaire n’effectue ni déploiement ni commit.

La mise à jour du périmètre maître concerne uniquement tests et documentation, sans changement de runtime participant. Aucune commande n’a été exécutée pour cette mise à jour ; les contrôles et smokes doivent être relancés avant de revendiquer une nouvelle validation.
