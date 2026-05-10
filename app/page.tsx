'use client'

import { useEffect, useState, useCallback } from 'react'
import { RecentMatchesFeed } from './components/RecentMatchesFeed'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface RankData {
  tier: string; division: string; lp: number
  wins: number; losses: number; winrate: number
}
interface MatchResult { win: boolean; champion: string }
interface Player {
  gameName: string; tagLine: string; profileIconId: number
  summonerLevel: number; rank: RankData | null
  recentMatches: MatchResult[] | null; error: string | null
}
interface ApiResponse { players: Player[]; ddVersion: string; updatedAt: string }

const TIER_COLORS: Record<string, string> = {
  IRON: '#9ca3af', BRONZE: '#b45309', SILVER: '#94a3b8', GOLD: '#d97706',
  PLATINUM: '#0891b2', EMERALD: '#10b981', DIAMOND: '#818cf8',
  MASTER: '#c084fc', GRANDMASTER: '#f87171', CHALLENGER: '#fbbf24',
}
const CHART_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#38bdf8']
const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])
const MEDALS = ['🥇', '🥈', '🥉']

type Tab = 'ranking' | 'historial' | 'estadisticas'

function getRankLabel(r: RankData) {
  return APEX_TIERS.has(r.tier) ? r.tier : `${r.tier} ${r.division}`
}

function getCardGlow(i: number): React.CSSProperties {
  if (i === 0) return { borderColor: 'rgba(245,158,11,0.3)', boxShadow: '0 0 40px rgba(245,158,11,0.06)' }
  if (i === 1) return { borderColor: 'rgba(148,163,184,0.2)' }
  if (i === 2) return { borderColor: 'rgba(205,127,50,0.2)' }
  return {}
}

function getStreak(matches: MatchResult[] | null) {
  if (!matches?.length) return null
  const first = matches[0].win
  let count = 0
  for (const m of matches) { if (m.win !== first) break; count++ }
  return count >= 2 ? { type: first ? 'win' : 'loss' as const, count } : null
}

function getMostPlayed(matches: MatchResult[] | null) {
  if (!matches?.length) return null
  const map: Record<string, { g: number; w: number }> = {}
  for (const m of matches) {
    if (!map[m.champion]) map[m.champion] = { g: 0, w: 0 }
    map[m.champion].g++
    if (m.win) map[m.champion].w++
  }
  const [champ, s] = Object.entries(map).sort((a, b) => b[1].g - a[1].g)[0]
  return { champ, games: s.g, wr: Math.round((s.w / s.g) * 100) }
}

function buildChartData(players: Player[]) {
  const maxLen = Math.max(...players.map((p) => p.recentMatches?.length ?? 0))
  if (!maxLen) return []
  return Array.from({ length: maxLen }, (_, i) => {
    const pt: Record<string, number | string> = { game: i + 1 }
    players.forEach((p) => {
      if (!p.recentMatches?.length) return
      const chrono = [...p.recentMatches].reverse()
      pt[p.gameName] = chrono.slice(0, i + 1).reduce((s, m) => s + (m.win ? 1 : -1), 0)
    })
    return pt
  })
}

