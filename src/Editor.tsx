import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import Image from '@tiptap/extension-image'
import { Node, mergeAttributes } from '@tiptap/core'
import { common, createLowlight } from 'lowlight'
import { useEffect, useRef, useCallback, useState } from 'react'
import { api } from './api'

const lowlight = createLowlight(common)

// 自定义视频节点
const Video = Node.create({
  name: 'video',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      src: { default: null },
      controls: { default: true },
    }
  },
  parseHTML() { return [{ tag: 'video' }] },
  renderHTML({ HTMLAttributes }) {
    return ['video', mergeAttributes(HTMLAttributes, { controls: 'true', style: 'max-width: 100%; border-radius: 8px; margin: 0.8em 0;' })]
  },
})

async function uploadAndInsert(editor: any, file: File, type: 'image' | 'video') {
  try {
    const { url } = await api.upload(file)
    if (type === 'image') {
      editor.chain().focus().setImage({ src: url }).run()
    } else {
      editor.chain().focus().insertContent({ type: 'video', attrs: { src: url } }).run()
    }
  } catch (e) {
    console.error('上传失败:', e)
  }
}

function triggerFileUpload(editor: any, accept: string, type: 'image' | 'video') {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = accept
  input.onchange = async () => {
    const file = input.files?.[0]
    if (file) await uploadAndInsert(editor, file, type)
  }
  input.click()
}

const SLASH_COMMANDS = [
  { icon: 'H₁', label: '标题 1', desc: '大标题', action: (editor: any) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { icon: 'H₂', label: '标题 2', desc: '中标题', action: (editor: any) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { icon: 'H₃', label: '标题 3', desc: '小标题', action: (editor: any) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { icon: '•', label: '无序列表', desc: '项目符号列表', action: (editor: any) => editor.chain().focus().toggleBulletList().run() },
  { icon: '1.', label: '有序列表', desc: '编号列表', action: (editor: any) => editor.chain().focus().toggleOrderedList().run() },
  { icon: '☑', label: '任务列表', desc: '复选框列表', action: (editor: any) => editor.chain().focus().toggleTaskList().run() },
  { icon: '❝', label: '引用', desc: '块引用', action: (editor: any) => editor.chain().focus().toggleBlockquote().run() },
  { icon: '</>', label: '代码块', desc: '代码片段', action: (editor: any) => editor.chain().focus().toggleCodeBlock().run() },
  { icon: '—', label: '分割线', desc: '水平分割', action: (editor: any) => editor.chain().focus().setHorizontalRule().run() },
  { icon: '\u{1F5BC}', label: '图片', desc: '上传图片', action: (editor: any) => triggerFileUpload(editor, 'image/*', 'image') },
  { icon: '\u{1F3AC}', label: '视频', desc: '上传视频', action: (editor: any) => triggerFileUpload(editor, 'video/*', 'video') },
]

function SlashMenu({ items, selectedIndex, onSelect }: { items: typeof SLASH_COMMANDS; selectedIndex: number; onSelect: (i: number) => void }) {
  return (
    <div className="slash-menu">
      {items.map((item, i) => (
        <button
          key={item.label}
          className={`slash-menu-item ${i === selectedIndex ? 'is-selected' : ''}`}
          onClick={() => onSelect(i)}
        >
          <span className="slash-menu-item-icon">{item.icon}</span>
          <div>
            <div className="slash-menu-item-label">{item.label}</div>
            <div className="slash-menu-item-desc">{item.desc}</div>
          </div>
        </button>
      ))}
    </div>
  )
}

// 浮动工具栏（文本选中时显示）
function FloatingToolbar({ editor }: { editor: any }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!editor) return
    const update = () => {
      const { from, to } = editor.state.selection
      if (from === to || !editor.isFocused) {
        setPos(null)
        return
      }
      const coords = editor.view.coordsAtPos(from)
      setPos({ top: coords.top - 44, left: coords.left })
    }
    editor.on('selectionUpdate', update)
    editor.on('blur', () => setPos(null))
    return () => {
      editor.off('selectionUpdate', update)
    }
  }, [editor])

  if (!pos || !editor) return null

  const buttons = [
    { label: 'B', action: () => editor.chain().focus().toggleBold().run(), active: editor.isActive('bold'), fontWeight: 700 },
    { label: 'I', action: () => editor.chain().focus().toggleItalic().run(), active: editor.isActive('italic'), fontStyle: 'italic' as const },
    { label: 'S', action: () => editor.chain().focus().toggleStrike().run(), active: editor.isActive('strike') },
    { label: '<>', action: () => editor.chain().focus().toggleCode().run(), active: editor.isActive('code') },
  ]

  return (
    <div style={{
      position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000,
      display: 'flex', gap: 2, padding: 4, borderRadius: 8,
      background: 'var(--bg-secondary)', border: '1px solid var(--border)',
      boxShadow: 'var(--shadow-popup)', animation: 'fadeIn 0.1s ease',
    }}>
      {buttons.map(btn => (
        <button key={btn.label} onMouseDown={e => { e.preventDefault(); btn.action() }} style={{
          background: btn.active ? 'var(--accent-bg-strong)' : 'transparent',
          border: 'none', borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
          color: btn.active ? 'var(--accent)' : 'var(--text-tertiary)',
          fontWeight: btn.fontWeight || 400,
          fontStyle: btn.fontStyle || 'normal',
          fontFamily: "'IBM Plex Mono', monospace", fontSize: 13,
        }}>{btn.label}</button>
      ))}
    </div>
  )
}

