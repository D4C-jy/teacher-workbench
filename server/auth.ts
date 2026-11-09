import crypto from 'node:crypto'
import { db } from './db'

const TOKEN_TTL_DAYS = 30

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const hash = crypto.scryptSync(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  const actual = crypto.scryptSync(password, salt, expected.length)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

export function issueToken(userId: number): string {
  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 864e5)
  db.prepare('INSERT INTO auth_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expires.toISOString()
  )
  return token
}

export interface SessionUser {
  id: number
  username: string
  displayName: string
}

export function userFromToken(token: string | undefined): SessionUser | null {
  if (!token) return null
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, t.expires_at
         FROM auth_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token = ?`
    )
    .get(token) as { id: number; username: string; display_name: string; expires_at: string } | undefined
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token)
    return null
  }
  return { id: row.id, username: row.username, displayName: row.display_name }
}

export function revokeToken(token: string | undefined) {
  if (token) db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(token)
}

export function countUsers(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
}
