# Glossaire en mots simples

Une définition par terme, la même à chaque explication. L'analogie est facultative : ne l'utilise que si elle aide.

## Le code et son historique

| Terme | En mots simples | Analogie |
|---|---|---|
| **Dépôt** (*repository*) | Le dossier du projet, avec tout l'historique de ses versions | Un classeur qui garde chaque version de chaque page |
| **Commit** | Un enregistrement daté d'un ensemble de modifications, avec un message qui dit pourquoi | Une sauvegarde nommée, à laquelle on peut revenir |
| **Branche** | Une ligne de travail parallèle : on y modifie sans toucher la version principale | Un brouillon à côté du document officiel |
| **Worktree** | Un second dossier du même projet, ouvert sur une autre branche : deux travaux avancent sans se gêner | Deux bureaux, un dossier par bureau |
| **Merge** (fusion) | Intégrer le travail d'une branche dans une autre | Recopier le brouillon validé dans le document officiel |
| **Conflit** | Deux modifications du même endroit, que l'outil ne sait pas fusionner seul : un humain choisit | Deux personnes ont corrigé la même phrase différemment |
| **PR** (*pull request*) | La demande d'intégrer une branche, avec les modifications à relire et les contrôles automatiques | Un document soumis à validation avant publication |
| **Diff** | La liste exacte des lignes ajoutées, retirées ou modifiées | Le mode « suivi des modifications » d'un traitement de texte |
| **Dépendance** | Un code écrit par d'autres, que le projet utilise | Une pièce achetée chez un fournisseur |
| **CVE** | Une faille de sécurité connue et publiée, avec un numéro | Un rappel de produit défectueux |

## La qualité

| Terme | En mots simples | Analogie |
|---|---|---|
| **Test** | Un petit programme qui vérifie automatiquement qu'une partie du code fait ce qu'on attend | Une check-list rejouée à chaque modification |
| **TDD** (test d'abord) | Écrire le test avant le code : on le voit échouer, puis on écrit juste le code qui le fait passer | Écrire la question de l'examen avant le cours |
| **Régression** | Quelque chose qui marchait et ne marche plus après une modification | Réparer le robinet et casser la douche |
| **Lint** | Un outil qui relit le code et signale les fautes de forme et les erreurs probables | Un correcteur orthographique pour le code |
| **Refactor** | Réorganiser le code sans changer ce qu'il fait | Ranger un placard sans rien jeter |
| **CI** (intégration continue) | Des contrôles lancés automatiquement sur un serveur à chaque modification envoyée | Un contrôle qualité en sortie d'usine |
| **Revue** | Une relecture du code par quelqu'un d'autre que son auteur | Relire la lettre d'un collègue avant envoi |

## Le harness

| Terme | En mots simples | Analogie |
|---|---|---|
| **Harness** | L'ensemble des règles, procédures et contrôles posés autour de l'agent pour qu'il travaille de façon fiable | Le cahier des charges et les garde-fous d'un chantier |
| **Skill** | Une procédure écrite que l'agent suit pour un type de tâche (`hx-tdd`, `hx-review`…) | Une fiche réflexe |
| **Agent, sous-agent** | Un assistant lancé pour une seule tâche, avec un contexte neuf, qui rend un résultat | Un spécialiste appelé pour une mission précise |
| **Rule** | Une convention que l'agent applique quand il touche certains fichiers | Le règlement intérieur d'un atelier |
| **Hook** | Un contrôle automatique déclenché à un moment précis (avant une écriture, en fin de tour), sans que l'agent le décide | Un détecteur de fumée : il se déclenche seul |
| **Spec** (OpenSpec) | La description écrite de ce que le logiciel doit faire, sous forme de scénarios | Le cahier des charges |
| **Scénario** | Un exemple précis de comportement attendu : « quand…, alors… » | Un cas d'usage raconté |
| **Change** | Un dossier qui décrit une évolution avant de la coder : pourquoi, scénarios, tâches | Une demande de travaux détaillée |
| **Piste S, M, L** | La taille du processus, choisie selon le risque : S petit correctif, M nouveau comportement, L décision lourde ou difficile à défaire | Petite réparation, rénovation, extension de la maison |
| **Porte de cadrage** | Le moment où l'utilisateur relit et valide la spec avant que l'agent code seul | La signature du devis avant le début des travaux |
| **Run** | La phase où l'agent code, vérifie et fait relire seul, après la porte, jusqu'au rapport | Les travaux, pendant que le client est ailleurs |
| **Mineur** | Un défaut relevé en revue, sans gravité, que l'utilisateur choisit de corriger ou non | Une retouche de finition |
| **Archive** | La dernière étape d'un change : sa spec devient la référence du projet | Le plan mis à jour après travaux |
| **ADR** | Une note qui garde la trace d'une décision importante : le besoin, les options, le choix et son prix | Le compte rendu d'une réunion de décision |
| **`hx check`** | La commande qui lance tous les contrôles du projet ; vert = preuve que c'est terminé | Le contrôle technique avant de rendre la voiture |
