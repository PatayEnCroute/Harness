---
name: hx-update
description: Met à jour le harness du projet vers la dernière version du template (copier update), résout les conflits avec l'utilisateur en choix cliquables, vérifie et commite, sans aucune commande à taper. À utiliser quand l'utilisateur demande de mettre à jour le harness, ou quand hx doctor signale une version en retard.
argument-hint: "[version, par défaut la dernière]"
---

# /hx-update : mettre à jour le harness

L'utilisateur n'a rien à taper : tu lances chaque commande toi-même.

## Étapes

1. **Arbre propre** : `git status --porcelain` doit être vide, car Copier fusionne sur les fichiers suivis. Sinon, montre les fichiers et demande, en choix cliquable (outil AskUserQuestion) : « Commiter ces changements d'abord » ou « Arrêter ». Ne mets jamais de côté (`stash`) ni ne jette rien sans cet accord.
2. **Retard** : `node .harness/hx.mjs doctor`. La ligne de version dit la version installée et la dernière. Déjà à jour, sans version demandée en argument : dis-le et arrête-toi.
3. **uv** : `uvx --version`. Absent : propose de l'installer pour l'utilisateur (méthode officielle de https://docs.astral.sh/uv/ pour son système), et attends son accord.
4. **Mise à jour** : `uvx copier@9.19.1 update --trust --defaults`, avec `--vcs-ref <version>` si une version est demandée. `--defaults` garde les réponses déjà données et prend la valeur par défaut des nouvelles questions : cite-les à l'utilisateur à la fin. Copier 9.19.1 est la version testée et le minimum exigé par le template.
5. **Conflits** : `node .harness/hx.mjs doctor` liste les marqueurs `<<<<<<<` et les fichiers `.rej`. Pour chacun :
   - **fichier générique** (`CLAUDE.md`, `.claude/` hors `settings.local.json`, `.harness/hx.mjs`, `.harness/hooks.mjs`, `openspec/config.yaml`, workflow CI) : garde la version du template, sauf personnalisation voulue ;
   - **personnalisation visible** dans `git log` du fichier, ou fichier spécifique (`.harness/config.json`, `.harness/project.md`) : demande en choix cliquable « Garder la version du template », « Garder ma version » ou « Fusionner les deux (Recommandé) », avec les deux extraits en une ligne chacun ;
   - un `.rej` : applique à la main la partie retenue, puis supprime le fichier.
6. **Vérifier** : `node .harness/hx.mjs doctor` sans erreur, puis `node .harness/hx.mjs check`. Rouge à cause de la mise à jour : corrige si c'est un conflit mal résolu ; sinon, arrête-toi et expose l'échec.
7. **Commit** : `git add -A && git commit -m "harness : mise à jour <version>"`, un seul commit.
8. **Résumé** pour l'utilisateur : version avant et après, fichiers modifiés (`git diff --stat HEAD~1`), conflits et leur résolution, nouvelles questions du template prises par défaut. Rien à pousser sans sa demande.

## Pièges

| Pensée | Réalité |
|---|---|
| « Je donne la commande à l'utilisateur » | Il travaille dans Desktop : tu la lances toi-même |
| « J'édite hx.mjs pour résoudre le conflit à ma façon » | Fichier géré par Copier : version du template |
| « Je résous les conflits en silence » | Toute personnalisation perdue se décide avec l'utilisateur |
