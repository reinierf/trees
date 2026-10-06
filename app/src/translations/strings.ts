import type { Locale } from './locale'

const nl = {
  'cityInfo.trees': 'Bomen',
  'cityInfo.source': 'Bron',
  'cityInfo.updated': 'Bijgewerkt',

  'tree.planted': 'Geplant',
  'tree.street': 'Straat',
  'tree.trunkDiameter': 'Stamdiam.',
  'tree.crown': 'Kroon',
  'tree.linkCopied': 'Link gekopieerd',
  'tree.flagSpecies': 'Markeer datafout voor soort',
  'tree.speciesFlagged': 'Soort al gemeld — klik om te bewerken',
  'tree.flagTree': 'Markeer datafout voor boom',
  'tree.treeFlagged': 'Boom al gemeld — klik om te bewerken',
  'tree.viewPhotos': "Bekijk foto's",
  'tree.removeFavourite': 'Verwijder uit favorieten',
  'tree.addFavourite': 'Voeg toe aan favorieten',
  'tree.shareLink': 'Deel link naar boom',
  'tree.centerOnTree': 'Centreer kaart op boom',

  'search.placeholder': 'Zoek op soortnaam...',
  'search.clear': 'Wis zoekopdracht',
  'search.loading': 'Soorten laden…',
  'search.noResults': 'Geen soorten gevonden',
  'search.typeMore': 'Typ meer om te verfijnen',

  'species.title': 'Soorten in beeld',
  'species.empty': 'Geen bomen in beeld',
  'species.filterBy': 'Filter op soort',
  'species.showAllOnMap': 'Toon alleen deze soort op de kaart',
  'species.openDetail': 'Open boomdetails',

  'popup.close': 'Sluiten',
  'popup.expand': 'Uitklappen',
  'popup.collapse': 'Inklappen',

  'favourites.title': 'Favorieten',
  'favourites.empty': 'Geen favorieten',

  'issues.title': 'Datafouten',
  'issues.trees': 'Bomen',
  'issues.species': 'Soorten',
  'issues.confirm': 'Zeker?',
  'issues.confirmResolve': 'Bevestig oplossen',
  'issues.cancel': 'Annuleer',
  'issues.markResolved': 'Markeer als opgelost',
  'issues.empty': 'Geen meldingen',
  'issues.searchSpecies': 'Zoek op soort',


  'map.chooseCity': 'Kies een plaats om bomen te verkennen',
  'map.legend.city': 'Gemeente',
  'map.legend.institution': 'Arboretum',

  'marker.trees': 'bomen',

  'city.choose': 'Kies plaats',
  'city.allPlaces': 'Alle plaatsen',
  'species.nearest': 'Toon de dichtstbijzijnde boom van deze soort',
  'species.notInView': 'Niet in beeld',
  'nearest.goThere': 'Toon op de kaart',
  'nearest.back': 'Terug naar vorige positie',
  'city.hidePlaces': 'Plaatsen verbergen',
  'sources.title': 'Bronnen in beeld',
  'sources.inView': 'In beeld',
  'species.zoomInForTrees': 'Zoom in om alle bomen afzonderlijk te zien',

  'map.layer': 'Kaartlaag',

  'fullscreen.enter': 'Volledig scherm',
  'fullscreen.exit': 'Volledig scherm afsluiten',

  'location.goTo': 'Ga naar mijn locatie',
  'location.denied': 'Locatietoegang geweigerd',
  'location.unavailable': 'Locatie niet beschikbaar',
  'location.timeout': 'Locatie: time-out',

  'nameMode.scientific': 'Wetenschappelijke namen',
  'nameMode.vernacular': 'Volksnamen',

  'settings.title': 'Instellingen',

  'species.loadingTrees': 'Bomen laden…',
  'species.clearFilter': 'Filter wissen',
} as const

export type TranslationKey = keyof typeof nl
type Dict = Record<TranslationKey, string>

