import { BenchmarkProvider } from '@/components/benchmark/benchmark-provider'
import { BenchmarkShell } from '@/components/benchmark/page-shell'

/**
 * Wraps every `/benchmark/*` route in one data provider and one header.
 *
 * Next.js keeps a layout mounted across navigations within its segment, so the
 * overview, a model page and the compare page share a single fetch: clicking a
 * bar to open a model, then going back, costs no requests and shows no
 * skeleton. That is what makes splitting these views into routes — with real
 * URLs and a working back button — cheaper than the tab state it replaces.
 */
export default function BenchmarkLayout({ children }: { children: React.ReactNode }) {
    return (
        <BenchmarkProvider>
            <BenchmarkShell>{children}</BenchmarkShell>
        </BenchmarkProvider>
    )
}
