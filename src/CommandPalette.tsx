import { useState, useEffect, useRef, useCallback } from 'react'
import type { Note, Folder, Tag } from './types'

interface Command {
  id: string
  icon: string
  label: string
  group: string
  shortcut?: string
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  notes: Note[]
  folders: Folder[]
  tags: Tag[]
  onSelectNote: (id: number) => void
  onSelectFolder: (id: number | null | 'all') => void
  onSelectTag: (id: number | null) => void
  commands: Command[]
}

function fuzzyMatch(text: string, query: string): boolean {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  if (t.includes(q)) return true
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  return qi === q.length
}

export default function CommandPalette({ open, onClose, notes, folders, tags, onSelectNote, onSelectFolder, onSelectTag, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  // 构建搜索结果
  const results: { type: string; id: string; icon: string; label: string; shortcut?: string; action: () => void }[] = []

  if (query) {
    // 搜索笔记
    notes.filter(n => fuzzyMatch(n.title || '无标题', query) || fuzzyMatch(n.content, query)).slice(0, 5).forEach(n => {
      results.push({ type: '笔记', id: `note-${n.id}`, icon: '📝', label: n.title || '无标题', action: () => { onSelectNote(n.id); onClose() } })
    })

    // 搜索文件夹
    folders.filter(f => fuzzyMatch(f.name, query)).forEach(f => {
      results.push({ type: '文件夹', id: `folder-${f.id}`, icon: '📁', label: f.name, action: () => { onSelectFolder(f.id); onClose() } })
    })

    // 搜索标签
    tags.filter(t => fuzzyMatch(t.name, query)).forEach(t => {
      results.push({ type: '标签', id: `tag-${t.id}`, icon: '🏷', label: t.name, action: () => { onSelectTag(t.id); onClose() } })
    })

    // 搜索命令
    commands.filter(c => fuzzyMatch(c.label, query)).forEach(c => {
      results.push({ type: '命令', id: c.id, icon: c.icon, label: c.label, shortcut: c.shortcut, action: () => { c.action(); onClose() } })
    })
  } else {
    // 无搜索时显示所有命令
    commands.forEach(c => {
      results.push({ type: '命令', id: c.id, icon: c.icon, label: c.label, shortcut: c.shortcut, action: () => { c.action(); onClose() } })
    })
  }

  // 按组分组
  const groups = new Map<string, typeof results>()
  results.forEach(r => {
    if (!groups.has(r.type)) groups.set(r.type, [])
    groups.get(r.type)!.push(r)
  })

  const flatResults = results

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, flatResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
      e.preventDefault()
      flatResults[selectedIndex].action()
    } else if (e.key === 'Escape') {
      onClose()
    }
  }, [flatResults, selectedIndex, onClose])

  // 滚动选中项到可见范围
  useEffect(() => {
    const el = listRef.current?.querySelector('.is-selected')
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!open) return null

  let itemIndex = -1

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="搜索笔记、文件夹、标签或命令…"
        />
        <div className="command-palette-list" ref={listRef}>
          {flatResults.length === 0 && (
            <div className="command-palette-empty">无匹配结果</div>
          )}
          {Array.from(groups.entries()).map(([group, items]) => (
            <div key={group}>
              <div className="command-palette-group">{group}</div>
              {items.map(item => {
                itemIndex++
                const idx = itemIndex
                return (
                  <button
                    key={item.id}
                    className={`command-palette-item ${idx === selectedIndex ? 'is-selected' : ''}`}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <span className="command-palette-item-icon">{item.icon}</span>
                    <span className="command-palette-item-label">{item.label}</span>
                    {item.shortcut && <span className="command-palette-item-shortcut">{item.shortcut}</span>}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
