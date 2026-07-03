import L from 'leaflet'
import 'leaflet.markercluster'
import type { Bbox, City, Tree } from '../types'
import { MAP_ZOOM, MAP_MAX_ZOOM, CLUSTER_DISABLE_ZOOM, MIN_CITY_SWITCH_ZOOM } from '../config'
import { createSpeciesIcon, createClusterIcon, createSelectedSpeciesIcon, createCityCircleMarker } from './markerIcon'
import { capitalizeFirst } from '../lib/utils'

interface Callbacks {
    onMoveEnd: (bounds: Bbox, zoom: number, center: [number, number]) => void
    onMarkerClick: (tree: Tree) => void
    onMapClick: () => void
}

export class MapController {
    private map: L.Map | null = null
    private tileLayer: L.TileLayer | null = null
    private clusterLayer: L.MarkerClusterGroup
    private clusterDisableZoom: number = CLUSTER_DISABLE_ZOOM
    private readonly favouriteLayer: L.LayerGroup = L.layerGroup()
    private readonly callbacks: Callbacks
    private dragOccurred = false
    private currentHighlight: string | null = null
    private readonly onPointerDown = () => { this.dragOccurred = false }
    private readonly cityMarkersLayer: L.LayerGroup = L.layerGroup()

    constructor(callbacks: Callbacks) {
        this.callbacks = callbacks
        this.clusterLayer = this.buildClusterLayer(this.clusterDisableZoom)
    }

    private buildClusterLayer(disableClusteringAtZoom: number): L.MarkerClusterGroup {
        return L.markerClusterGroup({
            iconCreateFunction: (cluster) => createClusterIcon(cluster.getChildCount()),
            disableClusteringAtZoom,
            chunkedLoading: true,
            animate: false,
        })
    }

    // disableClusteringAtZoom is constructor-only in Leaflet.markercluster (no
    // live setter), so a change means tearing down and recreating the cluster
    // group. Guarded on the value actually changing — most city switches share
    // the same (default) zoom, and recreating the layer needlessly would be
    // wasted work and a visible flicker.
    setClusterDisableZoom(zoom: number): void {
        if (zoom === this.clusterDisableZoom) return
        this.clusterDisableZoom = zoom
        const currentMarkers = this.markers.map(({ m }) => m)
        this.clusterLayer.remove()
        this.clusterLayer = this.buildClusterLayer(zoom)
        if (this.map) this.clusterLayer.addTo(this.map)
        this.clusterLayer.addLayers(currentMarkers)
    }

