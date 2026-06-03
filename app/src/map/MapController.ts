import L from 'leaflet'
import type { Bbox, Tree } from '../types'
import { MAP_CENTER, MAP_ZOOM } from '../config'

interface Callbacks {
  onMoveEnd: (bounds: Bbox, zoom: number) => void
  onMarkerClick: (tree: Tree) => void
}

export class MapController {
  private map: L.Map | null = null
  private readonly markerLayer = L.layerGroup()
  private readonly callbacks: Callbacks

  constructor(callbacks: Callbacks) {
    this.callbacks = callbacks
  }

  init(el: HTMLDivElement): void {
    this.map = L.map(el, { center: MAP_CENTER, zoom: MAP_ZOOM })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(this.map)

    this.markerLayer.addTo(this.map)

    this.map.on('moveend', () => this.fireMoveEnd())

    // Trigger initial data load once the map has a known size
    this.map.whenReady(() => this.fireMoveEnd())
  }

  private fireMoveEnd(): void {
    if (!this.map) return
    const b = this.map.getBounds()
    const zoom = this.map.getZoom()
    this.callbacks.onMoveEnd(
      {
        nw: { lat: b.getNorth(), lon: b.getWest() },
        se: { lat: b.getSouth(), lon: b.getEast() },
      },
      zoom,
    )
  }

  setTrees(trees: Tree[]): void {
    this.markerLayer.clearLayers()
    for (const tree of trees) {
      L.circleMarker([tree.lat, tree.lon], {
        radius: 5,
        fillColor: '#52b788',
        color: '#2d6a4f',
        weight: 1,
        fillOpacity: 0.75,
      })
        .on('click', () => this.callbacks.onMarkerClick(tree))
        .addTo(this.markerLayer)
    }
  }

  highlightSpecies(_species: string | null): void {
    // Step 6/8
  }

  destroy(): void {
    this.map?.remove()
    this.map = null
  }
}
