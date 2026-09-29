import { useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { MapController } from './MapController'
import { TileCache } from './tileCache'
import { useStore, PopupKind } from '../store'
import { CLUSTER_DISABLE_ZOOM, DEBOUNCE_MS, NL_CENTER, NL_ZOOM, PLACES_OVERLAY_MAX_ZOOM, SHARE_ZOOM } from '../config'
import { useTileLoader } from './useTileLoader'
import { useMapClickHandlers } from './useMapClickHandlers'
import { pushUrlPosition, readUrlState, replaceUrlPosition } from './urlState'
import { recordCityVisit } from '../lib/recentCitiesStorage'
import { treeKey } from '../lib/treeKey'
import { LAYERS } from './layers'
import type { Source, Tree } from '../types'

export interface MapHandle {
  controllerRef: RefObject<MapController | null>
  /** Record the current view as a history entry before a deliberate jump, so back returns here. */
  markJump: () => void
  goToPlace: (source: Source) => void
}

export function useMap(containerRef: RefObject<HTMLDivElement | null>): MapHandle {
  const controllerRef = useRef<MapController | null>(null)
  const prevPopupKind = useRef<string | undefined>(undefined)
  const prevSelectedTreeKey = useRef<string | undefined>(undefined)
  const pendingAnimatedRef = useRef<string | null>(null)
  const highlightedIssueKeyRef = useRef<string | null>(null)
  const tileCacheRef = useRef(new TileCache())
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const loadedZoomRef = useRef<number | null>(null)

  const closePopup = useStore((s) => s.closePopup)
  const setCurrentZoom = useStore((s) => s.setCurrentZoom)
  const setCurrentCenter = useStore((s) => s.setCurrentCenter)
  const setPendingTree = useStore((s) => s.setPendingTree)
  const setPendingCenter = useStore((s) => s.setPendingCenter)
  const setPendingHighlight = useStore((s) => s.setPendingHighlight)
  const setPlacesOverlay = useStore((s) => s.setPlacesOverlay)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const meta = useStore((s) => s.meta)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const clusters = useStore((s) => s.clusters)
  const sourcesInView = useStore((s) => s.sourcesInView)
  const sourcesById = useStore((s) => s.sourcesById)
  const popupView = useStore((s) => s.popupView)
  const pendingTree = useStore((s) => s.pendingTree)
  const pendingCenter = useStore((s) => s.pendingCenter)
  const pendingHighlight = useStore((s) => s.pendingHighlight)
  const pendingFlyTo = useStore((s) => s.pendingFlyTo)
  const setPendingFlyTo = useStore((s) => s.setPendingFlyTo)
  const pendingHighlightKey = useStore((s) => s.pendingHighlightKey)
  const setPendingHighlightKey = useStore((s) => s.setPendingHighlightKey)
  const favourites = useStore((s) => s.favourites)
  const speciesFilter = useStore((s) => s.speciesFilter)
  const placesOverlay = useStore((s) => s.placesOverlay)
  const locale = useStore((s) => s.locale)

  const { load: loadTiles, abort: abortLoad } = useTileLoader(tileCacheRef.current)
  const loadTilesRef = useRef(loadTiles)
  loadTilesRef.current = loadTiles
  const abortLoadRef = useRef(abortLoad)
  abortLoadRef.current = abortLoad

  const { onMapClick, onMarkerClick, onGroupMarkerClick } = useMapClickHandlers()
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  const onMarkerClickRef = useRef(onMarkerClick)
  onMarkerClickRef.current = onMarkerClick
  const onGroupMarkerClickRef = useRef(onGroupMarkerClick)
  onGroupMarkerClickRef.current = onGroupMarkerClick

  const markJump = useCallback(() => {
    const view = controllerRef.current?.getView()
    if (view) pushUrlPosition(view.center, view.zoom)
  }, [])

  const goToPlace = useCallback((source: Source) => {
    setPlacesOverlay(false)
    recordCityVisit(source.id)
    markJump()
    controllerRef.current?.fitBbox(source.bbox)
  }, [markJump, setPlacesOverlay])

  // ── EFFECT 1: create Leaflet map once on mount ────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const urlState = readUrlState()
    if (urlState?.tree) setPendingTree(urlState.tree)
    // First visit (no position in the URL): national overview with the places to pick from.
    if (!urlState) setPlacesOverlay(true)

    const controller = new MapController({
      // A new move makes any load for the previous view pointless: cancel it before it starts,
      // or abort it in flight.
      onMoveStart: () => {
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        abortLoadRef.current()
      },
      onMoveEnd: (bounds, zoom, center) => {
        setCurrentZoom(zoom)
        setCurrentCenter(center)
        replaceUrlPosition(center, zoom)
        // Zooming in by hand means the user has found their place: back to the trees.
        if (zoom > PLACES_OVERLAY_MAX_ZOOM && useStore.getState().placesOverlay) setPlacesOverlay(false)
        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        // A zoom step is one discrete action: load at once. While scrolling through several
        // levels, the next step's movestart aborts the load for the level passed through.
        // Panning comes in small drags, so its load waits until the map has been still a while.
        const zoomChanged = zoom !== loadedZoomRef.current
        loadedZoomRef.current = zoom
        if (zoomChanged) loadTilesRef.current(bounds, zoom)
        else moveTimerRef.current = setTimeout(() => loadTilesRef.current(bounds, zoom), DEBOUNCE_MS)
      },
      onMapClick: (...args) => onMapClickRef.current(...args),
      onMarkerClick: (...args) => onMarkerClickRef.current(...args),
      onGroupMarkerClick: (...args) => onGroupMarkerClickRef.current(...args),
    })

    controller.init(
      el,
      urlState?.center ?? NL_CENTER,
      urlState ? (urlState.tree ? SHARE_ZOOM : urlState.zoom) : NL_ZOOM,
    )
    controllerRef.current = controller

    const storedLayerId = useStore.getState().tileLayerId
    if (storedLayerId !== 'streets') {
      const layer = LAYERS.find((l) => l.id === storedLayerId)
      if (layer) controller.switchTileLayer(layer.url, layer.attribution, layer.maxZoom)
    }

    // Back/forward (and editing the URL by hand): move the map to the entry's position.
    function onPopState() {
      const state = readUrlState()
      if (!state) return
      if (state.tree) setPendingTree(state.tree)
      controller.flyToLocation(state.center[0], state.center[1], state.tree ? SHARE_ZOOM : state.zoom, { fly: false })
    }
    window.addEventListener('popstate', onPopState)

    return () => {
      window.removeEventListener('popstate', onPopState)
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      abortLoadRef.current()
      controller.destroy()
      controllerRef.current = null
      closePopup()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Reload what's in view when the data (build version) or the species filter changes;
  // both are part of the tile cache key, so this fetches fresh tiles.
  useEffect(() => {
    loadedZoomRef.current = null  // deliberate change: load at once, not after the pan delay
    controllerRef.current?.refresh()
  }, [meta?.version, speciesFilter])

  // Place markers: rebuilt when the places or the language (tooltips) change.
  useEffect(() => {
    if (!meta) return
    controllerRef.current?.setPlaceMarkers(meta.sources, goToPlace)
  }, [meta, locale, goToPlace])

  useEffect(() => {
    controllerRef.current?.setPlacesVisible(placesOverlay)
  }, [placesOverlay, meta])

  useEffect(() => {
    controllerRef.current?.setTrees(visibleTrees)
  }, [visibleTrees])

  useEffect(() => {
    controllerRef.current?.setServerClusters(clusters)
  }, [clusters])

  // Dense, small datasets (arboretums) keep clustering one zoom longer while they're in view.
  useEffect(() => {
    let zoom = CLUSTER_DISABLE_ZOOM
    for (const id of Object.keys(sourcesInView)) {
      const override = sourcesById.get(id)?.clusterDisableZoom
      if (override && override > zoom) zoom = override
    }
    controllerRef.current?.setClusterDisableZoom(zoom)
  }, [sourcesInView, sourcesById])

  useEffect(() => {
    if (!pendingCenter) return
    controllerRef.current?.panTo(pendingCenter[0], pendingCenter[1])
    setPendingCenter(null)
  }, [pendingCenter, setPendingCenter])

  useEffect(() => {
    if (!pendingFlyTo) return
    const { lat, lon, minZoom } = pendingFlyTo
    const zoom = Math.max(useStore.getState().currentZoom, minZoom)
    markJump()
    controllerRef.current?.flyToLocation(lat, lon, zoom)
    setPendingFlyTo(null)
  }, [pendingFlyTo, setPendingFlyTo, markJump])

  useEffect(() => {
    if (!pendingHighlight) return
    controllerRef.current?.highlightTree(pendingHighlight, true)
    setPendingHighlight(null)
  }, [pendingHighlight, setPendingHighlight])

  useEffect(() => {
    const inFavMode = popupView?.kind === PopupKind.Favourites ||
      (popupView?.kind === PopupKind.TreeDetail && popupView.returnTo === PopupKind.Favourites)
    controllerRef.current?.setFavouriteMarkers(inFavMode ? Object.values(favourites) : [])
    controllerRef.current?.setFavouritesMode(inFavMode)
  }, [popupView, favourites])

  // A shared tree link opens the tree's detail panel once its tile has loaded.
  const pendingTreeKey = pendingTree ? treeKey(pendingTree) : null
  useEffect(() => {
    if (!pendingTreeKey) return
    const pending = visibleTrees.find((t) => treeKey(t) === pendingTreeKey)
    if (!pending) return
    openTreeDetail(pending)
    setPendingTree(null)
  }, [visibleTrees, pendingTreeKey, openTreeDetail, setPendingTree])

  useEffect(() => {
    const pv = popupView
    const find = (key: string): Tree | null => visibleTrees.find((t) => treeKey(t) === key) ?? null
    let tree: Tree | null = null
    let species: number | null = null
    let animate = false

    if (pv?.kind === PopupKind.TreeDetail) {
      tree = pv.tree
      highlightedIssueKeyRef.current = null
    } else if (pv?.kind === PopupKind.SpeciesList && pv.expandedSpecies !== undefined) {
      species = pv.expandedSpecies
      highlightedIssueKeyRef.current = null
      if (pv.selectedTreeKey) {
        tree = find(pv.selectedTreeKey)
        animate = prevPopupKind.current === PopupKind.SpeciesList && pv.selectedTreeKey !== prevSelectedTreeKey.current
      }
    } else if (pendingTreeKey) {
      tree = find(pendingTreeKey)
      if (tree) {
        animate = pendingAnimatedRef.current !== pendingTreeKey
        pendingAnimatedRef.current = pendingTreeKey
      }
      highlightedIssueKeyRef.current = null
    } else if (pendingHighlightKey) {
      tree = find(pendingHighlightKey)
      if (tree) {
        animate = highlightedIssueKeyRef.current !== pendingHighlightKey
        highlightedIssueKeyRef.current = pendingHighlightKey
        setPendingHighlightKey(null)
      }
    } else if (highlightedIssueKeyRef.current) {
      tree = find(highlightedIssueKeyRef.current)
    }

    prevPopupKind.current = pv?.kind
    prevSelectedTreeKey.current = pv?.kind === PopupKind.SpeciesList ? pv.selectedTreeKey : undefined

    controllerRef.current?.highlightTree(tree, animate)
    controllerRef.current?.highlightSpecies(species)
  }, [popupView, visibleTrees, pendingTreeKey, pendingHighlightKey, setPendingHighlightKey])

  return { controllerRef, markJump, goToPlace }
}
