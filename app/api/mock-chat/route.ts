import { NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_USE_MOCK !== 'true') {
    return new Response('Not Found', { status: 404 })
  }

  try {
    const { query } = await request.json()
    if (!query) return new Response('Query is required', { status: 400 })

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        await delay(400)

        // Step 1: Initial todos
        send({
          type: 'tool', tool: 'write_todos', agent: 'Supervisor', content: 'Tool Calling',
          raw: { args: { todos: [
            { content: 'Understand the user query', status: 'completed' },
            { content: 'Search for relevant information', status: 'in_progress' },
            { content: 'Read and analyze sources', status: 'pending' },
            { content: 'Verify key claims', status: 'pending' },
            { content: 'Synthesize final answer', status: 'pending' },
          ] } },
        })

        await delay(600)

        // Step 2: Reasoning
        send({
          type: 'reasoning', agent: 'Sub-agent',
          content: 'Analyzing the query to determine the best research approach. The question requires recent factual information from multiple sources, so I will start with a broad web search and then deep-dive into the most relevant results.',
          raw: {},
        })

        await delay(800)

        // Step 3: Tavily search
        send({
          type: 'tool', tool: 'tavily_search', agent: 'Sub-agent', content: 'Tool Calling',
          raw: { args: { query, max_results: 5, topic: 'general' } },
        })

        await delay(1000)

        // Step 4: Update todos
        send({
          type: 'tool', tool: 'write_todos', agent: 'Supervisor', content: 'Tool Calling',
          raw: { args: { todos: [
            { content: 'Understand the user query', status: 'completed' },
            { content: 'Search for relevant information', status: 'completed' },
            { content: 'Read and analyze sources', status: 'in_progress' },
            { content: 'Verify key claims', status: 'pending' },
            { content: 'Synthesize final answer', status: 'pending' },
          ] } },
        })

        await delay(600)

        // Step 5: Skimming
        send({
          type: 'tool', tool: 'skimming_web_pages', agent: 'Sub-agent', content: 'Tool Calling',
          raw: { args: {
            purpose: 'Gather comprehensive information about the topic',
            urls: [
              'https://en.wikipedia.org/wiki/Quantum_computing',
              'https://nature.com/articles/s41586-024-quantum',
              'https://arxiv.org/abs/2024.12345',
              'https://technologyreview.com/2026/quantum-leap',
            ],
          } },
        })

        await delay(900)

        // Step 6: Reasoning
        send({
          type: 'reasoning', agent: 'Sub-agent',
          content: 'The search results provide several relevant articles. I will now do an intensive reading of the most promising source to extract detailed information and verify claims before synthesizing.',
          raw: {},
        })

        await delay(700)

        // Step 7: Full text reading
        send({
          type: 'tool', tool: 'get_full_text', agent: 'Sub-agent', content: 'Tool Calling',
          raw: { args: { url: 'https://nature.com/articles/s41586-024-quantum' } },
        })

        await delay(1100)

        // Step 8: Update todos
        send({
          type: 'tool', tool: 'write_todos', agent: 'Supervisor', content: 'Tool Calling',
          raw: { args: { todos: [
            { content: 'Understand the user query', status: 'completed' },
            { content: 'Search for relevant information', status: 'completed' },
            { content: 'Read and analyze sources', status: 'completed' },
            { content: 'Verify key claims', status: 'in_progress' },
            { content: 'Synthesize final answer', status: 'pending' },
          ] } },
        })

        await delay(600)

        // Step 9: Verify claim
        send({
          type: 'tool', tool: 'verify_claim', agent: 'Sub-agent', content: 'Tool Calling',
          raw: { args: { fact: 'Quantum computers can solve certain problems exponentially faster than classical computers' } },
        })

        await delay(900)

        // Step 10: Reasoning
        send({
          type: 'reasoning', agent: 'Sub-agent',
          content: 'All key claims have been verified against multiple sources. Now synthesizing a comprehensive answer with proper citations.',
          raw: {},
        })

        await delay(500)

        // Step 11: Final todos
        send({
          type: 'tool', tool: 'write_todos', agent: 'Supervisor', content: 'Tool Calling',
          raw: { args: { todos: [
            { content: 'Understand the user query', status: 'completed' },
            { content: 'Search for relevant information', status: 'completed' },
            { content: 'Read and analyze sources', status: 'completed' },
            { content: 'Verify key claims', status: 'completed' },
            { content: 'Synthesize final answer', status: 'in_progress' },
          ] } },
        })

        await delay(800)

        // Step 12: Final answer
        send({
          type: 'answer', agent: 'Supervisor',
          content: [
            { id: 'rs_01', summary: [], type: 'reasoning' },
            {
              type: 'text',
              text: JSON.stringify({
                final_answer: `# ${query}\n\n## Overview\n\nBased on comprehensive research across multiple authoritative sources, here is a detailed analysis of your query.\n\n## Key Findings\n\n**1. Core Concepts**\n\nThe fundamental principles underlying this topic are well-established in the scientific literature. Research from leading institutions confirms that the mechanisms involved are both robust and reproducible, making them suitable for practical applications.\n\n**2. Recent Developments**\n\nSignificant progress has been made in the past year:\n\n- New algorithmic approaches have improved efficiency by up to 40%\n- Cross-disciplinary collaborations have opened novel research directions\n- Industry adoption has accelerated, with major tech companies investing heavily\n\n**3. Expert Consensus**\n\nThe scientific community largely agrees on the following points:\n\n> "The pace of advancement in this field has exceeded most projections, and we expect continued acceleration through 2027." -- Nature Reviews, 2026\n\n## Detailed Analysis\n\nWhen examining the underlying data, several patterns emerge that are worth highlighting:\n\n| Factor | Impact | Confidence |\n|--------|--------|------------|\n| Algorithm efficiency | High | Strong |\n| Hardware scaling | Medium | Moderate |\n| Error correction | Critical | Growing |\n\nThe interplay between these factors creates a complex landscape that requires careful navigation. However, the overall trajectory is clearly positive, with compounding improvements across all dimensions.\n\n## Practical Implications\n\n1. **For researchers**: Focus on error correction and fault tolerance as these remain the primary bottlenecks\n2. **For industry**: Consider early adoption of hybrid approaches that combine classical and novel methods\n3. **For policymakers**: Invest in workforce development and infrastructure to support the growing ecosystem\n\n## Conclusion\n\nThe evidence strongly supports an optimistic outlook for this field. While challenges remain, the combination of theoretical advances, engineering improvements, and growing investment creates a powerful momentum that is likely to yield transformative results within the next few years. A Code block here: \n\n\`\`\`python\n# Example code snippet\nimport numpy as np\n\ndef example_function(x):\n    return np.exp(x) * np.sin(x)\n\nprint(example_function(0.5))\n\`\`\`\n\n## References\n\n1. Comprehensive Guide to the Topic - Nature Reviews (2026)\n2. Recent Research Findings and Breakthroughs - arXiv (2026)\n3. Expert Analysis and Industry Commentary - Technology Review (2026)\n4. Case Studies and Real-World Applications - Science Journal (2026)\n5. Wikipedia - Background and Foundations (2024)`,
                final_sources: [
                  { title: 'Comprehensive Guide to the Topic - Nature Reviews', url: 'https://nature.com/reviews/2026/comprehensive-guide' },
                  { title: 'Recent Research Findings and Breakthroughs', url: 'https://arxiv.org/abs/2026.quantum-research' },
                  { title: 'Expert Analysis and Industry Commentary', url: 'https://technologyreview.com/2026/expert-analysis' },
                  { title: 'Case Studies and Real-World Applications', url: 'https://science.org/doi/10.1126/applications-2026' },
                  { title: 'Wikipedia - Background and Foundations', url: 'https://en.wikipedia.org/wiki/Quantum_computing' },
                ],
              }),
              annotations: [],
              id: 'msg_01',
            },
          ],
          raw: {},
        })

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch {
    return new Response('Internal Server Error', { status: 500 })
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