interface EditorProps {
  content: string
  onUpdate: (html: string) => void
  editable?: boolean
}

export default function InkwellEditor({ content, onUpdate, editable = true }: EditorProps) {
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashPos, setSlashPos] = useState<{ top: number; left: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const [slashFilter, setSlashFilter] = useState('')
  const slashRef = useRef<HTMLDivElement>(null)

  const filteredCommands = SLASH_COMMANDS.filter(c =>
    c.label.toLowerCase().includes(slashFilter.toLowerCase())
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false,
      }),
      Placeholder.configure({ placeholder: '开始书写… 输入 / 唤起命令菜单' }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: true }),
      CodeBlockLowlight.configure({ lowlight }),
      Image.configure({ allowBase64: false, inline: false }),
      Video,
    ],
    content,
    editable,
    editorProps: {
      attributes: { class: 'tiptap-editor' },
      handleKeyDown: (_view: any, event: KeyboardEvent) => {
        if (slashOpen) {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setSlashIndex(i => (i + 1) % filteredCommands.length)
            return true
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setSlashIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length)
            return true
          }
          if (event.key === 'Enter') {
            event.preventDefault()
            executeSlashCommand(slashIndex)
            return true
          }
          if (event.key === 'Escape') {
            event.preventDefault()
            closeSlash()
            return true
          }
        }
        return false
      },
      handleDrop: (view: any, event: DragEvent) => {
        const files = event.dataTransfer?.files
        if (!files || files.length === 0) return false
        const file = files[0]
        if (file.type.startsWith('image/')) {
          event.preventDefault()
          uploadAndInsert(view.state.editor || (editor as any), file, 'image')
          return true
        }
        if (file.type.startsWith('video/')) {
          event.preventDefault()
          uploadAndInsert(view.state.editor || (editor as any), file, 'video')
          return true
        }
        return false
      },
      handlePaste: (_view: any, event: ClipboardEvent) => {
        const items = event.clipboardData?.items
        if (!items) return false
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile()
            if (file && editor) {
              event.preventDefault()
              uploadAndInsert(editor, file, 'image')
              return true
            }
          }
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onUpdate(html)

      const { state } = editor
      const { from } = state.selection
      const textBefore = state.doc.textBetween(Math.max(0, from - 20), from, '\n')
      const slashMatch = textBefore.match(/\/([^\s/]*)$/)

      if (slashMatch) {
        setSlashFilter(slashMatch[1])
        setSlashIndex(0)
        const coords = editor.view.coordsAtPos(from)
        setSlashPos({ top: coords.bottom + 4, left: coords.left })
        setSlashOpen(true)
      } else {
        if (slashOpen) closeSlash()
      }
    },
  }, [])

  const closeSlash = useCallback(() => {
    setSlashOpen(false)
    setSlashFilter('')
    setSlashIndex(0)
  }, [])

  const executeSlashCommand = useCallback((index: number) => {
    if (!editor || !filteredCommands[index]) return

    const { state } = editor
    const { from } = state.selection
    const textBefore = state.doc.textBetween(Math.max(0, from - 20), from, '\n')
    const slashMatch = textBefore.match(/\/([^\s/]*)$/)
    if (slashMatch) {
      const deleteFrom = from - slashMatch[0].length
      editor.chain().focus().deleteRange({ from: deleteFrom, to: from }).run()
    }

    filteredCommands[index].action(editor)
    closeSlash()
  }, [editor, filteredCommands, closeSlash])

  const prevContent = useRef(content)
  useEffect(() => {
    if (editor && content !== prevContent.current) {
      const currentHtml = editor.getHTML()
      if (content !== currentHtml) {
        editor.commands.setContent(content, false)
      }
      prevContent.current = content
    }
  }, [editor, content])

  useEffect(() => {
    if (editor) editor.setEditable(editable)
  }, [editor, editable])

  return (
    <div style={{ position: 'relative' }}>
      <EditorContent editor={editor} />
      <FloatingToolbar editor={editor} />

      {slashOpen && slashPos && filteredCommands.length > 0 && (
        <div ref={slashRef} style={{ position: 'fixed', top: slashPos.top, left: slashPos.left, zIndex: 1000 }}>
          <SlashMenu items={filteredCommands} selectedIndex={slashIndex} onSelect={executeSlashCommand} />
        </div>
      )}
    </div>
  )
}
