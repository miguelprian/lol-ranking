import { NextResponse } from 'next/server'

// Dynamic route — compute fresh on every request.
// Individual Riot API fetches are cached by Next.js Data Cache:
//   - match IDs: 5 min (revalidate: 300)
//   - match details: 24 h (revalidate: 86400)
// So cold loads are slow once, then fast.
export const dynamic = 'force-dynamic'

interface PlayerInput { gameName: string; tagLine: string }

interface RankData {
  tier: string; division: string; lp: number
  wins: number; losses: number; winrate: number
}

interface MatchResult { win: boolean; champion: string }

export interface ChampionStat {
  champion: string; games: number; wins: number; wr: number
}

interface PlayerResult {
  gameName: string; tagLine: string
  profileIconId: number; summonerLevel: number
  rank: RankData | null
  recentMatches: MatchResult[] | null
  topChampion: ChampionStat | null
  error: string | null
}

const PLAYERS: PlayerInput[] = [
  { gameName: 'Sμgμrμ', tagLine: 'EUW' },
  { gameName: 'CØJØNES CØLGØNES', tagLine: 'LEWI' },
  { gameName: 'pelicanoguarro', tagLine: 'XCAX' },
  { gameName: 'EL BICHARRACO', tagLine: 'CR7' },
  { gameName: 'EL PELUCA', tagLine: '232' },
  { gameName: 'QUE СОМА РΕLО', tagLine: 'LEWI' },
  { gameName: 'rësılıencë', tagLine: 'EUW' },
]

const TIER_ORDER  = ['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER']
const DIV_ORDER   = ['IV','III','II','I']

// Season 2025 (Split 1) start — 9 Jan 2025 00:00:00 UTC
const SEASON_2025_START = 1736380800

const CHAMPION_OVERRIDES: Record<string, string> = { FiddleSticks: 'Fiddlesticks' }
const fixChamp = (name: string) => CHAMPION_OVERRIDES[name] ?? name

async function getDDragonVersion(): Promise<string> {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      next: { revalidate: 86400 },
    })
    const versions: string[] = await res.json()
    return versions[0]
  } catch { return '15.8.1' }
}

/** Riot returns 429 when rate-limited.  Retry once after the indicated delay. */
async function riotFetch(url: string, apiKey: string, cacheSeconds: number): Promise<Response | null> {
  const opts = {
    headers: { 'X-Riot-Token': apiKey },
    next: { revalidate: cacheSeconds },
  }
  try {
    const res = await fetch(url, opts)
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') ?? '1', 10) * 1000
      await new Promise((r) => setTimeout(r, Math.min(wait, 5000)))
      return fetch(url, opts)
    }
    return res
  } catch { return null }
}

/**
 * Fetches ALL ranked solo/duo match IDs since Season 2025 start.
 * Paginates 100 at a time, max 700 games.
 */
