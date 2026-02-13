import type { Note, Folder, Tag, Comment, Stats, AuthResponse } from './types'

const BASE = '/api'

function getToken(): string | null {
  return sessionStorage.getItem('token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

function authHeadersRaw(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const auth = {
  async register(username: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${BASE}/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
    const data = await res.json()
    sessionStorage.setItem('token', data.token)
    return data
  },
  async login(username: string, password: string): Promise<AuthResponse> {
    const res = await fetch(`${BASE}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
    const data = await res.json()
    sessionStorage.setItem('token', data.token)
    return data
  },
  logout() { sessionStorage.removeItem('token') },
  isLoggedIn(): boolean { return !!getToken() },
}

export const folderApi = {
  async list(): Promise<Folder[]> {
    const res = await fetch(`${BASE}/folders`, { headers: authHeaders() })
    return res.json()
  },
  async create(name: string, color?: string): Promise<Folder> {
    const res = await fetch(`${BASE}/folders`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name, color }),
    })
    return res.json()
  },
  async remove(id: number): Promise<void> {
    await fetch(`${BASE}/folders/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
}

export const tagApi = {
  async list(): Promise<Tag[]> {
    const res = await fetch(`${BASE}/tags`, { headers: authHeaders() })
    return res.json()
  },
  async create(name: string, color?: string): Promise<Tag> {
    const res = await fetch(`${BASE}/tags`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ name, color }),
    })
    return res.json()
  },
  async remove(id: number): Promise<void> {
    await fetch(`${BASE}/tags/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
}

export const api = {
  async list(): Promise<Note[]> {
    const res = await fetch(`${BASE}/notes`, { headers: authHeaders() })
    if (res.status === 401) throw new Error('UNAUTHORIZED')
    return res.json()
  },
  async create(folderId?: number | null): Promise<Note> {
    const res = await fetch(`${BASE}/notes`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ title: '', content: '', folderId: folderId || null }),
    })
    return res.json()
  },
  async update(id: number, data: any): Promise<Note> {
    const res = await fetch(`${BASE}/notes/${id}`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify(data),
    })
    return res.json()
  },
  async remove(id: number): Promise<void> {
    await fetch(`${BASE}/notes/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
  async setTags(noteId: number, tagIds: number[]): Promise<Note> {
    const res = await fetch(`${BASE}/notes/${noteId}/tags`, {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ tagIds }),
    })
    return res.json()
  },
  async random(mode: 'random' | 'thisday' = 'random'): Promise<Note | Note[] | null> {
    const res = await fetch(`${BASE}/notes/random?mode=${mode}`, { headers: authHeaders() })
    return res.json()
  },
  async stats(): Promise<Stats> {
    const res = await fetch(`${BASE}/notes/stats`, { headers: authHeaders() })
    return res.json()
  },
  async lock(id: number, password: string): Promise<void> {
    const res = await fetch(`${BASE}/notes/${id}/lock`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ password }),
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
  },
  async unlock(id: number, password: string): Promise<Note> {
    const res = await fetch(`${BASE}/notes/${id}/unlock`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ password }),
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
    return res.json()
  },
  async removeLock(id: number, password: string): Promise<void> {
    const res = await fetch(`${BASE}/notes/${id}/remove-lock`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ password }),
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
  },
  async upload(file: File): Promise<{ url: string }> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${BASE}/upload`, {
      method: 'POST',
      headers: authHeadersRaw(),
      body: formData,
    })
    if (!res.ok) { const err = await res.json(); throw new Error(err.error) }
    return res.json()
  },
}

export const commentApi = {
  async list(noteId: number): Promise<Comment[]> {
    const res = await fetch(`${BASE}/notes/${noteId}/comments`, { headers: authHeaders() })
    return res.json()
  },
  async create(noteId: number, content: string): Promise<Comment> {
    const res = await fetch(`${BASE}/notes/${noteId}/comments`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ content }),
    })
    return res.json()
  },
  async remove(id: number): Promise<void> {
    await fetch(`${BASE}/comments/${id}`, { method: 'DELETE', headers: authHeaders() })
  },
}
