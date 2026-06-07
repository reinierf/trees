import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchCities } from './api/trees'
import { Map } from './components/Map'
import type { City } from './types'

export default function App() {
  const { city: cityParam } = useParams<{ city?: string }>()
  const navigate = useNavigate()
  const [cities, setCities] = useState<City[] | null>(null)

  useEffect(() => {
    fetchCities().then((data) => setCities(data)).catch(console.error)
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
    </div>
  )
}
