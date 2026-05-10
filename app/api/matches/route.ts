import { NextResponse } from 'next/server'

interface PlayerInput {
  gameName: string
  tagLine: string
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

export async function GET() {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'RIOT_API_KEY no configurada' }, { status: 500 })
  }

  const [ddVersion, playerAccounts] = await Promise.all([
    getDDragonVersion(),
    Promise.all(
      PLAYERS.map(async ({ gameName, tagLine }) => {
        try {
          const res = await fetch(
            `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
            { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }
          )
          if (!res.ok) return null
          const account = await res.json()
          return { gameName, puuid: account.puuid as string }
        } catch {
          return null
        }
      })
    ),
  ])

  const validAccounts = playerAccounts.filter(
    (a): a is { gameName: string; puuid: string } => a !== null
  )
  const trackedPlayers = Object.fromEntries(validAccounts.map((a) => [a.puuid, a.gameName]))

  const matchLists = await Promise.all(
    validAccounts.map(async ({ puuid }) => {
      try {
        const res = await fetch(
          `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=420&count=20`,
          { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 300 } }
        )
        if (!res.ok) return [] as string[]
        return (await res.json()) as string[]
      } catch {
        return [] as string[]
      }
    })
  )

  const uniqueMatchIds = Array.from(new Set(matchLists.flat()))

  const matchDetails = await Promise.all(
    uniqueMatchIds.map(async (matchId) => {
      try {
        const res = await fetch(
          `https://europe.api.riotgames.com/lol/match/v5/matches/${matchId}`,
          { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 86400 } }
        )
        if (!res.ok) return null
        return await res.json()
      } catch {
        return null
      }
    })
  )

  const CHAMPION_NAME_OVERRIDES: Record<string, string> = {
    FiddleSticks: 'Fiddlesticks',
  }
  const normalizeChampion = (name: string) => CHAMPION_NAME_OVERRIDES[name] ?? name

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matches = matchDetails
    .filter((m): m is NonNullable<typeof m> => m !== null)
    .sort((a, b) => b.info.gameStartTimestamp - a.info.gameStartTimestamp)
    .slice(0, 20)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((m: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const participants = m.info.participants.map((p: any) => ({
        puuid: p.puuid as string,
        displayName: p.riotIdGameName
          ? `${p.riotIdGameName}#${p.riotIdTagline}`
          : (p.summonerName as string),
        championName: normalizeChampion(p.championName as string),
        champLevel: p.champLevel as number,
        teamId: p.teamId as number,
        kills: p.kills as number,
        deaths: p.deaths as number,
        assists: p.assists as number,
        cs: (p.totalMinionsKilled + p.neutralMinionsKilled) as number,
        visionScore: p.visionScore as number,
        damage: p.totalDamageDealtToChampions as number,
        gold: p.goldEarned as number,
        win: p.win as boolean,
        items: [p.item0, p.item1, p.item2, p.item3, p.item4, p.item5, p.item6] as number[],
      }))

      const trackedPuuids = participants
        .filter((p: { puuid: string }) => trackedPlayers[p.puuid])
        .map((p: { puuid: string }) => p.puuid)

      return {
        matchId: m.metadata.matchId as string,
        gameStartTimestamp: m.info.gameStartTimestamp as number,
        gameDuration: m.info.gameDuration as number,
        participants,
        trackedPuuids,
      }
    })

  return NextResponse.json({ matches, ddVersion, trackedPlayers })
}
