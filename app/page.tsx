'use client'

import { useEffect, useState, useCallback } from 'react'
import { RecentMatchesFeed } from './components/RecentMatchesFeed'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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

function getRankLabel(rank: RankData): string {
  if (APEX_TIERS.has(rank.tier)) return rank.tier
  return `${rank.tier} ${rank.division}`
}

function getPositionColor(index: number): string {
  if (index === 0) return '#f59e0b'
  if (index === 1) return '#94a3b8'
  if (index === 2) return '#cd7f32'
  return '#475569'
}

function getCardGlow(index: number): React.CSSProperties {
  if (index === 0) {
    return {
      borderColor: 'rgba(245, 158, 11, 0.25)',
      boxShadow: '0 0 32px rgba(245, 158, 11, 0.07)',
    }
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
  return Array.from({ length: maxLen }, (_, gameIdx) => {
    const point: Record<string, number | string> = { game: gameIdx + 1 }
    players.forEach((p) => {
      if (!p.recentMatches || p.recentMatches.length === 0) return
      const chronological = [...p.recentMatches].reverse()
      const slice = chronological.slice(0, gameIdx + 1)
      point[p.gameName] = slice.reduce((sum, m) => sum + (m.win ? 1 : -1), 0)
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
        const games = (p.rank?.wins ?? 0) + (p.rank?.losses ?? 0)
        const bestGames = (best.rank?.wins ?? 0) + (best.rank?.losses ?? 0)
        return games > bestGames ? p : best
      })
    : null
  const mostPlayedInGroup: Record<string, number> = {}
  players.forEach((p) => {
    p.recentMatches?.forEach((m) => {
      mostPlayedInGroup[m.champion] = (mostPlayedInGroup[m.champion] ?? 0) + 1
    })
  })
  const topChamp = Object.entries(mostPlayedInGroup).sort((a, b) => b[1] - a[1])[0] ?? null
  return { totalGames, totalWins, totalLosses, groupWr, bestWr, mostActivePlayer, topChamp }
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(300)
  const [selectedChartPlayers, setSelectedChartPlayers] = useState<Set<string> | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/players')
      if (!res.ok) throw new Error('Error al cargar datos')
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
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { fetchData(); return 300 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [fetchData])

  const formatCountdown = (s: number) =>
    `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  const iconUrl = (id: number, version: string) =>
    `https://ddragon.leagueoflegends.com/cdn/${version}/img/profileicon/${id}.png`

  const emblemUrl = (tier: string) => {
    const ext = tier === 'EMERALD' ? 'svg' : 'png'
    return `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/${tier.toLowerCase()}.${ext}`
  }

  const opggUrl = (gameName: string, tagLine: string) =>
    `https://www.op.gg/summoners/euw/${encodeURIComponent(gameName)}-${encodeURIComponent(tagLine)}`

  const champIconUrl = (champion: string, version: string) =>
    `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champion}.png`

  const chartData = data ? buildChartData(data.players) : []
  const playersWithMatches = data?.players.filter((p) => p.recentMatches && p.recentMatches.length > 0) ?? []
  const visibleChartPlayers = playersWithMatches.filter(
    (p) => selectedChartPlayers === null || selectedChartPlayers.has(p.gameName)
  )

  function toggleChartPlayer(name: string) {
    setSelectedChartPlayers((prev) => {
      const all = new Set(playersWithMatches.map((p) => p.gameName))
      const current = prev ?? all
      if (current.has(name) && current.size === 1) return all
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next.size === all.size ? null : next
    })
  }

  const groupStats = data ? computeGroupStats(data.players) : null

  return (
    <main className="min-h-screen bg-[#060d1a] py-10 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <header className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="h-px w-12 bg-gradient-to-r from-transparent to-[#4f46e5]/60" />
            <span className="text-[#4f46e5] text-xs font-bold tracking-[0.25em] uppercase">Solo / Duo Queue</span>
            <div className="h-px w-12 bg-gradient-to-l from-transparent to-[#4f46e5]/60" />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight uppercase leading-none">
            Unemployed Ranking
          </h1>
          <p className="text-[#1e2d45] text-xs mt-2 tracking-widest uppercase">de los Chavales</p>
          <div className="flex items-center justify-center gap-4 mt-4">
            {data && (
              <span className="text-[#283548] text-xs tabular-nums">
                Actualiza en {formatCountdown(countdown)}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="text-xs text-[#4f46e5] hover:text-[#818cf8] disabled:opacity-40 transition-colors font-semibold"
            >
              {loading ? 'Cargando…' : '↻ Actualizar ahora'}
            </button>
          </div>
        </header>

        {/* Error */}
        {fetchError && (
          <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4 mb-5 text-red-400 text-sm text-center">
            {fetchError}
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="ranking">
          <TabsList className="w-full bg-[#0c1525] border border-[#111d30] p-1 h-auto rounded-xl mb-6">
            <TabsTrigger
              value="ranking"
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-[#334155] hover:text-[#64748b] data-active:bg-[#111d30] data-active:text-white transition-all"
            >
              🏆 Ranking
            </TabsTrigger>
            <TabsTrigger
              value="historial"
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-[#334155] hover:text-[#64748b] data-active:bg-[#111d30] data-active:text-white transition-all"
            >
              ⚔️ Historial
            </TabsTrigger>
            <TabsTrigger
              value="estadisticas"
              className="flex-1 py-2 rounded-lg text-sm font-semibold text-[#334155] hover:text-[#64748b] data-active:bg-[#111d30] data-active:text-white transition-all"
            >
              📊 Estadísticas
            </TabsTrigger>
          </TabsList>

          {/* ── Ranking tab ── */}
          <TabsContent value="ranking">
            <div className="space-y-2.5">
              {loading && !data
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-[#0c1525] rounded-xl p-4 border border-[#111d30] animate-pulse"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-7 h-5 bg-[#161e30] rounded" />
                        <div className="w-12 h-12 bg-[#161e30] rounded-full" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 bg-[#161e30] rounded w-36" />
                          <div className="h-3 bg-[#161e30] rounded w-48" />
                          <div className="h-3 bg-[#161e30] rounded w-40" />
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
                        className="bg-[#0c1525] rounded-xl px-4 py-4 border border-[#111d30] hover:border-[#1a2a40] transition-all duration-200"
                        style={getCardGlow(i)}
                      >
                        <div className="flex items-start gap-3.5">

                          {/* Position */}
                          <div className="w-7 text-right shrink-0 pt-0.5">
                            {i < 3 ? (
                              <span className="text-xl leading-none">{POSITION_MEDALS[i]}</span>
                            ) : (
                              <span
                                className="text-base font-black"
                                style={{ color: getPositionColor(i) }}
                              >
                                {i + 1}
                              </span>
                            )}
                          </div>

                          {/* Profile icon */}
                          <div className="relative shrink-0">
                            <img
                              src={iconUrl(player.profileIconId, data.ddVersion)}
                              alt="icon"
                              width={52}
                              height={52}
                              className="w-13 h-13 rounded-full border-2 border-[#161e30]"
                              style={{ width: 52, height: 52, borderRadius: '50%' }}
                              onError={(e) => {
                                ;(e.target as HTMLImageElement).src = iconUrl(29, data.ddVersion)
                              }}
                            />
                            <span className="absolute -bottom-1 -right-1 text-[10px] bg-[#0a1020] border border-[#161e30] text-[#475569] px-1 rounded font-medium leading-tight">
                              {player.summonerLevel}
                            </span>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {/* Name + streak */}
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[#e2e8f0] font-bold text-sm truncate">
                                {player.gameName}
                              </span>
                              <span className="text-[#1e2d45] text-xs shrink-0">
                                #{player.tagLine}
                              </span>
                              {streak && (
                                <Badge
                                  className={
                                    streak.type === 'win'
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 text-[10px] h-4 px-1.5'
                                      : 'bg-red-500/15 text-red-400 border border-red-500/25 text-[10px] h-4 px-1.5'
                                  }
                                >
                                  {streak.type === 'win' ? '🔥' : '💀'} {streak.count} seguidas
                                </Badge>
                              )}
                            </div>

                            {/* Rank info */}
                            {player.error ? (
                              <p className="text-red-400/70 text-xs mt-0.5">{player.error}</p>
                            ) : player.rank ? (
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <img
                                  src={emblemUrl(player.rank.tier)}
                                  alt={player.rank.tier}
                                  width={16}
                                  height={16}
                                  className="w-4 h-4 object-contain"
                                  onError={(e) => {
                                    ;(e.target as HTMLImageElement).style.display = 'none'
                                  }}
                                />
                                <span
                                  className="text-xs font-bold"
                                  style={{ color: TIER_COLORS[player.rank.tier] ?? '#9ca3af' }}
                                >
                                  {getRankLabel(player.rank)}
                                </span>
                                <span className="text-white text-xs font-semibold">
                                  {player.rank.lp} LP
                                </span>
                                <span className="text-[#1e2d45] text-xs">·</span>
                                <span className="text-[#475569] text-xs">
                                  <span className="text-green-400/80">{player.rank.wins}W</span>{' '}
                                  <span className="text-red-400/80">{player.rank.losses}L</span>{' '}
                                  · {player.rank.winrate}%
                                </span>
                              </div>
                            ) : (
                              <p className="text-[#1e2d45] text-xs mt-0.5">Sin clasificar</p>
                            )}

                            {/* Most played champion + last 5 */}
                            {(mostPlayed || (player.recentMatches && player.recentMatches.length > 0)) && (
                              <div className="mt-2.5 flex items-center gap-3 flex-wrap">

                                {/* Most played champion */}
                                {mostPlayed && (
                                  <div className="flex items-center gap-1.5">
                                    <img
                                      src={champIconUrl(mostPlayed.champion, data.ddVersion)}
                                      alt={mostPlayed.champion}
                                      width={22}
                                      height={22}
                                      className="w-[22px] h-[22px] rounded-md object-cover border border-[#1e2d45]"
                                      onError={(e) => {
                                        ;(e.target as HTMLImageElement).style.opacity = '0.2'
                                      }}
                                    />
                                    <span className="text-[#4a5568] text-[11px]">
                                      <span className="text-[#64748b] font-medium">{mostPlayed.champion}</span>
                                      {' '}
                                      <span className="text-[#334155]">
                                        {mostPlayed.games}p · {mostPlayed.wr}% WR
                                      </span>
                                    </span>
                                  </div>
                                )}

                                {/* Separator */}
                                {mostPlayed && player.recentMatches && player.recentMatches.length > 0 && (
                                  <span className="text-[#1a2840] text-xs">|</span>
                                )}

                                {/* Last 5 matches */}
                                {player.recentMatches && player.recentMatches.length > 0 && (
                                  <div className="flex gap-1">
                                    {player.recentMatches.slice(0, 5).map((match, idx) => (
                                      <div key={idx} className="relative group shrink-0">
                                        <img
                                          src={`https://ddragon.leagueoflegends.com/cdn/${data.ddVersion}/img/champion/${match.champion}.png`}
                                          alt={match.champion}
                                          title={match.champion}
                                          width={30}
                                          height={30}
                                          className={`w-[30px] h-[30px] rounded-md object-cover border-2 transition-opacity group-hover:opacity-90 ${
                                            match.win ? 'border-blue-500/70' : 'border-red-600/60'
                                          }`}
                                          onError={(e) => {
                                            ;(e.target as HTMLImageElement).style.opacity = '0.2'
                                          }}
                                        />
                                        <span
                                          className={`absolute -bottom-1 -right-1 text-[7px] font-black leading-none px-[3px] py-[2px] rounded-sm ${
                                            match.win ? 'bg-blue-600 text-white' : 'bg-red-700 text-white'
                                          }`}
                                        >
                                          {match.win ? 'V' : 'D'}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Op.gg button */}
                          <a
                            href={opggUrl(player.gameName, player.tagLine)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-xs font-semibold text-[#334155] hover:text-white bg-[#0a1020] hover:bg-[#111d30] border border-[#161e30] hover:border-[#1e2d45] px-2.5 py-1.5 rounded-lg transition-all duration-150"
                          >
                            op.gg ↗
                          </a>
                        </div>
                      </div>
                    )
                  })}
            </div>
          </TabsContent>

          {/* ── Historial tab ── */}
          <TabsContent value="historial">
            <RecentMatchesFeed />
          </TabsContent>

          {/* ── Estadísticas tab ── */}
          <TabsContent value="estadisticas">

            {/* Group stats cards */}
            {groupStats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-6">
                <div className="bg-[#0c1525] rounded-xl border border-[#111d30] p-3.5">
                  <p className="text-[#334155] text-[10px] font-bold uppercase tracking-widest mb-1">Partidas</p>
                  <p className="text-white text-xl font-black">{groupStats.totalGames}</p>
                  <p className="text-[#283548] text-[11px] mt-0.5">ranked totales</p>
                </div>
                <div className="bg-[#0c1525] rounded-xl border border-[#111d30] p-3.5">
                  <p className="text-[#334155] text-[10px] font-bold uppercase tracking-widest mb-1">WR Grupo</p>
                  <p className={`text-xl font-black ${groupStats.groupWr >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {groupStats.groupWr}%
                  </p>
                  <p className="text-[#283548] text-[11px] mt-0.5">
                    {groupStats.totalWins}V / {groupStats.totalLosses}D
                  </p>
                </div>
                {groupStats.bestWr && (
                  <div className="bg-[#0c1525] rounded-xl border border-[#111d30] p-3.5">
                    <p className="text-[#334155] text-[10px] font-bold uppercase tracking-widest mb-1">Mejor WR</p>
                    <p className="text-white text-sm font-bold truncate">{groupStats.bestWr.gameName}</p>
                    <p className="text-emerald-400 text-[11px] mt-0.5">{groupStats.bestWr.rank?.winrate}%</p>
                  </div>
                )}
                {groupStats.topChamp && (
                  <div className="bg-[#0c1525] rounded-xl border border-[#111d30] p-3.5">
                    <p className="text-[#334155] text-[10px] font-bold uppercase tracking-widest mb-1">Top Champ</p>
                    <div className="flex items-center gap-1.5">
                      {data && (
                        <img
                          src={champIconUrl(groupStats.topChamp[0], data.ddVersion)}
                          alt={groupStats.topChamp[0]}
                          width={22}
                          height={22}
                          className="w-[22px] h-[22px] rounded-md object-cover"
                          onError={(e) => { ;(e.target as HTMLImageElement).style.opacity = '0.2' }}
                        />
                      )}
                      <p className="text-white text-sm font-bold truncate">{groupStats.topChamp[0]}</p>
                    </div>
                    <p className="text-[#283548] text-[11px] mt-0.5">{groupStats.topChamp[1]} partidas</p>
                  </div>
                )}
              </div>
            )}

            {/* Form chart */}
            {chartData.length > 0 && playersWithMatches.length > 0 ? (
              <div className="bg-[#0c1525] rounded-xl border border-[#111d30] p-5">
                <h2 className="text-white text-sm font-bold tracking-widest uppercase mb-1">
                  Forma reciente
                </h2>
                <p className="text-[#334155] text-xs mb-4">
                  Últimas {chartData.length} partidas ranked · +1 victoria / −1 derrota
                </p>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {playersWithMatches.map((player, idx) => {
                    const color = CHART_COLORS[idx % CHART_COLORS.length]
                    const isActive = selectedChartPlayers === null || selectedChartPlayers.has(player.gameName)
                    return (
                      <button
                        key={player.gameName}
                        onClick={() => toggleChartPlayer(player.gameName)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all duration-150 border"
                        style={{
                          borderColor: isActive ? color + '60' : '#161e30',
                          backgroundColor: isActive ? color + '15' : 'transparent',
                          color: isActive ? color : '#334155',
                        }}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: isActive ? color : '#1e2d45' }}
                        />
                        {player.gameName}
                      </button>
                    )
                  })}
                </div>

                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <XAxis
                      dataKey="game"
                      tick={{ fill: '#1e2d45', fontSize: 10 }}
                      axisLine={{ stroke: '#111d30' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: '#1e2d45', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <ReferenceLine y={0} stroke="#1e2d45" strokeDasharray="3 3" />
                    <Tooltip
                      contentStyle={{
                        background: '#0a1020',
                        border: '1px solid #161e30',
                        borderRadius: 8,
                        fontSize: 12,
                        color: '#e2e8f0',
                      }}
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
              <p className="text-[#334155] text-sm text-center py-8">Sin datos suficientes para mostrar estadísticas.</p>
            ) : null}

            {loading && !data && (
              <div className="bg-[#0c1525] rounded-xl border border-[#111d30] h-64 animate-pulse" />
            )}
          </TabsContent>
        </Tabs>

        {/* Footer */}
        {data && (
          <p className="text-center text-[#0f172a] text-xs mt-8">
            Actualizado a las{' '}
            {new Date(data.updatedAt).toLocaleTimeString('es-ES', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </main>
  )
}
