# Xiao Swarm Attack — Game Design Reference

> Document de synthèse du projet au 27 septembre 2026.  
> Ce fichier décrit le jeu, ses systèmes et les décisions de design connues.  
> Les détails techniques d’implémentation du système de mouvement de foule sont volontairement exclus.

---

## 1. Concept général

**Xiao Swarm Attack** est un jeu d’action / survie destiné principalement à **Poki**, développé en **Solar2D / Lua**.

Le concept est inspiré notamment de **Red Raid**, avec une boucle qui emprunte aussi au genre **Vampire Survivors-like** pour la progression pendant une partie.

Le joueur ne contrôle pas un héros unique : il dirige **une escouade entière de soldats** qui se déplace comme un groupe cohérent et grossit au cours du run.

Le cœur du jeu repose sur :

- le déplacement d’une squad entière ;
- le combat automatique / semi-automatique contre des vagues d’aliens ;
- la récupération d’XP ;
- des level-ups avec choix d’upgrades ;
- le recrutement de nouvelles unités directement sur le terrain ;
- la construction progressive d’une composition de squad ;
- la survie face à des vagues de plus en plus dangereuses.

Le jeu vise des parties immédiatement compréhensibles, accessibles au public Poki, avec suffisamment de décisions pendant le run pour créer de la variété.

---

## 2. Plateforme et contraintes

### Plateforme principale

- **Poki / HTML5**
- Moteur : **Solar2D**
- Langage : **Lua**
- Contrôle principal pensé pour **souris / drag**
- Le prototype doit rester performant avec une quantité importante d’unités visibles.

### Échelle envisagée

Ordres de grandeur prévus :

- **4 soldats alliés au départ**
- jusqu’à environ **25 soldats alliés**
- jusqu’à environ **75 ennemis simultanément**
- environ **100 entités mobiles** dans les situations chargées

Ces chiffres servent de cible générale pour le ressenti et les performances.

---

## 3. Vue et présentation

Le jeu utilise une vue **top-down légèrement inclinée**, plutôt qu’une vue parfaitement verticale.

L’angle visuel retenu est approximativement de **60–70°**, afin de :

- conserver une lecture claire du terrain ;
- mieux montrer les soldats et les aliens ;
- donner davantage de volume aux personnages ;
- garder une lecture adaptée à un jeu d’action rapide.

La map est volontairement **petite et compacte**.

Elle peut contenir quelques obstacles et éléments de décor, mais le jeu n’est pas conçu autour de grands niveaux labyrinthiques.

---

## 4. Contrôle du joueur

Le joueur contrôle **toute la squad simultanément**.

Le contrôle principal repose sur un **joystick virtuel piloté à la souris / au drag**.

L’intention est que le joueur ait la sensation de diriger **une seule entité vivante composée de plusieurs soldats**, plutôt qu’une collection de personnages indépendants.

La réponse au contrôle doit être immédiate, tandis que les soldats peuvent avoir un léger retard ou une légère inertie visuelle afin que la formation paraisse organique.

Le groupe peut :

- se comprimer ;
- s’étirer légèrement ;
- contourner des obstacles ;
- être temporairement désorganisé ;
- se reformer naturellement.

Une unité temporairement éloignée du groupe doit essayer de revenir vers la squad.

Les unités réellement isolées ou coincées ne doivent pas faire dériver inutilement la caméra loin du groupe principal.

---

## 5. Caméra

La caméra suit principalement **la masse utile de la squad**.

Objectif :

- garder le groupe principal au centre de l’action ;
- éviter qu’un soldat isolé derrière un obstacle déplace la caméra ;
- conserver une lecture stable pendant les combats.

Les soldats anormalement éloignés du cœur de l’escouade peuvent donc être ignorés pour déterminer le cadrage.

---

## 6. Formation de la squad

La formation doit paraître **compacte mais souple**.

Elle ne doit pas ressembler à :

- une grille militaire rigide ;
- un cercle géométrique parfait ;
- une chaîne de soldats indépendants.

Le résultat recherché est plutôt une **boule / nuée organique de soldats**.

La formation doit rester visuellement satisfaisante quelle que soit la taille de la squad, notamment lorsque le nombre d’unités ne remplit pas parfaitement une couronne extérieure.

Les soldats doivent disposer de suffisamment d’espace entre eux pour éviter les superpositions visuelles permanentes.

Lorsqu’un soldat meurt ou qu’une nouvelle recrue rejoint la squad, le groupe doit pouvoir se réorganiser sans provoquer de grands croisements artificiels entre soldats.

