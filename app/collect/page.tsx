import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { CollectorClient } from '@/components/collector/collector-client'
import { COLLECTOR_COOKIE, verifySession } from '@/lib/collector/session'

export const dynamic = 'force-dynamic'

export default async function CollectPage() {
  // proxy.ts has already turned anonymous requests away; this reads the name off the
  // verified cookie for the header, and is a second check rather than the first.
  const session = await verifySession((await cookies()).get(COLLECTOR_COOKIE)?.value)
  if (!session) redirect('/collect/login')
  return <CollectorClient annotator={session.annotator} />
}