const en: Dict = {
  'cityInfo.trees': 'Trees',
  'cityInfo.source': 'Source',
  'cityInfo.updated': 'Updated',

  'tree.planted': 'Planted',
  'tree.street': 'Street',
  'tree.trunkDiameter': 'Trunk diam.',
  'tree.crown': 'Crown',
  'tree.linkCopied': 'Link copied',
  'tree.flagSpecies': 'Flag data issue for species',
  'tree.speciesFlagged': 'Species already flagged — click to edit',
  'tree.flagTree': 'Flag data issue for tree',
  'tree.treeFlagged': 'Tree already flagged — click to edit',
  'tree.viewPhotos': 'View photos',
  'tree.removeFavourite': 'Remove from favourites',
  'tree.addFavourite': 'Add to favourites',
  'tree.shareLink': 'Share link to tree',
  'tree.centerOnTree': 'Center map on tree',

  'search.placeholder': 'Search by species name...',
  'search.clear': 'Clear search',
  'search.loading': 'Loading species…',
  'search.noResults': 'No species found',
  'search.typeMore': 'Type more to narrow results',

  'species.title': 'Species in view',
  'species.empty': 'No trees in view',
  'species.filterBy': 'Filter by species',
  'species.showAllOnMap': 'Show only this species on the map',
  'species.openDetail': 'Open tree detail',

  'popup.close': 'Close',
  'popup.expand': 'Expand',
  'popup.collapse': 'Collapse',

  'favourites.title': 'Favourites',
  'favourites.empty': 'No favourites',

  'issues.title': 'Data issues',
  'issues.trees': 'Trees',
  'issues.species': 'Species',
  'issues.confirm': 'Sure?',
  'issues.confirmResolve': 'Confirm resolve',
  'issues.cancel': 'Cancel',
  'issues.markResolved': 'Mark as resolved',
  'issues.empty': 'No reports',
  'issues.searchSpecies': 'Search by species',


  'map.chooseCity': 'Choose a place to explore trees',
  'map.legend.city': 'Municipality',
  'map.legend.institution': 'Arboretum or institute',

  'marker.trees': 'trees',

  'city.choose': 'Choose place',
  'city.allPlaces': 'All places',
  'species.nearest': 'Show the nearest tree of this species',
  'species.notInView': 'Not in view',
  'nearest.goThere': 'Show on the map',
  'nearest.back': 'Back to previous position',
  'city.hidePlaces': 'Hide places',
  'sources.title': 'Sources in view',
  'sources.inView': 'In view',
  'species.zoomInForTrees': 'Zoom in to see all individual trees',

  'map.layer': 'Map layer',

  'fullscreen.enter': 'Enter fullscreen',
  'fullscreen.exit': 'Exit fullscreen',

  'location.goTo': 'Go to my location',
  'location.denied': 'Location access denied',
  'location.unavailable': 'Location unavailable',
  'location.timeout': 'Location timed out',

  'nameMode.scientific': 'Scientific names',
  'nameMode.vernacular': 'Vernacular names',

  'settings.title': 'Settings',

  'species.loadingTrees': 'Loading trees…',
  'species.clearFilter': 'Clear filter',
}

const de: Dict = {
  'cityInfo.trees': 'Bäume',
  'cityInfo.source': 'Quelle',
  'cityInfo.updated': 'Aktualisiert',

  'tree.planted': 'Gepflanzt',
  'tree.street': 'Straße',
  'tree.trunkDiameter': 'Stammdurchm.',
  'tree.crown': 'Krone',
  'tree.linkCopied': 'Link kopiert',
  'tree.flagSpecies': 'Datenfehler für Art melden',
  'tree.speciesFlagged': 'Art bereits gemeldet — klicken zum Bearbeiten',
  'tree.flagTree': 'Datenfehler für Baum melden',
  'tree.treeFlagged': 'Baum bereits gemeldet — klicken zum Bearbeiten',
  'tree.viewPhotos': 'Fotos ansehen',
  'tree.removeFavourite': 'Aus Favoriten entfernen',
  'tree.addFavourite': 'Zu Favoriten hinzufügen',
  'tree.shareLink': 'Link zum Baum teilen',
  'tree.centerOnTree': 'Karte auf Baum zentrieren',

  'search.placeholder': 'Nach Artname suchen...',
  'search.clear': 'Suche löschen',
  'search.loading': 'Arten werden geladen…',
  'search.noResults': 'Keine Arten gefunden',
  'search.typeMore': 'Weiter tippen zum Verfeinern',

  'species.title': 'Arten im Blick',
  'species.empty': 'Keine Bäume im Blick',
  'species.filterBy': 'Nach Art filtern',
  'species.showAllOnMap': 'Nur diese Art auf der Karte zeigen',
  'species.openDetail': 'Baumdetails öffnen',

  'popup.close': 'Schließen',
  'popup.expand': 'Ausklappen',
  'popup.collapse': 'Einklappen',

  'favourites.title': 'Favoriten',
  'favourites.empty': 'Keine Favoriten',

  'issues.title': 'Datenfehler',
  'issues.trees': 'Bäume',
  'issues.species': 'Arten',
  'issues.confirm': 'Sicher?',
  'issues.confirmResolve': 'Lösung bestätigen',
  'issues.cancel': 'Abbrechen',
  'issues.markResolved': 'Als gelöst markieren',
  'issues.empty': 'Keine Meldungen',
  'issues.searchSpecies': 'Nach Art suchen',


  'map.chooseCity': 'Wähle einen Ort, um Bäume zu erkunden',
  'map.legend.city': 'Gemeinde',
  'map.legend.institution': 'Arboretum oder Institut',

  'marker.trees': 'Bäume',

  'city.choose': 'Ort wählen',
  'city.allPlaces': 'Alle Orte',
  'species.nearest': 'Nächsten Baum dieser Art zeigen',
  'species.notInView': 'Nicht im Blick',
  'nearest.goThere': 'Auf der Karte zeigen',
  'nearest.back': 'Zurück zur vorherigen Position',
  'city.hidePlaces': 'Orte ausblenden',
  'sources.title': 'Quellen im Blick',
  'sources.inView': 'Im Blick',
  'species.zoomInForTrees': 'Hineinzoomen, um alle Bäume einzeln zu sehen',

  'map.layer': 'Kartenebene',

  'fullscreen.enter': 'Vollbild',
  'fullscreen.exit': 'Vollbild beenden',

  'location.goTo': 'Zu meinem Standort',
  'location.denied': 'Standortzugriff verweigert',
  'location.unavailable': 'Standort nicht verfügbar',
  'location.timeout': 'Standortabfrage abgelaufen',

  'nameMode.scientific': 'Wissenschaftliche Namen',
  'nameMode.vernacular': 'Trivialnamen',

  'settings.title': 'Einstellungen',

  'species.loadingTrees': 'Bäume werden geladen…',
  'species.clearFilter': 'Filter löschen',
}

