import { redirect } from 'next/navigation'

/** Root: into the app (the proxy bounces unauthenticated visitors to /login). */
export default function Home() {
  redirect('/app')
}
