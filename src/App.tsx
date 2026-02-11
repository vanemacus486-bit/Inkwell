import { useState, useRef, useEffect, useCallback } from 'react'
import type { Note, Folder, Tag } from './types'
import { api, auth, folderApi, tagApi } from './api'
import Login from './Login'
import InkwellEditor from './Editor'
import CommandPalette from './CommandPalette'

function formatDate(ts: string): string {
  const d = new Date(ts)
  const diff = Date.now() - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

function truncate(str: string, len = 50): string {
  if (!str) return '空白笔记'
  // Strip HTML tags for preview
  const text = str.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ')
  const line = text.split('\n').find(l => l.trim()) || ''
  return line.length > len ? line.slice(0, len) + '…' : line
}

// 主题管理
function getTheme(): 'light' | 'dark' {
  return (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'light'
}

function setTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('inkwell-theme', theme)
}

function toggleTheme() {
  setTheme(getTheme() === 'light' ? 'dark' : 'light')
}

const FOLDER_COLORS = ['#9b8e7e', '#bf6a3d', '#6a8f6e', '#5b7fa5', '#9673a6', '#a6736e', '#7a8c5e']
const TAG_COLORS = ['#bf6a3d', '#6a8f6e', '#5b7fa5', '#9673a6', '#a6736e', '#c4944a', '#7a8c5e']

function TagBadge({ tag, small, onClick, removable, onRemove }: { tag: Tag; small?: boolean; onClick?: () => void; removable?: boolean; onRemove?: () => void }) {
  return (
    <span onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '1px 8px' : '2px 10px', borderRadius: 99,
      background: tag.color + '18', color: tag.color, border: `1px solid ${tag.color}30`,
      fontSize: small ? 10 : 11, cursor: onClick ? 'pointer' : 'default',
      fontFamily: "'IBM Plex Mono', monospace", whiteSpace: 'nowrap',
    }}>
      {tag.name}
      {removable && <span onClick={e => { e.stopPropagation(); onRemove?.() }} style={{ cursor: 'pointer', marginLeft: 2, fontSize: 10, opacity: 0.6 }}>×</span>}
    </span>
  )
}

function NoteCard({ note, active, onClick }: { note: Note; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', padding: '12px 18px', border: 'none',
      borderLeft: active ? '3px solid var(--accent)' : '3px solid transparent',
      background: active ? 'var(--accent-bg)' : 'transparent',
      cursor: 'pointer', transition: 'all 0.15s ease', borderBottom: '1px solid var(--border-light)',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        {note.pinned && <span style={{ fontSize: 9, color: 'var(--accent)' }}>●</span>}
        <span style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Noto Serif SC', serif" }}>
          {note.title || '无标题'}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'IBM Plex Mono', monospace" }}>
        {truncate(note.content)}
      </div>
      {note.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {note.tags.slice(0, 3).map(t => <TagBadge key={t.id} tag={t} small />)}
          {note.tags.length > 3 && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>+{note.tags.length - 3}</span>}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 5, fontFamily: "'IBM Plex Mono', monospace" }}>{formatDate(note.updatedAt)}</div>
    </button>
  )
}

// Markdown 导出工具
function htmlToMarkdown(html: string): string {
  let md = html
  md = md.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
  md = md.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
  md = md.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
  md = md.replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
  md = md.replace(/<em>(.*?)<\/em>/gi, '*$1*')
  md = md.replace(/<s>(.*?)<\/s>/gi, '~~$1~~')
  md = md.replace(/<code>(.*?)<\/code>/gi, '`$1`')
  md = md.replace(/<blockquote><p>(.*?)<\/p><\/blockquote>/gi, '> $1\n\n')
  md = md.replace(/<hr\s*\/?>/gi, '---\n\n')
  md = md.replace(/<li><p>(.*?)<\/p><\/li>/gi, '- $1\n')
  md = md.replace(/<li>(.*?)<\/li>/gi, '- $1\n')
  md = md.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```\n\n')
  md = md.replace(/<p>(.*?)<\/p>/gi, '$1\n\n')
  md = md.replace(/<br\s*\/?>/gi, '\n')
  md = md.replace(/<[^>]*>/g, '')
  md = md.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  md = md.replace(/\n{3,}/g, '\n\n')
  return md.trim()
}

function downloadFile(filename: string, content: string, type = 'text/markdown') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function exportNoteAsMarkdown(note: Note, folders: Folder[]) {
  const folder = folders.find(f => f.id === note.folderId)
  const frontmatter = [
    '---',
    `title: "${note.title}"`,
    `created: ${note.createdAt}`,
    `updated: ${note.updatedAt}`,
    note.tags.length > 0 ? `tags: [${note.tags.map(t => `"${t.name}"`).join(', ')}]` : null,
    folder ? `folder: "${folder.name}"` : null,
    note.pinned ? 'pinned: true' : null,
    '---',
  ].filter(Boolean).join('\n')

  const md = htmlToMarkdown(note.content)
  const full = `${frontmatter}\n\n# ${note.title || '无标题'}\n\n${md}`
  downloadFile(`${note.title || '无标题'}.md`, full)
}

