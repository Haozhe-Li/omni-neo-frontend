export interface SSEMessage {
  type: string
  agent?: string
  content?: string
  tool?: string
  raw?: any
}

export interface TodoItem {
  content: string
  status: 'completed' | 'in_progress' | 'pending'
}

export interface Source {
  title: string
  url: string
  content?: string
}

export type PublishDuration = '7d' | '30d' | 'permanent'
