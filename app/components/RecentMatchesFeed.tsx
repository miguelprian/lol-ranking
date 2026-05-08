'use client'

import { useEffect, useState } from 'react'

interface MatchParticipant {
  puuid: string
  displayName: string
  championName: string
  champLevel: number
  teamId: number
  kills: number
  deaths: number
  assists: number
  cs: number
  visionScore: number
  damage: number
  gold: number
  win: boolean
  items: number[]
}

interface GlobalMatch {
  matchId: string
  gameStartTimestamp: number
  gameDuration: number
  participants: MatchParticipant[]
  trackedPuuids: string[]
}

interface MatchesResponse {
  matches: GlobalMatch[]
  ddVersion: string
  trackedPlayers: Record<string, string>
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 2) return 'ahora'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

function formatDuration(s: number): string {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
}

function formatDmg(d: number): string {
  return d >= 1000 ? `${(d / 1000).toFixed(1)}k` : String(d)
}

function TeamTable({
  players,
  won,
  ddVersion,
  trackedPlayers,
}: {
  players: MatchParticipant[]
  won: boolean
  ddVersion: string
  trackedPlayers: Record<string, string>
}) {
  const teamKills = players.reduce((s, p) => s + p.kills, 0)
  const maxDmg = Math.max(...players.map((p) => p.damage))

  return (
    <div
      className={`rounded-lg overflow-hidden border ${
        won ? 'border-blue-900/40' : 'border-red-900/30'
      }`}
    >
      <div
        className={`px-3 py-1.5 flex items-center justify-between text-xs font-bold uppercase tracking-wider ${
          won ? 'bg-blue-950/40 text-blue-300' : 'bg-red-950/30 text-red-400'
        }`}
      >
        <span>{won ? '🔵 Equipo Azul' : '🔴 Equipo Rojo'}</span>
        <span className="font-normal text-[#475569]">{teamKills} kills · {won ? 'VICTORIA' : 'DERROTA'}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[480px]">
          <thead>
            <tr className="text-[#334155] border-b border-[#0c1525]">
              <th className="text-left px-2 py-1 font-medium w-[165px]">Jugador</th>
              <th className="text-center px-2 py-1 font-medium">KDA</th>
              <th className="text-center px-2 py-1 font-medium">CS</th>
              <th className="text-center px-2 py-1 font-medium w-[60px]">Daño</th>
              <th className="text-center px-2 py-1 font-medium">👁</th>
              <th className="text-left px-2 py-1 font-medium">Objetos</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const isTracked = !!trackedPlayers[p.puuid]
              const dmgPct = maxDmg > 0 ? (p.damage / maxDmg) * 100 : 0
              const kda = p.deaths === 0 ? '∞' : ((p.kills + p.assists) / p.deaths).toFixed(1)

              return (
                <tr
                  key={p.puuid}
                  className={`border-b border-[#0a1020] last:border-0 ${
                    isTracked ? 'bg-[#0f1e35]' : ''
                  }`}
                >
                  {/* Champion + name */}
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="relative shrink-0">
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${p.championName}.png`}
                          alt={p.championName}
                          width={26}
                          height={26}
                          className="w-[26px] h-[26px] rounded object-cover"
                          onError={(e) => {
                            ;(e.target as HTMLImageElement).style.opacity = '0.2'
                          }}
                        />
                        <span className="absolute -bottom-1 -right-1 text-[8px] bg-black/80 text-[#94a3b8] px-[2px] rounded-sm leading-none">
                          {p.champLevel}
                        </span>
                      </div>
                      <span
                        className={`truncate max-w-[110px] ${
                          isTracked ? 'text-[#93c5fd] font-semibold' : 'text-[#4a5568]'
                        }`}
                      >
                        {isTracked
                          ? trackedPlayers[p.puuid]
                          : p.displayName.split('#')[0]}
                      </span>
                    </div>
                  </td>

                  {/* KDA */}
                  <td className="px-2 py-1.5 text-center">
                    <div>
                      <span className="text-green-400/80">{p.kills}</span>
                      <span className="text-[#1e2d45]">/</span>
                      <span className="text-red-400/80">{p.deaths}</span>
                      <span className="text-[#1e2d45]">/</span>
                      <span className="text-[#64748b]">{p.assists}</span>
                    </div>
                    <div className="text-[#334155] text-[10px]">{kda} KDA</div>
                  </td>

                  {/* CS */}
                  <td className="px-2 py-1.5 text-center text-[#4a5568]">{p.cs}</td>

                  {/* Damage with mini bar */}
                  <td className="px-2 py-1.5 text-center">
                    <div className="text-[#64748b]">{formatDmg(p.damage)}</div>
                    <div className="w-full bg-[#0a1020] rounded-full h-1 mt-0.5">
                      <div
                        className={`h-1 rounded-full ${won ? 'bg-blue-600/60' : 'bg-red-700/60'}`}
                        style={{ width: `${dmgPct}%` }}
                      />
                    </div>
                  </td>

                  {/* Vision */}
                  <td className="px-2 py-1.5 text-center text-[#4a5568]">{p.visionScore}</td>

                  {/* Items */}
                  <td className="px-2 py-1.5">
                    <div className="flex gap-0.5 flex-wrap">
                      {p.items.map((itemId, idx) =>
                        itemId > 0 ? (
                          <img
                            key={idx}
                            src={`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/item/${itemId}.png`}
                            alt=""
                            width={18}
                            height={18}
                            className="w-[18px] h-[18px] rounded object-cover"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).style.opacity = '0.2'
                            }}
                          />
                        ) : (
                          <div
                            key={idx}
                            className="w-[18px] h-[18px] rounded bg-[#0a1020] border border-[#0f1525]"
                          />
                        )
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function MatchCard({
  match,
  ddVersion,
  trackedPlayers,
}: {
  match: GlobalMatch
  ddVersion: string
  trackedPlayers: Record<string, string>
}) {
  const [expanded, setExpanded] = useState(false)

  const blue = match.participants.filter((p) => p.teamId === 100)
  const red = match.participants.filter((p) => p.teamId === 200)
  const blueWon = blue[0]?.win ?? false
  const blueKills = blue.reduce((s, p) => s + p.kills, 0)
  const redKills = red.reduce((s, p) => s + p.kills, 0)
  const trackedInMatch = match.participants.filter((p) => trackedPlayers[p.puuid])

  // Win/loss desde la perspectiva del grupo
  const groupWon = trackedInMatch.length > 0 ? trackedInMatch[0].win : blueWon

  return (
    <div
      className={`bg-[#0c1525] rounded-xl overflow-hidden border transition-colors
        ${groupWon
          ? 'border-blue-900/50 border-l-[3px] border-l-blue-500/70 hover:border-blue-800/60'
          : 'border-red-900/40 border-l-[3px] border-l-red-600/60 hover:border-red-800/50'
        }`}
    >
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3 hover:bg-[#0f1e35] transition-colors"
      >
        {/* Meta row: badge V/D + info */}
        <div className="flex items-center gap-2 mb-3">
          <span
            className={`text-[11px] font-black px-2 py-0.5 rounded tracking-wider ${
              groupWon
                ? 'bg-blue-600/20 text-blue-300 border border-blue-600/30'
                : 'bg-red-700/20 text-red-400 border border-red-700/30'
            }`}
          >
            {groupWon ? 'VICTORIA' : 'DERROTA'}
          </span>
          <span className="text-[#334155] text-xs">{formatDuration(match.gameDuration)}</span>
          <span className="text-[#1e2d45] text-xs">·</span>
          <span className="text-[#283548] text-xs">hace {timeAgo(match.gameStartTimestamp)}</span>
          <span className="ml-auto text-[#1e2d45] text-xs select-none">
            {expanded ? '▲' : '▼'}
          </span>
        </div>

        {/* Tracked players — protagonistas de la card */}
        {trackedInMatch.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-3">
            {trackedInMatch.map((p) => (
              <div key={p.puuid} className="flex items-center gap-2">
                <div className="relative shrink-0">
                  <img
                    src={`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${p.championName}.png`}
                    alt={p.championName}
                    width={36}
                    height={36}
                    className={`w-9 h-9 rounded-lg object-cover border-2 ${
                      p.win ? 'border-blue-500/70' : 'border-red-600/60'
                    }`}
                    onError={(e) => {
                      ;(e.target as HTMLImageElement).style.opacity = '0.2'
                    }}
                  />
                  <span className="absolute -bottom-1 -right-1 text-[8px] bg-black/80 text-[#94a3b8] px-[3px] py-[1px] rounded-sm leading-none">
                    {p.champLevel}
                  </span>
                </div>
                <div className="leading-tight">
                  <div className={`text-sm font-bold ${p.win ? 'text-blue-200' : 'text-red-300'}`}>
                    {trackedPlayers[p.puuid]}
                  </div>
                  <div className="text-[11px] text-[#475569]">
                    <span className="text-green-400/80">{p.kills}</span>
                    <span className="text-[#283548]">/</span>
                    <span className="text-red-400/80">{p.deaths}</span>
                    <span className="text-[#283548]">/</span>
                    <span className="text-[#64748b]">{p.assists}</span>
                    <span className="text-[#334155] ml-1.5">{p.championName}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 5v5 grid + marcador (contexto secundario) */}
        <div className="flex items-center gap-2">
          <div className={`flex gap-0.5 ${blueWon ? '' : 'opacity-35'}`}>
            {blue.map((p) => (
              <div key={p.puuid} className="relative">
                <img
                  src={`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${p.championName}.png`}
                  alt={p.championName}
                  title={trackedPlayers[p.puuid] ?? p.championName}
                  width={24}
                  height={24}
                  className={`w-6 h-6 rounded object-cover border ${
                    trackedPlayers[p.puuid] ? 'border-[#4f46e5]/70' : 'border-[#111d30]'
                  }`}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.opacity = '0.2'
                  }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 px-1.5">
            <span className={`text-sm font-black tabular-nums ${blueWon ? 'text-blue-400' : 'text-[#283548]'}`}>
              {blueKills}
            </span>
            <span className="text-[#1e2d45] text-xs">—</span>
            <span className={`text-sm font-black tabular-nums ${!blueWon ? 'text-red-400' : 'text-[#283548]'}`}>
              {redKills}
            </span>
          </div>

          <div className={`flex gap-0.5 ${!blueWon ? '' : 'opacity-35'}`}>
            {red.map((p) => (
              <div key={p.puuid} className="relative">
                <img
                  src={`https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/champion/${p.championName}.png`}
                  alt={p.championName}
                  title={trackedPlayers[p.puuid] ?? p.championName}
                  width={24}
                  height={24}
                  className={`w-6 h-6 rounded object-cover border ${
                    trackedPlayers[p.puuid] ? 'border-[#4f46e5]/70' : 'border-[#111d30]'
                  }`}
                  onError={(e) => {
                    ;(e.target as HTMLImageElement).style.opacity = '0.2'
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 space-y-2 border-t border-[#0f1525]">
          <TeamTable
            players={blue}
            won={blueWon}
            ddVersion={ddVersion}
            trackedPlayers={trackedPlayers}
          />
          <TeamTable
            players={red}
            won={!blueWon}
            ddVersion={ddVersion}
            trackedPlayers={trackedPlayers}
          />
        </div>
      )}
    </div>
  )
}

export function RecentMatchesFeed() {
  const [data, setData] = useState<MatchesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/api/matches')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false))

    const id = setInterval(() => {
      fetch('/api/matches')
        .then((r) => r.json())
        .then(setData)
        .catch(() => {})
    }, 300_000)

    return () => clearInterval(id)
  }, [])

  return (
    <section className="mt-8">
      <h2 className="text-white text-sm font-bold tracking-widest uppercase mb-1">
        Historial Reciente
      </h2>
      <p className="text-[#334155] text-xs mb-4">
        Últimas 20 partidas ranked del grupo
      </p>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-[#0c1525] rounded-xl border border-[#111d30] h-[88px] animate-pulse"
            />
          ))}
        </div>
      ) : error ? (
        <p className="text-red-400/60 text-sm text-center py-4">
          No se pudo cargar el historial.
        </p>
      ) : !data?.matches.length ? (
        <p className="text-[#334155] text-sm text-center py-4">Sin partidas recientes.</p>
      ) : (
        <div className="space-y-2">
          {data.matches.map((match) => (
            <MatchCard
              key={match.matchId}
              match={match}
              ddVersion={data.ddVersion}
              trackedPlayers={data.trackedPlayers}
            />
          ))}
        </div>
      )}
    </section>
  )
}