---

## 7. Départ d’un run

Le joueur commence toujours avec :

**4 soldats.**

La composition de départ n’est pas totalement aléatoire.

Elle est tirée parmi plusieurs **compositions prédéfinies et viables**, afin d’éviter qu’un mauvais tirage rende les premières secondes inutilement difficiles.

Exemples envisagés :

- Medic + Marine/Soldier + Flammeur + autre unité ;
- Medic + Marine/Soldier + Marine/Soldier + autre unité.

Le principe est donc :

**randomisation contrainte plutôt que randomisation pure.**

Cela doit créer de la variété entre les runs tout en garantissant un départ raisonnablement jouable.

---

## 8. Classes de soldats

Six classes de soldats ont été définies.

### Soldier / Marine

Unité de base de la squad.

Rôle :

- dégâts réguliers ;
- unité polyvalente ;
- constitue une partie importante de la puissance de feu standard.

Le nom définitif entre **Soldier** et **Marine** reste à harmoniser dans les documents du projet.

### Medic

Unité de soutien.

Capacité connue :

- peut **soigner la squad lorsqu’elle est à l’arrêt**.

Cela crée une décision de positionnement : continuer à se déplacer pour éviter le danger ou accepter de s’immobiliser pour récupérer.

### Flammeur

Unité offensive spécialisée.

Particularité connue :

- **explose lorsqu’il meurt**.

Sa mort peut donc avoir une valeur tactique en infligeant des dégâts aux ennemis proches.

### Sniper

Unité spécialisée dans les tirs à longue portée / dégâts ciblés.

Son identité exacte et ses valeurs restent à équilibrer.

### Bombardier

Unité orientée vers les attaques explosives / de zone.

Son comportement précis reste à finaliser.

### Tank

Unité lourde.

Rôle général :

- meilleure résistance ;
- présence physique plus importante au sein de la squad ;
- capacité à encaisser davantage que les autres classes.

---

## 9. Orientation et combat des soldats

Le déplacement et l’orientation visuelle d’un soldat sont indépendants.

Un soldat peut donc :

- se déplacer dans une direction ;
- regarder dans une autre ;
- tirer sur une cible située derrière ou sur le côté.

Le sprite du soldat doit prioritairement s’orienter vers sa **cible de combat**.

Lorsqu’aucune cible n’est disponible, l’orientation peut revenir vers la direction de déplacement ou la dernière direction de combat.

Cette séparation entre mouvement et visée permet à la squad de continuer à manœuvrer pendant qu’elle tire.

---

## 10. Ennemis

Les ennemis sont principalement des **aliens / créatures extraterrestres**.

La direction visuelle explorée comprend notamment des créatures simples et lisibles, avec une apparence pouvant aller vers des formes de slime ou de petites créatures/insectes extraterrestres.

Plusieurs archétypes d’ennemis sont prévus afin que les vagues n’aient pas toutes le même comportement.

Exemples conceptuels :

### Slime / petite créature

- petite ;
- relativement compacte ;
- attaque en groupe ;
- donne une impression de nuée dense.

### Brute / gros alien

- plus grand ;
- plus lent ;
- plus lourd ;
- davantage capable de perturber physiquement la squad.

### Runner

- petit ;
- rapide ;
- léger ;
- conçu pour mettre rapidement la pression sur le joueur.

Les espèces ennemies doivent pouvoir avoir des comportements distincts sans nécessiter un système de jeu complètement différent pour chacune.

---

## 11. Ciblage ennemi

Par défaut, les ennemis cherchent principalement à attaquer les soldats alliés proches.

Le design prévoit néanmoins la possibilité d’avoir des ennemis spécialisés capables de préférer certaines cibles, par exemple :

- le soldat le plus proche ;
- un Medic ;
- un soldat faible ;
- un Tank ;
- le centre de la squad.

Cela permet de créer des types d’ennemis avec des rôles tactiques différents.

---

## 12. Obstacles

La map peut contenir des obstacles simples.

Leur rôle est principalement de :

- casser légèrement les trajectoires ;
- obliger le joueur à manœuvrer ;
- déformer temporairement la squad ;
- créer des situations de combat plus intéressantes.

Le jeu n’est pas pensé comme un jeu de navigation complexe.

Quelques soldats peuvent occasionnellement être séparés ou temporairement coincés sans que cela invalide le concept, tant que le groupe principal reste agréable à contrôler.

---

## 13. Recrutement pendant le run

Les ennemis peuvent faire tomber directement des **recrues**.

