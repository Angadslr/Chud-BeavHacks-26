import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { addSong } from '../firebase/roomService'
import { getDisplayName, getUserId } from '../lib/session'

const API = 'https://www.googleapis.com/youtube/v3/search'
const DRAFT_PANEL_W = 292

function useSmUp() {
  const [smUp, setSmUp] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(min-width: 640px)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 640px)')
    const onChange = () => setSmUp(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return smUp
}

function newDraftKey() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export default function SearchModal({ roomId, open, onClose }) {
  const smUp = useSmUp()
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState([])
  const [editingKey, setEditingKey] = useState(null)
  const [accepting, setAccepting] = useState(false)

  const search = useCallback(async () => {
    const key = import.meta.env.VITE_YOUTUBE_API_KEY
    if (!key) {
      setError('Missing VITE_YOUTUBE_API_KEY in .env')
      return
    }
    if (!q.trim()) return
    setLoading(true)
    setError(null)
    try {
      const url = new URL(API)
      url.searchParams.set('part', 'snippet')
      url.searchParams.set('type', 'video')
      url.searchParams.set('maxResults', '12')
      url.searchParams.set('q', q.trim())
      url.searchParams.set('key', key)
      const res = await fetch(url.toString())
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.message || 'Search failed')
      }
      setResults(data.items || [])
    } catch (e) {
      setError(e.message || 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [q])

  const addToDraft = (item) => {
    const sn = item.snippet
    const thumbs = sn.thumbnails || {}
    const thumb =
      thumbs.medium?.url || thumbs.default?.url || thumbs.high?.url || ''
    setDraft((d) => [
      ...d,
      {
        key: newDraftKey(),
        videoId: item.id.videoId,
        title: sn.title,
        thumbnail: thumb,
        artist: sn.channelTitle || 'Unknown',
      },
    ])
  }

  const removeDraft = (key) => {
    setDraft((d) => d.filter((x) => x.key !== key))
    if (editingKey === key) setEditingKey(null)
  }

  const moveDraft = (index, delta) => {
    setDraft((d) => {
      const next = [...d]
      const j = index + delta
      if (j < 0 || j >= next.length) return d
      ;[next[index], next[j]] = [next[j], next[index]]
      return next
    })
  }

  const updateDraftTitle = (key, title) => {
    setDraft((d) => d.map((x) => (x.key === key ? { ...x, title } : x)))
  }

  const acceptAll = async () => {
    if (!roomId || draft.length === 0) return
    setAccepting(true)
    setError(null)
    try {
      for (const entry of draft) {
        await addSong(roomId, {
          videoId: entry.videoId,
          title: entry.title.trim() || 'Untitled',
          thumbnail: entry.thumbnail,
          artist: entry.artist,
          addedBy: getDisplayName() || 'Guest',
          addedByUserId: getUserId(),
        })
      }
      setDraft([])
      onClose()
    } catch (e) {
      setError(e?.message || 'Could not add songs to the queue')
    } finally {
      setAccepting(false)
    }
  }

  const requestClose = () => {
    if (draft.length > 0) {
      const ok = window.confirm(
        'Discard your staged songs? Nothing has been added to the room yet.',
      )
      if (!ok) return
    }
    onClose()
  }

  const hasDraft = draft.length > 0

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Add songs to queue"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close"
        onClick={requestClose}
      />
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
        className="relative z-10 flex max-h-[90vh] w-full max-w-[min(100%,56rem)] flex-col overflow-hidden rounded-2xl border border-aux-border bg-aux-surface shadow-2xl shadow-black/50 sm:max-h-[88vh]"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
          {/* Search + results (always full width of this column) */}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-aux-border px-4 py-3">
              <div>
                <h2 className="text-lg font-bold text-white">Add songs</h2>
                <p className="mt-0.5 text-xs text-white/45">
                  Search and tap <span className="text-aux-ice/90">+ Add</span>. Your
                  picks appear in the side panel — then{' '}
                  <span className="text-aux-ice/90">Accept</span> to queue them.
                </p>
              </div>
              <button
                type="button"
                onClick={requestClose}
                className="shrink-0 rounded-lg px-2 py-1 text-white/60 hover:bg-white/10 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form
              className="flex shrink-0 gap-2 border-b border-aux-border p-3"
              onSubmit={(e) => {
                e.preventDefault()
                if (!loading) search()
              }}
            >
              <input
                type="search"
                enterKeyHint="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search YouTube…"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-xl border border-aux-border bg-black/30 px-3 py-2.5 text-white placeholder:text-slate-500 focus:border-slate-400/60 focus:outline-none focus:ring-1 focus:ring-slate-500/40"
              />
              <button
                type="submit"
                disabled={loading}
                className="shrink-0 rounded-xl bg-aux-mint px-4 py-2.5 font-semibold text-[#0a1224] hover:brightness-95 disabled:opacity-50"
              >
                {loading ? '…' : 'Search'}
              </button>
            </form>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {error && (
                <p className="mb-2 rounded-lg bg-aux-coral/15 px-3 py-2 text-sm text-aux-coral">
                  {error}
                </p>
              )}
              <ul className="space-y-2">
                {results.map((item) => (
                  <li key={item.id.videoId}>
                    <button
                      type="button"
                      onClick={() => addToDraft(item)}
                      disabled={accepting}
                      className="flex w-full items-center gap-3 rounded-xl border border-transparent bg-black/25 p-2 text-left hover:border-slate-500/50 hover:bg-black/40 disabled:opacity-50"
                    >
                      <img
                        src={
                          item.snippet.thumbnails?.medium?.url ||
                          item.snippet.thumbnails?.default?.url
                        }
                        alt=""
                        className="h-14 w-[4.5rem] shrink-0 rounded-lg object-cover"
                      />
                      <div className="min-w-0">
                        <p className="line-clamp-2 font-medium text-white">
                          {item.snippet.title}
                        </p>
                        <p className="truncate text-xs text-white/50">
                          {item.snippet.channelTitle}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md border border-aux-ice/40 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-aux-ice/90">
                        + Add
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Draft: desktop = slide-in column; mobile = panel below results (doesn’t overlay) */}
          <motion.aside
            initial={false}
            animate={
              hasDraft
                ? smUp
                  ? {
                      width: DRAFT_PANEL_W,
                      opacity: 1,
                    }
                  : {
                      maxHeight: minDraftPanelH(),
                      opacity: 1,
                    }
                : smUp
                  ? { width: 0, opacity: 0 }
                  : { maxHeight: 0, opacity: 0 }
            }
            transition={{ type: 'spring', stiffness: 440, damping: 36 }}
            className={`min-w-0 flex shrink-0 flex-col overflow-hidden border-aux-border bg-gradient-to-b from-[#0c162c]/95 to-aux-surface ${
              smUp ? 'border-l border-t-0' : 'border-t border-l-0'
            } ${hasDraft ? 'pointer-events-auto' : 'pointer-events-none'}`}
            style={
              smUp
                ? { borderLeftWidth: hasDraft ? 1 : 0 }
                : { borderTopWidth: hasDraft ? 1 : 0 }
            }
          >
            <div
              className="flex h-full min-h-0 flex-col p-2 sm:py-2 sm:pr-2 sm:pl-1"
              style={{ width: smUp ? DRAFT_PANEL_W : '100%' }}
            >
              <motion.div
                layout
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/12 bg-black/50 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.06] backdrop-blur-md"
                transition={{ type: 'spring', stiffness: 380, damping: 32 }}
              >
                <AnimatePresence mode="wait">
                  {hasDraft && (
                    <motion.div
                      key="draft-inner"
                      initial={{ opacity: 0, filter: 'blur(4px)' }}
                      animate={{ opacity: 1, filter: 'blur(0px)' }}
                      exit={{ opacity: 0, filter: 'blur(4px)' }}
                      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                      className="flex min-h-0 flex-1 flex-col"
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">
                          Your list ({draft.length})
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDraft([])}
                            disabled={accepting}
                            className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-50"
                          >
                            Clear all
                          </button>
                          <button
                            type="button"
                            onClick={acceptAll}
                            disabled={accepting || draft.length === 0}
                            className="rounded-lg bg-aux-mint px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-[#0a1224] shadow-md transition-[filter] hover:brightness-95 disabled:opacity-50"
                          >
                            {accepting ? 'Adding…' : `Accept (${draft.length})`}
                          </button>
                        </div>
                      </div>
                      <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5 [scrollbar-width:thin] sm:max-h-[min(52vh,420px)]">
                        <AnimatePresence initial={false}>
                          {draft.map((entry, index) => (
                            <motion.li
                              key={entry.key}
                              layout
                              initial={{ opacity: 0, x: 14, scale: 0.98 }}
                              animate={{ opacity: 1, x: 0, scale: 1 }}
                              exit={{ opacity: 0, x: -10, scale: 0.96 }}
                              transition={{
                                type: 'spring',
                                stiffness: 500,
                                damping: 34,
                                opacity: { duration: 0.2 },
                              }}
                              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-black/40 py-1 pl-1 pr-1 shadow-sm sm:gap-2"
                            >
                              <span className="w-5 shrink-0 text-center text-[10px] font-bold text-white/35">
                                {index + 1}
                              </span>
                              <img
                                src={entry.thumbnail}
                                alt=""
                                className="h-9 w-12 shrink-0 rounded-md object-cover ring-1 ring-white/10"
                              />
                              <div className="min-w-0 flex-1">
                                {editingKey === entry.key ? (
                                  <input
                                    value={entry.title}
                                    onChange={(e) =>
                                      updateDraftTitle(entry.key, e.target.value)
                                    }
                                    onBlur={() => setEditingKey(null)}
                                    onKeyDown={(e) =>
                                      e.key === 'Enter' && setEditingKey(null)
                                    }
                                    className="w-full rounded border border-aux-ice/40 bg-black/50 px-2 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-aux-ice/50"
                                    autoFocus
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setEditingKey(entry.key)}
                                    className="w-full truncate text-left text-xs font-medium text-white transition-colors hover:text-aux-ice/90"
                                    title="Click to edit title"
                                  >
                                    {entry.title}
                                  </button>
                                )}
                                <p className="truncate text-[10px] text-white/40">
                                  {entry.artist}
                                </p>
                              </div>
                              <div className="flex shrink-0 flex-col gap-0.5">
                                <button
                                  type="button"
                                  aria-label="Move up"
                                  disabled={index === 0 || accepting}
                                  onClick={() => moveDraft(index, -1)}
                                  className="rounded px-1 text-[10px] text-white/50 transition-colors hover:bg-white/10 disabled:opacity-30"
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  aria-label="Move down"
                                  disabled={index === draft.length - 1 || accepting}
                                  onClick={() => moveDraft(index, 1)}
                                  className="rounded px-1 text-[10px] text-white/50 transition-colors hover:bg-white/10 disabled:opacity-30"
                                >
                                  ↓
                                </button>
                              </div>
                              <button
                                type="button"
                                aria-label="Remove from list"
                                disabled={accepting}
                                onClick={() => removeDraft(entry.key)}
                                className="shrink-0 rounded px-2 py-1 text-xs text-aux-coral transition-colors hover:bg-aux-coral/15 disabled:opacity-50"
                              >
                                ✕
                              </button>
                            </motion.li>
                          ))}
                        </AnimatePresence>
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            </div>
          </motion.aside>
        </div>
      </motion.div>
    </div>
  )
}

function minDraftPanelH() {
  if (typeof window === 'undefined') return 280
  return Math.min(Math.round(window.innerHeight * 0.42), 300)
}
