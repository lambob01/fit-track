export function Placeholder({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-content-muted">{description}</p>
    </section>
  )
}
