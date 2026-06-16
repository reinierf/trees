import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapController } from './MapController'
import { TileCache } from './tileCache'
import { useStore, PopupKind } from '../store'
import { DEBOUNCE_MS, MAP_ZOOM, RESTORE_CITY_POSITION, SHARE_ZOOM } from '../config'
import { loadSavedPosition, savePosition } from './positionStorage'
import { useTreeLoader } from './useTreeLoader'
import { useMapClickHandlers } from './useMapClickHandlers'
import { useCitySwitcher } from './useCitySwitcher'
import { LAYERS } from './layers'
import type { City } from '../types'

export function useMap(containerRef: RefObject<HTMLDivElement | null>, city: City, cities: City[]) {
  const location = useLocation()
  const navigate = useNavigate()
  const controllerRef = useRef<MapController | null>(null)
  const prevPopupKind = useRef<string | undefined>(undefined)
  const prevSelectedTreeId = useRef<string | undefined>(undefined)
  const pendingAnimatedRef = useRef<string | null>(null)
  const highlightedIssueIdRef = useRef<string | null>(null)
  const tileCacheRef = useRef(new TileCache())
  const moveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const closePopup = useStore((s) => s.closePopup)
  const setVisibleTrees = useStore((s) => s.setVisibleTrees)
  const setCurrentZoom = useStore((s) => s.setCurrentZoom)
  const setCurrentCenter = useStore((s) => s.setCurrentCenter)
  const setPendingTreeId = useStore((s) => s.setPendingTreeId)
  const setPendingCenter = useStore((s) => s.setPendingCenter)
  const setPendingHighlight = useStore((s) => s.setPendingHighlight)
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const visibleTrees = useStore((s) => s.visibleTrees)
  const popupView = useStore((s) => s.popupView)
  const pendingTreeId = useStore((s) => s.pendingTreeId)
  const pendingCenter = useStore((s) => s.pendingCenter)
  const pendingHighlight = useStore((s) => s.pendingHighlight)
  const pendingFlyTo = useStore((s) => s.pendingFlyTo)
  const setPendingFlyTo = useStore((s) => s.setPendingFlyTo)
  const pendingHighlightId = useStore((s) => s.pendingHighlightId)
  const setPendingHighlightId = useStore((s) => s.setPendingHighlightId)
  const favourites = useStore((s) => s.favourites)
  const speciesFilter = useStore((s) => s.speciesFilter)

  const { load: loadTrees, abort: abortLoad } = useTreeLoader(city.id, tileCacheRef.current)
  const prevSpeciesFilterRef = useRef<string | null>(speciesFilter)
  useEffect(() => {
    if (prevSpeciesFilterRef.current !== null && speciesFilter === null) {
      controllerRef.current?.refresh()
    }
    prevSpeciesFilterRef.current = speciesFilter
  }, [speciesFilter])

  const { onMapClick, onMarkerClick } = useMapClickHandlers()
  const checkCitySwitch = useCitySwitcher(city, cities)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const hash = window.location.hash
    const qIdx = hash.indexOf('?')

    // Parse URL params: tree deep link takes precedence over plain lat/lon fly
    let treeDeepLink: { lat: number; lon: number } | null = null
    let locationFly: { lat: number; lon: number } | null = null
    if (qIdx !== -1) {
      const params = new URLSearchParams(hash.slice(qIdx))
      const lat = parseFloat(params.get('lat') ?? '')
      const lon = parseFloat(params.get('lon') ?? '')
      const treeId = params.get('tree')
      if (!isNaN(lat) && !isNaN(lon)) {
        if (treeId) {
          treeDeepLink = { lat, lon }
          setPendingTreeId(treeId)
        } else {
          locationFly = { lat, lon }
        }
      }
    }

    // fromPicker is true only when CityButton triggered this navigation.
    // Clear it from history immediately so a page reload gets normal (saved) behavior.
    const fromPicker = (location.state as { fromPicker?: boolean } | null)?.fromPicker === true
    if (fromPicker) window.history.replaceState({ ...window.history.state, usr: null }, '')

    const useSaved = fromPicker ? RESTORE_CITY_POSITION : true
    const rawSaved = useSaved ? loadSavedPosition(city.id) : null
    const saved =
      rawSaved &&
      rawSaved.center[0] >= city.bbox.s && rawSaved.center[0] <= city.bbox.n &&
      rawSaved.center[1] >= city.bbox.w && rawSaved.center[1] <= city.bbox.e
        ? rawSaved
        : null

    // For tree deep links initialise directly at the target so whenReady's
    // invalidateSize() cannot interrupt a flyTo and leave the tree off-centre.
    const initCenter = treeDeepLink
      ? ([treeDeepLink.lat, treeDeepLink.lon] as [number, number])
      : (saved?.center ?? city.center)
    const initZoom = treeDeepLink ? SHARE_ZOOM : (saved?.zoom ?? MAP_ZOOM)

    const controller = new MapController({
      onMoveEnd: (bounds, zoom, center) => {
        setCurrentZoom(zoom)
        setCurrentCenter(center)

        if (checkCitySwitch(center, zoom)) return

        const [lat, lon] = center
        if (
          lat >= city.bbox.s && lat <= city.bbox.n &&
          lon >= city.bbox.w && lon <= city.bbox.e
        ) savePosition(city.id, center, zoom)

        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        moveTimerRef.current = setTimeout(() => loadTrees(bounds, zoom), DEBOUNCE_MS)
      },
      onMapClick,
      onMarkerClick,
    })

    controller.init(el, initCenter, initZoom)
    controllerRef.current = controller

    controller.setCityMarkers(cities, (id) => navigate(`/${id}`))

    const storedLayerId = useStore.getState().tileLayerId
    if (storedLayerId !== 'streets') {
      const layer = LAYERS.find((l) => l.id === storedLayerId)
      if (layer) controller.switchTileLayer(layer.url, layer.attribution, layer.maxZoom)
    }

    if (locationFly) {
      controller.flyToLocation(locationFly.lat, locationFly.lon)
      controller.setLocationMarker(locationFly.lat, locationFly.lon)
    }

    if (treeDeepLink || locationFly) {
      window.history.replaceState(
        window.history.state, '',
        window.location.pathname + hash.slice(0, qIdx)
      )
    }

    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      abortLoad()
      controller.destroy()
      controllerRef.current = null
      if (useStore.getState().popupView?.kind !== PopupKind.Favourites) closePopup()
      setVisibleTrees([])
    }
  }, [city, cities, navigate, checkCitySwitch, loadTrees, abortLoad, onMapClick, onMarkerClick, closePopup, setVisibleTrees, setCurrentZoom, setCurrentCenter, setPendingTreeId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle deep-link navigation when already on the page (e.g. pasting a share URL
  // in an existing tab). The init effect above won't re-run because city didn't change,
  // so we act directly on the existing controller.
  useEffect(() => {
    const hash = window.location.hash
    const qIdx = hash.indexOf('?')
    if (qIdx === -1) return

    const params = new URLSearchParams(hash.slice(qIdx))
    const lat = parseFloat(params.get('lat') ?? '')
    const lon = parseFloat(params.get('lon') ?? '')
    if (isNaN(lat) || isNaN(lon)) return

    const treeId = params.get('tree')
    if (treeId) {
      setPendingTreeId(treeId)
      controllerRef.current?.flyToLocation(lat, lon, SHARE_ZOOM)
    } else {
      controllerRef.current?.flyToLocation(lat, lon)
      controllerRef.current?.setLocationMarker(lat, lon)
    }

    window.history.replaceState(
      window.history.state, '',
      window.location.pathname + hash.slice(0, qIdx)
    )
  }, [location.search, setPendingTreeId])

  useEffect(() => {
    controllerRef.current?.setTrees(visibleTrees)
  }, [visibleTrees])

  useEffect(() => {
    if (!pendingCenter) return
    controllerRef.current?.panTo(pendingCenter[0], pendingCenter[1])
    setPendingCenter(null)
  }, [pendingCenter, setPendingCenter])

  useEffect(() => {
    if (!pendingFlyTo) return
    const { lat, lon, minZoom } = pendingFlyTo
    const zoom = Math.max(useStore.getState().currentZoom, minZoom)
    controllerRef.current?.flyToLocation(lat, lon, zoom)
    setPendingFlyTo(null)
  }, [pendingFlyTo, setPendingFlyTo])

  useEffect(() => {
    if (!pendingHighlight) return
    controllerRef.current?.highlightTree(pendingHighlight, true)
    setPendingHighlight(null)
  }, [pendingHighlight, setPendingHighlight])

  useEffect(() => {
    const inFavMode = popupView?.kind === PopupKind.Favourites ||
      (popupView?.kind === PopupKind.TreeDetail && popupView.returnTo === PopupKind.Favourites)
    const trees = inFavMode ? (favourites[city.id] ?? []) : []
    controllerRef.current?.setFavouriteMarkers(trees)
    controllerRef.current?.setFavouritesMode(inFavMode)
  }, [popupView, favourites, city.id])

  useEffect(() => {
    if (!pendingTreeId) return
    const pending = visibleTrees.find((t) => t.id === pendingTreeId)
    if (!pending) return
    openTreeDetail(pending)
    setPendingTreeId(null)
  }, [visibleTrees, pendingTreeId, openTreeDetail, setPendingTreeId])

  useEffect(() => {
    const pv = popupView
    let tree = null
    let species = null
    let animate = false

    if (pv?.kind === PopupKind.TreeDetail) {
      tree = pv.tree
      highlightedIssueIdRef.current = null
    } else if (pv?.kind === PopupKind.SpeciesList && pv.expandedSpecies) {
      species = pv.expandedSpecies
      highlightedIssueIdRef.current = null
      if (pv.selectedTreeId) {
        tree = visibleTrees.find((t) => t.id === pv.selectedTreeId) ?? null
        animate = prevPopupKind.current === PopupKind.SpeciesList && pv.selectedTreeId !== prevSelectedTreeId.current
      }
    } else if (pendingTreeId) {
      const pending = visibleTrees.find((t) => t.id === pendingTreeId)
      if (pending) {
        tree = pending
        animate = pendingAnimatedRef.current !== pendingTreeId
        pendingAnimatedRef.current = pendingTreeId
      }
      highlightedIssueIdRef.current = null
    } else if (pendingHighlightId) {
      const pending = visibleTrees.find((t) => t.id === pendingHighlightId)
      if (pending) {
        animate = highlightedIssueIdRef.current !== pendingHighlightId
        highlightedIssueIdRef.current = pendingHighlightId
        setPendingHighlightId(null)
        tree = pending
      }
    } else if (highlightedIssueIdRef.current) {
      tree = visibleTrees.find((t) => t.id === highlightedIssueIdRef.current!) ?? null
    }

    prevPopupKind.current = pv?.kind
    prevSelectedTreeId.current = pv?.kind === PopupKind.SpeciesList ? pv.selectedTreeId : undefined

    controllerRef.current?.highlightTree(tree, animate)
    controllerRef.current?.highlightSpecies(species)
  }, [popupView, visibleTrees, pendingTreeId, pendingHighlightId, setPendingHighlightId])

  return controllerRef
}
