// Builds the terminal card at the top of the profile README (light and dark SVG): a
// neofetch-style window with a volcano (Piton de la Fournaise) and live numbers.
// Run daily by .github/workflows/profile.yml. No dependency: Node 20+ (fetch).
// Usage: GITHUB_TOKEN=... GITHUB_USER=H0ozsed node scripts/terminal.mjs <out-dir>
//
// Counts come from the public contribution calendar: private contributions are included
// because "Private contributions" is enabled on the profile.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const user = process.env.GITHUB_USER ?? 'H0ozsed'
const token = process.env.GITHUB_TOKEN
const outDir = process.argv[2] ?? 'dist'
if (!token) throw new Error('GITHUB_TOKEN is required')

const PACKAGE = 'django-widget-hub'
const SCHOOL_START = 2024 // Epitech PGE, 5 years

async function graphql(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

const CALENDAR = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`

// ---- Data: every day since the account was created ------------------------------------

const { user: profile } = await graphql(
  'query($login: String!) { user(login: $login) { createdAt } }',
  { login: user },
)
const created = new Date(profile.createdAt)
const now = new Date()

const days = []
// The API returns at most one year per call.
for (let from = new Date(created); from < now; ) {
  const to = new Date(Math.min(now.getTime(), from.getTime() + 365 * 86_400_000))
  const data = await graphql(CALENDAR, {
    login: user,
    from: from.toISOString(),
    to: to.toISOString(),
  })
  for (const week of data.user.contributionsCollection.contributionCalendar.weeks) {
    for (const day of week.contributionDays) days.push(day)
  }
  from = new Date(to.getTime() + 1000)
}
// Remove duplicates at the boundaries, sort by date.
const byDate = new Map(days.map((d) => [d.date, d.contributionCount]))
const calendar = [...byDate].sort(([a], [b]) => a.localeCompare(b))

// Latest release on PyPI; the line is left out if PyPI does not answer.
let pkgVersion = null
try {
  const res = await fetch(`https://pypi.org/pypi/${PACKAGE}/json`)
  if (res.ok) pkgVersion = (await res.json()).info.version
} catch {}

// ---- Stats -----------------------------------------------------------------------------

const total = calendar.reduce((sum, [, n]) => sum + n, 0)
const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10)
const lastYear = calendar.filter(([d]) => d > yearAgo).reduce((sum, [, n]) => sum + n, 0)

let longest = 0
let run = 0
for (const [, n] of calendar) {
  run = n > 0 ? run + 1 : 0
  longest = Math.max(longest, run)
}
// Current streak: today may still be empty, it does not break the streak yet.
let current = 0
const today = now.toISOString().slice(0, 10)
for (let i = calendar.length - 1; i >= 0; i--) {
  const [date, n] = calendar[i]
  if (n > 0) current++
  else if (date === today) continue
  else break
}

// School year starts in September.
const schoolYear = Math.min(5, now.getUTCFullYear() - SCHOOL_START + (now.getUTCMonth() >= 8 ? 1 : 0))

// "2 years, 3 months" since the account was created.
const ageMonths =
  (now.getUTCFullYear() - created.getUTCFullYear()) * 12 + now.getUTCMonth() - created.getUTCMonth()
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const uptime = [
  Math.floor(ageMonths / 12) && plural(Math.floor(ageMonths / 12), 'year'),
  ageMonths % 12 && plural(ageMonths % 12, 'month'),
]
  .filter(Boolean)
  .join(', ')

// ---- SVG -------------------------------------------------------------------------------

const fmt = (n) => new Intl.NumberFormat('en-GB').format(n)
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const THEMES = {
  dark: {
    bg: '#0d1117', bar: '#161b22', border: '#30363d', text: '#e6edf3', muted: '#8b949e',
    key: '#79c0ff', user: '#7ee787', host: '#d2a8ff', hot: '#ffa657',
    lava: '#ff7b39', rock: '#c9d1d9', sea: '#58a6ff',
    blocks: ['#484f58', '#ff7b72', '#7ee787', '#d29922', '#58a6ff', '#bc8cff', '#39c5cf', '#e6edf3'],
  },
  light: {
    bg: '#ffffff', bar: '#f6f8fa', border: '#d0d7de', text: '#1f2328', muted: '#57606a',
    key: '#0969da', user: '#1a7f37', host: '#8250df', hot: '#bc4c00',
    lava: '#d1440c', rock: '#424a53', sea: '#0969da',
    blocks: ['#24292f', '#cf222e', '#1a7f37', '#9a6700', '#0969da', '#8250df', '#1b7c83', '#6e7781'],
  },
}

// Piton de la Fournaise: [text, class] segments per line.
const ART = [
  [['           ) )', 'muted']],
  [['          ( ( (', 'muted']],
  [['           ) ) )', 'muted']],
  [['         _______', 'rock']],
  [['        /', 'rock'], ['  \\|/  ', 'lava'], ['\\', 'rock']],
]
for (let k = 1; k <= 6; k++) {
  const gap = ' '.repeat(k - 1)
  ART.push([
    [`${' '.repeat(8 - k)}/`, 'rock'],
    [`   /${gap}|${gap}\\   `, 'lava'],
    ['\\', 'rock'],
  ])
}
ART.push([[' /___', 'rock'], ['/______|______\\', 'lava'], ['___\\', 'rock']])
ART.push([['~~~~~~~~~~~~~~~~~~~~~~~~~', 'sea']])

