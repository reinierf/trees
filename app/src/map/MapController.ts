import L from 'leaflet'
import 'leaflet.markercluster'
import type { Bbox, Tree } from '../types'
import { MAP_CENTER, MAP_ZOOM, MAP_MAX_ZOOM, CLUSTER_DISABLE_ZOOM } from '../config'
import { createSpeciesIcon, createClusterIcon } from './markerIcon'

interface Callbacks {
  onMoveEnd: (bounds: Bbox, zoom: number) => void
  onMarkerClick: (tree: Tree) => void
}

export class MapController {
  private map: L.Map | null = null
  private readonly clusterLayer: L.MarkerClusterGroup
  private readonly callbacks: Callbacks

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks
    this.clusterLayer = L.markerClusterGroup({
      iconCreateFunction: (cluster) => createClusterIcon(cluster.getChildCount()),
      disableClusteringAtZoom: CLUSTER_DISABLE_ZOOM,
      chunkedLoading: true,
    })
  }

  init(el: HTMLDivElement): void {
    this.map = L.map(el, { center: MAP_CENTER, zoom: MAP_ZOOM })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: MAP_MAX_ZOOM,
    }).addTo(this.map)

    this.clusterLayer.addTo(this.map)

    this.map.on('moveend', () => this.fireMoveEnd())
    this.map.whenReady(() => this.fireMoveEnd())
  }

  private fireMoveEnd(): void {
    if (!this.map) return
    const b = this.map.getBounds()
    this.callbacks.onMoveEnd(
      {
        nw: { lat: b.getNorth(), lon: b.getWest() },
        se: { lat: b.getSouth(), lon: b.getEast() },
      },
      this.map.getZoom(),
    )
  }

  setTrees(trees: Tree[]): void {
    this.clusterLayer.clearLayers()
    for (const tree of trees) {
      if (!tree.species_binomial) continue
      L.marker([tree.lat, tree.lon], { icon: createSpeciesIcon(tree.species_binomial) })
        .on('click', () => this.callbacks.onMarkerClick(tree))
        .addTo(this.clusterLayer)
    }
  }

  highlightSpecies(_species: string | null): void {
    // Step 8
  }

  destroy(): void {
    this.map?.remove()
    this.map = null
  }
}
