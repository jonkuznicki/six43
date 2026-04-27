import { redirect } from 'next/navigation'

export default async function GamePage({ params }: { params: { id: string } }) {
  redirect(`/games/${params.id}/lineup`)
}
