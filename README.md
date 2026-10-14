# Infomil Mauritius — Point quotidien

Application Next.js App Router, React, TypeScript et **Tailwind CSS v4**, migrée depuis le site HTML/JavaScript. L’interface et les comportements restent en français. L’ouverture directe de fichiers locaux (`file://`) n’est plus prise en charge : utilisez le serveur Next.js.

## Installation et commandes

Node.js **>= 20.9** et npm sont nécessaires. Depuis la racine du projet :

| Commande | Usage |
| --- | --- |
| `npm install` | Installer les dépendances. |
| `npm run dev` | Préparer les ressources puis lancer le développement sur http://localhost:3000. |
| `npm run build` | Préparer les ressources puis créer le build de production. |
| `npm run start` | Servir un build de production existant. |
| `npm run lint` | Vérifier les règles ESLint. |
| `npm run typecheck` | Vérifier TypeScript sans émission. |
| `npm run test` | Lancer le runner Node sur les tests TypeScript ; nécessite une version de Node prenant en charge `--experimental-strip-types` (Node >= 22.6). |
| `npm run assets` | Republier les ressources navigateur dans [public](public). |

Les [tests de domaine](tests/domain.test.ts) couvrent la normalisation, la migration, les prérequis de session, le mélange, les échéances et les chemins du catalogue. Node 22.6+ est conseillé pour utiliser toutes les commandes, même si le minimum de l’application est 20.9.

### Page sans styles ou bloquée sur le chargement

Pour modifier l’interface, privilégiez `npm run dev` : les changements sont actualisés automatiquement. Un serveur lancé avec `npm run start` utilise le build chargé à son démarrage. **Arrêtez tous les serveurs de production de ce projet avant `npm run build`, puis redémarrez-les une fois le build terminé.** Sinon, les anciennes pages peuvent demander des fichiers CSS/JavaScript remplacés et recevoir des erreurs HTTP 500.

Après le redémarrage, rechargez la page (Ctrl+F5 si nécessaire). Conservez le même port pour retrouver les données de votre équipe : localhost:3000, :3001 et :3002 sont des origines de stockage différentes. Il n’est pas nécessaire d’effacer les données du navigateur.

## Parcours et comportement

- **`/participants`** : ajouter les noms, gérer les présences et supprimer une sélection après confirmation. La racine `/` redirige vers cette route.
- **`/mood`** : consulter les baromètres locaux (fonds et GIF), choisir une humeur **1–4** pour chaque personne présente. Les GIF jouent automatiquement en boucle au chargement et à chaque changement de diapositive ou de baromètre, y compris si la réduction des mouvements est activée (lecture explicitement demandée). **Stop / Reprendre** fige ou reprend les animations de la diapositive actuelle ; **Précédente / Suivante** changent manuellement de diapositive. Aucun changement automatique de diapositive. Les autres animations de l’interface respectent la réduction des mouvements. Au moins une personne présente et toutes ses humeurs sont nécessaires pour continuer.
- **`/timer`** : ordre mélangé contenant uniquement les présents, minuteur par personne, pause, réinitialisation, ajout de 30 secondes, préalerte et fin sonore facultative. Le passage suivant reste manuel.

**Démarrer** ouvre le mode de parole : bandeau précédent / personne active centrée / personne suivante, minuteur agrandi et réglages verrouillés (y compris en pause). **Modifier** suspend le décompte et ouvre une fenêtre de réglages ; fermer cette fenêtre garde le minuteur en pause, sans quitter le mode de parole. **Suivant** termine le passage actuel et démarre immédiatement le minuteur de la prochaine personne ; à zéro, le passage reste manuel, sans changement automatique. Le dernier passage termine le tour et arrête le minuteur. Le rechargement revient au mode de préparation.

Après le dernier passage, un classement et le bilan du tour apparaissent. Score ludique : 400 points pour un passage mesuré d’au moins une seconde, +300 avant le signal, jusqu’à +300 pour un temps utilisé équilibré (maximum entre 25 % et 85 % du budget initial ; progressif de 0 à 25 %, puis décroissant de 85 à 100 %). Chaque passage relancé après réinitialisation ou fin retire 100 points (maximum 200) ; pause/reprise ne compte pas comme un nouveau passage. Les reprises au-delà du budget initial retirent jusqu’à 300 points proportionnellement au dépassement. Ce jeu n’évalue ni la qualité du travail ni les humeurs ; les égalités partagent le rang, les passages non mesurés restent sans score. Le bilan présente le temps actif (pauses exclues), la moyenne, les passages avant le signal et la répartition des repères d’humeur. Chaque choix d’humeur conserve son baromètre et sa diapositive : les images et les personnes associées figurent dans le bilan, avec lecture GIF facultative. Les mêmes nombres sur différents baromètres n’ont pas forcément le même sens. Le temps après zéro n’est pas mesuré. Ce bilan concerne le tour courant d’aujourd’hui, pas un historique journalier ; résultats en mémoire uniquement, effacés au nouveau tour, en quittant la route ou au rechargement.

