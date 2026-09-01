#!/usr/bin/env node
/** Generate wave10-lang-{fr,nl,de,it,ar,ru}.mjs from English + translation tables */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WAVE10_EN, WAVE10_NEW_KEYS, WAVE10_EXPAND_KEYS } from './wave10-en-chapters.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALL = [...WAVE10_NEW_KEYS, ...WAVE10_EXPAND_KEYS];

function f(name, effect) { return { name, effect }; }

function serialize(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (Array.isArray(obj)) {
    if (obj.every((x) => typeof x === 'string'))
      return '[\n' + obj.map((s) => padIn + JSON.stringify(s)).join(',\n') + '\n' + pad + ']';
    return '[\n' + obj.map((v) => padIn + serialize(v, indent + 1)).join(',\n') + '\n' + pad + ']';
  }
  if (obj && typeof obj === 'object') {
    return '{\n' + Object.entries(obj).map(([k, v]) => {
      const key = /^[a-zA-Z_$][\w$-]*$/.test(k) && !k.includes('-') ? k : JSON.stringify(k);
      return padIn + key + ': ' + serialize(v, indent + 1);
    }).join(',\n') + '\n' + pad + '}';
  }
  return JSON.stringify(obj);
}

const LANG_BUILDERS = { fr: buildFr };

for (const [lang, builder] of Object.entries(LANG_BUILDERS)) {
  const pack = builder();
  fs.writeFileSync(path.join(__dirname, `wave10-lang-${lang}.mjs`), `export const ${lang} = ${serialize(pack, 0)};\n`);
  console.log('wrote', lang, Object.keys(pack).length, 'chapters');
}

function buildFr() {
  return {
    orders: { sections: {
      'cancel-void': { title: 'Annuler / invalider des articles', intro: 'Depuis le menu ⋯ de la commande, Annuler ouvre une fenêtre pour invalider des lignes ou l\'addition entière. Les commandes payées peuvent déclencher une contre-passation comptable.', steps: ['Ouvrez ⋯ sur une commande En cours (ou Payée éligible) et choisissez Annuler la commande.', 'Sélectionnez un motif d\'annulation (obligatoire).', 'Cochez une ou plusieurs lignes et ajustez les quantités avec +/−.', 'Ajoutez éventuellement des commentaires, puis confirmez.'], caption: 'Fenêtre d\'annulation avec motif et sélection d\'articles.', fields: [f('Motif','Motif d\'annulation obligatoire de l\'enum OrderVoidReason ; enregistré sur chaque order_void et imprimé sur les tickets de suppression cuisine.'), f('Articles','Sélectionnez lignes et quantités partielles. Tout sélectionner annule la commande ; annulation partielle réduit la quantité ou supprime la ligne.'), f('Commentaires','Note libre optionnelle sur les annulations et impressions de suppression.'), f('Confirmer l\'annulation','Crée order_void, annule les étapes cuisine, envoie impressions de suppression et contre-passe le GL pour les commandes Payées si intégrations actives.')] },
      refund: { title: 'Rembourser des articles payés', intro: 'Remboursement disponible sur commandes Payées via ⋯. Taxe, service, extras et pourboire sont répartis proportionnellement.', steps: ['Ouvrez ⋯ sur commande Payée → Rembourser.', 'Cochez les articles à rembourser à gauche.', 'Vérifiez le total proportionnel.', 'Motif optionnel à droite, puis confirmez.'], caption: 'Fenêtre de remboursement avec articles et totaux.', fields: [f('Sélectionner articles','Liste des lignes actives ; le total met à l\'échelle taxe, remise, service, extras et pourboire.'), f('Motif','Texte optionnel sur order_refunds pour audit.'), f('Rembourser','Crée order_refunds, marque is_refunded, étiquette Remboursé, publie événement comptable et imprime note de remboursement.')] },
      'split-seats': { title: 'Diviser par sièges', intro: 'Divise une addition en commandes séparées par siège. Glissez les articles entre colonnes avant enregistrement.', steps: ['Choisissez Diviser par sièges dans ⋯ (PIN manager possible).', 'Vérifiez les colonnes initialisées depuis les numéros de siège.', 'Glissez ou réassignez les articles.', 'Ajoutez/supprimez des sièges puis enregistrez.'], caption: 'Division par sièges par glisser-déposer.', fields: [f('Colonnes de siège','Chaque colonne devient une commande En cours avec son numéro de facture.'), f('Ajouter siège','Colonne vide pour couverts non assignés.'), f('Retirer siège','Supprime une colonne vide quand plusieurs divisions existent.'), f('Enregistrer divisions','Persiste commandes, réassigne articles, marque parent Divisé.')] },
      'split-items': { title: 'Diviser par articles', intro: 'Répartit manuellement les lignes sur deux additions ou plus, indépendamment du siège.', steps: ['⋯ → Diviser par articles.', 'Tous les articles dans Division 1 ; + pour ajouter.', 'Glissez entre colonnes.', 'Enregistrez quand tout est assigné et ≥2 divisions.'], caption: 'Division par articles avec plusieurs colonnes.', fields: [f('Colonnes de division','Divisions nommées deviennent commandes séparées.'), f('Glisser articles','Déplace une ligne ; un article ne peut être que dans une division à l\'enregistrement.'), f('Ajouter division','Nouvelle colonne vide.'), f('Retirer division','Retire colonne et renvoie articles à Division 1.'), f('Enregistrer divisions','Crée commandes filles et marque source Divisé.')] },
      'split-amount': { title: 'Diviser par montant', intro: 'Divise par montants ; chaque part reçoit une part proportionnelle de taxes, frais et pourboires.', steps: ['⋯ → Diviser par montant.', 'Saisissez montants par division.', 'La somme doit égaler le total.', 'Enregistrez pour générer commandes filles.'], caption: 'Division par montant avec totaux par addition.', fields: [f('Montant division','Saisie par division ; somme = total avec taxe, extras, service et pourboire.'), f('Restant','Solde non assigné ; enregistrement bloqué jusqu\'à zéro.'), f('Ajouter division','Nouvelle colonne à 0.'), f('Retirer division','Supprime quand ≥2 divisions restent.'), f('Enregistrer divisions','Crée commandes avec prix de ligne mis à l\'échelle.')] },
      merge: { title: 'Fusionner des commandes', intro: 'Combine plusieurs additions En cours. Flux en deux étapes : marquer sources, choisir table destination.', steps: ['Sur première commande ⋯ → Fusionner (PIN manager).', 'Répétez pour chaque source.', 'Appuyez Choisir table et sélectionnez destination.', 'Confirmez ; articles et totaux se consolidant.'], caption: 'Flux de fusion avec sélecteur de table.', fields: [f('Fusionner (menu)','Marque commande comme source de fusion.'), f('Choisir table','Sélectionne commande survivante ; sources fusionnées et étiquetées.'), f('PIN manager','Peut être exigé par règles de sécurité.')] },
    }},
    'accounts-ledgers': { sections: {
      'profit-loss': { title: 'Compte de résultat', intro: 'Le compte de résultat résume revenus et charges sur une période, avec le même regroupement de comptes que les autres états.', steps: ['Ouvrez l\'onglet Compte de résultat sous Rapports Comptes.', 'Sélectionnez la plage de dates ou période.', 'Examinez revenus, coût des ventes et charges.', 'Exportez ou détaillez depuis comptes liés.'], caption: 'Onglet compte de résultat.' },
      'cash-flow': { title: 'Flux de trésorerie', intro: 'Montre comment la trésorerie a bougé en activités d\'exploitation, d\'investissement et de financement.', steps: ['Ouvrez l\'onglet Flux de trésorerie.', 'Choisissez la période.', 'Comparez soldes d\'ouverture et clôture.', 'Utilisez avec résultat et bilan pour clôture.'], caption: 'Onglet flux de trésorerie.' },
    }},
    ...buildFrRest(),
  };
}

