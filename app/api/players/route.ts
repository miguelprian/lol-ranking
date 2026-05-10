import { NextResponse } from 'next/server'

// Dynamic so it can read env vars at runtime.
// Actual caching is via CDN Cache-Control headers (set on the response below):
//   s-maxage=300 → Vercel CDN caches for 5 min, shared across all users
//   stale-while-revalidate=60 → serves stale instantly while recomputing in bg
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

const TIER_ORDER = ['IRON','BRONZE','SILVER','GOLD','PLATINUM','EMERALD','DIAMOND','MASTER','GRANDMASTER','CHALLENGER']
const DIV_ORDER  = ['IV','III','II','I']

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

/** One-retry wrapper that honours Riot's Retry-After header on 429. */
async function riotFetch(url: string, apiKey: string, cacheSeconds: number): Promise<Response | null> {
  const opts = { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: cacheSeconds } }
  try {
    let res = await fetch(url, opts)
    if (res.status === 429) {
      const wait = Math.min(parseInt(res.headers.get('Retry-After') ?? '1', 10) * 1000, 5000)
      await new Promise((r) => setTimeout(r, wait))
      res = await fetch(url, opts)
    }
    return res
  } catch { return null }
}

/**
 * Fetches the last 200 ranked solo/duo match IDs (no startTime filter).
 * This covers any player's full current season regardless of when it started.
 * 2 pages × 100 = 200 max.
 */
async function getRecentMatchIds(puuid: string, apiKey: string): Promise<string[]> {
  const allIds: string[] = []

  for (let page = 0; page < 2; page++) {
    const url =
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids` +
      `?queue=420&count=100&start=${page * 100}`

    const res = await riotFetch(url, apiKey, 300)
    if (!res?.ok) break

    const ids: string[] = await res.json()
    allIds.push(...ids)
    if (ids.length < 100) break
  }

  return allIds
}

async function getMatchHistory(puuid: string, apiKey: string): Promise<{
  recentMatches: MatchResult[]
  topChampion: ChampionStat | null
}> {
  try {
    const allIds = await getRecentMatchIds(puuid, apiKey)
    if (!allIds.length) return { recentMatches: [], topChampion: null }

    // Fetch all match details in parallel (24 h Data Cache — reused across routes).
    const results = await Promise.all(
      allIds.map(async (id) => {
        try {
          const res = await riotFetch(
            `https://europe.api.riotgames.com/lol/match/v5/matches/${id}`,
            apiKey, 86400,
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

    // Season champion stats
    const map: Record<string, { g: number; w: number }> = {}
    for (const m of allMatches) {
      if (!map[m.champion]) map[m.champion] = { g: 0, w: 0 }
      map[m.champion].g++
      if (m.win) map[m.champion].w++
    }

    const topChampion =
      Object.entries(map)
        .sort((a, b) => b[1].g - a[1].g)
        .map(([champion, s]) => ({
          champion, games: s.g, wins: s.w,
          wr: Math.round((s.w / s.g) * 100),
        }))[0] ?? null

    return { recentMatches: allMatches.slice(0, 20), topChampion }
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
      riotFetch(`https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`, apiKey, 300),
      riotFetch(`https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`, apiKey, 300),
      getMatchHistory(account.puuid, apiKey),
    ])

    if (!summonerRes?.ok) return fallback('Invocador no encontrado')
    const summoner = await summonerRes.json()
    const ranked: { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }[] =
      rankedRes?.ok ? await rankedRes.json() : []
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

  const body = { players: sortPlayers(players), ddVersion, updatedAt: new Date().toISOString() }

  // Cache at Vercel CDN for 5 min, serve stale instantly while recomputing in background.
  // This means the slow computation (fetching all season matches) happens at most
  // once every 5 minutes and is shared across all users.
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60',
    },
  })
}
