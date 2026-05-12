import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 3600

async function getDDVersion(): Promise<string> {
  try {
    const res = await fetch('https://ddragon.leagueoflegends.com/api/versions.json', { next: { revalidate: 86400 } })
    return ((await res.json()) as string[])[0]
  } catch { return '15.8.1' }
}

async function getChampionIdMap(version: string): Promise<Record<string, string>> {
  try {
    const res = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
      { next: { revalidate: 86400 } },
    )
    if (!res.ok) return {}
    const data = await res.json()
    const map: Record<string, string> = {}
    for (const [name, info] of Object.entries(data.data as Record<string, { key: string }>)) {
      map[info.key] = name
    }
    return map
  } catch { return {} }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ puuid: string }> },
) {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const { puuid } = await params

  try {
    const [version, masteryRes] = await Promise.all([
      getDDVersion(),
      fetch(
        `https://euw1.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/top?count=1`,
        { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: 3600 } },
      ),
    ])

    if (!masteryRes.ok) return NextResponse.json({ topChampion: null })

    const [mastery] = await masteryRes.json() as {
      championId: number
      championLevel: number
      championPoints: number
    }[]

    if (!mastery) return NextResponse.json({ topChampion: null })

    const idMap = await getChampionIdMap(version)
    const champion = idMap[String(mastery.championId)] ?? `Champion${mastery.championId}`

    return NextResponse.json({
      topChampion: {
        champion,
        masteryLevel: mastery.championLevel,
        masteryPoints: mastery.championPoints,
      },
    })
  } catch {
    return NextResponse.json({ topChampion: null }, { status: 500 })
  }
}
