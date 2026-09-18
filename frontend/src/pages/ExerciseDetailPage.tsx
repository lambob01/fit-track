import { useParams } from 'react-router-dom'
import { Placeholder } from '../components/Placeholder'

export function ExerciseDetailPage() {
  const { id } = useParams<{ id: string }>()

  return (
    <Placeholder
      title="Exercise"
      description={`Progress charts and personal records for exercise ${id} will appear here.`}
    />
  )
}
