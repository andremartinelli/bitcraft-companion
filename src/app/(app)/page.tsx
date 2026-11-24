import { redirect } from 'next/navigation'

/** The app opens on Planos, the first entry of the menu */
export default function Home() {
  redirect('/plans')
}