function exportAllAsMarkdown(notes: Note[], folders: Folder[]) {
  // 简易方式：合并所有笔记为一个 Markdown 文件
  const sections = notes.map(note => {
    const folder = folders.find(f => f.id === note.folderId)
    const tags = note.tags.map(t => `#${t.name}`).join(' ')
    const md = htmlToMarkdown(note.content)
    return `# ${note.title || '无标题'}\n\n> 📁 ${folder?.name || '未分类'} ${tags ? '| ' + tags : ''} | ${new Date(note.updatedAt).toLocaleDateString('zh-CN')}\n\n${md}`
  })
  downloadFile('Inkwell-全部笔记.md', sections.join('\n\n---\n\n'))
}

// 版本历史类型
interface NoteVersion {
  id: number
  title: string
  content: string
  createdAt: string
}

function NotesApp({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [activeFolder, setActiveFolder] = useState<number | null | 'all'>('all')
  const [activeTagFilter, setActiveTagFilter] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [showTagPicker, setShowTagPicker] = useState(false)
  const [theme, setThemeState] = useState(getTheme())
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [showTrash, setShowTrash] = useState(false)
  const [trashedNotes, setTrashedNotes] = useState<Note[]>([])
  const [showVersions, setShowVersions] = useState(false)
  const [versions, setVersions] = useState<NoteVersion[]>([])
  const [previewVersion, setPreviewVersion] = useState<NoteVersion | null>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const active = notes.find(n => n.id === activeId) ?? null

  useEffect(() => {
    Promise.all([api.list(), folderApi.list(), tagApi.list()]).then(([n, f, t]) => {
      setNotes(n); setFolders(f); setTags(t)
      if (n.length > 0) setActiveId(n[0].id)
    }).catch(() => onLogout())
  }, [])

  const filtered = notes.filter(n => {
    if (activeFolder !== 'all') {
      if (activeFolder === null && n.folderId !== null) return false
      if (activeFolder !== null && n.folderId !== activeFolder) return false
    }
    if (activeTagFilter && !n.tags.some(t => t.id === activeTagFilter)) return false
    if (search) {
      const q = search.toLowerCase()
      const plainText = n.content.replace(/<[^>]*>/g, '')
      const matchText = n.title.toLowerCase().includes(q) || plainText.toLowerCase().includes(q)
      const matchTag = n.tags.some(t => t.name.toLowerCase().includes(q))
      if (!matchText && !matchTag) return false
    }
    return true
  }).sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const createNote = useCallback(async () => {
    const fid = activeFolder === 'all' ? null : activeFolder
    const n = await api.create(fid)
    setNotes(prev => [n, ...prev])
    setActiveId(n.id)
    setTimeout(() => titleRef.current?.focus(), 50)
  }, [activeFolder])

  const deleteNote = useCallback(async () => {
    if (!active) return
    await api.remove(active.id)
    setNotes(prev => {
      const next = prev.filter(n => n.id !== active.id)
      setActiveId(next.length ? next[0].id : null)
      return next
    })
  }, [active])

  const updateNote = useCallback((field: string, value: any) => {
    if (activeId === null) return
    setNotes(prev => prev.map(n => n.id === activeId ? { ...n, [field]: value, updatedAt: new Date().toISOString() } : n))
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSaving(true)
    saveTimer.current = setTimeout(async () => {
      try {
        await api.update(activeId, { [field]: value })
      } catch (e) {
        console.error('保存失败:', e)
      } finally {
        setSaving(false)
      }
    }, 500)
  }, [activeId])

  const togglePin = useCallback(async () => {
    if (!active) return
    const v = !active.pinned
    setNotes(prev => prev.map(n => n.id === active.id ? { ...n, pinned: v } : n))
    await api.update(active.id, { pinned: v })
  }, [active])

  const moveToFolder = useCallback(async (folderId: number | null) => {
    if (!active) return
    setNotes(prev => prev.map(n => n.id === active.id ? { ...n, folderId } : n))
    await api.update(active.id, { folderId })
  }, [active])

  const toggleTag = useCallback(async (tagId: number) => {
    if (!active) return
    const has = active.tags.some(t => t.id === tagId)
    const newTagIds = has ? active.tags.filter(t => t.id !== tagId).map(t => t.id) : [...active.tags.map(t => t.id), tagId]
    const updated = await api.setTags(active.id, newTagIds)
    setNotes(prev => prev.map(n => n.id === active.id ? updated : n))
  }, [active])

  const createFolder = async () => {
    if (!newFolderName.trim()) return
    const color = FOLDER_COLORS[folders.length % FOLDER_COLORS.length]
    const f = await folderApi.create(newFolderName.trim(), color)
    setFolders(prev => [...prev, f])
    setNewFolderName(''); setShowNewFolder(false)
  }

  const deleteFolder = async (id: number) => {
    await folderApi.remove(id)
    setFolders(prev => prev.filter(f => f.id !== id))
    setNotes(prev => prev.map(n => n.folderId === id ? { ...n, folderId: null } : n))
    if (activeFolder === id) setActiveFolder('all')
  }

  const createTag = async () => {
    if (!newTagName.trim()) return
    const color = TAG_COLORS[tags.length % TAG_COLORS.length]
    const t = await tagApi.create(newTagName.trim(), color)
    setTags(prev => [...prev, t])
    setNewTagName(''); setShowNewTag(false)
  }

  const deleteTag = async (id: number) => {
    await tagApi.remove(id)
    setTags(prev => prev.filter(t => t.id !== id))
    setNotes(prev => prev.map(n => ({ ...n, tags: n.tags.filter(t => t.id !== id) })))
    if (activeTagFilter === id) setActiveTagFilter(null)
  }

  // 回收站功能
  const loadTrash = useCallback(async () => {
    try {
      const res = await fetch('/api/notes/trash', { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
      if (res.ok) setTrashedNotes(await res.json())
    } catch {}
  }, [])

  const restoreNote = async (id: number) => {
    await fetch(`/api/notes/${id}/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
    const restored = trashedNotes.find(n => n.id === id)
    if (restored) {
      setTrashedNotes(prev => prev.filter(n => n.id !== id))
      setNotes(prev => [{ ...restored, deletedAt: undefined } as any, ...prev])
    }
  }

  const permanentDelete = async (id: number) => {
    await fetch(`/api/notes/${id}/permanent`, { method: 'DELETE', headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
    setTrashedNotes(prev => prev.filter(n => n.id !== id))
  }

  // 版本历史功能
  const loadVersions = useCallback(async (noteId: number) => {
    try {
      const res = await fetch(`/api/notes/${noteId}/versions`, { headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` } })
      if (res.ok) setVersions(await res.json())
    } catch {}
  }, [])

  const restoreVersion = async (version: NoteVersion) => {
    if (!active) return
    updateNote('title', version.title)
    updateNote('content', version.content)
    setPreviewVersion(null)
    setShowVersions(false)
  }

  // 主题切换
  const handleToggleTheme = useCallback(() => {
    toggleTheme()
    setThemeState(getTheme() === 'light' ? 'dark' : 'light')
  }, [])

  // 命令面板命令
  const paletteCommands = [
    { id: 'new-note', icon: '✏️', label: '新建笔记', group: '操作', shortcut: 'Ctrl+N', action: createNote },
    { id: 'toggle-theme', icon: theme === 'light' ? '🌙' : '☀️', label: theme === 'light' ? '切换深色模式' : '切换浅色模式', group: '操作', action: handleToggleTheme },
    { id: 'toggle-sidebar', icon: '◧', label: '切换侧栏', group: '操作', shortcut: 'Ctrl+L', action: () => setSidebarOpen(v => !v) },
    { id: 'search', icon: '⌕', label: '搜索笔记', group: '操作', shortcut: 'Ctrl+F', action: () => searchRef.current?.focus() },
    { id: 'export-current', icon: '📄', label: '导出当前笔记为 Markdown', group: '导出', action: () => active && exportNoteAsMarkdown(active, folders) },
    { id: 'export-all', icon: '📦', label: '导出全部笔记', group: '导出', action: () => exportAllAsMarkdown(notes, folders) },
    { id: 'trash', icon: '🗑', label: '打开回收站', group: '操作', action: () => { setShowTrash(true); loadTrash() } },
    { id: 'versions', icon: '🕐', label: '查看版本历史', group: '操作', action: () => { if (active) { setShowVersions(true); loadVersions(active.id) } } },
    { id: 'pin', icon: '📌', label: active?.pinned ? '取消置顶' : '置顶笔记', group: '操作', action: togglePin },
    { id: 'delete', icon: '✕', label: '删除笔记', group: '操作', shortcut: 'Ctrl+D', action: deleteNote },
    { id: 'logout', icon: '🚪', label: '退出登录', group: '操作', action: onLogout },
  ]

  // 快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); createNote() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); deleteNote() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setCmdPaletteOpen(v => !v) }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') { e.preventDefault(); setSidebarOpen(v => !v) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createNote, deleteNote])

  const charCount = active ? active.content.replace(/<[^>]*>/g, '').length : 0

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: "'IBM Plex Mono', monospace", background: 'var(--bg-primary)', color: 'var(--text-primary)', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* 命令面板 */}
      <CommandPalette
        open={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        notes={notes}
        folders={folders}
        tags={tags}
        onSelectNote={id => { setActiveId(id); setShowTrash(false) }}
        onSelectFolder={id => { setActiveFolder(id); setActiveTagFilter(null) }}
        onSelectTag={id => setActiveTagFilter(id)}
        commands={paletteCommands}
      />

      {/* 侧栏 */}
      <aside style={{ width: sidebarOpen ? 280 : 0, minWidth: sidebarOpen ? 280 : 0, height: '100%', background: 'var(--bg-secondary)', borderRight: sidebarOpen ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease', overflow: 'hidden' }}>
        {/* 头部 */}
        <div style={{ padding: '18px 18px 10px', borderBottom: '1px solid var(--border-light)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Noto Serif SC', serif" }}>墨 Inkwell</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={handleToggleTheme} title="切换主题" style={{ background: 'none', border: 'none', fontSize: 14, cursor: 'pointer', padding: '2px 4px', color: 'var(--text-muted)' }}>{theme === 'light' ? '🌙' : '☀️'}</button>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{username}</span>
              <button onClick={onLogout} style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--text-faint)', cursor: 'pointer', fontFamily: 'inherit' }}>退出</button>
            </div>
          </div>
          <div style={{ marginTop: 12, position: 'relative' }}>
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索… 或 Ctrl+K 命令面板"
              style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid var(--border-input)', borderRadius: 8, background: 'var(--bg-primary)', fontSize: 11.5, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-faint)', pointerEvents: 'none' }}>⌕</span>
          </div>
        </div>

        {/* 文件夹区 */}
        <div style={{ padding: '10px 14px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>文件夹</span>
            <button onClick={() => setShowNewFolder(!showNewFolder)} style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--accent)', cursor: 'pointer', lineHeight: 1 }}>+</button>
          </div>
          {showNewFolder && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFolder()} placeholder="文件夹名" autoFocus
                style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border-input-strong)', borderRadius: 6, fontSize: 11, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <button onClick={createFolder} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>创建</button>
            </div>
          )}
          <button onClick={() => { setActiveFolder('all'); setActiveTagFilter(null); setShowTrash(false) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: 6, background: activeFolder === 'all' && !activeTagFilter && !showTrash ? 'var(--bg-active)' : 'transparent', color: 'var(--text-tertiary)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            全部笔记 <span style={{ color: 'var(--text-faint)' }}>({notes.length})</span>
          </button>
          <button onClick={() => { setActiveFolder(null); setActiveTagFilter(null); setShowTrash(false) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: 6, background: activeFolder === null && !activeTagFilter && !showTrash ? 'var(--bg-active)' : 'transparent', color: 'var(--text-tertiary)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            未分类 <span style={{ color: 'var(--text-faint)' }}>({notes.filter(n => !n.folderId).length})</span>
          </button>
          {folders.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center' }}>
              <button onClick={() => { setActiveFolder(f.id); setActiveTagFilter(null); setShowTrash(false) }}
                style={{ flex: 1, textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: 6, background: activeFolder === f.id ? 'var(--bg-active)' : 'transparent', color: 'var(--text-tertiary)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: f.color, fontSize: 10 }}>■</span>
                {f.name} <span style={{ color: 'var(--text-faint)' }}>({f._count?.notes ?? 0})</span>
              </button>
              <button onClick={() => deleteFolder(f.id)} style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', fontSize: 11, cursor: 'pointer', padding: '4px 6px' }}>×</button>
            </div>
          ))}
        </div>

        {/* 标签区 */}
        <div style={{ padding: '6px 14px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>标签</span>
            <button onClick={() => setShowNewTag(!showNewTag)} style={{ background: 'none', border: 'none', fontSize: 14, color: 'var(--accent)', cursor: 'pointer', lineHeight: 1 }}>+</button>
          </div>
          {showNewTag && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createTag()} placeholder="标签名" autoFocus
                style={{ flex: 1, padding: '4px 8px', border: '1px solid var(--border-input-strong)', borderRadius: 6, fontSize: 11, outline: 'none', fontFamily: 'inherit', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} />
              <button onClick={createTag} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>创建</button>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {tags.map(t => (
              <div key={t.id} style={{ display: 'inline-flex' }}>
                <TagBadge tag={t} small onClick={() => setActiveTagFilter(activeTagFilter === t.id ? null : t.id)} removable onRemove={() => deleteTag(t.id)} />
              </div>
            ))}
          </div>
          {activeTagFilter && (
            <button onClick={() => setActiveTagFilter(null)} style={{ background: 'none', border: 'none', fontSize: 10, color: 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>清除标签筛选</button>
          )}
        </div>

        {/* 回收站入口 */}
        <div style={{ padding: '6px 14px 0' }}>
          <button onClick={() => { setShowTrash(true); loadTrash() }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: 6, background: showTrash ? 'var(--bg-active)' : 'transparent', color: 'var(--text-muted)', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            🗑 回收站
          </button>
        </div>

        {/* 新建 + 列表 */}
        <button onClick={createNote} style={{ margin: '8px 14px 4px', padding: '8px 0', border: '1px dashed var(--accent-border)', borderRadius: 8, background: 'transparent', color: 'var(--accent)', fontSize: 12, fontFamily: "'Noto Serif SC', serif", cursor: 'pointer', fontWeight: 500 }}>+ 新建笔记</button>
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 2 }}>
          {showTrash ? (
            // 回收站列表
            trashedNotes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)', fontSize: 11 }}>回收站为空</div>
            ) : (
              trashedNotes.map(n => (
                <div key={n.id} style={{ padding: '10px 18px', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)', fontFamily: "'Noto Serif SC', serif", marginBottom: 4 }}>{n.title || '无标题'}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{truncate(n.content)}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => restoreNote(n.id)} style={{ background: 'var(--accent-bg)', color: 'var(--accent)', border: 'none', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>恢复</button>
                    <button onClick={() => permanentDelete(n.id)} style={{ background: 'none', color: 'var(--text-ghost)', border: '1px solid var(--border-input)', borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>永久删除</button>
                  </div>
                </div>
              ))
            )
          ) : (
            // 正常笔记列表
            <>
              {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-faint)', fontSize: 11 }}>
                {search ? '无匹配结果' : (
                  <div>
                    <div style={{ fontSize: 32, opacity: 0.2, marginBottom: 12 }}>墨</div>
                    <div>还没有笔记</div>
                    <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-ghost)' }}>点击上方按钮或 Ctrl+N 创建</div>
                  </div>
                )}
              </div>}
              {filtered.map(n => <NoteCard key={n.id} note={n} active={n.id === activeId} onClick={() => setActiveId(n.id)} />)}
            </>
          )}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border-light)', fontSize: 9.5, color: 'var(--text-ghost)', textAlign: 'center', fontStyle: 'italic' }}>Inkwell v0.5</div>
      </aside>

      {/* 编辑区 */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-primary)', minHeight: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', padding: '4px 6px' }}>{sidebarOpen ? '◧' : '▤'}</button>
            <button onClick={() => setCmdPaletteOpen(true)} title="命令面板 (Ctrl+K)" style={{ background: 'none', border: '1px solid var(--border-input)', borderRadius: 6, cursor: 'pointer', fontSize: 11, color: 'var(--text-faint)', padding: '4px 12px', fontFamily: 'inherit' }}>⌕ Ctrl+K</button>
            {saving && <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>保存中…</span>}
          </div>
          {active && !showTrash && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select value={active.folderId ?? ''} onChange={e => moveToFolder(e.target.value ? parseInt(e.target.value) : null)}
                style={{ padding: '3px 8px', border: '1px solid var(--border-input)', borderRadius: 6, background: 'var(--bg-primary)', fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value="">未分类</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowTagPicker(!showTagPicker)}
                  style={{ background: showTagPicker ? 'var(--accent-bg-strong)' : 'none', border: '1px solid var(--border-input)', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                  标签 ({active.tags.length})
                </button>
                {showTagPicker && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: 'var(--bg-secondary)', border: '1px solid var(--border-input)', borderRadius: 10, padding: 12, minWidth: 180, zIndex: 100, boxShadow: 'var(--shadow-popup)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 8 }}>点击切换标签</div>
                    {tags.length === 0 && <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>在侧栏创建标签</div>}
                    {tags.map(t => {
                      const has = active.tags.some(at => at.id === t.id)
                      return (
                        <button key={t.id} onClick={() => toggleTag(t.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: 'none', borderRadius: 6, background: has ? t.color + '18' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: 'var(--text-secondary)', textAlign: 'left', width: '100%' }}>
                          <span style={{ color: t.color, fontSize: 11 }}>{has ? '✓' : '○'}</span> {t.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <button onClick={() => { setShowVersions(v => !v); if (!showVersions && active) loadVersions(active.id) }} title="版本历史"
                style={{ background: showVersions ? 'var(--accent-bg-strong)' : 'none', border: '1px solid var(--border-input)', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                🕐 历史
              </button>
              <button onClick={() => active && exportNoteAsMarkdown(active, folders)} title="导出 Markdown"
                style={{ background: 'none', border: '1px solid var(--border-input)', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: 'var(--text-tertiary)', cursor: 'pointer', fontFamily: 'inherit' }}>
                📄 导出
              </button>
              <button onClick={togglePin} style={{ background: active.pinned ? 'var(--accent-bg-strong)' : 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: active.pinned ? 'var(--accent)' : 'var(--text-faint)', padding: '4px 8px', borderRadius: 6 }}>{active.pinned ? '◉ 置顶' : '○ 置顶'}</button>
              <button onClick={deleteNote} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-ghost)', padding: '4px 8px', borderRadius: 6 }}>删除</button>
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 编辑主区域 */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {active && !showTrash ? (
              <div style={{ display: 'flex', justifyContent: 'center' }} onClick={() => setShowTagPicker(false)}>
                <div style={{ width: '100%', maxWidth: 720, padding: '40px 32px 120px' }}>
                  <input ref={titleRef} value={active.title} onChange={e => updateNote('title', e.target.value)} placeholder="标题"
                    style={{ width: '100%', border: 'none', outline: 'none', fontSize: 28, fontWeight: 700, fontFamily: "'Noto Serif SC', serif", color: 'var(--text-primary)', background: 'transparent', lineHeight: 1.3, padding: 0, marginBottom: 6 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
                      {new Date(active.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} · {charCount} 字
                    </span>
                    {active.tags.map(t => <TagBadge key={t.id} tag={t} removable onRemove={() => toggleTag(t.id)} />)}
                  </div>
                  <div style={{ height: 1, background: `linear-gradient(90deg, var(--accent), transparent)`, opacity: 0.3, marginBottom: 28 }} />

                  {previewVersion ? (
                    <div>
                      <div style={{ padding: '8px 14px', marginBottom: 16, borderRadius: 8, background: 'var(--accent-bg)', fontSize: 12, color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>预览版本: {new Date(previewVersion.createdAt).toLocaleString('zh-CN')}</span>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button onClick={() => restoreVersion(previewVersion)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, padding: '3px 12px', fontSize: 11, cursor: 'pointer' }}>恢复此版本</button>
                          <button onClick={() => setPreviewVersion(null)} style={{ background: 'none', color: 'var(--accent)', border: '1px solid var(--accent)', borderRadius: 4, padding: '3px 12px', fontSize: 11, cursor: 'pointer' }}>取消</button>
                        </div>
                      </div>
                      <div className="tiptap-editor" dangerouslySetInnerHTML={{ __html: previewVersion.content }} />
                    </div>
                  ) : (
                    <InkwellEditor
                      content={active.content}
                      onUpdate={html => updateNote('content', html)}
                    />
                  )}
                </div>
              </div>
            ) : showTrash ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-ghost)' }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>🗑</div>
                <div style={{ fontSize: 13 }}>在左侧选择要恢复或删除的笔记</div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--text-ghost)' }}>
                <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>墨</div>
                <div style={{ fontSize: 13 }}>选择一篇笔记，或创建新的</div>
                <div style={{ fontSize: 11, marginTop: 8, color: 'var(--text-ghost)' }}>Ctrl+K 打开命令面板</div>
              </div>
            )}
          </div>

          {/* 版本历史侧栏 */}
          {showVersions && active && (
            <div className="version-panel" style={{ animation: 'slideIn 0.2s ease' }}>
              <div className="version-panel-header">
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: "'Noto Serif SC', serif" }}>版本历史</span>
                <button onClick={() => { setShowVersions(false); setPreviewVersion(null) }} style={{ background: 'none', border: 'none', color: 'var(--text-ghost)', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {versions.length === 0 ? (
                  <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-faint)', fontSize: 11 }}>暂无历史版本</div>
                ) : (
                  versions.map(v => (
                    <div
                      key={v.id}
                      className={`version-item ${previewVersion?.id === v.id ? 'is-selected' : ''}`}
                      onClick={() => setPreviewVersion(v)}
                    >
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-tertiary)', marginBottom: 2 }}>{v.title || '无标题'}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-faint)', fontFamily: "'IBM Plex Mono', monospace" }}>
                        {new Date(v.createdAt).toLocaleString('zh-CN')}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-ghost)', marginTop: 3 }}>
                        {v.content.replace(/<[^>]*>/g, '').slice(0, 40)}…
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {active && !showTrash && (
          <div style={{ padding: '5px 24px', borderTop: '1px solid var(--border-light)', fontSize: 10, color: 'var(--text-ghost)', display: 'flex', justifyContent: 'space-between', fontFamily: "'IBM Plex Mono', monospace", background: 'var(--bg-tertiary)' }}>
            <span>最后编辑: {formatDate(active.updatedAt)}</span>
            <span>Ctrl+N 新建 · Ctrl+K 命令 · Ctrl+F 搜索 · Ctrl+D 删除</span>
          </div>
        )}
      </main>
    </div>
  )
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(auth.isLoggedIn())
  const [username, setUsername] = useState('')
  const handleLogout = () => { auth.logout(); setLoggedIn(false); setUsername('') }
  if (!loggedIn) return <Login onSuccess={name => { setLoggedIn(true); setUsername(name) }} />
  return <NotesApp username={username} onLogout={handleLogout} />
}
