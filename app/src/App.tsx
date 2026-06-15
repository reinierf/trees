import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchCities, fetchVernacularNames } from './api/trees'
import { Map } from './components/Map'
import { InfoPopup } from './components/InfoPopup'
import { OverviewMap } from './components/OverviewMap'
import { useStore } from './store'
import type { City } from './types'

function hasVisitedAnyCity(cities: City[]): boolean {
  return cities.some((c) => localStorage.getItem(`map-position-${c.id}`) !== null)
}

export default function App() {
  const { city: cityParam } = useParams<{ city?: string }>()
  const navigate = useNavigate()
  const [cities, setCities] = useState<City[] | null>(null)
  const setVernacularNames = useStore((s) => s.setVernacularNames)

  useEffect(() => {
    fetchCities().then((data) => setCities(data)).catch(console.error)
    fetchVernacularNames().then(setVernacularNames).catch(console.error)
  }, [])

  useEffect(() => {
    if (!cities) return
    if (!cityParam) {
      // Root path: only redirect if the user has visited a city before
      if (hasVisitedAnyCity(cities)) {
        navigate(`/${cities[0].id}`, { replace: true })
      }
    } else if (!cities.find((c) => c.id === cityParam)) {
      // Unknown city param: redirect to first city
      navigate(`/${cities[0].id}`, { replace: true })
    }
  }, [cities, cityParam, navigate])

  if (!cities) return null

  const currentCity = cities.find((c) => c.id === cityParam)

  if (!currentCity) {
    // Suppress flash while redirect is in flight (invalid param or returning visitor)
    if (cityParam || hasVisitedAnyCity(cities)) return null
    // First visit: show Netherlands overview
    return (
      <div className="w-screen h-dvh">
        <OverviewMap cities={cities} />
      </div>
    )
  }

  return (
    <div className="w-screen h-dvh">
      <Map key={currentCity.id} city={currentCity} cities={cities} />
      <InfoPopup cities={cities} currentCityId={currentCity.id} />
    </div>
  )
}
