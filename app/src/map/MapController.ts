import L from 'leaflet'
import 'leaflet.markercluster'
import type { Bbox, Tree } from '../types'
import { MAP_ZOOM, MAP_MAX_ZOOM, CLUSTER_DISABLE_ZOOM } from '../config'
import { createSpeciesIcon, createClusterIcon, createSelectedSpeciesIcon } from './markerIcon'
import { capitalizeFirst } from '../lib/utils'

interface Callbacks {
    onMoveEnd: (bounds: Bbox, zoom: number, center: [number, number]) => void
    onMarkerClick: (tree: Tree) => void
    onMapClick: () => void
}

export class MapController {
    private map: L.Map | null = null
    private tileLayer: L.TileLayer | null = null
    private readonly clusterLayer: L.MarkerClusterGroup
    private readonly favouriteLayer: L.LayerGroup = L.layerGroup()
    private readonly callbacks: Callbacks
    private dragOccurred = false
    private currentHighlight: string | null = null
    private readonly onPointerDown = () => { this.dragOccurred = false }

    constructor(callbacks: Callbacks) {
        this.callbacks = callbacks
        this.clusterLayer = L.markerClusterGroup({
            iconCreateFunction: (cluster) => createClusterIcon(cluster.getChildCount()),
            disableClusteringAtZoom: CLUSTER_DISABLE_ZOOM,
            chunkedLoading: true,
            animate: false,
        })
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
        this.callbacks.onMoveEnd(
            {
                nw: { lat: b.getNorth(), lon: b.getWest() },
                se: { lat: b.getSouth(), lon: b.getEast() },
            },
            this.map.getZoom(),
            [c.lat, c.lng],
        )
    }

    private markers: Array<{ m: L.Marker; species: string }> = []
    private favMode = false

    private static tooltipContent(tree: Tree): string {
        const species = `<span style="font-style:italic;font-weight:600">${capitalizeFirst(tree.species_binomial ?? tree.species)}</span>`
        if (!tree.name_indigenous) return species
        const indigenous = capitalizeFirst(tree.name_indigenous.toLowerCase())
            .replace(/'([a-z])/g, (_, c: string) => `'${c.toUpperCase()}`)
        return `${species}, ${indigenous}`
    }

    private tooltipGen = 0

    private addDelayedTooltip(m: L.Marker, tree: Tree, gen: number): void {
        let timer: ReturnType<typeof setTimeout> | null = null
        let tip: L.Tooltip | null = null
        m.on('mouseover', () => {
            if (timer !== null) clearTimeout(timer)
            timer = setTimeout(() => {
                timer = null
                if (gen !== this.tooltipGen || !this.map) return
                tip = L.tooltip({ direction: 'top', offset: [0, -8] })
                    .setLatLng(m.getLatLng())
                    .setContent(MapController.tooltipContent(tree))
                    .addTo(this.map)
            }, 500)
        })
        m.on('mouseout', () => {
            if (timer !== null) { clearTimeout(timer); timer = null }
            tip?.remove()
            tip = null
        })
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
            this.addDelayedTooltip(m, tree, gen)
            m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.callbacks.onMarkerClick(tree) })
            this.markers.push({ m, species: tree.species_binomial })
            layerMarkers.push(m)
        }
        this.clusterLayer.addLayers(layerMarkers)
        this.applyOpacities()
    }

    setFavouriteMarkers(trees: Tree[]): void {
        this.tooltipGen++
        this.favouriteLayer.clearLayers()
        const gen = this.tooltipGen
        for (const tree of trees) {
            if (!tree.species_binomial) continue
            const m = L.marker([tree.lat, tree.lon], {
                icon: createSpeciesIcon(tree.species_binomial),
                pane: 'favouritePane',
            })
            this.addDelayedTooltip(m, tree, gen)
            m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.callbacks.onMarkerClick(tree) })
            this.favouriteLayer.addLayer(m)
        }
    }

    panTo(lat: number, lon: number): void {
        this.map?.panTo([lat, lon])
    }

    flyToLocation(lat: number, lon: number, zoom = 16): void {
        this.map?.flyTo([lat, lon], zoom)
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
