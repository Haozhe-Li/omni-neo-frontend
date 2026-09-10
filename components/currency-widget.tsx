import { useState } from 'react'
import { ExternalLink } from 'lucide-react'

export interface CurrencyWidgetProps {
    baseCurrency: string
    rates: Record<string, number>
    initialAmount?: number
    date?: string
}

function formatNum(num: number): string {
    if (isNaN(num)) return ''
    let str = num.toString()
    if (str.includes('.')) {
        const [intPart, decPart] = str.split('.')
        if (decPart.length > 4) {
            return parseFloat(num.toFixed(4)).toString()
        }
    }
    return str
}

export function CurrencyWidget({ baseCurrency, rates, initialAmount = 1, date }: CurrencyWidgetProps) {
    const entries = Object.entries(rates)

    const [activeId, setActiveId] = useState<string>('base')
    const [activeValue, setActiveValue] = useState<string>(String(initialAmount))

    if (entries.length === 0) return null

    // Calculate base amount based on active value
    let floatVal = parseFloat(activeValue)
    if (isNaN(floatVal)) floatVal = 0

    let baseAmount = floatVal
    if (activeId !== 'base' && rates[activeId]) {
        baseAmount = floatVal / rates[activeId]
    }

    const isSingle = entries.length === 1

    const handleInputChange = (id: string, val: string) => {
        // Prevent multiple leading zeros except 0.
        if (val.length > 1 && val.startsWith('0') && !val.startsWith('0.')) {
            val = val.replace(/^0+/, '')
            if (val === '') val = '0'
            if (val.startsWith('.')) val = '0' + val
        }
        if (/^\d*\.?\d*$/.test(val)) {
            setActiveId(id)
            setActiveValue(val)
        }
    }

    /* ── The design's paired boxes ────────────────────────────────────────
       Base on raised paper, each target on a teal tint, an `=` between them.
       The tint is the point: it says which side is the answer without a
       label, so a glance lands on the converted number rather than reading
       two identical boxes to work out which is which. Both sides stay
       editable — converting back is the same question asked the other way. */
    const CurrencyBox = ({
        id,
        code,
        value,
        target,
    }: {
        id: string
        code: string
        value: string
        target?: boolean
    }) => (
        <label
            className={`flex min-w-0 flex-1 cursor-text flex-col rounded-[14px] border px-3 py-2.5 transition-colors ${
                target
                    ? 'border-[var(--teal-line)] bg-[var(--teal-tint-deep)] focus-within:border-[var(--teal)]'
                    : 'border-[var(--line)] bg-[var(--paper)] focus-within:border-[var(--teal)]'
            }`}
        >
            <span
                className={`omni-mono mb-1 text-[10px] tracking-[0.1em] ${
                    target ? 'text-[var(--teal)]' : 'text-[var(--ink-faint)]'
                }`}
            >
                {code.toUpperCase()}
            </span>
            <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => handleInputChange(id, e.target.value)}
                placeholder="0"
                className={`omni-display w-full min-w-0 bg-transparent p-0 text-[24px] leading-tight outline-none placeholder:text-[var(--ink-fainter)] ${
                    target ? 'text-[var(--teal)]' : 'text-[var(--ink)]'
                }`}
            />
        </label>
    )

    const baseValue = activeId === 'base' ? activeValue : formatNum(baseAmount)
    const primaryRate = entries[0][1]

    return (
        <div className="w-full min-w-0 rounded-[20px] border border-[var(--line-strong)] bg-[var(--paper-raised)] px-[18px] pb-[17px] pt-[15px]">
            <div className="mb-3 flex items-center justify-between gap-3">
                <span className="omni-eyebrow">Currency</span>
                <a
                    href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-1.5 truncate text-[11.5px] text-[var(--ink-faint)] transition-colors hover:text-[var(--teal)]"
                >
                    {date ? `As of ${date}` : 'European Central Bank'}
                    <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
            </div>

            {isSingle ? (
                <div className="grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-2">
                    <CurrencyBox id="base" code={baseCurrency} value={baseValue} />
                    <span className="text-center text-[15px] text-[var(--ink-fainter)]">=</span>
                    <CurrencyBox
                        id={entries[0][0]}
                        code={entries[0][0]}
                        value={activeId === entries[0][0] ? activeValue : formatNum(baseAmount * primaryRate)}
                        target
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    <CurrencyBox id="base" code={baseCurrency} value={baseValue} />
                    {entries.map(([targetCurrency, rate]) => (
                        <div key={targetCurrency} className="grid grid-cols-[18px_minmax(0,1fr)] items-center gap-2">
                            <span className="text-center text-[15px] text-[var(--ink-fainter)]">=</span>
                            <CurrencyBox
                                id={targetCurrency}
                                code={targetCurrency}
                                value={activeId === targetCurrency ? activeValue : formatNum(baseAmount * rate)}
                                target
                            />
                        </div>
                    ))}
                </div>
            )}

            <div className="omni-mono mt-3 text-[12.5px] text-[var(--ink-muted)]">
                1 {baseCurrency.toUpperCase()} = {primaryRate.toLocaleString(undefined, { maximumFractionDigits: 4 })}{' '}
                {entries[0][0].toUpperCase()}
            </div>
        </div>
    )
}