function buildFrRest() {
  return {
    'inventory-reconciliation': { title: 'Rapprochement cuisine', intro: 'Compare l\'usage théorique du stock aux comptages physiques, pertes, repas staff et consommations offertes par emplacement et date d\'activité.', sections: {
      overview: { title: 'Écran de rapprochement', steps: ['Ouvrez Stock → Rapprochement cuisine.', 'Choisissez date d\'activité et emplacement.', 'Générez ou rouvrez le rapprochement.'], caption: 'En-tête avec date et emplacement.', fields: [f('Date d\'activité','Date calendaire du rapprochement ; usage attendu depuis ventes et recettes.'), f('Emplacement','Emplacement actif lié à la cuisine ; requis avant génération.'), f('Générer','Appelle generateReconciliation pour créer/actualiser lignes attendues.')] },
      grid: { title: 'Grille de rapprochement', intro: 'Saisissez comptages physiques et ajustements par article. Brouillon ou import CSV.', steps: ['Vérifiez stock attendu et écarts.', 'Saisissez comptage, perte, repas staff et offert.', 'Enregistrez brouillon sans vérifier.', 'CSV pour grandes cuisines.'], caption: 'Grille avec comptages et écarts.', fields: [f('Comptage physique','Quantité comptée à la clôture ; comparée au stock attendu.'), f('Qté perte','Perte enregistrée déduite de l\'usage attendu.'), f('Qté repas staff','Repas personnel pour la date.'), f('Qté offert','Consommation offerte/comp.'), f('Enregistrer brouillon','Persiste via saveManualInputs sans verrouiller.'), f('Import CSV','Mise à jour en masse par code article.')] },
      verify: { title: 'Vérifier le rapprochement', steps: ['Vérifiez totaux d\'écart et alertes jours manqués.', 'Résolvez grands écarts ou notes de révision.', 'Vérifiez pour verrouiller (PIN manager possible).', 'Historique des révisions.'], caption: 'Résumé écarts et action Vérifier.', fields: [f('Vérifier','Appelle verifyReconciliation ; approbation manager via protectAction possible.'), f('Historique révisions','Instantanés avant/après par champ.'), f('Bannière jours manqués','Alerte si dates antérieures non vérifiées.')] },
    }},
    'inventory-production': { title: 'Lots de production', intro: 'Production par recette pour consommer intrants et créer produits finis, sous-recettes ou pertes.', sections: {
      overview: { title: 'Onglet Production', steps: ['Stock → Production.', 'Panneau exécution et historique.', 'Nouveau lot si prep requiert sortie à l\'échelle.'], caption: 'Onglet Production avec historique.' },
      'run-batch': { title: 'Exécuter un lot', intro: 'Complétez un lot depuis recette active. Prévisualisez avant confirmation.', steps: ['Démarrer lot / Exécuter production.', 'Recette, quantité produite et n° lot optionnel.', 'Prévisualisation intrants/sorties.', 'Confirmez pour mouvements stock.'], caption: 'Formulaire lot avec prévisualisation.', fields: [f('Recette','Recette active : intrants, sorties, rendement % et allocation coût.'), f('Qté produite','Quantité cible ; met à l\'échelle via previewProductionBatch.'), f('N° de lot','Identifiant optionnel ; auto-généré si vide.'), f('Notes','Note libre sur le lot.'), f('Mettre à jour coût article','Recalcule coûts sortie depuis intrants.'), f('Confirmer lot','Appelle completeProductionBatch.')] },
      history: { title: 'Historique des lots', steps: ['Parcourez lots passés.', 'Filtrez par recette.', 'Ouvrez ligne pour intrants, sorties et coûts.'], caption: 'Liste des lots terminés.' },
    }},
    'inventory-buffet': { title: 'Sessions buffet', intro: 'Planifiez et clôturez sessions : convives attendus, menu, lots et rapprochement consommation.', sections: {
      'sessions-list': { title: 'Liste des sessions', steps: ['Stock → Buffet.', 'Sessions avec date, type, menu et statut.', 'Créez ou ouvrez tableau de bord.'], caption: 'Table des sessions buffet.' },
      'session-form': { title: 'Créer session buffet', steps: ['Créer session.', 'Menu buffet et emplacement.', 'Date, type, convives attendus et prix.', 'Enregistrez pour ouvrir tableau de bord.'], caption: 'Formulaire nouvelle session.', fields: [f('Menu','Menu buffet : articles et plans production.'), f('Emplacement','Emplacement stock buffet.'), f('Date d\'activité','Date opérationnelle.'), f('Type de session','Petit-déjeuner, déjeuner ou dîner.'), f('Convives attendus','Couvert prévu pour plan production.'), f('Prix buffet','Prix par convive sur tableau de bord.'), f('Notes','Notes optionnelles.')] },
      'session-dashboard': { title: 'Tableau de bord et clôture', intro: 'Gérez lots, convives réels et clôture depuis le tableau de bord.', steps: ['Démarrez session au service.', 'Générez et complétez lots du plan.', 'Convives réels et consommation à la clôture.', 'Clôture pour finaliser écarts.'], caption: 'Tableau de bord avec progression production.', fields: [f('Démarrer session','Passe de planifiée à active.'), f('Générer plan production','Lots planifiés selon convives attendus.'), f('Convives réels','Couvert enregistré vs projection.'), f('Terminer clôture','Capture comptages restants et marque terminée.')] },
    }},
    'hr-cost-centers': { title: 'Centres de coûts', intro: 'Les centres de coûts allouent main-d\'œuvre et paie aux dimensions comptables.', sections: {
      'cost-centers-list': { title: 'Liste centres de coûts', steps: ['RH → Centres de coûts.', 'Codes avec nom et statut actif.', 'Ajoutez ou modifiez centres.'], caption: 'Table maintenance centres.' },
      'cost-center-form': { title: 'Formulaire centre de coûts', steps: ['Ajouter ou modifier.', 'Code, nom et description.', 'Actif puis enregistrer.'], caption: 'Modal créer/modifier centre.', fields: [f('Code','Identifiant court unique.'), f('Nom','Nom affiché dans sélecteurs RH.'), f('Description','Explication optionnelle.'), f('Actif','Inactifs masqués des nouvelles affectations.')] },
    }},
    'hr-pay': { title: 'Profils et règles de paie', intro: 'Configurez taux de base et ajustements automatiques via règles de paie.', sections: {
      'pay-profiles-list': { title: 'Profils de paie', steps: ['RH → Profils de paie.', 'Lien employé, type et taux avec dates.', 'Ajoutez à l\'embauche ou changement.'], caption: 'Liste profils de paie.' },
      'pay-profile-form': { title: 'Formulaire profil', steps: ['Employé, type et taux.', 'Date début obligatoire et fin optionnelle.', 'Enregistrez pour activer.'], caption: 'Formulaire profil de paie.', fields: [f('Employé','Employé concerné.'), f('Type de paie','Horaire, salaire, journalier, contrat, commission ou mixte.'), f('Taux de base','Taux principal selon type.'), f('Devise','Code ISO (défaut USD).'), f('Effectif depuis','Date début obligatoire.'), f('Effectif jusqu\'au','Fin optionnelle.'), f('Notes','Notes internes RH.')] },
      'pay-rules-list': { title: 'Règles de paie', intro: 'Multiplicateurs, primes ou retenues selon horaires, départements, postes et jours fériés.', steps: ['RH → Règles de paie.', 'Priorité et mode empilement.', 'Modifiez heures sup et primes.'], caption: 'Liste règles de paie.' },
      'pay-rule-form': { title: 'Formulaire règle', steps: ['Code, nom, priorité et empilement.', 'Effets (multiplicateur, prime/retenue).', 'Filtres employé, département, etc.', 'Enregistrez ; règles actives en prévisualisation paie.'], caption: 'Formulaire règle avec effets.', fields: [f('Code / Nom','Identifiant en détail exécution paie.'), f('Priorité','Petits nombres évalués en premier si mode priorité.'), f('Mode empilement','Autoriser, empêcher, plus haut gagne ou priorité.'), f('Exclusive','Stoppe règles inférieures après correspondance.'), f('Effets','Type, valeur et applies_to.'), f('Filtres','Employé, département, poste, centre, férié, jour, mois, heure.'), f('Active','Règles inactives ignorées.')] },
    }},
    'hr-payroll': { title: 'Périodes et exécutions de paie', intro: 'Définissez périodes et générez exécutions prévisualisées.', sections: {
      'payroll-periods-list': { title: 'Périodes de paie', steps: ['RH → Périodes de paie.', 'Périodes ouvertes, verrouillées, clôturées ou payées.', 'Créez période avant exécution.'], caption: 'Table périodes.' },
      'payroll-period-form': { title: 'Formulaire période', steps: ['Nom, type et dates.', 'Statut (souvent ouvert).', 'Enregistrez pour autoriser exécutions.'], caption: 'Formulaire période.', fields: [f('Nom','Libellé sur exécutions et exports.'), f('Type de période','Hebdo, bihebdo, mensuel ou personnalisé.'), f('Date début / fin','Bornes inclusives.'), f('Statut','Ouvert accepte nouvelles exécutions.')] },
      'payroll-runs-list': { title: 'Exécutions de paie', steps: ['RH → Exécutions.', 'Chaque exécution a période et numéro.', 'Ouvrez pour instantanés, approbation ou export.'], caption: 'Liste exécutions.' },
      'payroll-run-form': { title: 'Créer exécution', steps: ['Période ouverte.', 'Confirmez numéro suggéré.', 'Générez prévisualisation.'], caption: 'Formulaire nouvelle exécution.', fields: [f('Période de paie','Période ouverte obligatoire.'), f('N° exécution','Séquentiel par période.'), f('Générer prévisualisation','Appelle generatePreview.')] },
    }},
    'hr-documents': { title: 'Documents employés', intro: 'Contrats, licences, pièces d\'identité et fichiers avec suivi d\'expiration.', sections: {
      'documents-list': { title: 'Liste documents', steps: ['RH → Documents.', 'Filtrez employé ou catégorie.', 'Téléversez ou vérifiez expirations.'], caption: 'Table documents.' },
      'document-form': { title: 'Formulaire document', steps: ['Employé et catégorie.', 'Titre et expiration optionnelle.', 'Fichier puis enregistrer.'], caption: 'Modal téléversement.', fields: [f('Employé','Propriétaire du document.'), f('Catégorie','Contrat, certificat, licence, ID, médical, avertissement ou autre.'), f('Titre','Nom affiché.'), f('Expire le','Date pour rappels.'), f('Fichier','Binaire sur employee_documents ; requis à la création.')] },
    }},
    'hr-performance': { title: 'Notes de performance', intro: 'Avertissements, compliments, évaluations et incidents ; visibilité employé configurable.', sections: {
      'performance-list': { title: 'Liste notes', steps: ['RH → Performance.', 'Par employé, type et gravité.', 'Ajoutez après service ou évaluation.'], caption: 'Table notes performance.' },
      'performance-form': { title: 'Formulaire note', steps: ['Employé, type et titre.', 'Contenu détaillé et gravité.', 'Visible employé ou non.', 'Enregistrez sur dossier RH.'], caption: 'Formulaire note.', fields: [f('Employé','Sujet de la note.'), f('Type','Avertissement, compliment, évaluation ou incident.'), f('Titre','Résumé court.'), f('Contenu','Corps détaillé obligatoire.'), f('Gravité','Faible/moyenne/élevée/critique optionnelle.'), f('Visible employé','Coché : peut apparaître côté employé ; sinon RH seulement.')] },
    }},
    'hr-employees': { sections: {
      'employee-form': { title: 'Formulaire employé', steps: ['Employés → Ajouter/modifier.', 'Utilisateur POS, département, poste, centre et manager optionnels.', 'Statut, type, dates et notes.'], caption: 'Formulaire employé.', fields: [f('N° employé','Identifiant RH unique.'), f('Prénom / Nom','Nom légal.'), f('Utilisateur','Lien POS optionnel.'), f('Département / Poste','Affectation organisationnelle.'), f('Centre de coûts','Dimension comptable MO.'), f('Manager','Autre employé hiérarchie.'), f('Statut emploi','Actif, inactif, licencié, congé ou suspendu.'), f('Type emploi','Horaire, salaire, contrat, commission ou mixte.'), f('Embauche / Départ','Dates de service.'), f('Notes','Notes RH libres.')] },
      'department-form': { title: 'Formulaire département', steps: ['Départements → Ajouter.', 'Nom et enregistrer.', 'Affectez sur employés.'], caption: 'Formulaire département.', fields: [f('Nom','Libellé département.')] },
      'position-form': { title: 'Formulaire poste', steps: ['Postes → Ajouter.', 'Intitulé et enregistrer.', 'Associez employés et règles.'], caption: 'Formulaire poste.', fields: [f('Nom','Intitulé de poste.')] },
    }},
    'hr-attendance': { sections: {
      'attendance-form': { title: 'Saisie manuelle présence', intro: 'Les managers peuvent corriger pointages manquants.', steps: ['Présence → Saisie manuelle.', 'Employé et horaires entrée/sortie.', 'Notes optionnelles.'], caption: 'Formulaire présence manuelle.', fields: [f('Employé','Employé concerné.'), f('Entrée','Horodatage début obligatoire.'), f('Sortie','Fin après entrée.'), f('Notes','Motif ou référence.')] },
    }},
    'hr-leave': { sections: {
      'leave-type-form': { title: 'Type de congé', steps: ['Congés → types → Ajouter.', 'Code, payé, approbation, accrual et limites.'], caption: 'Formulaire type congé.', fields: [f('Code / Nom','Identifiant congés.'), f('Payé','Temps payé en paie.'), f('Approbation requise','Demandes en attente.'), f('Max jours/an','Plafond annuel.'), f('Taux accrual','Unités par période.'), f('Actif','Types inactifs non sélectionnables.')] },
      'leave-request-form': { title: 'Demande de congé', steps: ['Ajoutez demande.', 'Employé, type et dates.', 'Motif optionnel.'], caption: 'Formulaire demande.', fields: [f('Employé','Demandeur.'), f('Type congé','Payé/non payé et workflow.'), f('Début / Fin','Plage inclusive.'), f('Jours','Override jours ouvrés.'), f('Motif','Commentaire stocké.')] },
    }},
    'admin-menus': { sections: {
      'dish-form': { title: 'Formulaire plat', steps: ['Plats → Ajouter/modifier.', 'Numéro, nom, prix, coût, catégories, photo.', 'Modificateurs, workflow, cuisine, recette.'], caption: 'Formulaire plat.', fields: [f('Nom / Numéro','Nom et PLU/SKU.'), f('Priorité','Ordre dans catégories.'), f('Prix vente / Coût','Prix client et coût théorique.'), f('Catégories','Visibilité et navigation.'), f('Photo','Image optionnelle.'), f('Workflow','Prep avec overrides cuisine.'), f('Groupes modificateurs','Groupe, requis, auto, priorité.'), f('Lignes recette','Articles stock et coût.')] },
      'menu-form': { title: 'Formulaire menu', steps: ['Menus → Ajouter.', 'Nom et horaires.', 'Actif et enregistrer.'], caption: 'Formulaire menu.', fields: [f('Nom','Libellé menu.'), f('Début / Fin','Fenêtre quotidienne.'), f('Fin le lendemain','Menus de nuit.'), f('Actif','Menus inactifs masqués.')] },
      'category-form': { title: 'Formulaire catégorie', steps: ['Catégories → Ajouter.', 'Nom, priorité, afficher.'], caption: 'Formulaire catégorie.', fields: [f('Nom','Bouton catégorie.'), f('Priorité','Ordre catégories.'), f('Afficher au menu','Masque UI salle si off.')] },
      'modifier-group-form': { title: 'Groupe modificateurs', intro: 'Modificateurs (plats liés) avec prix et règles groupes suivants.', steps: ['Groupes → Ajouter.', 'Nom et priorité.', 'Modificateurs avec prix et groupes suivants.'], caption: 'Formulaire groupe.', fields: [f('Nom / Priorité','Libellé et ordre.'), f('Modificateur (plat)','Plat comme option.'), f('Prix','Supplément.'), f('Groupes suivants autorisés','Flux imbriqué.'), f('Overrides groupe suivant','Masquer ou prix imbriqués.')] },
    }},
    'admin-floors': { sections: {
      'floor-form': { title: 'Formulaire salle', steps: ['Salles → Ajouter.', 'Nom, priorité, couleurs.', 'Enregistrer et disposer tables.'], caption: 'Formulaire salle.', fields: [f('Nom','Nom dans sélecteur.'), f('Priorité','Ordre commutation.'), f('Fond / Couleur','Couleurs plan.')] },
      'table-form': { title: 'Formulaire table', steps: ['Tables → Ajouter.', 'Salle, numéro, couleurs, contraintes.', 'Position sur plan.'], caption: 'Formulaire table.', fields: [f('Nom / Numéro','Identifiant addition/tickets.'), f('Priorité','Ordre plan.'), f('Salle','Salle parente.'), f('Fond / Couleur','Couleurs tuile.'), f('Catégories / Types commande / Paiement','Restrictions optionnelles.'), f('Demander couverts','Saisie convives obligatoire.')] },
    }},
    'admin-promotions': { sections: {
      'discount-form': { title: 'Règle remise', intro: 'Moteur complet : catégorie, cibles, horaires, empilement.', steps: ['Remises → Règles → Ajouter.', 'Catégorie, portée, mode, cibles.', 'Valeur, empilement, taxes.', 'Horaires ; Achetez X Obtenez Y.'], caption: 'Formulaire règle remise.', fields: [f('Nom','Libellé reçus.'), f('Catégorie','manager, staff, vip/corporate, happy_hour, category/product, floor, damage_wastage, bulk_order, manual, buy_x_get_y.'), f('Portée','item, category, cart, customer ou floor.'), f('Mode application','manual, automatic ou both.'), f('Cibles','IDs selon portée.'), f('Type / Taux min/max','Pourcent ou fixe.'), f('Plafond max','Plafond monétaire pourcent.'), f('Montant commande min','Seuil panier.'), f('Priorité','Ordre si priority.'), f('Mode empilement','allow, prevent, highest_wins, priority.'), f('Traitement taxe','tax_before_discount, tax_after_discount, inclusive, exclusive.'), f('Empilable / Exclusive','Flags combinaison.'), f('Motif / Approbation requis','Au POS.'), f('Active','Règles inactives exclues.'), f('Horaire','Fenêtres auto.'), f('Conditions Achetez X Obtenez Y','Si buy_x_get_y.')] },
      'coupon-form': { title: 'Formulaire coupon', steps: ['Coupons → Ajouter.', 'Code, type/valeur, limites, validité.', 'Jours/heures valides.'], caption: 'Formulaire coupon.', fields: [f('Code','Chaîne saisie au paiement.'), f('Description','Note interne.'), f('Type coupon','Usage unique ou multiple.'), f('Type / Valeur remise','Pourcent ou fixe.'), f('Commande min / Remise max','Seuils optionnels.'), f('Limite usage / Par utilisateur','Limites globales et client.'), f('Priorité','Ordre application.'), f('Jours / Validité','Calendrier et intrajournalier.'), f('Active','Coupons inactifs rejetés.')] },
    }},
    'admin-kitchen': { sections: {
      'kitchen-form': { title: 'Formulaire cuisine', steps: ['Cuisines → Ajouter.', 'Station, priorité, plats et imprimantes.'], caption: 'Station cuisine.', fields: [f('Nom','Nom sur tickets.'), f('Priorité','Ordre filtres KDS.'), f('Imprimantes','Jobs KOT/suppression.'), f('Articles (plats)','Routage commandes.')] },
      'workflow-form': { title: 'Formulaire workflow', steps: ['Workflows → Ajouter.', 'Nom et étapes ordonnées.', 'Réordonnez et enregistrez.'], caption: 'Formulaire workflow.', fields: [f('Nom','Modèle attachable aux plats.'), f('Étapes','Étapes prep avec cuisine.'), f('Ordre étapes','Contrôles haut/bas.')] },
    }},
    'admin-printing': { sections: {
      'printer-form': { title: 'Formulaire imprimante', steps: ['Imprimantes → Ajouter.', 'Connexion et type.'], caption: 'Formulaire imprimante.', fields: [f('Nom','Nom convivial.'), f('Type','Réseau, USB, etc.'), f('IP / Port','Cible réseau.'), f('VID / PID','USB.')] },
      'print-setting-form': { title: 'Paramètre impression', steps: ['Paramètres → type modèle.', 'Sections reçu.', 'Enregistrer pour nouvelles commandes.'], caption: 'Modèle impression.', fields: [f('Type impression','Addition provisoire, reçu final, ticket cuisine, etc.'), f('Éditeur sections','Blocs ordonnés.'), f('Copies / Options','Défauts.')] },
    }},
    'admin-payments': { sections: {
      'payment-type-form': { title: 'Type de paiement', intro: 'Types sur écran paiement ; Remote active passerelles.', steps: ['Types → Ajouter.', 'Nom, type, priorité, taxe, remises.', 'Remote : passerelle et identifiants.'], caption: 'Formulaire avec passerelle.', fields: [f('Nom','Bouton paiement.'), f('Priorité','Ordre boutons.'), f('Type','Espèces, Carte, Points ou Remote.'), f('Passerelle','Stripe, PayPal, Razorpay, etc.'), f('Mode passerelle','sandbox ou live.'), f('Clé publique / secrète','API payment_type_gateway_configs.'), f('Secret webhook','Callbacks async.'), f('Client ID / secret','OAuth.'), f('Merchant ID / salt','Champs fournisseur.'), f('Taxe','Taxe optionnelle.'), f('Remises','Remises fixes auto.')] },
    }},
    'admin-users': { sections: {
      'user-form': { title: 'Formulaire utilisateur', steps: ['Utilisateurs → Ajouter.', 'PIN ou mot de passe, nom, rôle, shift.', 'Employé lié optionnel.'], caption: 'Compte utilisateur.', fields: [f('Méthode connexion','PIN 4 chiffres ou identifiant/mot de passe.'), f('Prénom / Nom','Affiché commandes.'), f('Login / PIN','Identifiants.'), f('Mot de passe','Requis si mot de passe.'), f('Rôle','Accès modules.'), f('Shift','Shift par défaut.'), f('Créer employé','Auto-création RH.'), f('N° employé','Requis si création.')] },
      'role-form': { title: 'Formulaire rôle', steps: ['Rôles → Ajouter.', 'Nom du rôle.', 'Modules et permissions.'], caption: 'Permissions rôle.', fields: [f('Nom','Libellé rôle.'), f('Modules','Arbre ACCESS_RULE_MODULES.')] },
      'shift-form': { title: 'Formulaire shift', steps: ['Shifts → Ajouter.', 'Nom et horaires.', 'Nuit définit ends_next_day.'], caption: 'Formulaire shift.', fields: [f('Nom','Libellé shift.'), f('Heure début / fin','Heures locales.')] },
      'tip-definition-form': { title: 'Définition pourboires', intro: 'Poids pool par rôle et utilisateur.', steps: ['Définition pourboires.', 'Lignes rôle avec poids.', 'Overrides utilisateur.', 'Enregistrer.'], caption: 'Éditeur poids pourboires.', fields: [f('Lignes poids rôle','Poids pool.'), f('Lignes poids utilisateur','Overrides.'), f('Enregistrer','Persiste tip_distribution.')] },
    }},
  };
}

