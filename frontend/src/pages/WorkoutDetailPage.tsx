import { useParams } from 'react-router-dom'
import { Placeholder } from '../components/Placeholder'

export function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <Placeholder
      title="Workout"
      description={`The workout logger for session ${id} will appear here.`}
    />
  )
}