Chaque page indique son étape et l’action suivante. Les présences et les états prêts/terminés sont verts ; les absences et le temps écoulé sont rouges ; les informations incomplètes et les avertissements sont orange. Le minuteur passe à l’orange au seuil configuré, puis au rouge dans les dernières secondes (10 secondes maximum, ou la moitié du seuil). Les halos pulsent doucement uniquement pendant le décompte, jamais en pause ni avec la réduction des mouvements. Désactiver la préalerte désactive ces étapes avant zéro. À zéro, une notification urgente et un message persistant demandent de conclure et de passer la parole ; aucun passage automatique n’a lieu.

Ce sont de vraies routes Next.js, pas des vues à fragments d’URL. Les gardes attendent la restauration des données puis empêchent de sauter les prérequis. Modifier une présence ou une humeur invalide la session. Quitter la route du minuteur arrête son exécution ; la progression et le compte à rebours ne sont pas persistés. Le mélange garde la personne active après le démarrage, y compris en pause. Raccourcis : **Espace** démarrer/pause, **N** suivant, **R** réinitialiser, sans intercepter les contrôles natifs ou les dialogues.

Préserver les contrôles accessibles, le focus visible, les notifications en français, les listes paginées, les panneaux adaptés aux petits écrans et la réduction des mouvements (animations et GIF).

## Architecture

| Emplacement | Responsabilité |
| --- | --- |
| [src/app](src/app) | Routes, layout racine, métadonnées et états d’erreur ; les dossiers `_components` sont privés à leur route. |
| [src/components](src/components) | Composants partagés : cadre de l’application, dialogues, pagination, titres et onglets. |
| [src/hooks](src/hooks) | Comportements React : gardes de parcours, cycle de vie et actions du minuteur. |
| [src/providers](src/providers) | État partagé, persistance navigateur et notifications. |
| [src/lib](src/lib) | Helpers purs de validation, mélange, calcul du temps et normalisation du catalogue ; adaptateurs explicites de stockage et d’audio. |
| [src/types](src/types) | Contrats TypeScript du domaine. |
| [src/components/ui/styles.ts](src/components/ui/styles.ts) | Recettes Tailwind partagées : boutons, cartes, champs, badges et structure des routes. |
| [src/app/globals.css](src/app/globals.css) | Entrée Tailwind v4, tokens de marque, règles de base minimales et keyframes ; aucune feuille de styles de composants. |
| [postcss.config.mjs](postcss.config.mjs) | Intégration du plugin PostCSS Tailwind au build Next.js. |

Les APIs navigateur restent côté client et dans des effets/gestionnaires appropriés. Le compte à rebours utilise une échéance, pas un cumul de ticks. Les noms sont rendus comme texte React, jamais comme HTML. Palette Infomil : bleu **#205f9d**, orange **#ec8b23**, blanc ; le logo local est une recréation vectorielle.

Les mises en page, variantes d’état et points de rupture sont exprimés directement en utilitaires Tailwind dans les composants. Les anciennes feuilles de styles ont été supprimées, ainsi que les blocs UI morts et la dépendance directe Zod (qui reste une dépendance transitive des outils ESLint). Les styles calculés à l’exécution restent nécessaires pour les GIF superposés, l’anneau du minuteur et la progression. Les fichiers d’export, tests, sources d’images et HTML de secours sont utilisés et conservés.

## Ressources et déploiement

### Mode Google SVG à la demande (par défaut)

Le lecteur utilise désormais une liste de **888 URLs de présentations**, dans [src/lib/remote-mood-catalog.json](src/lib/remote-mood-catalog.json), indépendante de l’ancien corpus local. Il ne télécharge plus les PowerPoint et ne publie plus les images locales au démarrage/build. Seuls le logo, le secours HTML et un indicateur de mode sont publiés. Les sources existantes ne sont pas supprimées.

Un indicateur de chargement apparaît pendant la lecture du catalogue, des diapositives et de leur image. En cas d’échec ou de délai dépassé (45 à 50 secondes), le baromètre par défaut prend le relais : **1 = mauvaise humeur / énergie élevée ; 2 = mauvaise humeur / énergie basse ; 3 = bonne humeur / énergie basse ; 4 = bonne humeur / énergie élevée**. Ces repères concernent le baromètre par défaut, pas nécessairement les présentations externes.

À la sélection d’un baromètre, les routes Next.js lisent les identifiants de diapositives du lecteur public Google, puis demandent chaque image via l’export SVG de Google. Le navigateur affiche le SVG dans une image, jamais en HTML injecté. Les résultats réutilisent ces mêmes URLs. Un cache mémoire borné à 32 Mo conserve les réponses au maximum cinq minutes lors des accès ; aucun SVG ou PPTX n’est enregistré sur disque. Un hébergeur peut appliquer son propre cache HTTP.

