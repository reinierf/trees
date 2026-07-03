import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { MapController } from './MapController'
import { TileCache } from './tileCache'
import { useStore, PopupKind } from '../store'
import {
  DEBOUNCE_MS, MAP_ZOOM, RESTORE_CITY_POSITION, SHARE_ZOOM,
  NL_CENTER, NL_ZOOM, MIN_CITY_SWITCH_ZOOM, CLUSTER_DISABLE_ZOOM,
} from '../config'
import { loadSavedPosition, savePosition } from './positionStorage'
import { useTreeLoader } from './useTreeLoader'
import { useMapClickHandlers } from './useMapClickHandlers'
import { useCitySwitcher } from './useCitySwitcher'
import { LAYERS } from './layers'
import type { City } from '../types'

type LocationState = { fromPicker?: boolean; fromCityMarker?: boolean; autoSwitch?: boolean } | null

export function useMap(containerRef: RefObject<HTMLDivElement | null>, city: City | null, cities: City[]) {
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

  // Tree loader updates when city.id changes; refs let the stable onMoveEnd closure always use the latest
  const { load: loadTrees, abort: abortLoad } = useTreeLoader(city?.id ?? '', tileCacheRef.current)
  const loadTreesRef = useRef(loadTrees)
  loadTreesRef.current = loadTrees
  const abortLoadRef = useRef(abortLoad)
  abortLoadRef.current = abortLoad

  const prevSpeciesFilterRef = useRef<string | null>(speciesFilter)
  useEffect(() => {
    if (prevSpeciesFilterRef.current !== null && speciesFilter === null) {
      controllerRef.current?.refresh()
    }
    prevSpeciesFilterRef.current = speciesFilter
  }, [speciesFilter])

  const { onMapClick, onMarkerClick } = useMapClickHandlers()
  const onMapClickRef = useRef(onMapClick)
  onMapClickRef.current = onMapClick
  const onMarkerClickRef = useRef(onMarkerClick)
  onMarkerClickRef.current = onMarkerClick

  const checkCitySwitch = useCitySwitcher(city, cities)
  const checkCitySwitchRef = useRef(checkCitySwitch)
  checkCitySwitchRef.current = checkCitySwitch

  // Refs for values read inside the stable onMoveEnd closure
  const cityRef = useRef(city)
  cityRef.current = city
  const citiesRef = useRef(cities)
  citiesRef.current = cities
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const locationStateRef = useRef<LocationState>(location.state as LocationState)
  locationStateRef.current = location.state as LocationState

  // ── EFFECT 1: create Leaflet map once on mount ────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const hash = window.location.hash
    const qIdx = hash.indexOf('?')

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

    const initialCity = cityRef.current
    const state = locationStateRef.current
    const fromPicker = state?.fromPicker === true
    if (fromPicker) window.history.replaceState({ ...window.history.state, usr: null }, '')

    let initCenter: [number, number]
    let initZoom: number
    if (initialCity) {
      const useSaved = fromPicker ? RESTORE_CITY_POSITION : true
      const rawSaved = useSaved ? loadSavedPosition(initialCity.id) : null
      const saved =
        rawSaved &&
        rawSaved.center[0] >= initialCity.bbox.s && rawSaved.center[0] <= initialCity.bbox.n &&
        rawSaved.center[1] >= initialCity.bbox.w && rawSaved.center[1] <= initialCity.bbox.e
          ? rawSaved
          : null
      initCenter = treeDeepLink
        ? [treeDeepLink.lat, treeDeepLink.lon]
        : (saved?.center ?? initialCity.center)
      initZoom = treeDeepLink ? SHARE_ZOOM : (saved?.zoom ?? initialCity.mapZoom ?? MAP_ZOOM)
    } else {
      initCenter = NL_CENTER
      initZoom = NL_ZOOM
    }

    const controller = new MapController({
      onMoveEnd: (bounds, zoom, center) => {
        setCurrentZoom(zoom)
        setCurrentCenter(center)

        const currentCity = cityRef.current
        const isOverviewZoom = zoom <= MIN_CITY_SWITCH_ZOOM

        // Zoom-based URL transitions
        if (isOverviewZoom && currentCity) {
          navigateRef.current('/overview', { replace: true, state: { autoSwitch: true } })
          return
        }
        if (!isOverviewZoom && !currentCity) {
          const [lat, lon] = center
          const target = citiesRef.current.find(
            (c) => c.has_data &&
              lat >= c.bbox.s && lat <= c.bbox.n &&
              lon >= c.bbox.w && lon <= c.bbox.e,
          )
          if (target) navigateRef.current(`/${target.id}`, { replace: true, state: { autoSwitch: true } })
          return
        }

        if (!currentCity) return

        if (checkCitySwitchRef.current(center, zoom)) return

        const [lat, lon] = center
        if (
          lat >= currentCity.bbox.s && lat <= currentCity.bbox.n &&
          lon >= currentCity.bbox.w && lon <= currentCity.bbox.e
        ) savePosition(currentCity.id, center, zoom)

        if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
        moveTimerRef.current = setTimeout(() => loadTreesRef.current(bounds, zoom), DEBOUNCE_MS)
      },
      onMapClick: (...args) => onMapClickRef.current(...args),
      onMarkerClick: (...args) => onMarkerClickRef.current(...args),
    })

    controller.init(el, initCenter, initZoom)
    controller.setClusterDisableZoom(initialCity?.clusterDisableZoom ?? CLUSTER_DISABLE_ZOOM)
    controllerRef.current = controller

    controller.setCityMarkers(
      citiesRef.current,
      (id) => navigateRef.current(`/${id}`, { state: { fromCityMarker: true } }),
    )

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
        window.location.pathname + hash.slice(0, qIdx),
      )
    }

    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      abortLoadRef.current()
      controller.destroy()
      controllerRef.current = null
      if (useStore.getState().popupView?.kind !== PopupKind.Favourites) closePopup()
      setVisibleTrees([])
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── EFFECT 2: react to city changes after initial mount ───────────────────
  const isFirstCityRef = useRef(true)
  useEffect(() => {
    if (isFirstCityRef.current) {
      isFirstCityRef.current = false
      return
    }

    abortLoadRef.current()
    setVisibleTrees([])
    if (useStore.getState().popupView?.kind !== PopupKind.Favourites) closePopup()

    const ctrl = controllerRef.current
    if (!ctrl) return

    ctrl.setClusterDisableZoom(city?.clusterDisableZoom ?? CLUSTER_DISABLE_ZOOM)

    const state = locationStateRef.current
    // Clear consumed navigation state so page reload doesn't re-apply it
    if (state?.fromPicker || state?.fromCityMarker) {
      window.history.replaceState({ ...window.history.state, usr: null }, '')
    }

    if (state?.autoSwitch) {
      // User panned/zoomed there — already in place, don't fly
      return
    }

    if (!city) {
      ctrl.flyToLocation(NL_CENTER[0], NL_CENTER[1], NL_ZOOM, { fly: false })
      return
    }

    if (state?.fromPicker || state?.fromCityMarker) {
      // Explicit city selection: fly to center (saved position only if RESTORE_CITY_POSITION)
      if (RESTORE_CITY_POSITION) {
        const saved = loadSavedPosition(city.id)
        const validSaved =
          saved &&
          saved.center[0] >= city.bbox.s && saved.center[0] <= city.bbox.n &&
          saved.center[1] >= city.bbox.w && saved.center[1] <= city.bbox.e
            ? saved
            : null
        if (validSaved) {
          ctrl.flyToLocation(validSaved.center[0], validSaved.center[1], validSaved.zoom)
          return
        }
      }
      ctrl.flyToLocation(city.center[0], city.center[1], city.mapZoom ?? MAP_ZOOM)
      return
    }

    // No navigation state (e.g. forward/back in browser history): restore saved or center
    const saved = loadSavedPosition(city.id)
    const validSaved =
      saved &&
      saved.center[0] >= city.bbox.s && saved.center[0] <= city.bbox.n &&
      saved.center[1] >= city.bbox.w && saved.center[1] <= city.bbox.e
        ? saved
        : null
    if (validSaved) {
      ctrl.flyToLocation(validSaved.center[0], validSaved.center[1], validSaved.zoom)
    } else {
      ctrl.flyToLocation(city.center[0], city.center[1], city.mapZoom ?? MAP_ZOOM)
    }
  }, [city?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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
      window.location.pathname + hash.slice(0, qIdx),
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
    const trees = inFavMode && city ? (favourites[city.id] ?? []) : []
    controllerRef.current?.setFavouriteMarkers(trees)
    controllerRef.current?.setFavouritesMode(inFavMode)
  }, [popupView, favourites, city?.id])

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
