import { NextRequest, NextResponse } from 'next/server'

// Per-player champion stats endpoint.
// Dynamic — no build-time prerender, no timeout issues.
// Each PUUID is cached independently at the CDN level for 1 hour.
export const dynamic = 'force-dynamic'

const CHAMPION_OVERRIDES: Record<string, string> = { FiddleSticks: 'Fiddlesticks' }
const fixChamp = (n: string) => CHAMPION_OVERRIDES[n] ?? n
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function riotFetch(url: string, apiKey: string, cache: number): Promise<Response | null> {
  const opts = { headers: { 'X-Riot-Token': apiKey }, next: { revalidate: cache } }
  try {
    const res = await fetch(url, opts)
    if (res.status !== 429) return res
    const wait = Math.min(parseInt(res.headers.get('Retry-After') ?? '2', 10) * 1000, 6000)
    await sleep(wait)
    return fetch(url, opts)
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no key' }, { status: 500 })

  const puuid = req.nextUrl.searchParams.get('puuid')
  if (!puuid) return NextResponse.json({ error: 'missing puuid' }, { status: 400 })

  try {
    // Fetch up to 200 match IDs (2 pages) — covers any player's full season
    const allIds: string[] = []
    for (let page = 0; page < 2; page++) {
      const url =
        `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids` +
        `?queue=420&count=100&start=${page * 100}`
      const res = await riotFetch(url, apiKey, 300)
      if (!res?.ok) break
      const batch: string[] = await res.json()
      allIds.push(...batch)
      if (batch.length < 100) break
    }

    if (!allIds.length) {
      return NextResponse.json({ topChampion: null }, {
        headers: { 'Cache-Control': 'public, s-maxage=3600' },
      })
    }

    // Fetch match details in chunks of 20 with 1.1 s gap to respect
    // Riot's dev key rate limit (20 req/s, 100 req/2 min).
    // Next.js Data Cache deduplicates across concurrent player requests
    // (friends share matches → same match ID fetched only once).
    const CHUNK = 20
    const DELAY = 1100
    const allMatches: { win: boolean; champion: string }[] = []

    for (let i = 0; i < allIds.length; i += CHUNK) {
      const chunk = allIds.slice(i, i + CHUNK)
      const results = await Promise.all(chunk.map(async (id) => {
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
      allMatches.push(...results.filter((r): r is { win: boolean; champion: string } => r !== null))
      if (i + CHUNK < allIds.length) await sleep(DELAY)
    }

    // Aggregate season champion stats
    const map: Record<string, { g: number; w: number }> = {}
    for (const m of allMatches) {
      if (!map[m.champion]) map[m.champion] = { g: 0, w: 0 }
      map[m.champion].g++
      if (m.win) map[m.champion].w++
    }

    const ranked = Object.entries(map)
      .sort((a, b) => b[1].g - a[1].g)
      .map(([champion, s]) => ({
        champion, games: s.g, wins: s.w,
        wr: Math.round((s.w / s.g) * 100),
      }))

    return NextResponse.json(
      { topChampion: ranked[0] ?? null, totalGames: allMatches.length },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' } },
    )
  } catch {
    return NextResponse.json({ topChampion: null }, { status: 500 })
  }
}