const fr: Dict = {
  'cityInfo.trees': 'Arbres',
  'cityInfo.source': 'Source',
  'cityInfo.updated': 'Mis à jour',

  'tree.planted': 'Planté',
  'tree.street': 'Rue',
  'tree.trunkDiameter': 'Diam. tronc',
  'tree.crown': 'Couronne',
  'tree.linkCopied': 'Lien copié',
  'tree.flagSpecies': "Signaler une erreur pour l'espèce",
  'tree.speciesFlagged': 'Espèce déjà signalée — cliquer pour modifier',
  'tree.flagTree': "Signaler une erreur pour l'arbre",
  'tree.treeFlagged': 'Arbre déjà signalé — cliquer pour modifier',
  'tree.viewPhotos': 'Voir les photos',
  'tree.removeFavourite': 'Retirer des favoris',
  'tree.addFavourite': 'Ajouter aux favoris',
  'tree.shareLink': "Partager le lien de l'arbre",
  'tree.centerOnTree': "Centrer la carte sur l'arbre",

  'search.placeholder': "Rechercher par nom d'espèce...",
  'search.clear': 'Effacer la recherche',
  'search.loading': 'Chargement des espèces…',
  'search.noResults': 'Aucune espèce trouvée',
  'search.typeMore': 'Continuez à taper pour affiner',

  'species.title': 'Espèces visibles',
  'species.empty': 'Aucun arbre visible',
  'species.filterBy': 'Filtrer par espèce',
  'species.showAllOnMap': 'Afficher uniquement cette espèce sur la carte',
  'species.openDetail': "Ouvrir les détails de l'arbre",

  'popup.close': 'Fermer',
  'popup.expand': 'Déplier',
  'popup.collapse': 'Replier',

  'favourites.title': 'Favoris',
  'favourites.empty': 'Aucun favori',

  'issues.title': 'Erreurs de données',
  'issues.trees': 'Arbres',
  'issues.species': 'Espèces',
  'issues.confirm': 'Sûr ?',
  'issues.confirmResolve': 'Confirmer la résolution',
  'issues.cancel': 'Annuler',
  'issues.markResolved': 'Marquer comme résolu',
  'issues.empty': 'Aucun signalement',
  'issues.searchSpecies': 'Rechercher par espèce',


  'map.chooseCity': 'Choisissez un lieu pour explorer les arbres',
  'map.legend.city': 'Commune',
  'map.legend.institution': 'Arboretum ou institut',

  'marker.trees': 'arbres',

  'city.choose': 'Choisir un lieu',
  'city.allPlaces': 'Tous les lieux',
  'species.nearest': "Afficher l'arbre le plus proche de cette espèce",
  'species.notInView': 'Hors de vue',
  'nearest.goThere': 'Afficher sur la carte',
  'nearest.back': 'Retour à la position précédente',
  'city.hidePlaces': 'Masquer les lieux',
  'sources.title': 'Sources visibles',
  'sources.inView': 'Visibles',
  'species.zoomInForTrees': 'Zoomez pour voir chaque arbre',

  'map.layer': 'Couche de carte',

  'fullscreen.enter': 'Plein écran',
  'fullscreen.exit': 'Quitter le plein écran',

  'location.goTo': 'Aller à ma position',
  'location.denied': 'Accès à la position refusé',
  'location.unavailable': 'Position indisponible',
  'location.timeout': 'Délai de localisation dépassé',

  'nameMode.scientific': 'Noms scientifiques',
  'nameMode.vernacular': 'Noms vernaculaires',

  'settings.title': 'Paramètres',

  'species.loadingTrees': 'Chargement des arbres…',
  'species.clearFilter': 'Effacer le filtre',
}

export const TRANSLATIONS: Record<Locale, Dict> = { nl, en, de, fr }
