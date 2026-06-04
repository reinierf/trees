import L from 'leaflet'
import 'leaflet.markercluster'
import type { Bbox, Tree } from '../types'
import { MAP_CENTER, MAP_ZOOM, MAP_MAX_ZOOM, CLUSTER_DISABLE_ZOOM } from '../config'
import { createSpeciesIcon, createClusterIcon } from './markerIcon'

interface Callbacks {
  onMoveEnd: (bounds: Bbox, zoom: number, center: [number, number]) => void
  onMarkerClick: (tree: Tree) => void
  onMapClick: () => void
}

export class MapController {
  private map: L.Map | null = null
  private readonly clusterLayer: L.MarkerClusterGroup
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

  init(el: HTMLDivElement, center?: [number, number], zoom?: number): void {
    this.map = L.map(el, { center: center ?? MAP_CENTER, zoom: zoom ?? MAP_ZOOM })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: MAP_MAX_ZOOM,
    }).addTo(this.map)

    this.clusterLayer.addTo(this.map)

    this.map.on('moveend', () => this.fireMoveEnd())
    this.map.on('drag', () => { this.dragOccurred = true })
    this.map.on('click', () => { if (!this.dragOccurred) this.callbacks.onMapClick() })
    el.addEventListener('pointerdown', this.onPointerDown)
    this.map.whenReady(() => {
      this.map?.invalidateSize()
      this.fireMoveEnd()
    })
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

  setTrees(trees: Tree[]): void {
    this.clusterLayer.clearLayers()
    this.markers = []
    const layerMarkers: L.Marker[] = []
    for (const tree of trees) {
      if (!tree.species_binomial) continue
      const m = L.marker([tree.lat, tree.lon], { icon: createSpeciesIcon(tree.species_binomial) })
      m.on('click', (e) => { L.DomEvent.stopPropagation(e); this.callbacks.onMarkerClick(tree) })
      this.markers.push({ m, species: tree.species_binomial })
      layerMarkers.push(m)
    }
    this.clusterLayer.addLayers(layerMarkers)
    this.highlightSpecies(this.currentHighlight)
  }

  highlightSpecies(species: string | null): void {
    this.currentHighlight = species
    for (const { m, species: s } of this.markers) {
      m.setOpacity(species === null || species === s ? 1 : 0.5)
    }
  }

  destroy(): void {
    this.map?.getContainer().removeEventListener('pointerdown', this.onPointerDown)
    this.map?.remove()
    this.map = null
  }
}
