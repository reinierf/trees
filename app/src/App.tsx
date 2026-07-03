import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchCities, fetchVernacularNames } from './api/trees'
import { Map } from './components/Map'
import { InfoPopup } from './components/InfoPopup'
import { LoadingSpinner } from './components/LoadingSpinner'
import { recordCityVisit } from './lib/recentCitiesStorage'
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
  }, [setVernacularNames])

  useEffect(() => {
    if (!cities) return
    if (!cityParam) {
      // Root path: redirect returning visitors to their last city
      if (hasVisitedAnyCity(cities)) {
        navigate(`/${cities[0].id}`, { replace: true })
      }
      // First-time visitors: stay on overview (no redirect)
    } else if (cityParam === 'overview') {
      // Overview is always a valid destination — no redirect
    } else if (!cities.find((c) => c.id === cityParam)) {
      // unknown city param: redirect to first city
      navigate(`/${cities[0].id}`, { replace: true })
    }
  }, [cities, cityParam, navigate])

  const isOverview = !cityParam || cityParam === 'overview'
  const currentCity = cities
    ? (isOverview ? null : (cities.find((c) => c.id === cityParam) ?? null))
    : null

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (currentCity?.has_data) recordCityVisit(currentCity.id) }, [currentCity?.id])

  if (!cities) {
    return (
      <div className="w-screen h-dvh flex items-center justify-center">
        <div className="scale-150">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  // Suppress flash while redirect is in flight
  if (!isOverview && !currentCity) return null

  if (!isOverview && currentCity && !currentCity.has_data) {
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
      <Map city={currentCity} cities={cities} />
      {currentCity && <InfoPopup cities={cities} currentCityId={currentCity.id} />}
    </div>
  )
}