// NL, DE, IT, AR, RU — same structure, translated
function buildNl() { return cloneTranslate(buildFr(), NL_MAP); }
function buildDe() { return cloneTranslate(buildFr(), DE_MAP); }
function buildIt() { return cloneTranslate(buildFr(), IT_MAP); }
function buildAr() { return buildArDirect(); }
function buildRu() { return buildRuDirect(); }

function cloneTranslate(obj, map) {
  if (typeof obj === 'string') {
    let s = obj;
    for (const [from, to] of Object.entries(map)) s = s.split(from).join(to);
    return s;
  }
  if (Array.isArray(obj)) return obj.map((v) => cloneTranslate(v, map));
  if (obj && typeof obj === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(obj)) o[k] = cloneTranslate(v, map);
    return o;
  }
  return obj;
}

const NL_MAP = {
  'Annuler / invalider des articles': 'Items annuleren / ongeldig maken',
  'Compte de résultat': 'Winst- en verliesrekening',
  'Flux de trésorerie': 'Kasstroom',
  'Rapprochement cuisine': 'Keukenafstemming',
  'Lots de production': 'Productiebatches',
  'Sessions buffet': 'Buffetsessies',
  'Centres de coûts': 'Kostenplaatsen',
  'Profils et règles de paie': 'Loonprofielen en -regels',
  'Périodes et exécutions de paie': 'Loonperiodes en -runs',
  'Documents employés': 'Werknemersdocumenten',
  'Notes de performance': 'Prestatienotities',
  'commande': 'bestelling',
  'Commande': 'Bestelling',
  'Enregistrer': 'Opslaan',
  'Employé': 'Werknemer',
  'employé': 'werknemer',
  'Motif': 'Reden',
  'Articles': 'Items',
  'Rembourser': 'Terugbetalen',
  'Fusionner': 'Samenvoegen',
  'Diviser': 'Splitsen',
  'Formulaire': 'Formulier',
  'Onglet': 'Tab',
  'Stock': 'Voorraad',
  'Cuisine': 'Keuken',
  'Imprimante': 'Printer',
  'Remise': 'Korting',
  'Coupon': 'Coupon',
  'Utilisateur': 'Gebruiker',
  'Rôle': 'Rol',
};

