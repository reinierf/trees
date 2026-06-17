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

  if (!currentCity.has_data) {
    return (
      <div className="w-screen h-dvh flex flex-col items-center justify-center gap-4 text-center px-6">
        <h1 className="text-2xl font-bold text-gray-800">{currentCity.name}</h1>
        <p className="text-gray-500">Boomdata voor {currentCity.name} is nog niet beschikbaar.</p>
        <button
          onClick={() => navigate(`/${cities.find((c) => c.has_data)?.id ?? ''}`)}
          className="mt-2 px-4 py-2 rounded-lg bg-[#2d6a4f] text-white text-sm hover:bg-[#1e4d38] transition-colors"
        >
          Terug naar kaart
        </button>
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
