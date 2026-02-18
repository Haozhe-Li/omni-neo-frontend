import type { SSEMessage } from './types'

export function parseSSEMessage(data: any): SSEMessage {
  return {
    type: data.type || 'unknown',
    agent: data.agent,
    content: data.content,
    tool: data.tool,
    raw: data.raw || data,
  }
}
