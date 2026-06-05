import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { AdminLayout } from './AdminLayout'

interface PlayerRow {
  team: string
  name: string
}

/**
 * Accepts two JSON formats:
 *
 * Grouped (compact, recommended):
 *   [{"team": "Mexico", "players": ["Ochoa", "Álvarez", ...]}, ...]
 *
 * Flat:
 *   [{"team": "Mexico", "name": "Ochoa"}, ...]
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseRosterJson(data: any): PlayerRow[] {
  if (!Array.isArray(data)) throw new Error('Expected a JSON array at the top level')
  const rows: PlayerRow[] = []
  for (const item of data) {
    const team = (item.team ?? item.Team ?? '').trim()
    if (!team) throw new Error('Each entry must have a "team" field')
    // Grouped format: { team, players: [] }
    if (Array.isArray(item.players)) {
      for (const p of item.players) {
        const name = (typeof p === 'string' ? p : p.name ?? '').trim()
        if (name) rows.push({ team, name })
      }
    } else {
      // Flat format: { team, name }
      const name = (item.name ?? item.player ?? item.Player ?? '').trim()
      if (!name) throw new Error(`Entry for team "${team}" is missing a "name" field`)
      rows.push({ team, name })
    }
  }
  return rows
}

// ─── Component ────────────────────────────────────────────────────────────────

interface TeamCount { team: string; count: number }

export function AdminRoster() {
  const [text, setText]           = useState('')
  const [parsed, setParsed]       = useState<PlayerRow[] | null>(null)
  const [parseErr, setParseErr]   = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [counts, setCounts]       = useState<TeamCount[]>([])
  const [loadingCounts, setLoadingCounts] = useState(true)

  async function loadCounts() {
    setLoadingCounts(true)
    const { data } = await supabase.from('players').select('team, name')
    if (data) {
      const map: Record<string, number> = {}
      for (const r of data) {
        map[r.team as string] = (map[r.team as string] ?? 0) + 1
      }
      setCounts(Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).map(([team, count]) => ({ team, count })))
    }
    setLoadingCounts(false)
  }

  useEffect(() => { loadCounts() }, [])

  function handleParse() {
    setParseErr(null)
    setParsed(null)
    setImportMsg(null)
    try {
      const json = JSON.parse(text)
      const rows = parseRosterJson(json)
      if (rows.length === 0) throw new Error('No players found in the JSON')
      setParsed(rows)
    } catch (e) {
      setParseErr(e instanceof Error ? e.message : 'Invalid JSON')
    }
  }

  async function handleImport() {
    if (!parsed) return
    setImporting(true)
    setImportMsg(null)

    const CHUNK = 100
    let imported = 0
    let firstErr: string | null = null

    for (let i = 0; i < parsed.length; i += CHUNK) {
      const chunk = parsed.slice(i, i + CHUNK)
      const { error } = await supabase
        .from('players')
        .upsert(chunk, { onConflict: 'team,name', ignoreDuplicates: true })
      if (error) { firstErr = error.message; break }
      imported += chunk.length
    }

    setImporting(false)
    if (firstErr) {
      setImportMsg({ ok: false, text: `Failed after ${imported} rows: ${firstErr}` })
    } else {
      setImportMsg({ ok: true, text: `✓ ${imported} players loaded.` })
      setParsed(null)
      setText('')
      loadCounts()
    }
  }

  async function handleClearAll() {
    if (!confirm('Delete ALL players from the roster? This cannot be undone.')) return
    const { error } = await supabase.from('players').delete().neq('id', 0)
    if (error) {
      setImportMsg({ ok: false, text: `Clear failed: ${error.message}` })
    } else {
      setCounts([])
      setImportMsg({ ok: true, text: '✓ Roster cleared.' })
    }
  }

  // Summary: teams loaded and total player count
  const totalPlayers = counts.reduce((s, c) => s + c.count, 0)

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold text-gray-800">Player Rosters</h1>
        {totalPlayers > 0 && (
          <button
            onClick={handleClearAll}
            className="text-xs text-red-500 hover:text-red-700 font-medium"
          >
            Clear all
          </button>
        )}
      </div>
      <p className="text-sm text-gray-500 mb-5">
        Load the squad rosters so users see a player dropdown when picking for a match.
        Team names must exactly match the fixture team names.
      </p>

      {/* Current roster summary */}
      {loadingCounts ? (
        <p className="text-sm text-gray-400 mb-4">Loading roster…</p>
      ) : totalPlayers === 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 mb-4">
          No players loaded yet. Paste the squad JSON below to get started.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 mb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Current roster — {totalPlayers} players across {counts.length} teams
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
            {counts.map(c => (
              <div key={c.team} className="flex justify-between text-gray-600">
                <span className="truncate">{c.team}</span>
                <span className="text-gray-400 ml-2 tabular-nums">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Paste input */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 py-4 space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">
            Paste squad JSON
          </p>
          <p className="text-xs text-gray-400 mb-3">
            Grouped format (recommended):{' '}
            <code className="bg-gray-100 px-1 rounded">{`[{"team":"Mexico","players":["Ochoa","Álvarez",...]}]`}</code>
          </p>
          <textarea
            rows={10}
            value={text}
            onChange={e => { setText(e.target.value); setParsed(null); setParseErr(null) }}
            placeholder={`[\n  {"team": "Mexico", "players": ["Guillermo Ochoa", "Edson Álvarez"]},\n  {"team": "Brazil", "players": ["Alisson", "Vinicius Jr"]}\n]`}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {parseErr && (
          <p className="text-red-600 text-sm">{parseErr}</p>
        )}

        {parsed && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-800">
            Parsed {parsed.length} players across {new Set(parsed.map(p => p.team)).size} teams.
            Ready to import.
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleParse}
            disabled={!text.trim()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 font-medium text-sm rounded-lg transition-colors"
          >
            Parse
          </button>
          {parsed && (
            <button
              onClick={handleImport}
              disabled={importing}
              className="px-4 py-2 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white font-medium text-sm rounded-lg transition-colors"
            >
              {importing ? 'Importing…' : `Import ${parsed.length} players`}
            </button>
          )}
        </div>

        {importMsg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${importMsg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {importMsg.text}
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
