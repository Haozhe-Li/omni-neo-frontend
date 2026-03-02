import { useState } from 'react'
import { DollarSign, ExternalLink } from 'lucide-react'

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

    return (
        <div className="rounded-xl overflow-hidden border border-[var(--border-subtle)]/40 bg-[var(--background)] shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all">
            {/* header row */}
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border-subtle)]/40 bg-[var(--secondary)]/10">
                <div className="flex items-center gap-2 min-w-0">
                    <DollarSign className="h-4 w-4 flex-none text-emerald-600 dark:text-emerald-400" />
                    <span className="text-[13px] font-medium text-[var(--foreground)] truncate opacity-80">Currency Conversion</span>
                </div>
                <a
                    href="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded-md text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--secondary)] transition-colors flex-none ml-2"
                >
                    <ExternalLink className="h-3.5 w-3.5" />
                </a>
            </div>

            {/* body */}
            <div className="px-3.5 py-3.5 flex flex-col gap-3">
                {isSingle ? (
                    <div className="flex items-center gap-1.5 sm:gap-2">
                        <div className="flex items-center gap-2 bg-[var(--secondary)]/30 rounded-xl p-2 px-3 border border-transparent focus-within:border-[var(--accent)]/40 focus-within:bg-[var(--secondary)]/50 focus-within:shadow-[0_0_0_1px_rgba(var(--accent),0.1)] transition-all flex-1 min-w-0">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={activeId === 'base' ? activeValue : formatNum(baseAmount)}
                                onChange={(e) => handleInputChange('base', e.target.value)}
                                className="bg-transparent text-[20px] sm:text-[22px] font-semibold tracking-tight text-[var(--foreground)] w-full min-w-0 outline-none placeholder:text-[var(--muted-foreground)]/30 p-0 m-0"
                                placeholder="0"
                            />
                            <span className="text-[13px] sm:text-sm font-medium text-[var(--muted-foreground)] uppercase shrink-0 px-1 select-none">{baseCurrency}</span>
                        </div>

                        <div className="flex items-center justify-center shrink-0 px-0 sm:px-1 text-[var(--muted-foreground)]/40 font-semibold text-lg">
                            =
                        </div>

                        <div className="flex items-center gap-2 bg-[var(--secondary)]/30 rounded-xl p-2 px-3 border border-transparent focus-within:border-[var(--accent)]/40 focus-within:bg-[var(--secondary)]/50 focus-within:shadow-[0_0_0_1px_rgba(var(--accent),0.1)] transition-all flex-1 min-w-0">
                            <input
                                type="text"
                                inputMode="decimal"
                                value={activeId === entries[0][0] ? activeValue : formatNum(baseAmount * entries[0][1])}
                                onChange={(e) => handleInputChange(entries[0][0], e.target.value)}
                                className="bg-transparent text-[20px] sm:text-[22px] font-semibold tracking-tight text-[var(--foreground)] w-full min-w-0 outline-none placeholder:text-[var(--muted-foreground)]/30 p-0 m-0"
                                placeholder="0"
                            />
                            <span className="text-[13px] sm:text-sm font-medium text-[var(--muted-foreground)] uppercase shrink-0 px-1 select-none">{entries[0][0]}</span>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <div className="flex items-center gap-2 bg-[var(--secondary)]/30 rounded-xl p-2.5 px-3.5 border border-transparent focus-within:border-[var(--accent)]/40 focus-within:bg-[var(--secondary)]/50 focus-within:shadow-[0_0_0_1px_rgba(var(--accent),0.1)] transition-all flex-1 min-w-0">
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={activeId === 'base' ? activeValue : formatNum(baseAmount)}
                                    onChange={(e) => handleInputChange('base', e.target.value)}
                                    className="bg-transparent text-[22px] font-semibold tracking-tight text-[var(--foreground)] w-full min-w-0 outline-none placeholder:text-[var(--muted-foreground)]/30 p-0 m-0"
                                    placeholder="0"
                                />
                                <span className="text-sm font-medium text-[var(--muted-foreground)] uppercase shrink-0 px-1 select-none">{baseCurrency}</span>
                            </div>
                        </div>

                        {entries.map(([targetCurrency, rate]) => (
                            <div key={targetCurrency} className="flex items-center gap-2">
                                <div className="flex items-center justify-center shrink-0 w-8 text-[var(--muted-foreground)]/40 font-semibold text-lg">
                                    =
                                </div>
                                <div className="flex items-center gap-2 bg-[var(--secondary)]/30 rounded-xl p-2.5 px-3.5 border border-transparent focus-within:border-[var(--accent)]/40 focus-within:bg-[var(--secondary)]/50 focus-within:shadow-[0_0_0_1px_rgba(var(--accent),0.1)] transition-all flex-1 min-w-0">
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={activeId === targetCurrency ? activeValue : formatNum(baseAmount * rate)}
                                        onChange={(e) => handleInputChange(targetCurrency, e.target.value)}
                                        className="bg-transparent text-[22px] font-semibold tracking-tight text-[var(--foreground)] w-full min-w-0 outline-none placeholder:text-[var(--muted-foreground)]/30 p-0 m-0"
                                        placeholder="0"
                                    />
                                    <span className="text-sm font-medium text-[var(--muted-foreground)] uppercase shrink-0 px-1 select-none">{targetCurrency}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {date && (
                    <div className="flex justify-start border-t border-[var(--border-subtle)]/40 pt-2.5 mt-0.5">
                        <p className="text-[11px] text-[var(--muted-foreground)] w-full text-left opacity-70">As of {date}</p>
                    </div>
                )}
            </div>
        </div>
    )
}
