import { Metadata } from 'next'
import { GetFreeCreditClient } from '@/components/get-free-credit-client'

export const metadata: Metadata = {
    title: { absolute: 'Get free credit | Omni Knows' },
    robots: { index: false, follow: false },
}

export default function GetFreeCreditPage() {
    return <GetFreeCreditClient />
}
