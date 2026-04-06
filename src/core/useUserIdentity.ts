import { useState } from "react"

export interface UserIdentity {
  name: string
  color: string
}

const STORAGE_KEY = "collab-user"

function generateColor(): string {
  // Generate a visually distinct, saturated color
  const hue = Math.floor(Math.random() * 360)
  return `hsl(${hue}, 70%, 50%)`
}

function hslToHex(hsl: string): string {
  const match = hsl.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/)
  if (!match) return "#ff5733"
  const h = parseInt(match[1]) / 360
  const s = parseInt(match[2]) / 100
  const l = parseInt(match[3]) / 100
  let r, g, b
  if (s === 0) {
    r = g = b = l
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1 / 6) return p + (q - p) * 6 * t
      if (t < 1 / 2) return q
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1 / 3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1 / 3)
  }
  return (
    "#" +
    [r, g, b]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
      .join("")
  )
}

export function getOrCreateUser(): UserIdentity {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {}
  }
  const color = generateColor()
  const user: UserIdentity = {
    name: "User " + Math.floor(Math.random() * 900 + 100),
    color: hslToHex(color),
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
  return user
}

export function saveUser(user: UserIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

export function useUserIdentity() {
  const [user, setUserState] = useState<UserIdentity>(() => getOrCreateUser())

  const setUser = (updated: UserIdentity) => {
    saveUser(updated)
    setUserState(updated)
  }

  return { user, setUser }
}
