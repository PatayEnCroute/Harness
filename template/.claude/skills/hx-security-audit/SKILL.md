---
name: hx-security-audit
description: Audit de sécurité de toute la solution, hors du workflow de développement. Inventorie les dépendances et leurs versions installées, cherche les CVE qui les touchent, puis cherche les angles d'injection SQL dans le code. Lecture seule. À lancer explicitement, à la demande ou à intervalle régulier, pas sur un diff (pour un diff, c'est hx-review).
argument-hint: "[composant ou dossier, par défaut toute la solution]"
disable-model-invocation: true
allowed-tools: WebSearch, WebFetch
---

# /hx-security-audit : audit de sécurité de la solution

But : dire à l'utilisateur ce qui est **réellement** exploitable aujourd'hui dans la solution, preuves à l'appui.

## Le résultat attendu n'est pas un nombre de constats

- **« Aucun constat » est un résultat valide**, et souvent le bon. L'audit réussit quand chaque affirmation du rapport est vraie, pas quand il trouve quelque chose.
- **Qualité plutôt que quantité** : un constat prouvé vaut mieux que dix plausibles. Pas de preuve, pas de constat.
- Ne gonfle pas le rapport : pas de bonnes pratiques génériques, pas de « pourrait être vulnérable si… », pas de CVE recopiée sans avoir vérifié la version. Un doute non levé va dans **À vérifier**, jamais dans les constats.
- Ce qui rend « aucun constat » crédible, c'est la **couverture** : dis ce que tu as examiné, comment, et ce que tu n'as pas pu examiner.

## Règles

- **Lecture seule** : tu ne modifies ni code, ni manifeste, ni lockfile. Une correction passe ensuite par le workflow normal (`hx-triage`).
- **Version installée, pas version demandée** : le lockfile fait foi. Sans lockfile, la version n'est pas résolue : dis-le, ne suppose pas la pire ni la meilleure.
- **Source citée** pour chaque CVE : identifiant (`CVE-…`, `GHSA-…`) et lien vers l'avis (osv.dev, GitHub Advisory, NVD ou l'avis de l'éditeur).
- **Aucun secret** recopié dans le rapport : cite le fichier et la ligne, pas la valeur.

## Étapes

1. **Périmètre** : `$ARGUMENTS`, sinon toute la solution. Les composants et leur stack sont dans `.harness/config.json` (`components`) ; à défaut, `node .harness/hx.mjs detect --json`.

2. **Inventaire des dépendances**, par composant :
   - manifestes (`package.json`, `*.csproj`, `Directory.Packages.props`, `pyproject.toml`, `requirements*.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle*`…) et lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `packages.lock.json`, `uv.lock`, `poetry.lock`, `go.sum`, `Cargo.lock`…) ; `git ls-files` les liste ;
   - pour chaque dépendance : nom, version installée, directe ou transitive, exécution ou développement seulement ;
   - écarte ce qui n'est pas livré (dossiers de fixtures, exemples) en le disant.

3. **Recherche de CVE** :
   - **Outil d'audit de l'écosystème**, s'il est disponible : `npm audit --json`, `pnpm audit --json`, `dotnet list package --vulnerable --include-transitive`, `pip-audit`, `govulncheck ./...`, `cargo audit`… Il couvre les transitives. S'il manque ou échoue (réseau, outil absent), dis-le et passe à la suite.
   - **Recherche** (WebSearch, WebFetch) : pour chaque dépendance directe d'exécution, et pour chaque candidat remonté par l'outil, consulte l'avis sur osv.dev, GitHub Advisory ou NVD. Commence par les dépendances exposées : framework web, parseurs et sérialiseurs, ORM et pilotes de base, authentification, cryptographie, traitement de fichiers.
   - **Confirme chaque candidat** avant d'en faire un constat :
     1. la version installée est dans la plage affectée de l'avis (lis la plage, pas le titre) ;
     2. la fonction, l'option ou le cas d'usage vulnérable est utilisé par la solution, ou l'atteignabilité ne peut pas être exclue (dis lequel des deux) ;
     3. la version corrigée la plus proche existe, et le saut est mineur ou majeur.
   - Une CVE sur une dépendance de développement seulement, ou sur une fonction que la solution n'appelle pas, n'est pas un constat : mentionne-la dans **Écartés**, avec la raison en une ligne.

4. **Injection SQL** :
   - **Repère les points d'exécution SQL** (*sinks*) de chaque stack : la liste est dans [`references/sql-sinks.md`](references/sql-sinks.md). Cherche aussi le SQL dynamique dans les fichiers `.sql` (procédures stockées, `EXEC`, `sp_executesql`, `EXECUTE format(…)`). Sur une grosse solution, un `hx-explorer` par composant peut faire ce repérage ; le jugement reste le tien.
   - **Écarte vite les sinks sûrs** : requête constante, paramètres liés, interpolation que l'ORM paramètre lui-même (voir la référence).
   - **Pour chaque sink restant**, remonte la valeur concaténée jusqu'à sa source. C'est un constat seulement s'il existe un chemin d'une **entrée non fiable** (requête HTTP, argument de commande, fichier importé, message de file, valeur relue en base qui venait d'un utilisateur) jusqu'au sink, **sans** paramètre lié ni liste blanche.
   - **Identifiants dynamiques** (nom de colonne ou de table, sens de tri, `ORDER BY`) : ils ne se paramètrent pas. Sûrs seulement s'ils passent par une liste blanche fermée.
   - Ne compte pas comme injection : un `LIKE` dont les jokers ne sont pas échappés (au plus un mineur fonctionnel), une requête construite à partir de constantes du code.

5. **Rapport**, dernier message de l'audit.

## Rapport

```markdown
## Audit de sécurité : <solution ou périmètre> · <date>

Résultat : <N constats> | Aucun constat exploitable

### Couverture
- Dépendances : <n> composants, <n> directes, <n> transitives ; outils d'audit : <lancés, ou absents et pourquoi> ; avis consultés : <sources>
- Injection SQL : <n> sinks repérés, <n> sûrs d'emblée, <n> remontés jusqu'à leur source
- Non couvert : <ce qui n'a pas pu être examiné, et pourquoi>

### Constats
| Gravité | Où | Catégorie | Preuve | Correction |
|---|---|---|---|---|
| bloquant | paquet@1.2.3 (composant) | CVE-AAAA-NNNN | version dans la plage < 1.2.5 ; fonction X appelée dans chemin:ligne | passer à 1.2.5 |
| important | chemin:ligne | injection SQL | source chemin:ligne → sink chemin:ligne, concaténation sans paramètre | requête paramétrée |

### À vérifier
- <doute non levé, et ce qui le lèverait>

### Écartés
- <CVE ou sink> : <raison en une ligne>

### Prochaine étape
<un change par constat via hx-triage, en commençant par les bloquants> | Rien à faire
```

Gravité, même échelle que `hx-security-reviewer` : **bloquant** si exploitable tel quel ; **important** si un scénario d'exploitation plausible existe ; **mineur** pour un durcissement sans exploitation démontrée. Les sections vides restent, avec « Aucun ».
