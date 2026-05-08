import { NextResponse } from 'next/server'

interface PlayerInput {
  gameName: string
  tagLine: string
}

interface RankData {
  tier: string
  division: string
  lp: number
  wins: number
  losses: number
  winrate: number
}

interface PlayerResult {
  gameName: string
  tagLine: string
  profileIconId: number
  summonerLevel: number
  rank: RankData | null
  recentMatches: boolean[] | null
  error: string | null
}

const PLAYERS: PlayerInput[] = [
  { gameName: 'Sμgμrμ', tagLine: 'EUW' },
  { gameName: 'CØJØNES CØLGØNES', tagLine: 'LEWI' },
  { gameName: 'pelicanoguarro', tagLine: 'XCAX' },
  { gameName: 'EL BICHARRACO', tagLine: 'CR7' },
  { gameName: 'EL PELUCA', tagLine: '232' },
  { gameName: 'QUE СОМА РΕLО', tagLine: 'LEWI' },
]

const TIER_ORDER = [
  'IRON', 'BRONZE', 'SILVER', 'GOLD', 'PLATINUM',
  'EMERALD', 'DIAMOND', 'MASTER', 'GRANDMASTER', 'CHALLENGER',
]
const DIV_ORDER = ['IV', 'III', 'II', 'I']

async function getDDragonVersion(): Promise<string> {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', {
      next: { revalidate: 86400 },
    })
    const versions: string[] = await res.json()
    return versions[0]
  } catch {
    return '15.8.1'
  }
}

async function getMatchHistory(puuid: string, apiKey: string): Promise<boolean[]> {
  try {
    const idsRes = await fetch(
      `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=20`,
      { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }
    )
    if (!idsRes.ok) return []
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
          const participant = match.info.participants.find((p: any) => p.puuid === puuid)
          return participant?.win ?? null
        } catch {
          return null
        }
      })
    )

    return results.filter((r): r is boolean => r !== null)
  } catch {
    return []
  }
}

async function getPlayerData(player: PlayerInput, apiKey: string): Promise<PlayerResult> {
  const { gameName, tagLine } = player
  const fallback = (error: string): PlayerResult => ({
    gameName, tagLine, profileIconId: 29, summonerLevel: 0, rank: null, recentMatches: null, error,
  })

  try {
    const accountRes = await fetch(
      `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
      { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }
    )
    if (!accountRes.ok) return fallback('Cuenta no encontrada')
    const account = await accountRes.json()

    const [summonerRes, rankedRes, recentMatches] = await Promise.all([
      fetch(
        `https://euw1.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`,
        { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }
      ),
      fetch(
        `https://euw1.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
        { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }
      ),
      getMatchHistory(account.puuid, apiKey),
    ])

    if (!summonerRes.ok) return fallback('Invocador no encontrado')
    const summoner = await summonerRes.json()

    const ranked: any[] = rankedRes.ok ? await rankedRes.json() : []
    const solo = ranked.find((e) => e.queueType === 'RANKED_SOLO_5x5')

    return {
      gameName,
      tagLine,
      profileIconId: summoner.profileIconId,
      summonerLevel: summoner.summonerLevel,
      rank: solo
        ? {
            tier: solo.tier,
            division: solo.rank,
            lp: solo.leaguePoints,
            wins: solo.wins,
            losses: solo.losses,
            winrate: Math.round((solo.wins / (solo.wins + solo.losses)) * 100),
          }
        : null,
      recentMatches,
      error: null,
    }
  } catch {
    return fallback('Error de conexión')
  }
}

function sortPlayers(players: PlayerResult[]): PlayerResult[] {
  return [...players].sort((a, b) => {
    if (!a.rank && !b.rank) return 0
    if (!a.rank) return 1
    if (!b.rank) return -1

    const aTier = TIER_ORDER.indexOf(a.rank.tier)
    const bTier = TIER_ORDER.indexOf(b.rank.tier)
    if (aTier !== bTier) return bTier - aTier

    const aDiv = DIV_ORDER.indexOf(a.rank.division)
    const bDiv = DIV_ORDER.indexOf(b.rank.division)
    if (aDiv !== bDiv) return bDiv - aDiv

    return b.rank.lp - a.rank.lp
  })
}

export async function GET() {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RIOT_API_KEY no configurada' }, { status: 500 })
  }

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
