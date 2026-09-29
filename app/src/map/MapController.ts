import L from 'leaflet'
import 'leaflet.markercluster'
import type { Bbox, Cluster, Source, Tree } from '../types'
import { MAP_MAX_ZOOM, CLUSTER_DISABLE_ZOOM, MIN_MAP_ZOOM, PLACE_MAX_ZOOM } from '../config'
import { createSpeciesIcon, createClusterIcon, createGroupIcon, createSelectedSpeciesIcon, createPlaceMarker } from './markerIcon'
import { capitalizeFirst } from '../lib/utils'
import { formatVernacular, lookupSpeciesNames } from '../lib/species'

/** Marker options of a server cluster: how many trees the single marker stands for. */
type TreeCountOptions = L.MarkerOptions & { treeCount?: number }

interface Callbacks {
    onMoveEnd: (bounds: Bbox, zoom: number, center: [number, number]) => void
    onMarkerClick: (tree: Tree) => void
    onGroupMarkerClick: (trees: Tree[]) => void
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
    private currentHighlight: number | null = null
    private readonly onPointerDown = () => { this.dragOccurred = false }
    private readonly placeMarkersLayer: L.LayerGroup = L.layerGroup()
    // Clusters computed by the server for tiles holding too many trees to send individually.
    // They join the tree markers in the markercluster group, carrying their tree count, so
    // bubbles form by on-screen distance instead of the server's fixed 64 px grid, and the
    // border between cluster tiles and tree tiles disappears.
    private serverMarkers: L.Marker[] = []

    constructor(callbacks: Callbacks) {
        this.callbacks = callbacks
        this.clusterLayer = this.buildClusterLayer(this.clusterDisableZoom)
    }

    private buildClusterLayer(disableClusteringAtZoom: number): L.MarkerClusterGroup {
        return L.markerClusterGroup({
            iconCreateFunction: (cluster) => createClusterIcon(
                cluster.getAllChildMarkers().reduce((sum, m) => sum + ((m.options as TreeCountOptions).treeCount ?? 1), 0),
            ),
            disableClusteringAtZoom,
            // Wider grouping while bubbles stand for whole neighbourhoods; the default 80 px from
            // zoom 16, where they group individual trees.
            maxClusterRadius: (zoom: number) => (zoom < 16 ? 120 : 80),
            chunkedLoading: true,
            animate: false,
        })
    }

    // disableClusteringAtZoom is constructor-only in Leaflet.markercluster (no
    // live setter), so a change means tearing down and recreating the cluster
    // group. Guarded on the value actually changing — most views share the
    // same (default) zoom, and recreating the layer needlessly would be
    // wasted work and a visible flicker.
    setClusterDisableZoom(zoom: number): void {
        if (zoom === this.clusterDisableZoom) return
        this.clusterDisableZoom = zoom
        const currentMarkers = [...this.markers.map(({ m }) => m), ...this.serverMarkers]
        this.clusterLayer.remove()
        this.clusterLayer = this.buildClusterLayer(zoom)
        if (this.map && !this.placesVisible) this.clusterLayer.addTo(this.map)
        this.clusterLayer.addLayers(currentMarkers)
    }

