// Builds the contribution stats card of the profile README (light and dark SVG).
// Run daily by .github/workflows/profile.yml. No dependency: Node 20+ (fetch).
// Usage: GITHUB_TOKEN=... GITHUB_USER=H0ozsed node scripts/stats.mjs <out-dir>
//
// Counts come from the public contribution calendar: private contributions are included
// because "Private contributions" is enabled on the profile.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const user = process.env.GITHUB_USER ?? 'H0ozsed'
const token = process.env.GITHUB_TOKEN
const outDir = process.argv[2] ?? 'dist'
if (!token) throw new Error('GITHUB_TOKEN is required')

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

// Last 12 months, per month (oldest first).
const months = []
for (let i = 11; i >= 0; i--) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
  const key = d.toISOString().slice(0, 7)
  const count = calendar.filter(([date]) => date.startsWith(key)).reduce((s, [, n]) => s + n, 0)
  months.push({ key, count, label: d.toLocaleDateString('fr-FR', { month: 'short' }) })
}

// ---- SVG -------------------------------------------------------------------------------

const fmt = (n) => new Intl.NumberFormat('fr-FR').format(n)
const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const THEMES = {
  dark: {
    bg: '#0d1117',
    border: '#30363d',
    text: '#e6edf3',
    muted: '#8b949e',
    accent: '#58a6ff',
    accent2: '#bc8cff',
    bar: '#238636',
    barEmpty: '#161b22',
  },
  light: {
    bg: '#ffffff',
    border: '#d0d7de',
    text: '#1f2328',
    muted: '#57606a',
    accent: '#0969da',
    accent2: '#8250df',
    bar: '#2da44e',
    barEmpty: '#ebedf0',
  },
}

function card(t) {
  const W = 840
  const H = 250
  const metrics = [
    { value: fmt(lastYear), label: 'contributions sur 12 mois' },
    { value: fmt(total), label: `contributions depuis ${created.getUTCFullYear()}` },
    { value: fmt(current), label: `jour${current > 1 ? 's' : ''} de série en cours` },
    { value: fmt(longest), label: 'jours de meilleure série' },
  ]
  const colW = (W - 64) / metrics.length
  const max = Math.max(1, ...months.map((m) => m.count))
  const chartX = 32
  const chartY = 150
  const chartH = 60
  const barW = (W - 64) / months.length

  const metricSvg = metrics
    .map((m, i) => {
      const x = 32 + i * colW
      return `<g class="fade" style="animation-delay:${0.1 + i * 0.12}s">
    <text x="${x}" y="98" class="value">${escape(m.value)}</text>
    <text x="${x}" y="122" class="label">${escape(m.label)}</text>
  </g>`
    })
    .join('\n  ')

  const bars = months
    .map((m, i) => {
      const h = Math.max(3, Math.round((m.count / max) * chartH))
      const x = chartX + i * barW + 4
      const w = barW - 8
      return `<rect x="${x}" y="${chartY + chartH - h}" width="${w}" height="${h}" rx="3" fill="${m.count ? t.bar : t.barEmpty}" class="grow" style="animation-delay:${0.5 + i * 0.04}s"><title>${escape(m.label)} : ${fmt(m.count)}</title></rect>
  <text x="${x + w / 2}" y="${chartY + chartH + 16}" class="month" text-anchor="middle">${escape(m.label.replace('.', ''))}</text>`
    })
    .join('\n  ')

  const updated = now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="title desc">
  <title id="title">Activité GitHub de ${escape(user)}</title>
  <desc id="desc">${escape(`${metrics.map((m) => `${m.value} ${m.label}`).join(', ')}.`)}</desc>
  <defs>
    <linearGradient id="accent" x1="0" x2="1">
      <stop offset="0" stop-color="${t.accent}"/>
      <stop offset="1" stop-color="${t.accent2}"/>
    </linearGradient>
  </defs>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .title { font-size: 18px; font-weight: 700; fill: ${t.text}; }
    .sub { font-size: 12px; fill: ${t.muted}; }
    .value { font-size: 34px; font-weight: 800; fill: url(#accent); }
    .label { font-size: 13px; fill: ${t.muted}; }
    .month { font-size: 11px; fill: ${t.muted}; }
    .fade { opacity: 0; animation: fade .6s ease-out forwards; }
    .grow { transform-box: fill-box; transform-origin: bottom; transform: scaleY(0); animation: grow .6s ease-out forwards; }
    @keyframes fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    @keyframes grow { to { transform: scaleY(1); } }
    @media (prefers-reduced-motion: reduce) { .fade, .grow { animation: none; opacity: 1; transform: none; } }
  </style>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" rx="12" fill="${t.bg}" stroke="${t.border}"/>
  <text x="32" y="44" class="title">Mon activité sur GitHub</text>
  <text x="${W - 32}" y="44" class="sub" text-anchor="end">mis à jour le ${escape(updated)}</text>
  ${metricSvg}
  ${bars}
</svg>
`
}

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'stats-dark.svg'), card(THEMES.dark))
writeFileSync(join(outDir, 'stats-light.svg'), card(THEMES.light))
console.log(
  `stats: ${lastYear} last year, ${total} total, streak ${current} (best ${longest}) -> ${outDir}`,
)
