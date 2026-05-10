'use client'

import { useEffect, useState, useCallback } from 'react'
import { RecentMatchesFeed } from './components/RecentMatchesFeed'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'

interface RankData {
  tier: string
  division: string
  lp: number
  wins: number
  losses: number
  winrate: number
}

interface MatchResult {
  win: boolean
  champion: string
}

interface Player {
  gameName: string
  tagLine: string
  profileIconId: number
  summonerLevel: number
  rank: RankData | null
  recentMatches: MatchResult[] | null
  error: string | null
}

interface ApiResponse {
  players: Player[]
  ddVersion: string
  updatedAt: string
}

const TIER_COLORS: Record<string, string> = {
  IRON: '#9ca3af',
  BRONZE: '#b45309',
  SILVER: '#94a3b8',
  GOLD: '#d97706',
  PLATINUM: '#0891b2',
  EMERALD: '#10b981',
  DIAMOND: '#818cf8',
  MASTER: '#c084fc',
  GRANDMASTER: '#f87171',
  CHALLENGER: '#fbbf24',
}

const CHART_COLORS = ['#818cf8', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#38bdf8']
const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])
const POSITION_MEDALS = ['🥇', '🥈', '🥉']

type Tab = 'ranking' | 'historial' | 'estadisticas'

function getRankLabel(rank: RankData): string {
  if (APEX_TIERS.has(rank.tier)) return rank.tier
  return `${rank.tier} ${rank.division}`
}

function getCardGlow(index: number): React.CSSProperties {
  if (index === 0) return {
    borderColor: 'rgba(245, 158, 11, 0.3)',
    boxShadow: '0 0 40px rgba(245, 158, 11, 0.07)',
  }
  return {}
}

function getStreak(matches: MatchResult[] | null): { type: 'win' | 'loss'; count: number } | null {
  if (!matches || matches.length === 0) return null
  const first = matches[0].win
  let count = 0
  for (const m of matches) {
    if (m.win !== first) break
    count++
  }
  return count >= 2 ? { type: first ? 'win' : 'loss', count } : null
}

function getMostPlayedChampion(matches: MatchResult[] | null) {
  if (!matches || matches.length === 0) return null
  const map: Record<string, { games: number; wins: number }> = {}
  for (const m of matches) {
    if (!map[m.champion]) map[m.champion] = { games: 0, wins: 0 }
    map[m.champion].games++
    if (m.win) map[m.champion].wins++
  }
  const [champion, stats] = Object.entries(map).sort((a, b) => b[1].games - a[1].games)[0]
  return { champion, ...stats, wr: Math.round((stats.wins / stats.games) * 100) }
}

function buildChartData(players: Player[]) {
  const maxLen = Math.max(...players.map((p) => p.recentMatches?.length ?? 0))
  if (maxLen === 0) return []
  return Array.from({ length: maxLen }, (_, i) => {
    const point: Record<string, number | string> = { game: i + 1 }
    players.forEach((p) => {
      if (!p.recentMatches?.length) return
      const chrono = [...p.recentMatches].reverse()
      point[p.gameName] = chrono.slice(0, i + 1).reduce((s, m) => s + (m.win ? 1 : -1), 0)
    })
    return point
  })
}

