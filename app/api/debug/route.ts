import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no key' }, { status: 500 })
  const puuid = req.nextUrl.searchParams.get('puuid') ?? ''
  const h = { 'X-Riot-Token': apiKey }
  const base = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`

  // Count total q420 games by paginating until empty
  let total = 0
  const pageSizes: number[] = []
  for (let p = 0; p < 10; p++) {
    const r = await fetch(`${base}?queue=420&count=100&start=${p * 100}`, { headers: h })
    if (!r.ok) break
    const ids: string[] = await r.json()
    pageSizes.push(ids.length)
    total += ids.length
    if (ids.length < 100) break
  }

  // Get timestamp of match at position 0, 100, 200 to find season boundary
  const checkPositions = [0, 100, 200, 300]
  const timestamps: Record<number, string> = {}
  for (const pos of checkPositions) {
    const r = await fetch(`${base}?queue=420&count=1&start=${pos}`, { headers: h })
    if (!r.ok) break
    const ids: string[] = await r.json()
    if (!ids.length) break
    const matchRes = await fetch(
      `https://europe.api.riotgames.com/lol/match/v5/matches/${ids[0]}`,
      { headers: h }
    )
    if (!matchRes.ok) break
    const match = await matchRes.json()
    const ts = match.info.gameStartTimestamp as number
    timestamps[pos] = new Date(ts).toISOString().slice(0, 10)
  }

  return NextResponse.json({ total, pageSizes, dateAtPosition: timestamps })
}
