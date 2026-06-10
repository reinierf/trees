import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation } from 'react-router-dom'
import { MapController } from './MapController'
import { TileCache } from './tileCache'
import { useStore } from '../store'
import { DEBOUNCE_MS, MAP_ZOOM, RESTORE_CITY_POSITION, SHARE_ZOOM } from '../config'
import { loadSavedPosition, savePosition } from './positionStorage'
import { useTreeLoader } from './useTreeLoader'
import { useMapClickHandlers } from './useMapClickHandlers'
import { useCitySwitcher } from './useCitySwitcher'
import { LAYERS } from './layers'
import type { City } from '../types'

export function useMap(containerRef: RefObject<HTMLDivElement | null>, city: City, cities: City[]) {
  const location = useLocation()
  const controllerRef = useRef<MapController | null>(null)
  const prevPopupKind = useRef<string | undefined>(undefined)
  const prevSelectedTreeId = useRef<string | undefined>(undefined)
  const pendingAnimatedRef = useRef<string | null>(null)
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
  const favourites = useStore((s) => s.favourites)

  const { load: loadTrees, abort: abortLoad } = useTreeLoader(city.id, tileCacheRef.current)
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
      if (useStore.getState().popupView?.kind !== 'favourites') closePopup()
      setVisibleTrees([])
    }
  }, [city, checkCitySwitch, loadTrees, abortLoad, onMapClick, onMarkerClick, closePopup, setVisibleTrees, setCurrentZoom, setCurrentCenter, setPendingTreeId]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!pendingHighlight) return
    controllerRef.current?.highlightTree(pendingHighlight, true)
    setPendingHighlight(null)
  }, [pendingHighlight, setPendingHighlight])

  useEffect(() => {
    const inFavMode = popupView?.kind === 'favourites' ||
      (popupView?.kind === 'tree-detail' && popupView.returnTo === 'favourites')
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

    if (pv?.kind === 'tree-detail') {
      tree = pv.tree
      species = pv.tree.species_binomial ?? null
    } else if (pv?.kind === 'species-list' && pv.expandedSpecies) {
      species = pv.expandedSpecies
      if (pv.selectedTreeId) {
        tree = visibleTrees.find((t) => t.id === pv.selectedTreeId) ?? null
        animate = prevPopupKind.current === 'species-list' && pv.selectedTreeId !== prevSelectedTreeId.current
      }
    } else if (pendingTreeId) {
      const pending = visibleTrees.find((t) => t.id === pendingTreeId)
      if (pending) {
        tree = pending
        species = pending.species_binomial ?? null
        animate = pendingAnimatedRef.current !== pendingTreeId
        pendingAnimatedRef.current = pendingTreeId
      }
    }

    prevPopupKind.current = pv?.kind
    prevSelectedTreeId.current = pv?.kind === 'species-list' ? pv.selectedTreeId : undefined

    controllerRef.current?.highlightTree(tree, animate)
    controllerRef.current?.highlightSpecies(species)
  }, [popupView, visibleTrees, pendingTreeId])

  return controllerRef
}
