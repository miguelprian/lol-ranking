import { NextResponse } from 'next/server'

// Dynamic: runs at request time so RIOT_API_KEY is available.
// Individual fetches use Next.js Data Cache (300s for rank/account,
// 86400s for match details) so repeated requests are fast.
export const dynamic = 'force-dynamic'

interface PlayerInput { gameName: string; tagLine: string }

interface RankData {
  tier: string; division: string; lp: number
  wins: number; losses: number; winrate: number
}
interface MatchResult { win: boolean; champion: string }

interface PlayerResult {
  puuid: string
  gameName: string; tagLine: string
  profileIconId: number; summonerLevel: number
  rank: RankData | null
  recentMatches: MatchResult[] | null
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
const CHAMPION_OVERRIDES: Record<string, string> = { FiddleSticks: 'Fiddlesticks' }
const fixChamp = (n: string) => CHAMPION_OVERRIDES[n] ?? n

async function getDDragonVersion(): Promise<string> {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', { next: { revalidate: 86400 } })
    return ((await res.json()) as string[])[0]
  } catch { return '15.8.1' }
}

async function riotFetch(url: string, apiKey: string, cache: number): Promise<Response | null> {
  const opts = { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: cache } }
  try {
    const res = await fetch(url, opts)
    if (res.status !== 429) return res
    const wait = Math.min(parseInt(res.headers.get('Retry-After') ?? '2', 10) * 1000, 5000)
    await new Promise((r) => setTimeout(r, wait))
    return fetch(url, opts)
  } catch { return null }
}

/** Fetch the last 20 ranked match results (champion + win) for the icons row. */
async function getRecentMatches(puuid: string, apiKey: string): Promise<MatchResult[]> {
  try {
    const idsRes = await riotFetch(
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=20`,
      apiKey, 300,
    )
    if (!idsRes?.ok) return []
    const ids: string[] = await idsRes.json()

    const results = await Promise.all(ids.map(async (id) => {
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
    }))

    return results.filter((r): r is MatchResult => r !== null)
  } catch { return [] }
}

async function getPlayerData(player: PlayerInput, apiKey: string): Promise<PlayerResult> {
  const { gameName, tagLine } = player
  const fallback = (error: string): PlayerResult => ({
    puuid: '', gameName, tagLine, profileIconId: 29, summonerLevel: 0,
    rank: null, recentMatches: null, error,
  })

  try {
    const accountRes = await riotFetch(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/` +
      `${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      apiKey, 300,
    )
    if (!accountRes?.ok) return fallback('Cuenta no encontrada')
    const account = await accountRes.json()

    const [summonerRes, rankedRes, recentMatches] = await Promise.all([
      riotFetch(`https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`, apiKey, 300),
      riotFetch(`https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`, apiKey, 300),
      getRecentMatches(account.puuid, apiKey),
    ])

    if (!summonerRes?.ok) return fallback('Invocador no encontrado')
    const summoner = await summonerRes.json()
    const ranked: { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }[] =
      rankedRes?.ok ? await rankedRes.json() : []
    const solo = ranked.find((e) => e.queueType === 'RANKED_SOLO_5x5')

    return {
      puuid: account.puuid as string,
      gameName, tagLine,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      rank: solo ? {
        tier: solo.tier, division: solo.rank, lp: solo.leaguePoints,
        wins: solo.wins, losses: solo.losses,
        winrate: Math.round((solo.wins / (solo.wins + solo.losses)) * 100),
      } : null,
      recentMatches,
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

  return NextResponse.json({ players: sortPlayers(players), ddVersion, updatedAt: new Date().toISOString() })
}