function computeGroupStats(players: Player[]) {
  const ranked = players.filter((p) => p.rank)
  const totalWins = ranked.reduce((s, p) => s + (p.rank?.wins ?? 0), 0)
  const totalLosses = ranked.reduce((s, p) => s + (p.rank?.losses ?? 0), 0)
  const totalGames = totalWins + totalLosses
  const groupWr = totalGames > 0 ? Math.round((totalWins / totalGames) * 100) : 0
  const bestWr = ranked.length > 0
    ? ranked.reduce((best, p) => (p.rank!.winrate > best.rank!.winrate ? p : best))
    : null
  const mostActivePlayer = ranked.length > 0
    ? ranked.reduce((best, p) => {
        const g = (p.rank?.wins ?? 0) + (p.rank?.losses ?? 0)
        const bg = (best.rank?.wins ?? 0) + (best.rank?.losses ?? 0)
        return g > bg ? p : best
      })
    : null
  const champMap: Record<string, number> = {}
  players.forEach((p) => p.recentMatches?.forEach((m) => {
    champMap[m.champion] = (champMap[m.champion] ?? 0) + 1
  }))
  const topChamp = Object.entries(champMap).sort((a, b) => b[1] - a[1])[0] ?? null
  return { totalGames, totalWins, totalLosses, groupWr, bestWr, mostActivePlayer, topChamp }
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(300)
  const [activeTab, setActiveTab] = useState<Tab>('ranking')
  const [selectedChartPlayers, setSelectedChartPlayers] = useState<Set<string> | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/players')
      if (!res.ok) throw new Error('error')
      const json: ApiResponse = await res.json()
      setData(json)
      setCountdown(300)
    } catch {
      setFetchError('No se pudieron cargar los datos. Comprueba que la API key de Riot está configurada.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { fetchData(); return 300 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [fetchData])

  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  const iconUrl = (id: number, v: string) =>
    `https://ddragon.leagueoflegends.com/cdn/${v}/img/profileicon/${id}.png`
  const emblemUrl = (tier: string) => {
    const ext = tier === 'EMERALD' ? 'svg' : 'png'
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.${ext}`
  }
  const opggUrl = (g: string, t: string) =>
    `https://www.op.gg/summoners/euw/${encodeURIComponent(g)}-${encodeURIComponent(t)}`
  const champUrl = (c: string, v: string) =>
    `https://ddragon.leagueoflegends.com/cdn/${v}/img/champion/${c}.png`

  const chartData = data ? buildChartData(data.players) : []
  const playersWithMatches = data?.players.filter((p) => p.recentMatches?.length) ?? []
  const visibleChartPlayers = playersWithMatches.filter(
    (p) => selectedChartPlayers === null || selectedChartPlayers.has(p.gameName)
  )

  function toggleChartPlayer(name: string) {
    setSelectedChartPlayers((prev) => {
      const all = new Set(playersWithMatches.map((p) => p.gameName))
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
    <main className="min-h-screen bg-[#060d1a] py-12 px-4">
      <div className="max-w-3xl mx-auto">

        {/* Header */}
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="h-px w-16 bg-gradient-to-r from-transparent to-[#4f46e5]/60" />
            <span className="text-[#4f46e5] text-xs font-bold tracking-[0.3em] uppercase">
              Solo / Duo Queue
            </span>
            <div className="h-px w-16 bg-gradient-to-l from-transparent to-[#4f46e5]/60" />
          </div>
          <h1 className="text-5xl font-black text-white tracking-tight uppercase leading-none">
            Unemployed
          </h1>
          <h2 className="text-4xl font-black text-[#4f46e5] tracking-tight uppercase leading-tight mt-1">
            Ranking
          </h2>
          <p className="text-[#283548] text-sm mt-3 tracking-widest uppercase">
            de los Chavales
          </p>
          <div className="flex items-center justify-center gap-5 mt-5">
            {data && (
              <span className="text-[#1e2d45] text-sm tabular-nums">
                Actualiza en {fmt(countdown)}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="text-sm text-[#4f46e5] hover:text-[#818cf8] disabled:opacity-40 transition-colors font-semibold"
            >
              {loading ? 'Cargando…' : '↻ Actualizar'}
            </button>
          </div>
        </header>

        {/* Error */}
        {fetchError && (
          <div className="bg-red-950/20 border border-red-900/40 rounded-2xl p-5 mb-6 text-red-400 text-sm text-center">
            {fetchError}
          </div>
        )}

        {/* Tab nav */}
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

        {/* ── Ranking ── */}
        {activeTab === 'ranking' && (
          <div className="space-y-3">
            {loading && !data
              ? Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-[#0c1525] rounded-2xl p-5 border border-[#111d30] animate-pulse">
                    <div className="flex items-center gap-5">
                      <div className="w-8 h-6 bg-[#161e30] rounded" />
                      <div className="w-16 h-16 bg-[#161e30] rounded-full" />
                      <div className="flex-1 space-y-2.5">
                        <div className="h-4 bg-[#161e30] rounded w-40" />
                        <div className="h-3 bg-[#161e30] rounded w-56" />
                        <div className="h-3 bg-[#161e30] rounded w-48" />
                      </div>
                    </div>
                  </div>
                ))
              : data?.players.map((player, i) => {
                  const streak = getStreak(player.recentMatches)
                  const mostPlayed = getMostPlayedChampion(player.recentMatches)

                  return (
                    <div
                      key={`${player.gameName}#${player.tagLine}`}
                      className="bg-[#0c1525] rounded-2xl px-5 py-4 border border-[#111d30] hover:border-[#1a2a40] transition-all duration-200"
                      style={getCardGlow(i)}
                    >
                      <div className="flex items-start gap-4">

                        {/* Position */}
                        <div className="w-8 text-right shrink-0 pt-1">
                          {i < 3
                            ? <span className="text-2xl leading-none">{POSITION_MEDALS[i]}</span>
                            : <span className="text-xl font-black text-[#475569]">{i + 1}</span>
                          }
                        </div>

                        {/* Profile icon */}
                        <div className="relative shrink-0">
                          <img
                            src={iconUrl(player.profileIconId, data.ddVersion)}
                            alt="icon"
                            width={64}
                            height={64}
                            className="rounded-full border-2 border-[#1e2d45]"
                            style={{ width: 64, height: 64 }}
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).src = iconUrl(29, data.ddVersion)
                            }}
                          />
                          <span className="absolute -bottom-1 -right-1 text-[11px] bg-[#0a1020] border border-[#1e2d45] text-[#475569] px-1.5 rounded-md font-semibold leading-tight">
                            {player.summonerLevel}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">

                          {/* Name row */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white font-bold text-base">
                              {player.gameName}
                            </span>
                            <span className="text-[#1e2d45] text-sm">#{player.tagLine}</span>
                            {streak && (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
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
                            <p className="text-red-400/70 text-sm mt-1">{player.error}</p>
                          ) : player.rank ? (
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <img
                                src={emblemUrl(player.rank.tier)}
                                alt={player.rank.tier}
                                width={18}
                                height={18}
                                className="w-[18px] h-[18px] object-contain"
                                onError={(e) => {
                                  ;(e.target as HTMLImageElement).style.display = 'none'
                                }}
                              />
                              <span className="text-sm font-bold" style={{ color: TIER_COLORS[player.rank.tier] ?? '#9ca3af' }}>
                                {getRankLabel(player.rank)}
                              </span>
                              <span className="text-white text-sm font-bold">{player.rank.lp} LP</span>
                              <span className="text-[#1e2d45]">·</span>
                              <span className="text-[#475569] text-sm">
                                <span className="text-green-400/80">{player.rank.wins}W</span>{' '}
                                <span className="text-red-400/80">{player.rank.losses}L</span>{' '}
                                · {player.rank.winrate}%
                              </span>
                            </div>
                          ) : (
                            <p className="text-[#1e2d45] text-sm mt-1">Sin clasificar</p>
                          )}

                          {/* Champion + last 5 */}
                          {(mostPlayed || player.recentMatches?.length) && (
                            <div className="mt-3 flex items-center gap-3 flex-wrap">
                              {mostPlayed && (
                                <div className="flex items-center gap-1.5">
                                  <img
                                    src={champUrl(mostPlayed.champion, data.ddVersion)}
                                    alt={mostPlayed.champion}
                                    width={24}
                                    height={24}
                                    className="w-6 h-6 rounded-md object-cover border border-[#1e2d45]"
                                    onError={(e) => {
                                      ;(e.target as HTMLImageElement).style.opacity = '0.2'
                                    }}
                                  />
                                  <span className="text-sm text-[#475569]">
                                    <span className="text-[#64748b] font-semibold">{mostPlayed.champion}</span>
                                    {' '}
                                    <span className="text-[#334155]">
                                      {mostPlayed.games}p · {mostPlayed.wr}%WR
                                    </span>
                                  </span>
                                </div>
                              )}

                              {mostPlayed && player.recentMatches?.length && (
                                <span className="text-[#161e30]">|</span>
                              )}

                              {player.recentMatches && player.recentMatches.length > 0 && (
                                <div className="flex gap-1.5">
                                  {player.recentMatches.slice(0, 5).map((match, idx) => (
                                    <div key={idx} className="relative group shrink-0">
                                      <img
                                        src={`https://ddragon.leagueoflegends.com/cdn/${data.ddVersion}/img/champion/${match.champion}.png`}
                                        alt={match.champion}
                                        title={match.champion}
                                        width={34}
                                        height={34}
                                        className={`w-[34px] h-[34px] rounded-lg object-cover border-2 transition-opacity group-hover:opacity-90 ${
                                          match.win ? 'border-blue-500/70' : 'border-red-600/60'
                                        }`}
                                        onError={(e) => {
                                          ;(e.target as HTMLImageElement).style.opacity = '0.2'
                                        }}
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

                        {/* Op.gg */}
                        <a
                          href={opggUrl(player.gameName, player.tagLine)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-sm font-semibold text-[#334155] hover:text-white bg-[#0a1020] hover:bg-[#111d30] border border-[#161e30] hover:border-[#1e2d45] px-3 py-2 rounded-xl transition-all duration-150"
                        >
                          op.gg ↗
                        </a>
                      </div>
                    </div>
                  )
                })}
          </div>
        )}

        {/* ── Historial ── */}
        {activeTab === 'historial' && <RecentMatchesFeed />}

        {/* ── Estadísticas ── */}
        {activeTab === 'estadisticas' && (
          <div>
            {groupStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                <div className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-4">
                  <p className="text-[#334155] text-[11px] font-bold uppercase tracking-widest mb-1">Partidas</p>
                  <p className="text-white text-2xl font-black">{groupStats.totalGames}</p>
                  <p className="text-[#283548] text-xs mt-0.5">ranked totales</p>
                </div>
                <div className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-4">
                  <p className="text-[#334155] text-[11px] font-bold uppercase tracking-widest mb-1">WR Grupo</p>
                  <p className={`text-2xl font-black ${groupStats.groupWr >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {groupStats.groupWr}%
                  </p>
                  <p className="text-[#283548] text-xs mt-0.5">{groupStats.totalWins}V / {groupStats.totalLosses}D</p>
                </div>
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
                      <img
                        src={champUrl(groupStats.topChamp[0], data.ddVersion)}
                        alt={groupStats.topChamp[0]}
                        width={24}
                        height={24}
                        className="w-6 h-6 rounded-md object-cover"
                        onError={(e) => { ;(e.target as HTMLImageElement).style.opacity = '0.2' }}
                      />
                      <p className="text-white text-sm font-bold truncate">{groupStats.topChamp[0]}</p>
                    </div>
                    <p className="text-[#283548] text-xs mt-0.5">{groupStats.topChamp[1]} partidas</p>
                  </div>
                )}
              </div>
            )}

            {chartData.length > 0 && playersWithMatches.length > 0 ? (
              <div className="bg-[#0c1525] rounded-2xl border border-[#111d30] p-6">
                <h2 className="text-white text-base font-bold tracking-widest uppercase mb-1">Forma reciente</h2>
                <p className="text-[#334155] text-sm mb-5">
                  Últimas {chartData.length} partidas · +1 victoria / −1 derrota
                </p>
                <div className="flex flex-wrap gap-2 mb-5">
                  {playersWithMatches.map((player, idx) => {
                    const color = CHART_COLORS[idx % CHART_COLORS.length]
                    const isActive = selectedChartPlayers === null || selectedChartPlayers.has(player.gameName)
                    return (
                      <button
                        key={player.gameName}
                        onClick={() => toggleChartPlayer(player.gameName)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-sm font-medium transition-all border"
                        style={{
                          borderColor: isActive ? color + '60' : '#161e30',
                          backgroundColor: isActive ? color + '18' : 'transparent',
                          color: isActive ? color : '#334155',
                        }}
                      >
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: isActive ? color : '#1e2d45' }} />
                        {player.gameName}
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
                      formatter={(value, name) => [
                        typeof value === 'number' && value > 0 ? `+${value}` : value,
                        name as string,
                      ]}
                    />
                    {visibleChartPlayers.map((player) => {
                      const idx = playersWithMatches.findIndex((p) => p.gameName === player.gameName)
                      return (
                        <Line
                          key={player.gameName}
                          type="monotone"
                          dataKey={player.gameName}
                          stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, strokeWidth: 0 }}
                          connectNulls
                        />
                      )
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : !loading ? (
              <p className="text-[#334155] text-base text-center py-10">Sin datos suficientes.</p>
            ) : (
              <div className="bg-[#0c1525] rounded-2xl border border-[#111d30] h-64 animate-pulse" />
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
