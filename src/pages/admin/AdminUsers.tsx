import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { AdminLayout } from './AdminLayout'

interface Profile {
  id: string
  team_name: string
  is_admin: boolean
  created_at: string
}

export function AdminUsers() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, team_name, is_admin, created_at')
      .order('team_name')
    setProfiles((data ?? []) as Profile[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function startEdit(profile: Profile) {
    setEditingId(profile.id)
    setEditName(profile.team_name)
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
    setError(null)
  }

  async function saveRename(id: string) {
    const name = editName.trim()
    if (!name) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('profiles')
      .update({ team_name: name })
      .eq('id', id)
    setSaving(false)
    if (err) {
      setError(err.message)
    } else {
      setEditingId(null)
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, team_name: name } : p))
    }
  }

  async function deleteUser(profile: Profile) {
    if (profile.is_admin) {
      setError('Admin accounts cannot be deleted here. Remove the admin flag in Supabase first.')
      return
    }
    if (!confirm(`Remove "${profile.team_name}" from the leaderboard? This also deletes all their predictions and cannot be undone.`)) return
    const { error: err } = await supabase
      .from('profiles')
      .delete()
      .eq('id', profile.id)
    if (err) {
      setError(err.message)
    } else {
      setProfiles(prev => prev.filter(p => p.id !== profile.id))
    }
  }

  return (
    <AdminLayout>
      <h1 className="text-lg font-bold text-gray-800 mb-1">Users</h1>
      <p className="text-sm text-gray-500 mb-5">
        Rename a team or remove a user. Deleting a user removes their profile and all predictions.
      </p>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading…</div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-16 text-gray-400">No users found.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-xs text-gray-400 uppercase tracking-wide">
                <th className="text-left py-3 px-4 font-medium">Team name</th>
                <th className="text-left py-3 px-4 font-medium hidden sm:table-cell">Joined</th>
                <th className="py-3 px-4 font-medium w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles.map(profile => (
                <tr key={profile.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4">
                    {editingId === profile.id ? (
                      <input
                        autoFocus
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') saveRename(profile.id)
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        className="border border-green-400 rounded px-2 py-1 text-sm w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    ) : (
                      <span className="font-semibold text-gray-800">
                        {profile.team_name}
                        {profile.is_admin && (
                          <span className="ml-2 text-xs font-normal text-gray-400">admin</span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-gray-400 text-xs hidden sm:table-cell">
                    {new Date(profile.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {editingId === profile.id ? (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => saveRename(profile.id)}
                          disabled={saving || !editName.trim()}
                          className="text-xs px-3 py-1 bg-green-700 hover:bg-green-800 disabled:opacity-40 text-white rounded-lg font-medium transition-colors"
                        >
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={cancelEdit}
                          disabled={saving}
                          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg font-medium transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(profile)}
                          className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-colors"
                        >
                          Rename
                        </button>
                        <button
                          onClick={() => deleteUser(profile)}
                          className="text-xs px-3 py-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg font-medium transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminLayout>
  )
}