Lorsqu’une recrue est récupérée :

- une nouvelle unité rejoint directement la squad ;
- il n’y a pas de menu de choix intermédiaire obligatoire.

Le **type d’unité droppée** dépend de la composition actuelle de l’escouade.

L’objectif est d’éviter une distribution totalement aveugle et de pouvoir influencer la composition du groupe de manière cohérente.

Le **taux de drop des recrues** dépend également du nombre actuel de soldats dans la squad.

Ainsi, le système peut :

- aider davantage une petite squad ;
- ralentir le recrutement lorsque la squad devient déjà importante.

---

## 14. Capacité maximale de squad

La squad possède une **capacité maximale**.

Le joueur ne peut donc pas accumuler indéfiniment des soldats.

Cette capacité maximale peut être augmentée pendant le run grâce à une upgrade.

Une upgrade envisagée est :

**Max Squad +3**

Cela fait de la taille maximale de l’armée une composante de la progression du build.

---

## 15. XP et level-up

Les ennemis peuvent générer des **cristaux d’XP**, dans un fonctionnement inspiré des Vampire Survivors-like.

Le joueur récupère l’XP pendant le combat.

Une fois un seuil atteint :

- le joueur gagne un niveau ;
- une sélection d’upgrades lui est proposée ;
- l’upgrade choisie modifie la puissance ou les propriétés de la squad pour le reste du run.

Le système de progression est principalement **in-run**.

---

## 16. Upgrades connues

Plusieurs upgrades ont déjà été envisagées.

### Upgrades générales

- **Damage +10 %**
- **Fire Rate +10 %**
- **Max Squad +3**
- **Health +10 %**

### Upgrades / bonus conditionnels ou liés aux classes

Exemples envisagés :

- les gunners immobiles obtiennent **+20 % d’Attack Speed** ;
- bonus d’Attack Speed lorsque la squad ou l’unité passe sous **50 % HP** ;
- le Medic peut fournir un **boost de vitesse lorsque les HP passent sous 20 %**.

Les valeurs sont des valeurs de design actuelles et restent sujettes à équilibrage.

L’objectif est de créer des choix qui ne soient pas uniquement des augmentations linéaires de statistiques, mais qui puissent modifier la manière de jouer.

---

## 17. Progression hors run

À ce stade du concept :

**pas de méta-progression hors run prévue.**

Le cœur de la progression doit se produire pendant la partie :

- recrutement ;
- composition de squad ;
- XP ;
- upgrades ;
- augmentation de capacité ;
- montée en puissance.

Cette décision permet de garder un jeu Poki immédiatement accessible et centré sur la rejouabilité du run.

---

## 18. Vagues

Les ennemis arrivent sous forme de **vagues scriptées**.

Le système doit permettre de contrôler :

- le rythme d’apparition ;
- le nombre d’ennemis ;
- les types d’ennemis ;
- les mélanges d’archétypes ;
- la difficulté progressive.

Le but est de construire une courbe de difficulté maîtrisée plutôt qu’une simple génération aléatoire continue.

Les vagues peuvent progressivement introduire :

1. des ennemis simples ;
2. des groupes plus nombreux ;
3. des ennemis rapides ;
4. des unités lourdes ;
5. des compositions mixtes ;
6. des attaques ou ennemis spéciaux.

---

## 19. Knockback et attaques spéciales

Le contact normal avec les ennemis ne doit pas transformer la squad en groupe constamment projeté dans tous les sens.

En revanche, certaines attaques spéciales peuvent réellement désorganiser la formation.

Exemples :

- charge ;
- explosion ;
- slam de boss ;
- projectile spécial.

Après ce type d’impact, la squad doit naturellement retrouver sa cohésion.

Le knockback est donc un outil de gameplay ponctuel, destiné à créer des moments de danger et de désorganisation.

---

## 20. Boucle de gameplay

La boucle générale envisagée est :

1. Le joueur commence avec 4 soldats.
2. Il déplace la squad dans une petite arène.
3. Des vagues d’aliens apparaissent.
4. La squad attaque les ennemis.
5. Les ennemis donnent de l’XP et peuvent donner des recrues.
6. Le joueur récupère les cristaux d’XP.
7. Il monte de niveau.
8. Il choisit une upgrade.
9. Sa squad grossit et se spécialise.
10. Les vagues deviennent plus difficiles.
11. Le joueur tente de survivre et de construire une squad efficace jusqu’à la fin du run.

Le plaisir doit venir simultanément de :