const INFO = [
  ['OS', `Epitech PGE, year ${schoolYear} of 5`],
  ['Host', 'La Réunion (UTC+4)'],
  ['Focus', 'cybersecurity, full-stack web'],
  ['Uptime', `${uptime} on GitHub`],
  ['Languages', 'C, Python, TypeScript'],
  ['Stack', 'Django, Next.js, React, PostgreSQL, Docker'],
  ...(pkgVersion ? [['Packages', `${PACKAGE} ${pkgVersion} (PyPI)`]] : []),
  ['Status', 'looking for an internship', 'hot'],
  null,
  ['Activity', `${fmt(lastYear)} contributions in 12 months (${fmt(total)} total)`],
  ['Streak', `${plural(current, 'day')} (best ${longest})`],
  ['Updated', now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
]

function terminal(t) {
  const W = 840
  const LH = 21
  const top = 78 // first output line
  const infoX = 300
  const lines = INFO.length + 3 // title, rule, info, colour blocks

  const artTop = top + Math.round(((lines - ART.length) * LH) / 2)
  const art = ART.map(
    (segs, i) =>
      `<text x="32" y="${artTop + i * LH}" xml:space="preserve">${segs
        .map(([s, c]) => `<tspan class="${c}">${escape(s)}</tspan>`)
        .join('')}</text>`,
  ).join('\n  ')

  let y = top
  let step = 0
  const row = (content) => {
    const out = `<text x="${infoX}" y="${y}" class="line" style="animation-delay:${(0.9 + step * 0.07).toFixed(2)}s" xml:space="preserve">${content}</text>`
    y += LH
    step++
    return out
  }
  const head = `<tspan class="user">ethaniel</tspan><tspan class="muted">@</tspan><tspan class="host">${escape(user)}</tspan>`
  const info = [row(head), row(`<tspan class="muted">${'-'.repeat(8 + 1 + user.length)}</tspan>`)]
  for (const item of INFO) {
    if (!item) {
      y += LH / 2
      continue
    }
    const [key, value, cls] = item
    info.push(row(`<tspan class="key">${escape(key.padEnd(11))}</tspan><tspan class="${cls ?? 'text'}">${escape(value)}</tspan>`))
  }
  const blocks = t.blocks
    .map((c, i) => `<rect x="${infoX + i * 30}" y="${y - 13}" width="26" height="16" rx="2" fill="${c}"/>`)
    .join('')
  info.push(`<g class="line" style="animation-delay:${(0.9 + step * 0.07).toFixed(2)}s">${blocks}</g>`)
  y += LH * 1.5

  const prompt = `<tspan class="user">ethaniel@${escape(user)}</tspan><tspan class="muted">:</tspan><tspan class="key">~</tspan><tspan class="muted">$ </tspan>`
  const desc = INFO.filter(Boolean)
    .map(([k, v]) => `${k}: ${v}`)
    .join('. ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y + 16}" viewBox="0 0 ${W} ${y + 16}" role="img" aria-labelledby="title desc">
  <title id="title">Ethaniel Gonthier (${escape(user)})</title>
  <desc id="desc">${escape(desc)}.</desc>
  <style>
    text { font: 14px ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace; fill: ${t.text}; }
    .text { fill: ${t.text}; }
    .muted { fill: ${t.muted}; }
    .key { fill: ${t.key}; font-weight: 700; }
    .user { fill: ${t.user}; font-weight: 700; }
    .host { fill: ${t.host}; font-weight: 700; }
    .hot { fill: ${t.hot}; font-weight: 700; }
    .lava { fill: ${t.lava}; font-weight: 700; }
    .rock { fill: ${t.rock}; }
    .sea { fill: ${t.sea}; }
    .bar { font: 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; fill: ${t.muted}; }
    .line, .art { opacity: 0; animation: show .25s ease-out forwards; }
    .art { animation-delay: .8s; }
    .lava { animation: glow 3s ease-in-out infinite; }
    .cursor { fill: ${t.text}; animation: blink 1s steps(1) infinite; }
    @keyframes show { to { opacity: 1; } }
    @keyframes glow { 50% { opacity: .55; } }
    @keyframes blink { 50% { opacity: 0; } }
    @media (prefers-reduced-motion: reduce) {
      .line, .art, .lava, .cursor { animation: none; opacity: 1; }
    }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${y + 15}" rx="10" fill="${t.bg}" stroke="${t.border}"/>
  <path d="M0.5 32V10.5a10 10 0 0 1 10-10h${W - 21}a10 10 0 0 1 10 10V32z" fill="${t.bar}"/>
  <line x1="0.5" y1="32" x2="${W - 0.5}" y2="32" stroke="${t.border}"/>
  <circle cx="20" cy="16" r="6" fill="#ff5f57"/><circle cx="40" cy="16" r="6" fill="#febc2e"/><circle cx="60" cy="16" r="6" fill="#28c840"/>
  <text x="${W / 2}" y="20" class="bar" text-anchor="middle">ethaniel@${escape(user)}: ~</text>
  <text x="32" y="56" xml:space="preserve">${prompt}<tspan class="text">neofetch</tspan></text>
  <g class="art">
  ${art}
  </g>
  ${info.join('\n  ')}
  <text x="32" y="${y}" class="line" style="animation-delay:${(1 + step * 0.07).toFixed(2)}s" xml:space="preserve">${prompt}<tspan class="cursor">▌</tspan></text>
</svg>
`
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'terminal-dark.svg'), terminal(THEMES.dark))
writeFileSync(join(outDir, 'terminal-light.svg'), terminal(THEMES.light))
console.log(
  `terminal: ${lastYear} last year, ${total} total, streak ${current} (best ${longest}), ${PACKAGE} ${pkgVersion} -> ${outDir}`,
)
