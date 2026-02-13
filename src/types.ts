export interface Tag {
  id: number
  name: string
  color: string
}

export interface Folder {
  id: number
  name: string
  color: string
  _count?: { notes: number }
}

export interface Note {
  id: number
  title: string
  content: string
  pinned: boolean
  folderId: number | null
  tags: Tag[]
  createdAt: string
  updatedAt: string
  locked?: boolean
}

export interface Comment {
  id: number
  content: string
  createdAt: string
  noteId: number
}

export interface Stats {
  heatmap: Record<string, number>
  streak: number
  totalNotes: number
  totalChars: number
}

export interface AuthResponse {
  token: string
  user: { id: number; username: string }
}