**Aucun PowerPoint, autre ordinateur Windows, service de conversion ou clé API Google n’est nécessaire.** Sur Windows, [scripts/fetch-google-slide.ps1](scripts/fetch-google-slide.ps1) utilise le proxy système et ses identifiants Windows si nécessaire. Sur Linux et les plateformes comme Vercel, les routes utilisent directement HTTPS. L’accès Internet à Google est indispensable ; les présentations privées/refusées ne sont pas contournées. Les routes limitent les requêtes au catalogue, jamais à une URL libre. Le SVG est servi avec une politique sandbox et sans scripts.

**Limite : les SVG exportés sont statiques. Les GIF et animations PowerPoint ne sont pas préservés.** Les images matricielles intégrées restent matricielles même dans un SVG ; le format ne garantit pas un fichier plus petit. La première ouverture dépend du temps de réponse Google. Son export public n’est pas une API contractuelle : quotas, permissions ou changements du lecteur peuvent interrompre le service.

Commandes : `npm run mood:catalog` régénère la liste depuis le rapport existant sans télécharger les présentations ; l’option `-- -Refresh` relit les liens publics de Google Sites sans télécharger les PowerPoint. Après une modification, reconstruire/redéployer. Pour retrouver le mode local animé, définir `MOOD_LOCAL_ASSETS=1` dans l’environnement ou dans le fichier de configuration local ignoré par Git, puis relancer `npm run dev` ou reconstruire. Ce mode republie les ressources locales volumineuses. Ne définir aucune ancienne variable `MOOD_SERVICE_*` : le service séparé a été retiré.

### Ancien mode local (optionnel)

[scripts/prepare-assets.mjs](scripts/prepare-assets.mjs) s’exécute via **predev** et **prebuild**, ou explicitement avec `npm run assets`. Il génère [public](public) : logo, HTML de secours, catalogue JSON issu du [catalogue exporté](mood-meters/catalog.js) et images de [mood-meters/slides](mood-meters/slides). Les images et fichiers fixes sont publiés par **liens physiques** lorsque possible, sinon par copie. Ne modifiez pas les sorties générées ; les liens physiques peuvent partager le contenu avec leur source.

Conserver les sources racine [infomil-logo.svg](infomil-logo.svg) et [mood-meter.html](mood-meter.html), requises par la publication. **Ne jamais publier les PowerPoint sources**, rapports ou métadonnées internes dans le répertoire public. Les [scripts](scripts) de téléchargement/export et [mood-meters](mood-meters) restent indépendants de React.

Le corpus comprend **888 présentations, environ 9,6 Go** : vérifier le budget de stockage, le nombre de fichiers, les limites d’upload/build et la bande passante de l’hébergeur avant de déployer. Les liens physiques économisent de l’espace local, pas le budget des ressources déployées. Ne supposez pas qu’un hébergement gratuit peut accueillir l’ensemble.

L’[exporteur PowerPoint existant](scripts/export-mood-meters.ps1) est inchangé : rendu Windows/PowerPoint, fonds PNG et GIF superposés avec leur géométrie. Un export reconstruit les sorties générées ; les sources restent intactes. Après tout nouvel export, **relancer `npm run assets`, reconstruire et redéployer**. Le lecteur React utilise le catalogue publié, et le [baromètre HTML](mood-meter.html) sert de secours. Utiliser uniquement les ressources dont les droits autorisent l’utilisation et la redistribution.

## Persistance et migration

La clé localStorage **`standup.team.v2`** conserve noms, présences, dernières humeurs/dates, ordre de session et préférences. La lecture normalise les données et migre l’ancienne clé **`standup.preferences.v1`** lorsque la clé actuelle est absente. Si le stockage est indisponible, le parcours fonctionne en mémoire avec un avertissement. Aucun compte ou serveur d’équipe ne synchronise ces données.

La reprise automatique exige **le même navigateur et la même origine** (protocole, hôte et port). Les données de l’ancien site servi sur la même origine peuvent être reprises ; celles ouvertes sous `file://` **ne sont pas transférées automatiquement** vers localhost ou un domaine déployé. Changer d’origine nécessite une migration manuelle. Effacer les données du site supprime les préférences enregistrées.

## Validation

La migration a été vérifiée avec `npm run lint`, `npm run typecheck`, `npm run test` (7 tests) et `npm run build`.

Le [scénario navigateur](tests/browser_smoke.py) utilise Python Playwright avec Chromium. Avec un serveur lancé sur http://localhost:3000, exécuter `python tests/browser_smoke.py`. Il vérifie le parcours et les gardes, les noms sûrs, les présences et humeurs, le catalogue de 888 baromètres, les GIF/pause, le minuteur sans passage automatique, le rechargement, la suppression confirmée/annulée, la réduction des mouvements et le stockage indisponible. La pagination avec 40 personnes a été vérifiée sur les trois routes en 320×568, 390×844, 768×1024, 1024×576, 1366×768 et 1920×1080, sans débordement. Les dépendances Python de cette vérification optionnelle ne sont pas installées par npm.

Ces vérifications locales ne valident pas les quotas ou le déploiement de l’hébergeur. Après une modification, relancer les contrôles concernés.