    init(el: HTMLDivElement, center: [number, number], zoom?: number): void {
        this.map = L.map(el, { center, zoom: zoom ?? MAP_ZOOM })

        this.tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
            maxZoom: MAP_MAX_ZOOM,
        }).addTo(this.map)

        this.map.createPane('favouritePane').style.zIndex = '620'
        this.map.createPane('selectionPane').style.zIndex = '640'

        this.clusterLayer.addTo(this.map)
        this.favouriteLayer.addTo(this.map)

        this.map.on('moveend', () => this.fireMoveEnd())
        this.map.on('drag', () => { this.dragOccurred = true })
        this.map.on('click', () => { if (!this.dragOccurred) this.callbacks.onMapClick() })
        this.map.on('zoomstart', () => this.clearActiveTip())
        el.addEventListener('pointerdown', this.onPointerDown)
        this.map.whenReady(() => {
            this.map?.invalidateSize()
            this.fireMoveEnd()
        })
    }

    refresh(): void {
        this.fireMoveEnd()
    }

    private fireMoveEnd(): void {
        if (!this.map) return
        const b = this.map.getBounds()
        const c = this.map.getCenter()
        const zoom = this.map.getZoom()
        this.updateCityMarkersVisibility(zoom)
        this.callbacks.onMoveEnd(
            {
                nw: { lat: b.getNorth(), lon: b.getWest() },
                se: { lat: b.getSouth(), lon: b.getEast() },
            },
            zoom,
            [c.lat, c.lng],
        )
    }

    private updateCityMarkersVisibility(zoom: number): void {
        if (!this.map || this.cityMarkersLayer.getLayers().length === 0) return
        if (zoom <= MIN_CITY_SWITCH_ZOOM) {
            this.cityMarkersLayer.addTo(this.map)
        } else {
            this.cityMarkersLayer.remove()
        }
    }

    private markers: Array<{ m: L.Marker; species: string }> = []
    private favMode = false

    private static tooltipContent(tree: Tree): string {
        const species = `<span style="font-style:italic;font-weight:600">${capitalizeFirst(tree.species_binomial ?? tree.species)}</span>`
        if (!tree.name_vernacular) return species
        const vernacular = capitalizeFirst(tree.name_vernacular.toLowerCase())
            .replace(/'([a-z])/g, (_, c: string) => `'${c.toUpperCase()}`)
        return `${species}, ${vernacular}`
    }

    private tooltipGen = 0
    private favTooltipGen = 0
    private activeTip: L.Tooltip | null = null
    private activeTimer: ReturnType<typeof setTimeout> | null = null

    private clearActiveTip(): void {
        if (this.activeTimer !== null) { clearTimeout(this.activeTimer); this.activeTimer = null }
        this.activeTip?.remove()
        this.activeTip = null
    }

    private addDelayedTooltip(m: L.Marker, tree: Tree, gen: number, getGen: () => number): void {
        m.on('mouseover', () => {
            this.clearActiveTip()
            this.activeTimer = setTimeout(() => {
                this.activeTimer = null
                if (gen !== getGen() || !this.map) return
                this.activeTip = L.tooltip({ direction: 'top', offset: [0, -8] })
                    .setLatLng(m.getLatLng())
                    .setContent(MapController.tooltipContent(tree))
                    .addTo(this.map)
            }, 500)
        })
        m.on('mouseout', () => this.clearActiveTip())
    }

    setTrees(trees: Tree[]): void {
        this.tooltipGen++
        this.clusterLayer.clearLayers()
        this.markers = []
        const layerMarkers: L.Marker[] = []
        const gen = this.tooltipGen
        for (const tree of trees) {
            if (!tree.species_binomial) continue
            const m = L.marker([tree.lat, tree.lon], { icon: createSpeciesIcon(tree.species_binomial) })
            this.addDelayedTooltip(m, tree, gen, () => this.tooltipGen)
            m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.callbacks.onMarkerClick(tree) })
            this.markers.push({ m, species: tree.species_binomial })
            layerMarkers.push(m)
        }
        this.clusterLayer.addLayers(layerMarkers)
        this.applyOpacities()
    }

    setFavouriteMarkers(trees: Tree[]): void {
        this.favTooltipGen++
        this.favouriteLayer.clearLayers()
        const gen = this.favTooltipGen
        for (const tree of trees) {
            if (!tree.species_binomial) continue
            const m = L.marker([tree.lat, tree.lon], {
                icon: createSpeciesIcon(tree.species_binomial),
                pane: 'favouritePane',
            })
            this.addDelayedTooltip(m, tree, gen, () => this.favTooltipGen)
            m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.callbacks.onMarkerClick(tree) })
            this.favouriteLayer.addLayer(m)
        }
    }

    panTo(lat: number, lon: number): void {
        this.map?.panTo([lat, lon])
    }

    flyToLocation(lat: number, lon: number, zoom = 16, { fly = true }: { fly?: boolean } = {}): void {
        this.cityMarkersLayer.remove()
        if (fly) {
            this.map?.flyTo([lat, lon], zoom)
        } else {
            this.map?.setView([lat, lon], zoom, { animate: true })
        }
    }

    fitTrees(trees: { lat: number; lon: number }[]): void {
        if (!this.map || trees.length === 0) return
        const bounds = L.latLngBounds(trees.map((t) => [t.lat, t.lon] as [number, number]))
        this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: MAP_ZOOM })
    }

    private selectedRing: L.Marker | null = null
    private locationMarker: L.CircleMarker | null = null

    setLocationMarker(lat: number, lon: number): void {
        if (!this.map) return
        if (this.locationMarker) {
            this.locationMarker.setLatLng([lat, lon])
        } else {
            this.locationMarker = L.circleMarker([lat, lon], {
                radius: 8,
                fillColor: '#3B82F6',
                fillOpacity: 1,
                color: '#ffffff',
                weight: 2,
                interactive: false,
            }).addTo(this.map)
        }
    }

    highlightTree(tree: Tree | null, animate = false): void {
        if (!this.map) return
        if (!tree) {
            this.selectedRing?.remove()
            this.selectedRing = null
            return
        }
        if (this.selectedRing) {
            this.selectedRing.setLatLng([tree.lat, tree.lon])
            this.selectedRing.setIcon(createSelectedSpeciesIcon(tree.species_binomial ?? ''))
        } else {
            this.selectedRing = L.marker([tree.lat, tree.lon], {
                icon: createSelectedSpeciesIcon(tree.species_binomial ?? ''),
                interactive: false,
                pane: 'selectionPane',
            }).addTo(this.map)
        }
        if (animate) this.animateSelectedRing()
    }

    private animateSelectedRing(): void {
        const inner = this.selectedRing?.getElement()?.querySelector<HTMLElement>('.selected-marker-inner')
        if (!inner) return
        inner.classList.remove('marker-pop')
        void inner.offsetWidth
        inner.classList.add('marker-pop')
        inner.addEventListener('animationend', () => inner.classList.remove('marker-pop'), { once: true })
    }

    setFavouritesMode(active: boolean): void {
        this.favMode = active
        this.applyOpacities()
    }

    highlightSpecies(species: string | null): void {
        this.currentHighlight = species
        this.applyOpacities()
    }

    private applyOpacities(): void {
        for (const { m, species } of this.markers) {
            const opacity = this.favMode
                ? 0.4
                : (this.currentHighlight === null || this.currentHighlight === species ? 1 : 0.5)
            m.setOpacity(opacity)
        }
    }

    setCityMarkers(cities: City[], onCityClick: (id: string) => void): void {
        this.cityMarkersLayer.clearLayers()
        for (const city of cities) {
            const m = createCityCircleMarker(city)
            m.on('click', (e) => { L.DomEvent.stopPropagation(e); onCityClick(city.id) })
            this.cityMarkersLayer.addLayer(m)
        }
        if (this.map) this.updateCityMarkersVisibility(this.map.getZoom())
    }

    switchTileLayer(url: string, attribution: string, maxZoom: number): void {
        if (!this.map) return
        this.tileLayer?.remove()
        this.tileLayer = L.tileLayer(url, { attribution, maxZoom }).addTo(this.map)
        this.tileLayer.bringToBack()
    }

    destroy(): void {
        this.map?.getContainer().removeEventListener('pointerdown', this.onPointerDown)
        this.map?.remove()
        this.map = null
    }
}