function computeGroupStats(players: Player[]) {
  const ranked = players.filter((p) => p.rank)
  const totalWins = ranked.reduce((s, p) => s + (p.rank?.wins ?? 0), 0)
  const totalLosses = ranked.reduce((s, p) => s + (p.rank?.losses ?? 0), 0)
  const totalGames = totalWins + totalLosses
  const groupWr = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0
  const bestWr = ranked.length
    ? ranked.reduce((b, p) => p.rank!.winrate > b.rank!.winrate ? p : b)
    : null
  const champMap: Record<string, number> = {}
  players.forEach((p) => p.recentMatches?.forEach((m) => {
    champMap[m.champion] = (champMap[m.champion] ?? 0) + 1
  }))
  const topChamp = Object.entries(champMap).sort((a, b) => b[1] - a[1])[0] ?? null
  return { totalGames, totalWins, totalLosses, groupWr, bestWr, topChamp }
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(300)
  const [activeTab, setActiveTab] = useState<Tab>('ranking')
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string> | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setFetchError(null)
    try {
      const res = await fetch('/api/players')
      if (!res.ok) throw new Error('err')
      const json: ApiResponse = await res.json()
      setData(json); setCountdown(300)
    } catch {
      setFetchError('No se pudieron cargar los datos.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((p) => { if (p <= 1) { fetchData(); return 300 } return p - 1 })
    }, 1000)
    return () => clearInterval(id)
  }, [fetchData])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  const iconUrl = (id: number, v: string) => `https://ddragon.leagueoflegends.com/cdn/${v}/img/profileicon/${id}.png`
  const emblemUrl = (t: string) => {
    const ext = t === 'EMERALD' ? 'svg' : 'png'
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${t.toLowerCase()}.${ext}`
  }
  const opggUrl = (g: string, t: string) =>
    `https://www.op.gg/summoners/euw/${encodeURIComponent(g)}-${encodeURIComponent(t)}`
  const champUrl = (c: string, v: string) =>
    `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${c}.png`

  const chartData = data ? buildChartData(data.players) : []
  const pwm = data?.players.filter((p) => p.recentMatches?.length) ?? []
  const visiblePlayers = pwm.filter((p) => selectedPlayers === null || selectedPlayers.has(p.gameName))

  function togglePlayer(name: string) {
    setSelectedPlayers((prev) => {
      const all = new Set(pwm.map((p) => p.gameName))
      const cur = prev ?? all
      if (cur.has(name) && cur.size === 1) return all
      const next = new Set(cur)
      next.has(name) ? next.delete(name) : next.add(name)
      return next.size === all.size ? null : next
    })
  }

  const groupStats = data ? computeGroupStats(data.players) : null

  const TABS: { id: Tab; label: string }[] = [
    { id: 'ranking', label: '🏆 Ranking' },
    { id: 'historial', label: '⚔️ Historial' },
    { id: 'estadisticas', label: '📊 Estadísticas' },
  ]

  return (
    <main className="min-h-screen bg-[#060d1a] flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-3xl">

        {/* ── Header ── */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#4f46e5]/60" />
            <span className="text-[#4f46e5] text-xs font-bold tracking-[0.3em] uppercase">Solo / Duo Queue</span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#4f46e5]/60" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tight uppercase leading-none">
            Unemployed
          </h1>
          <h2 className="text-4xl font-black text-[#4f46e5] tracking-tight uppercase leading-tight mt-1">
            Ranking
          </h2>
          <p className="text-[#283548] text-sm mt-3 tracking-widest uppercase">de los Chavales</p>
          <div className="flex items-center justify-center gap-5 mt-5">
            {data && <span className="text-[#1e2d45] text-sm tabular-nums">Actualiza en {fmt(countdown)}</span>}
            <button
              onClick={fetchData} disabled={loading}
              className="text-sm text-[#4f46e5] hover:text-[#818cf8] disabled:opacity-40 transition-colors font-semibold"
            >
              {loading ? 'Cargando…' : '↻ Actualizar'}
            </button>
          </div>
        </header>

        {fetchError && (
          <div className="bg-red-950/20 border border-red-900/40 rounded-2xl p-5 mb-6 text-red-400 text-sm text-center">
            {fetchError}
          </div>
        )}

        {/* ── Tab nav ── */}
        <div className="flex gap-2 bg-[#0c1525] border border-[#111d30] rounded-2xl p-1.5 mb-8">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-3 rounded-xl text-sm font-bold tracking-wide transition-all duration-200 ${
                activeTab === t.id
                  ? 'bg-[#4f46e5] text-white shadow-lg shadow-indigo-900/40'
                  : 'text-[#334155] hover:text-[#64748b] hover:bg-[#0f1a2e]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ══ RANKING ══ */}
        {activeTab === 'ranking' && (
          <div className="space-y-3">
            {loading && !data
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-5 animate-pulse">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-8 bg-[#161e30] rounded" />
                      <div className="w-[68px] h-[68px] bg-[#161e30] rounded-full" />
                      <div className="flex-1 space-y-3">
                        <div className="h-5 bg-[#161e30] rounded w-48" />
                        <div className="h-4 bg-[#161e30] rounded w-64" />
                      </div>
                      <div className="w-24 h-10 bg-[#161e30] rounded-xl" />
                    </div>
                    <div className="mt-4 ml-14 h-4 bg-[#161e30] rounded w-72" />
                  </div>
                ))
              : data?.players.map((player, i) => {
                  const streak = getStreak(player.recentMatches)
                  const mostPlayed = getMostPlayed(player.recentMatches)
                  return (
                    <div
                      key={`${player.gameName}#${player.tagLine}`}
                      className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-5 hover:border-[#1a2a40] transition-all duration-200"
                      style={getCardGlow(i)}
                    >
                      {/* ─ Top row ─ */}
                      <div className="flex items-center gap-4">

                        {/* Position */}
                        <div className="shrink-0 w-10 flex items-center justify-center">
                          {i < 3
                            ? <span className="text-2xl leading-none">{MEDALS[i]}</span>
                            : <span className="text-xl font-black text-[#334155]">{i + 1}</span>}
                        </div>

                        {/* Avatar */}
                        <div className="relative shrink-0">
                          <img
                            src={iconUrl(player.profileIconId, data.ddVersion)}
                            alt="icon" width={68} height={68}
                            style={{ width: 68, height: 68, borderRadius: '50%' }}
                            className="border-2 border-[#1e2d45]"
                            onError={(e) => { ;(e.target as HTMLImageElement).src = iconUrl(29, data.ddVersion) }}
                          />
                          <span className="absolute -bottom-1.5 -right-1 text-[10px] bg-[#060d1a] border border-[#1e2d45] text-[#475569] px-1.5 py-px rounded-full font-bold leading-tight">
                            {player.summonerLevel}
                          </span>
                        </div>

                        {/* Name + rank */}
                        <div className="flex-1 min-w-0">
                          {/* Name row */}
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <span className="text-white font-bold text-lg leading-tight">{player.gameName}</span>
                            <span className="text-[#1e2d45] text-sm">#{player.tagLine}</span>
                            {streak && (
                              <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${
                                streak.type === 'win'
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : 'bg-red-500/15 text-red-400 border-red-500/25'
                              }`}>
                                {streak.type === 'win' ? '🔥' : '💀'} {streak.count} seguidas
                              </span>
                            )}
                          </div>
                          {/* Rank row */}
                          {player.error ? (
                            <p className="text-red-400/70 text-sm">{player.error}</p>
                          ) : player.rank ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <img
                                src={emblemUrl(player.rank.tier)} alt={player.rank.tier}
                                width={18} height={18} className="w-[18px] h-[18px] object-contain"
                                onError={(e) => { ;(e.target as HTMLImageElement).style.display = 'none' }}
                              />
                              <span className="text-sm font-bold" style={{ color: TIER_COLORS[player.rank.tier] ?? '#9ca3af' }}>
                                {getRankLabel(player.rank)}
                              </span>
                              <span className="text-white text-sm font-bold">{player.rank.lp} LP</span>
                              <span className="w-px h-4 bg-[#1a2840] mx-0.5 shrink-0" />
                              <span className="text-green-400/90 text-sm">{player.rank.wins}W</span>
                              <span className="text-red-400/90 text-sm">{player.rank.losses}L</span>
                              <span className="text-[#334155] text-sm">·</span>
                              <span className="text-[#94a3b8] text-sm font-semibold">{player.rank.winrate}%</span>
                            </div>
                          ) : (
                            <p className="text-[#1e2d45] text-sm">Sin clasificar</p>
                          )}
                        </div>

                        {/* OP.GG button */}
                        <a
                          href={opggUrl(player.gameName, player.tagLine)}
                          target="_blank" rel="noopener noreferrer"
                          className="shrink-0 flex flex-col items-center justify-center gap-0.5 bg-[#0d1f38] hover:bg-[#12284a] border border-[#1a3560]/60 hover:border-[#2d5a9e]/70 px-4 py-2.5 rounded-xl transition-all duration-200 group"
                        >
                          <span className="text-[#4d8bca] group-hover:text-[#7db3e8] text-sm font-black tracking-wider transition-colors">OP.GG</span>
                          <span className="text-[#1e3a5f] group-hover:text-[#2d5a8a] text-[10px] font-medium transition-colors">Ver perfil ↗</span>
                        </a>
                      </div>

                      {/* ─ Bottom row: champion + last 5 ─ */}
                      {(mostPlayed || player.recentMatches?.length) && (
                        <div className="mt-4 flex items-center gap-3 flex-wrap pl-[54px]">
                          {mostPlayed && (
                            <div className="flex items-center gap-2 bg-[#090e1a] rounded-lg px-2.5 py-1.5 border border-[#0f1a2e]">
                              <img
                                src={champUrl(mostPlayed.champ, data.ddVersion)} alt={mostPlayed.champ}
                                width={22} height={22}
                                className="w-[22px] h-[22px] rounded-md object-cover"
                                onError={(e) => { ;(e.target as HTMLImageElement).style.opacity = '0.2' }}
                              />
                              <span className="text-[#64748b] text-xs font-semibold">{mostPlayed.champ}</span>
                              <span className="text-[#1e2d45] text-xs">·</span>
                              <span className="text-[#475569] text-xs">{mostPlayed.games}p</span>
                              <span className="text-[#1e2d45] text-xs">·</span>
                              <span className={`text-xs font-bold ${mostPlayed.wr >= 50 ? 'text-emerald-500/80' : 'text-red-400/80'}`}>
                                {mostPlayed.wr}% WR
                              </span>
                            </div>
                          )}

                          {player.recentMatches && player.recentMatches.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              {player.recentMatches.slice(0, 5).map((match, idx) => (
                                <div key={idx} className="relative group/img shrink-0">
                                  <img
                                    src={champUrl(match.champion, data.ddVersion)}
                                    alt={match.champion} title={match.champion}
                                    width={34} height={34}
                                    className={`w-[34px] h-[34px] rounded-lg object-cover border-2 transition-opacity group-hover/img:brightness-110 ${
                                      match.win ? 'border-blue-500/70' : 'border-red-600/60'
                                    }`}
                                    onError={(e) => { ;(e.target as HTMLImageElement).style.opacity = '0.2' }}
                                  />
                                  <span className={`absolute -bottom-1 -right-1 text-[7px] font-black leading-none px-[3px] py-[2px] rounded-sm ${
                                    match.win ? 'bg-blue-600 text-white' : 'bg-red-700 text-white'
                                  }`}>
                                    {match.win ? 'V' : 'D'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
          </div>
        )}

        {/* ══ HISTORIAL ══ */}
        {activeTab === 'historial' && <RecentMatchesFeed />}

        {/* ══ ESTADÍSTICAS ══ */}
        {activeTab === 'estadisticas' && (
          <div>
            {groupStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                {[
                  { label: 'Partidas', value: String(groupStats.totalGames), sub: 'ranked totales', color: 'text-white' },
                  {
                    label: 'WR Grupo', value: `${groupStats.groupWr}%`,
                    sub: `${groupStats.totalWins}V / ${groupStats.totalLosses}D`,
                    color: groupStats.groupWr >= 50 ? 'text-emerald-400' : 'text-red-400',
                  },
                ].map((s) => (
                  <div key={s.label} className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-4">
                    <p className="text-[#334155] text-[11px] font-bold uppercase tracking-widest mb-1">{s.label}</p>
                    <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                    <p className="text-[#283548] text-xs mt-0.5">{s.sub}</p>
                  </div>
                ))}
                {groupStats.bestWr && (
                  <div className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-4">
                    <p className="text-[#334155] text-[11px] font-bold uppercase tracking-widest mb-1">Mejor WR</p>
                    <p className="text-white text-base font-bold truncate">{groupStats.bestWr.gameName}</p>
                    <p className="text-emerald-400 text-sm mt-0.5">{groupStats.bestWr.rank?.winrate}%</p>
                  </div>
                )}
                {groupStats.topChamp && data && (
                  <div className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-4">
                    <p className="text-[#334155] text-[11px] font-bold uppercase tracking-widest mb-1">Top Champ</p>
                    <div className="flex items-center gap-2">
                      <img src={champUrl(groupStats.topChamp[0], data.ddVersion)} alt={groupStats.topChamp[0]}
                        width={24} height={24} className="w-6 h-6 rounded-md object-cover"
                        onError={(e) => { ;(e.target as HTMLImageElement).style.opacity = '0.2' }}
                      />
                      <p className="text-white text-sm font-bold truncate">{groupStats.topChamp[0]}</p>
                    </div>
                    <p className="text-[#283548] text-xs mt-0.5">{groupStats.topChamp[1]} partidas</p>
                  </div>
                )}
              </div>
            )}

            {loading && !data && <div className="bg-[#0c1525] rounded-2xl border border-[#111d30] h-64 animate-pulse mb-8" />}

            {chartData.length > 0 && pwm.length > 0 && (
              <div className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-6">
                <h2 className="text-white text-base font-bold tracking-widest uppercase mb-1">Forma reciente</h2>
                <p className="text-[#334155] text-sm mb-5">Últimas {chartData.length} partidas · +1 victoria / −1 derrota</p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {pwm.map((p, idx) => {
                    const color = CHART_COLORS[idx % CHART_COLORS.length]
                    const active = selectedPlayers === null || selectedPlayers.has(p.gameName)
                    return (
                      <button key={p.gameName} onClick={() => togglePlayer(p.gameName)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium transition-all border"
                        style={{
                          borderColor: active ? color + '60' : '#161e30',
                          backgroundColor: active ? color + '18' : 'transparent',
                          color: active ? color : '#334155',
                        }}
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: active ? color : '#1e2d45' }} />
                        {p.gameName}
                      </button>
                    )
                  })}
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <XAxis dataKey="game" tick={{ fill: '#1e2d45', fontSize: 11 }} axisLine={{ stroke: '#111d30' }} tickLine={false} />
                    <YAxis tick={{ fill: '#1e2d45', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <ReferenceLine y={0} stroke="#1e2d45" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{ background: '#0a1020', border: '1px solid #161e30', borderRadius: 10, fontSize: 13, color: '#e2e8f0' }}
                      itemStyle={{ color: '#94a3b8' }}
                      labelFormatter={(v) => `Partida ${v}`}
                      formatter={(value, name) => [typeof value === 'number' && value > 0 ? `+${value}` : value, name as string]}
                    />
                    {visiblePlayers.map((p) => {
                      const idx = pwm.findIndex((x) => x.gameName === p.gameName)
                      return (
                        <Line key={p.gameName} type="monotone" dataKey={p.gameName}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]} strokeWidth={2}
                          dot={false} activeDot={{ r: 4, strokeWidth: 0 }} connectNulls
                        />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {data && (
          <p className="text-center text-[#0f172a] text-sm mt-10">
            Actualizado a las{' '}
            {new Date(data.updatedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </main>
  )
}