- la sensation de contrôler une foule ;
- la croissance visuelle de la squad ;
- la puissance croissante des tirs ;
- la construction d’un build ;
- la gestion du positionnement ;
- la pression créée par les vagues.

---

## 21. Principes de game feel

Le jeu doit donner une sensation de **swarm contrôlé**, mais pas chaotique.

Principes importants :

- contrôle immédiatement réactif ;
- squad lisible malgré le nombre d’unités ;
- soldats légèrement organiques dans leurs déplacements ;
- formation capable de se déformer ;
- retour naturel à un groupe compact ;
- impacts et knockbacks visibles ;
- croissance de la squad très perceptible ;
- ennemis suffisamment nombreux pour produire un effet de horde.

Le joueur doit sentir qu’il contrôle **une armée vivante**, sans avoir à micro-manager chaque unité.

---

## 22. Lisibilité

Avec potentiellement une centaine d’entités mobiles, la lisibilité est une contrainte majeure.

Les éléments importants doivent rester facilement identifiables :

- soldats alliés ;
- classes particulières ;
- ennemis ;
- gros ennemis ;
- projectiles ;
- cristaux d’XP ;
- recrues ;
- obstacles ;
- dangers spéciaux.

Les classes de soldats devront avoir des silhouettes ou signes visuels suffisamment distincts pour que le joueur comprenne rapidement la composition de sa squad.

---

## 23. Direction artistique

La direction artistique générale recherchée est adaptée à Poki :

- accessible ;
- colorée ;
- lisible ;
- immédiatement compréhensible ;
- plutôt cartoon / casual que réaliste.

Pour l’icône du jeu, plusieurs directions ont été explorées :

- suppression du texte ;
- soldats / personnage principal au premier plan ;
- ennemis extraterrestres ;
- aliens plus proches de petites créatures ou insectes kawaii que de personnages humanoïdes ;
- environnement de **planète désertique violette** ;
- composition carrée adaptée à une icône Poki.

L’identité visuelle exacte du jeu reste susceptible d’évoluer.

---

## 24. Identité Xiao Games

Le jeu appartient au label / univers de développement **xiao games**.

Une stratégie de naming utilisant le préfixe **“xiao”** est envisagée sur plusieurs projets.

Le nom de travail actuel est :

**Xiao Swarm Attack**

Le titre pourra encore être optimisé selon le positionnement final et les besoins de découvrabilité sur Poki.

---

## 25. Positionnement Poki

Le jeu est pensé dès le départ pour le public **Poki**.

Parmi les catégories Poki existantes qui peuvent correspondre au projet, les plus naturellement compatibles semblent être :

- **Action Games**
- **Shooting Games**
- **Survival Games**
- **Strategy Games**
- **War Games**
- **Monster Games**
- potentiellement **Mouse Games**

La catégorie finale devra surtout être choisie en fonction du gameplay présenté dans le build de test et de l’audience que l’on souhaite mesurer.

---

## 26. Premier playtest Poki

Un premier playtest a déjà été réalisé sur un prototype.

État du prototype lors de ce test :

- direction artistique encore très rudimentaire ;
- prototype visuellement peu travaillé ;
- difficulté élevée ;
- absence de tutoriel ;
- gameplay encore à un stade précoce.

Les résultats de ce test doivent donc être interprétés comme ceux d’une **validation très amont du concept**, et non comme une mesure du potentiel d’une version correctement onboardée et polishée.

Les prochains tests doivent notamment permettre d’isoler l’impact de :

- la difficulté ;
- l’onboarding ;
- la compréhension immédiate du contrôle ;
- la lisibilité du combat ;
- la progression pendant les premières minutes ;
- la qualité visuelle.

---

## 27. Tutoriel / onboarding

Le premier prototype testé ne comportait **pas de tutoriel**.

Pour une version Poki plus représentative, le joueur doit comprendre très rapidement :

- qu’il contrôle toute la squad ;
- comment déplacer le groupe ;
- que les soldats attaquent les ennemis ;
- qu’il faut récupérer l’XP ;
- que les recrues augmentent la squad ;
- que les level-ups donnent des améliorations.

L’onboarding doit être très court et idéalement intégré directement aux premières secondes de gameplay.

---

## 28. Difficulté

Le premier prototype était considéré comme **assez difficile**.

La difficulté doit être retravaillée pour que les premières secondes servent davantage à :

- comprendre le contrôle ;
- observer les tirs ;
- récupérer les premières récompenses ;
- voir la squad grossir ;
- obtenir rapidement un premier level-up.

