'use client'

import { useEffect, useState, useCallback } from 'react'

interface RankData {
  tier: string
  division: string
  lp: number
  wins: number
  losses: number
  winrate: number
}

interface Player {
  gameName: string
  tagLine: string
  profileIconId: number
  summonerLevel: number
  rank: RankData | null
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

const APEX_TIERS = new Set(['MASTER', 'GRANDMASTER', 'CHALLENGER'])

function getRankLabel(rank: RankData): string {
  if (APEX_TIERS.has(rank.tier)) return rank.tier
  return `${rank.tier} ${rank.division}`
}

function getPositionColor(index: number): string {
  if (index === 0) return '#f59e0b'
  if (index === 1) return '#94a3b8'
  if (index === 2) return '#cd7f32'
  return '#334155'
}

function getCardStyle(index: number): React.CSSProperties {
  if (index === 0) {
    return {
      borderColor: 'rgba(245, 158, 11, 0.2)',
      boxShadow: '0 0 24px rgba(245, 158, 11, 0.06)',
    }
  }
  return {}
}

export default function Home() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(300)

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

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchData()
          return 300
        }
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

  return (
    <main className="min-h-screen bg-[#060d1a] py-10 px-4">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-2xl font-black text-white tracking-widest uppercase">
            EUW Gang Ranking
          </h1>
          <p className="text-[#334155] text-xs mt-1 tracking-widest uppercase">
            Solo / Duo Queue
          </p>
          <div className="flex items-center justify-center gap-4 mt-3">
            {data && (
              <span className="text-[#1e293b] text-xs">
                Actualiza en {formatCountdown(countdown)}
              </span>
            )}
            <button
              onClick={fetchData}
              disabled={loading}
              className="text-xs text-[#4f46e5] hover:text-[#818cf8] disabled:opacity-40 transition-colors font-medium"
            >
              {loading ? 'Cargando...' : '↻ Actualizar ahora'}
            </button>
          </div>
        </header>

        {/* Error */}
        {fetchError && (
          <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4 mb-5 text-red-400 text-sm text-center">
            {fetchError}
          </div>
        )}

        {/* Cards */}
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
                    </div>
                    <div className="w-14 h-7 bg-[#161e30] rounded-lg" />
                  </div>
                </div>
              ))
            : data?.players.map((player, i) => (
                <div
                  key={`${player.gameName}#${player.tagLine}`}
                  className="bg-[#0c1525] rounded-xl px-4 py-3.5 border border-[#111d30] hover:border-[#1a2a40] transition-all duration-200"
                  style={getCardStyle(i)}
                >
                  <div className="flex items-center gap-3.5">

                    {/* Position */}
                    <div className="w-6 text-right shrink-0">
                      <span
                        className="text-base font-black"
                        style={{ color: getPositionColor(i) }}
                      >
                        {i + 1}
                      </span>
                    </div>

                    {/* Profile icon */}
                    <div className="relative shrink-0">
                      <img
                        src={iconUrl(player.profileIconId, data.ddVersion)}
                        alt="icon"
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-full border-2 border-[#161e30]"
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
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[#e2e8f0] font-semibold text-sm truncate">
                          {player.gameName}
                        </span>
                        <span className="text-[#1e2d45] text-xs shrink-0">
                          #{player.tagLine}
                        </span>
                      </div>

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
              ))}
        </div>

        {/* Footer */}
        {data && (
          <p className="text-center text-[#0f172a] text-xs mt-6">
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