const DE_MAP = {
  'Annuler / invalider des articles': 'Artikel stornieren / ungültig machen',
  'Compte de résultat': 'Gewinn- und Verlustrechnung',
  'Flux de trésorerie': 'Kapitalflussrechnung',
  'Rapprochement cuisine': 'Küchenabstimmung',
  'Lots de production': 'Produktionschargen',
  'Sessions buffet': 'Buffet-Sitzungen',
  'Centres de coûts': 'Kostenstellen',
  'Profils et règles de paie': 'Lohnprofile und -regeln',
  'Périodes et exécutions de paie': 'Lohnperioden und -läufe',
  'Documents employés': 'Mitarbeiterdokumente',
  'Notes de performance': 'Leistungsnotizen',
  'commande': 'Bestellung',
  'Commande': 'Bestellung',
  'Enregistrer': 'Speichern',
  'Employé': 'Mitarbeiter',
  'employé': 'Mitarbeiter',
  'Motif': 'Grund',
  'Articles': 'Artikel',
  'Rembourser': 'Erstatten',
  'Fusionner': 'Zusammenführen',
  'Diviser': 'Teilen',
  'Formulaire': 'Formular',
  'Onglet': 'Register',
  'Stock': 'Bestand',
  'Cuisine': 'Küche',
};