    init(el: HTMLDivElement, center: [number, number], zoom: number): void {
        this.map = L.map(el, { center, zoom, minZoom: MIN_MAP_ZOOM })

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
        this.lastZoom = zoom
        this.map.on('zoomend', () => this.dropStaleServerClusters())
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

    private markers: Array<{ m: L.Marker; speciesId: number | null }> = []
    private favMode = false

    private static tooltipContent(tree: Tree): string {
        const names = lookupSpeciesNames(tree.speciesId)
        const species = `<span style="font-style:italic;font-weight:600">${capitalizeFirst(names.key)}</span>`
        if (!names.vernacular) return species
        return `${species}, ${formatVernacular(names.vernacular)}`
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

    // Trees positioned per planting-section rather than individually surveyed
    // can share an exact coordinate — grouped into one marker instead of fully
    // overlapping, unclickable individual ones. Grouping happens here, before
    // markers reach the cluster layer, so a coincident group is just one more
    // marker as far as clustering is concerned.
    private static groupByCoordinate(trees: Tree[]): Tree[][] {
        const groups = new Map<string, Tree[]>()
        for (const tree of trees) {
            const key = `${tree.lat},${tree.lon}`
            const group = groups.get(key)
            if (group) group.push(tree)
            else groups.set(key, [tree])
        }
        return [...groups.values()]
    }

    setTrees(trees: Tree[]): void {
        this.tooltipGen++
        this.clusterLayer.removeLayers(this.markers.map(({ m }) => m))
        this.markers = []
        const layerMarkers: L.Marker[] = []
        const gen = this.tooltipGen
        // Below disableClusteringAtZoom, Leaflet's own proximity-based clustering
        // already absorbs coincident points into a normal cluster count — no
        // special treatment needed, and showing an amber group marker in isolation
        // while ordinary clustering is still active elsewhere is just confusing.
        // Group markers only earn their keep once clustering is fully off, which
        // is the only point where a coordinate collision is actually unclickable.
        const groupingActive = (this.map?.getZoom() ?? 0) >= this.clusterDisableZoom
        for (const group of MapController.groupByCoordinate(trees)) {
            if (group.length === 1 || !groupingActive) {
                for (const tree of group) {
                    const m = L.marker([tree.lat, tree.lon], { icon: createSpeciesIcon(lookupSpeciesNames(tree.speciesId).key) })
                    this.addDelayedTooltip(m, tree, gen, () => this.tooltipGen)
                    m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.callbacks.onMarkerClick(tree) })
                    this.markers.push({ m, speciesId: tree.speciesId })
                    layerMarkers.push(m)
                }
            } else {
                const [{ lat, lon }] = group
                const m = L.marker([lat, lon], { icon: createGroupIcon(group.length) })
                m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.callbacks.onGroupMarkerClick(group) })
                this.markers.push({ m, speciesId: null })
                layerMarkers.push(m)
            }
        }
        this.clusterLayer.addLayers(layerMarkers)
        this.applyOpacities()
    }

    private lastZoom = 0

    // After zooming in, the previous zoom's server clusters are twice as far apart on screen
    // (~128 px for 64 px cells), beyond the grouping radius, so markercluster would show each on
    // its own — a flash of the server's grid until the new zoom's tiles arrive. Drop them
    // instead; the map briefly shows only the trees while loading. Zooming out needs nothing:
    // finer clusters move closer together and group correctly.
    private dropStaleServerClusters(): void {
        if (!this.map) return
        const zoom = this.map.getZoom()
        if (zoom > this.lastZoom && this.serverMarkers.length > 0) {
            this.clusterLayer.removeLayers(this.serverMarkers)
            this.serverMarkers = []
        }
        this.lastZoom = zoom
    }

    setServerClusters(clusters: Cluster[]): void {
        this.clusterLayer.removeLayers(this.serverMarkers)
        this.serverMarkers = clusters.map((c) => {
            const m = L.marker([c.lat, c.lon], { icon: createClusterIcon(c.count), treeCount: c.count } as TreeCountOptions)
            m.on('click', (e) => {
                L.DomEvent.stopPropagation(e)
                if (this.map) this.map.setView([c.lat, c.lon], Math.min(this.map.getZoom() + 2, MAP_MAX_ZOOM))
            })
            return m
        })
        this.clusterLayer.addLayers(this.serverMarkers)
    }

    setFavouriteMarkers(trees: Tree[]): void {
        this.favTooltipGen++
        this.favouriteLayer.clearLayers()
        const gen = this.favTooltipGen
        for (const tree of trees) {
            const m = L.marker([tree.lat, tree.lon], {
                icon: createSpeciesIcon(lookupSpeciesNames(tree.speciesId).key),
                pane: 'favouritePane',
            })
            this.addDelayedTooltip(m, tree, gen, () => this.favTooltipGen)
            m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.callbacks.onMarkerClick(tree) })
            this.favouriteLayer.addLayer(m)
        }
    }

    getView(): { center: [number, number]; zoom: number } | null {
        if (!this.map) return null
        const c = this.map.getCenter()
        return { center: [c.lat, c.lng], zoom: this.map.getZoom() }
    }

    panTo(lat: number, lon: number): void {
        this.map?.panTo([lat, lon])
    }

    flyToLocation(lat: number, lon: number, zoom = 16, { fly = true }: { fly?: boolean } = {}): void {
        if (fly) {
            this.map?.flyTo([lat, lon], zoom)
        } else {
            this.map?.setView([lat, lon], zoom, { animate: true })
        }
    }

    fitBbox(bbox: Source['bbox']): void {
        this.map?.flyToBounds([[bbox.s, bbox.w], [bbox.n, bbox.e]], { padding: [40, 40], maxZoom: PLACE_MAX_ZOOM })
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
        const icon = createSelectedSpeciesIcon(lookupSpeciesNames(tree.speciesId).key)
        if (this.selectedRing) {
            this.selectedRing.setLatLng([tree.lat, tree.lon])
            this.selectedRing.setIcon(icon)
        } else {
            this.selectedRing = L.marker([tree.lat, tree.lon], {
                icon,
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

    highlightSpecies(speciesId: number | null): void {
        this.currentHighlight = speciesId
        this.applyOpacities()
    }

    private applyOpacities(): void {
        for (const { m, speciesId } of this.markers) {
            const opacity = this.favMode
                ? 0.4
                : (this.currentHighlight === null || this.currentHighlight === speciesId ? 1 : 0.5)
            m.setOpacity(opacity)
        }
    }

    setPlaceMarkers(sources: Source[], onPlaceClick: (source: Source) => void): void {
        this.placeMarkersLayer.clearLayers()
        for (const source of sources) {
            const m = createPlaceMarker(source)
            m.on('click', (e) => { L.DomEvent.stopPropagation(e); onPlaceClick(source) })
            this.placeMarkersLayer.addLayer(m)
        }
    }

    // While the places overlay is on, it replaces the trees: at national zoom, place markers on
    // top of tree clusters are an unreadable pile.
    private placesVisible = false

    setPlacesVisible(visible: boolean): void {
        if (!this.map) return
        this.placesVisible = visible
        if (visible) {
            this.clusterLayer.remove()
            this.placeMarkersLayer.addTo(this.map)
        } else {
            this.placeMarkersLayer.remove()
            this.clusterLayer.addTo(this.map)
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
