import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { PrismaClient } from '@prisma/client'

const app = express()
const prisma = new PrismaClient()
const PORT = 3001
const JWT_SECRET = process.env.JWT_SECRET || 'inkwell-secret-key'

app.use(cors())
app.use(express.json())

interface AuthRequest extends express.Request { userId?: number }

function authenticate(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' })
  try {
    const payload = jwt.verify(header.split(' ')[1], JWT_SECRET) as { userId: number }
    req.userId = payload.userId
    next()
  } catch { return res.status(401).json({ error: '登录已过期' }) }
}

// ─── Auth ───
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body
  if (!username || !password) return res.status(400).json({ error: '用户名和密码不能为空' })
  if (password.length < 4) return res.status(400).json({ error: '密码至少4位' })
  if (await prisma.user.findUnique({ where: { username } })) return res.status(400).json({ error: '用户名已存在' })
  const user = await prisma.user.create({ data: { username, password: await bcrypt.hash(password, 10) } })
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, username: user.username } })
})

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body
  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) return res.status(400).json({ error: '用户不存在' })
  if (!(await bcrypt.compare(password, user.password))) return res.status(400).json({ error: '密码错误' })
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })
  res.json({ token, user: { id: user.id, username: user.username } })
})

// ─── Folders ───
app.get('/api/folders', authenticate, async (req: AuthRequest, res) => {
  const folders = await prisma.folder.findMany({
    where: { userId: req.userId },
    include: { _count: { select: { notes: true } } },
    orderBy: { name: 'asc' },
  })
  res.json(folders)
})

app.post('/api/folders', authenticate, async (req: AuthRequest, res) => {
  const { name, color } = req.body
  if (!name?.trim()) return res.status(400).json({ error: '文件夹名不能为空' })
  const folder = await prisma.folder.create({
    data: { name: name.trim(), color: color || '#9b8e7e', userId: req.userId! },
    include: { _count: { select: { notes: true } } },
  })
  res.json(folder)
})

app.delete('/api/folders/:id', authenticate, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id)
  await prisma.note.updateMany({ where: { folderId: id, userId: req.userId }, data: { folderId: null } })
  await prisma.folder.delete({ where: { id } })
  res.json({ ok: true })
})

// ─── Tags ───
app.get('/api/tags', authenticate, async (req: AuthRequest, res) => {
  const tags = await prisma.tag.findMany({ where: { userId: req.userId }, orderBy: { name: 'asc' } })
  res.json(tags)
})

app.post('/api/tags', authenticate, async (req: AuthRequest, res) => {
  const { name, color } = req.body
  if (!name?.trim()) return res.status(400).json({ error: '标签名不能为空' })
  const tag = await prisma.tag.create({ data: { name: name.trim(), color: color || '#bf6a3d', userId: req.userId! } })
  res.json(tag)
})

app.delete('/api/tags/:id', authenticate, async (req: AuthRequest, res) => {
  await prisma.tag.delete({ where: { id: parseInt(req.params.id) } })
  res.json({ ok: true })
})

// ─── Notes ───
app.get('/api/notes', authenticate, async (req: AuthRequest, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.userId, deletedAt: null },
    include: { tags: true },
    orderBy: [{ pinned: 'desc' }, { updatedAt: 'desc' }],
  })
  res.json(notes)
})

// 回收站（必须在 :id 路由之前）
app.get('/api/notes/trash', authenticate, async (req: AuthRequest, res) => {
  const notes = await prisma.note.findMany({
    where: { userId: req.userId, deletedAt: { not: null } },
    include: { tags: true },
    orderBy: { deletedAt: 'desc' },
  })
  res.json(notes)
})

app.post('/api/notes', authenticate, async (req: AuthRequest, res) => {
  const note = await prisma.note.create({
    data: { title: req.body.title ?? '', content: req.body.content ?? '', folderId: req.body.folderId || null, userId: req.userId! },
    include: { tags: true },
  })
  res.json(note)
})

app.patch('/api/notes/:id', authenticate, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id)
  const note = await prisma.note.findFirst({ where: { id, userId: req.userId } })
  if (!note) return res.status(404).json({ error: '笔记不存在' })

  // 字段白名单
  const allowed = ['title', 'content', 'pinned', 'folderId']
  const data: any = {}
  for (const key of allowed) {
    if (req.body[key] !== undefined) data[key] = req.body[key]
  }

  // 保存版本快照（内容或标题变化时）
  if (data.content !== undefined || data.title !== undefined) {
    await prisma.noteVersion.create({
      data: { noteId: id, title: note.title, content: note.content },
    })
    // 限制每篇笔记最多 50 个版本
    const versionCount = await prisma.noteVersion.count({ where: { noteId: id } })
    if (versionCount > 50) {
      const oldest = await prisma.noteVersion.findMany({
        where: { noteId: id },
        orderBy: { createdAt: 'asc' },
        take: versionCount - 50,
      })
      await prisma.noteVersion.deleteMany({
        where: { id: { in: oldest.map(v => v.id) } },
      })
    }
  }

  const updated = await prisma.note.update({ where: { id }, data, include: { tags: true } })
  res.json(updated)
})

app.put('/api/notes/:id/tags', authenticate, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id)
  const { tagIds } = req.body
  const updated = await prisma.note.update({
    where: { id },
    data: { tags: { set: tagIds.map((tid: number) => ({ id: tid })) } },
    include: { tags: true },
  })
  res.json(updated)
})

// 软删除
app.delete('/api/notes/:id', authenticate, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id)
  await prisma.note.update({ where: { id }, data: { deletedAt: new Date() } })
  res.json({ ok: true })
})

// ─── 回收站 ───
app.post('/api/notes/:id/restore', authenticate, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id)
  const note = await prisma.note.findFirst({ where: { id, userId: req.userId } })
  if (!note) return res.status(404).json({ error: '笔记不存在' })
  const updated = await prisma.note.update({
    where: { id },
    data: { deletedAt: null },
    include: { tags: true },
  })
  res.json(updated)
})

app.delete('/api/notes/:id/permanent', authenticate, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id)
  const note = await prisma.note.findFirst({ where: { id, userId: req.userId } })
  if (!note) return res.status(404).json({ error: '笔记不存在' })
  await prisma.note.delete({ where: { id } })
  res.json({ ok: true })
})

// ─── 版本历史 ───
app.get('/api/notes/:id/versions', authenticate, async (req: AuthRequest, res) => {
  const id = parseInt(req.params.id)
  const note = await prisma.note.findFirst({ where: { id, userId: req.userId } })
  if (!note) return res.status(404).json({ error: '笔记不存在' })
  const versions = await prisma.noteVersion.findMany({
    where: { noteId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  res.json(versions)
})

app.listen(PORT, () => console.log(`  ✓ API 服务运行中: http://localhost:${PORT}`))
