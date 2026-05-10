import { NextResponse } from 'next/server'

interface PlayerInput { gameName: string; tagLine: string }

interface RankData {
  tier: string; division: string; lp: number
  wins: number; losses: number; winrate: number
}

interface MatchResult { win: boolean; champion: string }

export interface ChampionStat { champion: string; games: number; wins: number; wr: number }

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
const DIV_ORDER = ['IV','III','II','I']
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

async function getMatchHistory(puuid: string, apiKey: string): Promise<{
  recentMatches: MatchResult[]
  topChampion: ChampionStat | null
}> {
  try {
    // Fetch last 50 ranked solo/duo matches for season-level champion stats
    const idsRes = await fetch(
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=50`,
      { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }
    )
    if (!idsRes.ok) return { recentMatches: [], topChampion: null }
    const matchIds: string[] = await idsRes.json()

    const results = await Promise.all(
      matchIds.map(async (matchId) => {
        try {
          const matchRes = await fetch(
            `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`,
            { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 86400 } }
          )
          if (!matchRes.ok) return null
          const match = await matchRes.json()
          const p = match.info.participants.find((x: { puuid: string }) => x.puuid === puuid)
          if (!p) return null
          return { win: p.win as boolean, champion: fixChamp(p.championName as string) }
        } catch { return null }
      })
    )

    const allMatches = results.filter((r): r is MatchResult => r !== null)

    // Compute per-champion stats across all fetched matches (season coverage)
    const champMap: Record<string, { games: number; wins: number }> = {}
    for (const m of allMatches) {
      if (!champMap[m.champion]) champMap[m.champion] = { games: 0, wins: 0 }
      champMap[m.champion].games++
      if (m.win) champMap[m.champion].wins++
    }

    const topChampion = Object.entries(champMap)
      .sort((a, b) => b[1].games - a[1].games)
      .map(([champion, s]) => ({
        champion, games: s.games, wins: s.wins,
        wr: Math.round((s.wins / s.games) * 100),
      }))[0] ?? null

    return {
      recentMatches: allMatches.slice(0, 20),
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
    const accountRes = await fetch(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }
    )
    if (!accountRes.ok) return fallback('Cuenta no encontrada')
    const account = await accountRes.json()

    const [summonerRes, rankedRes, matchData] = await Promise.all([
      fetch(`https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`,
        { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }),
      fetch(`https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
        { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }),
      getMatchHistory(account.puuid, apiKey),
    ])

    if (!summonerRes.ok) return fallback('Invocador no encontrado')
    const summoner = await summonerRes.json()
    const ranked: { queueType: string; tier: string; rank: string; leaguePoints: number; wins: number; losses: number }[] =
      rankedRes.ok ? await rankedRes.json() : []
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
  if (!apiKey) return NextResponse.json({ error: 'RIOT_API_KEY no configurada' }, { status: 500 })

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
