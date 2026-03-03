/**
 * Preprocesses markdown content to fix math delimiters and other formatting issues.
 * Specifically handles display math wrapped in [ ] and inline math in ( ) 
 * by converting them to $$ $$ and $ $ for remark-math.
 */
export function preprocessMarkdown(content: string): string {
    if (!content) return ''

    return content
        // 1. Convert block math [ math ] or \[ math \] to $$ math $$
        // We look for [ or \[ at the start of a line (or after a newline) 
        // and wait for the corresponding ] or \].
        .replace(/(^|\n)\[\s*([\s\S]*?)\s*\](?=\n|$)/g, '$1$$\n$2\n$$')
        .replace(/(^|\n)\\\[\s*([\s\S]*?)\s*\\\](?=\n|$)/g, '$1$$\n$2\n$$')

        // 2. Convert inline math ( math ) or \( math \) to $ math $ if it looks like LaTeX
        // We check if it contains common LaTeX commands to avoid false positives with regular parentheses
        .replace(/\\\(\s*([\s\S]*?)\s*\\\)/g, '$$$1$$')
        .replace(/\(\s*(\\.*|.*(\\text|\\frac|\\sum|\\approx|\\times|\\alpha|\\beta|\\gamma|\\rho|\\sigma|\\tau|\\theta|\\omega|\\Delta|\\nabla|\\partial|\\cdot|\\infty|\\le|\\ge|\\ne).*?)\s*\)/g, '$$$1$$')

        // 3. Handle leftover bracket math that might be mid-sentence but definitely looks like LaTeX
        .replace(/\[\s*(\\.*|.*(\\text|\\frac|\\sum|\\approx|\\times).*?)\s*\]/g, '$$$1$$')
}
