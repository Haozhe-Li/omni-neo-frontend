import { MarkdownBlogView } from '@/components/markdown-blog-view'

const demoMarkdown = `## 为什么 Markdown 博客应该“隐形设计”

一个好的阅读界面，不应该抢走内容本身的注意力。它只需要做到三件事：

1. 让读者快速找到信息层级
2. 让长文阅读保持舒适节奏
3. 在代码和数据段落里保持清晰

> 当视觉噪音减少时，理解速度会明显提升。

### 设计细节

- 内容宽度控制在 800~900px
- 正文字号使用 16px，行高 1.8
- 强调色仅用于链接与关键引用

### 示例代码

\`\`\`ts
type PostMeta = {
  title: string
  author: string
  publishedAt: string
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('zh-CN')
}
\`\`\`

### 示例表格

| 模块 | 目标 | 结果 |
| --- | --- | --- |
| 标题区 | 快速建立上下文 | 阅读起点更清晰 |
| 正文区 | 保持高可读性 | 滚动疲劳降低 |
| 代码区 | 强化技术表达 | 复制与理解更快 |

更多细节可参考 [设计规范文档](/doc/style.md)。
`

export default function BlogDemoPage() {
  return (
    <MarkdownBlogView
      title="面向 AI 内容站点的 Markdown 博客 UI"
      sectionLabel="Blog"
      excerpt="这是一套遵循 Omni Knows 设计语言的博客展示 UI：克制、清晰、信息优先。"
      author="Omni Knows"
      publishedAt="2026-02-24"
      readingTime="6 min read"
      tags={['Design System', 'Markdown', 'UX']}
      markdown={demoMarkdown}
    />
  )
}