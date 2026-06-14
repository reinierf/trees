import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchCities, fetchVernacularNames } from './api/trees'
import { Map } from './components/Map'
import { InfoPopup } from './components/InfoPopup'
import { useStore } from './store'
import type { City } from './types'

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
    if (!cityParam || !cities.find((c) => c.id === cityParam)) {
      navigate(`/${cities[0].id}`, { replace: true })
    }
  }, [cities, cityParam, navigate])

  if (!cities) return null

  const currentCity = cities.find((c) => c.id === cityParam)
  if (!currentCity) return null

  return (
    <div className="w-screen h-dvh">
      <Map key={currentCity.id} city={currentCity} cities={cities} />
      <InfoPopup cities={cities} currentCityId={currentCity.id} />
    </div>
  )
}