const IT_MAP = {
  'Annuler / invalider des articles': 'Annulla / invalida articoli',
  'Compte de résultat': 'Conto economico',
  'Flux de trésorerie': 'Flusso di cassa',
  'Rapprochement cuisine': 'Riconciliazione cucina',
  'Lots de production': 'Lotti di produzione',
  'Sessions buffet': 'Sessioni buffet',
  'Centres de coûts': 'Centri di costo',
  'Profils et règles de paie': 'Profili e regole retributive',
  'Périodes et exécutions de paie': 'Periodi ed esecuzioni paghe',
  'Documents employés': 'Documenti dipendenti',
  'Notes de performance': 'Note prestazioni',
  'commande': 'ordine',
  'Commande': 'Ordine',
  'Enregistrer': 'Salva',
  'Employé': 'Dipendente',
  'employé': 'dipendente',
  'Motif': 'Motivo',
  'Articles': 'Articoli',
  'Rembourser': 'Rimborsa',
  'Fusionner': 'Unisci',
  'Diviser': 'Dividi',
  'Formulaire': 'Modulo',
  'Onglet': 'Scheda',
  'Stock': 'Magazzino',
  'Cuisine': 'Cucina',
};

function buildArDirect() {
  const b = buildFr();
  return cloneTranslate(b, {
    'Annuler / invalider des articles': 'إلغاء / إبطال العناصر',
    'Compte de résultat': 'الأرباح والخسائر',
    'Flux de trésorerie': 'التدفق النقدي',
    'Rapprochement cuisine': 'تسوية المطبخ',
    'Lots de production': 'دفعات الإنتاج',
    'Sessions buffet': 'جلسات البuffet',
    'Centres de coûts': 'مراكز التكلفة',
    'Profils et règles de paie': 'ملفات وقواعد الأجور',
    'Périodes et exécutions de paie': 'فترات وتشغيلات الرواتب',
    'Documents employés': 'مستندات الموظفين',
    'Notes de performance': 'ملاحظات الأداء',
    'commande': 'طلب',
    'Commande': 'طلب',
    'Enregistrer': 'حفظ',
    'Employé': 'موظف',
    'Motif': 'السبب',
    'Articles': 'العناصر',
    'Rembourser': 'استرداد',
    'Fusionner': 'دمج',
    'Diviser': 'تقسيم',
    'Formulaire': 'نموذج',
    'Onglet': 'تبويب',
    'Stock': 'المخزون',
    'Cuisine': 'المطبخ',
  });
}

function buildRuDirect() {
  const b = buildFr();
  return cloneTranslate(b, {
    'Annuler / invalider des articles': 'Отмена / аннулирование позиций',
    'Compte de résultat': 'Отчёт о прибылях и убытках',
    'Flux de trésorerie': 'Движение денежных средств',
    'Rapprochement cuisine': 'Сверка кухни',
    'Lots de production': 'Производственные партии',
    'Sessions buffet': 'Сессии шведского стола',
    'Centres de coûts': 'Центры затрат',
    'Profils et règles de paie': 'Профили и правила оплаты',
    'Périodes et exécutions de paie': 'Расчётные периоды и запуски',
    'Documents employés': 'Документы сотрудников',
    'Notes de performance': 'Заметки об эффективности',
    'commande': 'заказ',
    'Commande': 'Заказ',
    'Enregistrer': 'Сохранить',
    'Employé': 'Сотрудник',
    'Motif': 'Причина',
    'Articles': 'Позиции',
    'Rembourser': 'Возврат',
    'Fusionner': 'Объединить',
    'Diviser': 'Разделить',
    'Formulaire': 'Форма',
    'Onglet': 'Вкладка',
    'Stock': 'Склад',
    'Cuisine': 'Кухня',
  });
}