La pression peut ensuite augmenter progressivement grâce aux vagues scriptées.

---

## 29. Contenu encore à définir

Plusieurs éléments ne sont pas encore suffisamment arrêtés pour être considérés comme des spécifications définitives :

- durée cible exacte d’un run ;
- condition finale de victoire ;
- bosses et leur fréquence ;
- nombre total d’ennemis / espèces ;
- statistiques précises des classes ;
- armes exactes de chaque classe ;
- comportement précis du Sniper ;
- comportement précis du Bombardier ;
- système de HP global ou individuel à finaliser ;
- nombre de choix proposés à chaque level-up ;
- rareté éventuelle des upgrades ;
- système exact de collecte de l’XP ;
- règles précises de spawn des recrues ;
- économie éventuelle ;
- monétisation exacte ;
- scoring ;
- leaderboard éventuel ;
- achievements éventuels ;
- audio et feedback haptique/visuel ;
- durée et structure complète du FTU ;
- nom commercial définitif.

---

## 30. Priorités de développement produit

L’ordre logique actuel du projet est :

### Phase 1 — Valider le contrôle de la squad

Obtenir une squad agréable à contrôler et visuellement convaincante.

### Phase 2 — Valider la pression ennemie

Ajouter une horde d’ennemis capable de créer une vraie sensation de survie.

### Phase 3 — Combat

Faire fonctionner les classes, les attaques et les interactions de base.

### Phase 4 — Progression du run

Ajouter :

- XP ;
- level-ups ;
- upgrades ;
- recrutement ;
- capacité de squad.

### Phase 5 — Waves et balancing

Créer une montée en difficulté structurée.

### Phase 6 — Onboarding et polish Poki

Améliorer :

- tutoriel ;
- compréhension ;
- feedback ;
- UI ;
- DA ;
- difficulté initiale.

### Phase 7 — Playtests

Mesurer notamment :

- compréhension du jeu ;
- rétention dans les premières minutes ;
- Player Fit ;
- durée de session ;
- abandon pendant le FTU ;
- impact des changements de difficulté et de progression.

---

## 31. Vision synthétique

**Xiao Swarm Attack** doit être un jeu d’action casual où le joueur commence avec une petite équipe de quatre soldats et termine potentiellement à la tête d’une grosse escouade combattant une horde d’aliens.

La promesse visuelle et ludique est la transformation :

**4 soldats fragiles → une squad massive et spécialisée.**

Le jeu doit rester simple à contrôler :

**un seul drag contrôle toute l’armée.**

La profondeur vient ensuite de :

- la composition de l’escouade ;
- les classes ;
- les recrutements ;
- les upgrades ;
- le positionnement ;
- les vagues ;
- les situations de combat.

Le principe directeur peut être résumé ainsi :

> Le joueur ne contrôle pas 25 soldats séparément : il dirige une seule escouade vivante qui grandit, se déforme, combat et se spécialise pendant le run.

---

## 32. Résumé des décisions déjà validées

- Jeu Solar2D / Lua destiné à Poki.
- Vue top-down légèrement inclinée.
- Contrôle de toute la squad via souris / drag / joystick virtuel.
- 4 soldats au début.
- Environ 25 soldats maximum visés en late game.
- Environ 75 ennemis simultanés possibles.
- Six classes : Soldier/Marine, Medic, Flammeur, Sniper, Bombardier, Tank.
- Medic : soin lorsque la squad est immobile.
- Flammeur : explosion à sa mort.
- Composition de départ tirée parmi des sets prédéfinis viables.
- Les ennemis peuvent dropper directement des recrues.
- Le type de recrue dépend de la composition actuelle.
- Le taux de drop dépend de la taille actuelle de la squad.
- Cap maximum de squad.
- Upgrade permettant d’augmenter ce cap.
- XP sous forme de cristaux.
- Progression de type Vampire Survivors-like pendant le run.
- Upgrades envisagées : dégâts, fire rate, santé, taille maximale de squad et bonus conditionnels.
- Pas de méta-progression hors run prévue à ce stade.
- Vagues scriptées.
- Caméra centrée sur la masse principale de la squad et non sur les unités isolées.
- Déplacement et orientation des soldats indépendants.
- Knockback réservé principalement aux attaques spéciales.
- Petite map avec quelques obstacles.
- Premier playtest effectué sur un prototype difficile, sans tutoriel et avec une DA encore rudimentaire.
- Direction générale : gameplay immédiatement lisible, croissance de squad très visible et format adapté à Poki.
