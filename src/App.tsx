import { useState, useRef, useEffect, useCallback } from 'react'
import type { Note, Folder, Tag } from './types'
import { api, auth, folderApi, tagApi } from './api'
import Login from './Login'

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
  const line = str.split('\n').find(l => l.trim()) || ''
  return line.length > len ? line.slice(0, len) + '…' : line
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
      borderLeft: active ? '3px solid #bf6a3d' : '3px solid transparent',
      background: active ? 'linear-gradient(90deg, rgba(191,106,61,0.08), transparent)' : 'transparent',
      cursor: 'pointer', transition: 'all 0.15s ease', borderBottom: '1px solid rgba(120,100,80,0.08)',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(120,100,80,0.04)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
        {note.pinned && <span style={{ fontSize: 9, color: '#bf6a3d' }}>●</span>}
        <span style={{ fontSize: 13, fontWeight: 600, color: active ? '#2c2419' : '#5a4d3e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'Noto Serif SC', serif" }}>
          {note.title || '无标题'}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: '#9b8e7e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'IBM Plex Mono', monospace" }}>
        {truncate(note.content)}
      </div>
      {note.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          {note.tags.slice(0, 3).map(t => <TagBadge key={t.id} tag={t} small />)}
          {note.tags.length > 3 && <span style={{ fontSize: 10, color: '#b8ab9a' }}>+{note.tags.length - 3}</span>}
        </div>
      )}
      <div style={{ fontSize: 10, color: '#b8ab9a', marginTop: 5, fontFamily: "'IBM Plex Mono', monospace" }}>{formatDate(note.updatedAt)}</div>
    </button>
  )
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
      const matchText = n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
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
      await api.update(activeId, { [field]: value })
      setSaving(false)
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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') { e.preventDefault(); createNote() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); searchRef.current?.focus() }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); deleteNote() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [createNote, deleteNote])

  const charCount = active ? active.content.length : 0

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', fontFamily: "'IBM Plex Mono', monospace", background: '#faf7f2', color: '#2c2419', overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=IBM+Plex+Mono:wght@300;400;500&display=swap" rel="stylesheet" />

      {/* 侧栏 */}
      <aside style={{ width: sidebarOpen ? 280 : 0, minWidth: sidebarOpen ? 280 : 0, height: '100%', background: '#f5f0e8', borderRight: sidebarOpen ? '1px solid rgba(120,100,80,0.12)' : 'none', display: 'flex', flexDirection: 'column', transition: 'all 0.3s ease', overflow: 'hidden' }}>
        {/* 头部 */}
        <div style={{ padding: '18px 18px 10px', borderBottom: '1px solid rgba(120,100,80,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0, fontFamily: "'Noto Serif SC', serif" }}>墨 Inkwell</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#9b8e7e' }}>{username}</span>
              <button onClick={onLogout} style={{ background: 'none', border: 'none', fontSize: 10, color: '#b8ab9a', cursor: 'pointer', fontFamily: 'inherit' }}>退出</button>
            </div>
          </div>
          <div style={{ marginTop: 12, position: 'relative' }}>
            <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索关键字或标签…"
              style={{ width: '100%', padding: '8px 12px 8px 30px', border: '1px solid rgba(120,100,80,0.15)', borderRadius: 8, background: '#faf7f2', fontSize: 11.5, color: '#2c2419', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#b8ab9a', pointerEvents: 'none' }}>⌕</span>
          </div>
        </div>

        {/* 文件夹区 */}
        <div style={{ padding: '10px 14px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#b8ab9a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>文件夹</span>
            <button onClick={() => setShowNewFolder(!showNewFolder)} style={{ background: 'none', border: 'none', fontSize: 14, color: '#bf6a3d', cursor: 'pointer', lineHeight: 1 }}>+</button>
          </div>
          {showNewFolder && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={newFolderName} onChange={e => setNewFolderName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFolder()} placeholder="文件夹名" autoFocus
                style={{ flex: 1, padding: '4px 8px', border: '1px solid rgba(120,100,80,0.2)', borderRadius: 6, fontSize: 11, outline: 'none', fontFamily: 'inherit', background: '#faf7f2' }} />
              <button onClick={createFolder} style={{ background: '#bf6a3d', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>创建</button>
            </div>
          )}
          <button onClick={() => { setActiveFolder('all'); setActiveTagFilter(null) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: 6, background: activeFolder === 'all' && !activeTagFilter ? 'rgba(120,100,80,0.1)' : 'transparent', color: '#5a4d3e', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            全部笔记 <span style={{ color: '#b8ab9a' }}>({notes.length})</span>
          </button>
          <button onClick={() => { setActiveFolder(null); setActiveTagFilter(null) }}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: 6, background: activeFolder === null && !activeTagFilter ? 'rgba(120,100,80,0.1)' : 'transparent', color: '#5a4d3e', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit' }}>
            未分类 <span style={{ color: '#b8ab9a' }}>({notes.filter(n => !n.folderId).length})</span>
          </button>
          {folders.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center' }}>
              <button onClick={() => { setActiveFolder(f.id); setActiveTagFilter(null) }}
                style={{ flex: 1, textAlign: 'left', padding: '6px 10px', border: 'none', borderRadius: 6, background: activeFolder === f.id ? 'rgba(120,100,80,0.1)' : 'transparent', color: '#5a4d3e', fontSize: 11.5, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: f.color, fontSize: 10 }}>■</span>
                {f.name} <span style={{ color: '#b8ab9a' }}>({f._count?.notes ?? 0})</span>
              </button>
              <button onClick={() => deleteFolder(f.id)} style={{ background: 'none', border: 'none', color: '#c4b8a8', fontSize: 11, cursor: 'pointer', padding: '4px 6px' }}>×</button>
            </div>
          ))}
        </div>

        {/* 标签区 */}
        <div style={{ padding: '6px 14px 4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 10, color: '#b8ab9a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>标签</span>
            <button onClick={() => setShowNewTag(!showNewTag)} style={{ background: 'none', border: 'none', fontSize: 14, color: '#bf6a3d', cursor: 'pointer', lineHeight: 1 }}>+</button>
          </div>
          {showNewTag && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input value={newTagName} onChange={e => setNewTagName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createTag()} placeholder="标签名" autoFocus
                style={{ flex: 1, padding: '4px 8px', border: '1px solid rgba(120,100,80,0.2)', borderRadius: 6, fontSize: 11, outline: 'none', fontFamily: 'inherit', background: '#faf7f2' }} />
              <button onClick={createTag} style={{ background: '#bf6a3d', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer' }}>创建</button>
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
            <button onClick={() => setActiveTagFilter(null)} style={{ background: 'none', border: 'none', fontSize: 10, color: '#bf6a3d', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>清除标签筛选</button>
          )}
        </div>

        {/* 新建 + 列表 */}
        <button onClick={createNote} style={{ margin: '8px 14px 4px', padding: '8px 0', border: '1px dashed rgba(191,106,61,0.35)', borderRadius: 8, background: 'transparent', color: '#bf6a3d', fontSize: 12, fontFamily: "'Noto Serif SC', serif", cursor: 'pointer', fontWeight: 500 }}>+ 新建笔记</button>
        <div style={{ flex: 1, overflowY: 'auto', paddingTop: 2 }}>
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 30, color: '#b8ab9a', fontSize: 11 }}>{search ? '无匹配结果' : '还没有笔记'}</div>}
          {filtered.map(n => <NoteCard key={n.id} note={n} active={n.id === activeId} onClick={() => setActiveId(n.id)} />)}
        </div>
        <div style={{ padding: '10px 18px', borderTop: '1px solid rgba(120,100,80,0.08)', fontSize: 9.5, color: '#c4b8a8', textAlign: 'center', fontStyle: 'italic' }}>Inkwell v0.4</div>
      </aside>

      {/* 编辑区 */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 24px', borderBottom: '1px solid rgba(120,100,80,0.08)', background: '#faf7f2', minHeight: 44 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9b8e7e', padding: '4px 6px' }}>{sidebarOpen ? '◧' : '▤'}</button>
            {saving && <span style={{ fontSize: 10, color: '#b8ab9a' }}>保存中…</span>}
          </div>
          {active && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <select value={active.folderId ?? ''} onChange={e => moveToFolder(e.target.value ? parseInt(e.target.value) : null)}
                style={{ padding: '3px 8px', border: '1px solid rgba(120,100,80,0.15)', borderRadius: 6, background: '#faf7f2', fontSize: 11, color: '#5a4d3e', fontFamily: 'inherit', outline: 'none', cursor: 'pointer' }}>
                <option value="">未分类</option>
                {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <div style={{ position: 'relative' }}>
                <button onClick={() => setShowTagPicker(!showTagPicker)}
                  style={{ background: showTagPicker ? 'rgba(191,106,61,0.1)' : 'none', border: '1px solid rgba(120,100,80,0.15)', borderRadius: 6, padding: '3px 10px', fontSize: 11, color: '#5a4d3e', cursor: 'pointer', fontFamily: 'inherit' }}>
                  标签 ({active.tags.length})
                </button>
                {showTagPicker && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, background: '#f5f0e8', border: '1px solid rgba(120,100,80,0.15)', borderRadius: 10, padding: 12, minWidth: 180, zIndex: 100, boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                    <div style={{ fontSize: 10, color: '#b8ab9a', marginBottom: 8 }}>点击切换标签</div>
                    {tags.length === 0 && <div style={{ fontSize: 11, color: '#b8ab9a' }}>在侧栏创建标签</div>}
                    {tags.map(t => {
                      const has = active.tags.some(at => at.id === t.id)
                      return (
                        <button key={t.id} onClick={() => toggleTag(t.id)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', border: 'none', borderRadius: 6, background: has ? t.color + '18' : 'transparent', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: '#3d3225', textAlign: 'left', width: '100%' }}>
                          <span style={{ color: t.color, fontSize: 11 }}>{has ? '✓' : '○'}</span> {t.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
              <button onClick={togglePin} style={{ background: active.pinned ? 'rgba(191,106,61,0.1)' : 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: active.pinned ? '#bf6a3d' : '#b8ab9a', padding: '4px 8px', borderRadius: 6 }}>{active.pinned ? '◉ 置顶' : '○ 置顶'}</button>
              <button onClick={deleteNote} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: '#c4b8a8', padding: '4px 8px', borderRadius: 6 }}>删除</button>
            </div>
          )}
        </div>

        {active ? (
          <div style={{ flex: 1, overflow: 'auto', display: 'flex', justifyContent: 'center' }} onClick={() => setShowTagPicker(false)}>
            <div style={{ width: '100%', maxWidth: 720, padding: '40px 32px 120px' }}>
              <input ref={titleRef} value={active.title} onChange={e => updateNote('title', e.target.value)} placeholder="标题"
                style={{ width: '100%', border: 'none', outline: 'none', fontSize: 28, fontWeight: 700, fontFamily: "'Noto Serif SC', serif", color: '#2c2419', background: 'transparent', lineHeight: 1.3, padding: 0, marginBottom: 6 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: '#b8ab9a', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {new Date(active.createdAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })} · {charCount} 字
                </span>
                {active.tags.map(t => <TagBadge key={t.id} tag={t} removable onRemove={() => toggleTag(t.id)} />)}
              </div>
              <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(191,106,61,0.3), rgba(191,106,61,0.05), transparent)', marginBottom: 28 }} />
              <textarea value={active.content} onChange={e => updateNote('content', e.target.value)} placeholder="开始书写…"
                style={{ width: '100%', minHeight: 400, border: 'none', outline: 'none', fontSize: 15, fontFamily: "'Noto Serif SC', serif", color: '#3d3225', background: 'transparent', lineHeight: 2, padding: 0, resize: 'none' }} />
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: '#c4b8a8' }}>
            <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>墨</div>
            <div style={{ fontSize: 13 }}>选择一篇笔记，或创建新的</div>
          </div>
        )}

        {active && (
          <div style={{ padding: '5px 24px', borderTop: '1px solid rgba(120,100,80,0.06)', fontSize: 10, color: '#c4b8a8', display: 'flex', justifyContent: 'space-between', fontFamily: "'IBM Plex Mono', monospace", background: '#f9f6f0' }}>
            <span>最后编辑: {formatDate(active.updatedAt)}</span>
            <span>Ctrl+N 新建 · Ctrl+F 搜索 · Ctrl+D 删除</span>
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