async function getAllSeasonMatchIds(puuid: string, apiKey: string): Promise<string[]> {
  const allIds: string[] = []
  const PAGE_SIZE = 100
  const MAX_PAGES = 7 // up to 700 games

  for (let page = 0; page < MAX_PAGES; page++) {
    const url =
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids` +
      `?queue=420&count=${PAGE_SIZE}&start=${page * PAGE_SIZE}&startTime=${SEASON_2025_START}`

    const res = await riotFetch(url, apiKey, 300)
    if (!res?.ok) break

    const ids: string[] = await res.json()
    allIds.push(...ids)
    if (ids.length < PAGE_SIZE) break // last page
  }

  return allIds
}

async function getMatchHistory(puuid: string, apiKey: string): Promise<{
  recentMatches: MatchResult[]
  topChampion: ChampionStat | null
}> {
  try {
    const allIds = await getAllSeasonMatchIds(puuid, apiKey)
    if (!allIds.length) return { recentMatches: [], topChampion: null }

    // Fetch all match details (24h cache — shared across players and routes)
    const results = await Promise.all(
      allIds.map(async (matchId) => {
        try {
          const res = await riotFetch(
            `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`,
            apiKey,
            86400,
          )
          if (!res?.ok) return null
          const match = await res.json()
          const p = match.info.participants.find((x: { puuid: string }) => x.puuid === puuid)
          if (!p) return null
          return { win: p.win as boolean, champion: fixChamp(p.championName as string) }
        } catch { return null }
      })
    )

    const allMatches = results.filter((r): r is MatchResult => r !== null)

    // Compute per-champion stats across the full season
    const champMap: Record<string, { games: number; wins: number }> = {}
    for (const m of allMatches) {
      if (!champMap[m.champion]) champMap[m.champion] = { games: 0, wins: 0 }
      champMap[m.champion].games++
      if (m.win) champMap[m.champion].wins++
    }

    const topChampion =
      Object.entries(champMap)
        .sort((a, b) => b[1].games - a[1].games)
        .map(([champion, s]) => ({
          champion, games: s.games, wins: s.wins,
          wr: Math.round((s.wins / s.games) * 100),
        }))[0] ?? null

    return {
      recentMatches: allMatches.slice(0, 20), // last 20 for the icons row
      topChampion,
    }
  } catch { return { recentMatches: [], topChampion: null } }
}

async function getPlayerData(player: PlayerInput, apiKey: string): Promise<PlayerResult> {
  const { gameName, tagLine } = player
  const fallback = (error: string): PlayerResult => ({
    gameName, tagLine, profileIconId: 29, summonerLevel: 0,
    rank: null, recentMatches: null, topChampion: null, error,
  })

  try {
    const accountRes = await riotFetch(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      apiKey, 300,
    )
    if (!accountRes?.ok) return fallback('Cuenta no encontrada')
    const account = await accountRes.json()

    const [summonerRes, rankedRes, matchData] = await Promise.all([
      riotFetch(
        `https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`,
        apiKey, 300,
      ),
      riotFetch(
        `https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
        apiKey, 300,
      ),
      getMatchHistory(account.puuid, apiKey),
    ])

    if (!summonerRes?.ok) return fallback('Invocador no encontrado')
    const summoner = await summonerRes.json()
    const ranked: {
      queueType: string; tier: string; rank: string
      leaguePoints: number; wins: number; losses: number
    }[] = rankedRes?.ok ? await rankedRes.json() : []
    const solo = ranked.find((e) => e.queueType === 'RANKED_SOLO_5x5')

    return {
      gameName, tagLine,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      rank: solo ? {
        tier: solo.tier, division: solo.rank, lp: solo.leaguePoints,
        wins: solo.wins, losses: solo.losses,
        winrate: Math.round((solo.wins / (solo.wins + solo.losses)) * 100),
      } : null,
      recentMatches: matchData.recentMatches,
      topChampion: matchData.topChampion,
      error: null,
    }
  } catch { return fallback('Error de conexión') }
}

function sortPlayers(players: PlayerResult[]): PlayerResult[] {
  return [...players].sort((a, b) => {
    if (!a.rank && !b.rank) return 0
    if (!a.rank) return 1
    if (!b.rank) return -1
    const ta = TIER_ORDER.indexOf(a.rank.tier), tb = TIER_ORDER.indexOf(b.rank.tier)
    if (ta !== tb) return tb - ta
    const da = DIV_ORDER.indexOf(a.rank.division), db = DIV_ORDER.indexOf(b.rank.division)
    if (da !== db) return db - da
    return b.rank.lp - a.rank.lp
  })
}

export async function GET() {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey)
    return NextResponse.json({ error: 'RIOT_API_KEY no configurada' }, { status: 500 })

  const [players, ddVersion] = await Promise.all([
    Promise.all(PLAYERS.map((p) => getPlayerData(p, apiKey))),
    getDDragonVersion(),
  ])

  return NextResponse.json({
    players: sortPlayers(players),
    ddVersion,
    updatedAt: new Date().toISOString(),
  })
}
