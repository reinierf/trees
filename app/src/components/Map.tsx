import { useEffect, useRef } from 'react'
import { useMap } from '../map/useMap'
import { useDebugMode } from '../map/useDebugMode'
import { useStore } from '../store'
import { NL_CENTER, NL_ZOOM } from '../config'
import { fetchIssues } from '../api/trees'
import { zoomForAccuracy } from '../lib/utils'
import { PLACE_COLORS } from '../map/markerIcon'
import { useT } from '../translations/useT'
import { SpeciesButton } from './SpeciesButton'
import { CityButton } from './CityButton'
import { LocationButton } from './LocationButton'
import { FullscreenButton } from './FullscreenButton'
import { LoadingSpinner } from './LoadingSpinner'
import { SpeciesFilterBadge } from './SpeciesFilterBadge'
import { LayerButton } from './LayerButton'
import { FavouritesButton } from './FavouritesButton'
import { IssuesButton } from './IssuesButton'
import { SourcesButton } from './SourcesButton'
import { BackBar } from './BackBar'

/** controls=false hides every overlay and button, leaving just the map (e.g. behind the welcome dialog). */
export function Map({ controls = true }: { controls?: boolean }) {
  const t = useT()
  const containerRef = useRef<HTMLDivElement>(null)
  const { controllerRef, markJump, goToPlace } = useMap(containerRef)
  const isLoading = useStore((s) => s.isLoading)
  const currentZoom = useStore((s) => s.currentZoom)
  const currentCenter = useStore((s) => s.currentCenter)
  const allTreeMode = useStore((s) => s.allTreeMode)
  const countInView = useStore((s) => s.countInView)
  const speciesFilter = useStore((s) => s.speciesFilter)
  const setSpeciesFilter = useStore((s) => s.setSpeciesFilter)
  const clearSpeciesFilter = useStore((s) => s.clearSpeciesFilter)
  const placesOverlay = useStore((s) => s.placesOverlay)
  const setPlacesOverlay = useStore((s) => s.setPlacesOverlay)

  const debugMode = useStore((s) => s.debugMode)
  const setIssues = useStore((s) => s.setIssues)
  useDebugMode()

  useEffect(() => {
    if (!debugMode) return
    fetchIssues().then(({ trees, species }) => setIssues(trees, species)).catch(console.error)
  }, [debugMode, setIssues])

  const pendingSpeciesSelect    = useStore((s) => s.pendingSpeciesSelect)
  const setPendingSpeciesSelect = useStore((s) => s.setPendingSpeciesSelect)

  useEffect(() => {
    if (pendingSpeciesSelect !== null) {
      setPendingSpeciesSelect(null)
      setSpeciesFilter(pendingSpeciesSelect)
    }
  }, [pendingSpeciesSelect, setPendingSpeciesSelect, setSpeciesFilter])

  function handleLocate(lat: number, lon: number, accuracy: number) {
    markJump()
    controllerRef.current?.flyToLocation(lat, lon, zoomForAccuracy(accuracy))
    controllerRef.current?.setLocationMarker(lat, lon)
  }

  function handleAllPlaces() {
    markJump()
    controllerRef.current?.flyToLocation(NL_CENTER[0], NL_CENTER[1], NL_ZOOM)
    setPlacesOverlay(true)
  }

  const centerStr = currentCenter
    ? `[${currentCenter[0].toFixed(4)}, ${currentCenter[1].toFixed(4)}]`
    : ''

  return (
    <div className={`relative w-full h-full ${controls ? '' : '[&_.leaflet-control-zoom]:hidden'}`}>
      <div ref={containerRef} className="w-full h-full" />
      {controls && <>
      {placesOverlay && !speciesFilter && (
        <div className="absolute inset-x-0 top-4 flex justify-center pointer-events-none z-[1000]">
          <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-md text-sm text-muted-foreground">
            {t('map.chooseCity')}
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {(['city', 'institution'] as const).map((type) => (
                <span key={type} className="flex items-center gap-1.5">
                  <span
                    className="w-[13px] h-[13px] rounded-full ring-1 ring-white shadow-sm"
                    style={{ backgroundColor: PLACE_COLORS[type] }}
                  />
                  {t(`map.legend.${type}`)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      {isLoading && (
        <div className="absolute inset-x-0 top-3 flex justify-center pointer-events-none z-[1000]">
          <LoadingSpinner />
        </div>
      )}
      {debugMode && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 pointer-events-none z-[1000] font-mono text-xs bg-black/60 text-white px-2 py-1 rounded">
          z{currentZoom} · {allTreeMode ? 'trees' : 'clusters'} · {countInView} in view{centerStr && ` · ${centerStr}`}
        </div>
      )}
      <SpeciesFilterBadge onClear={clearSpeciesFilter} />
      <BackBar />
      <FullscreenButton />
      <LayerButton onSwitch={(url, attribution, maxZoom) => controllerRef.current?.switchTileLayer(url, attribution, maxZoom)} />
      <CityButton onAllPlaces={handleAllPlaces} onPlace={goToPlace} />
      <SpeciesButton />
      <FavouritesButton />
      <IssuesButton />
      <SourcesButton />
      <LocationButton onLocate={handleLocate} />
      </>}
    </div>
  )
}
