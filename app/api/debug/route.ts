import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const apiKey = process.env.RIOT_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'no key' }, { status: 500 })
  const puuid = req.nextUrl.searchParams.get('puuid') ?? ''

  const base = `https://europe.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids`
  const h = { 'X-Riot-Token': apiKey }

  const [all, q420, q440, typeRanked] = await Promise.all([
    fetch(`${base}?count=100&start=0`, { headers: h }).then(r => r.json()),
    fetch(`${base}?queue=420&count=100&start=0`, { headers: h }).then(r => r.json()),
    fetch(`${base}?queue=440&count=100&start=0`, { headers: h }).then(r => r.json()),
    fetch(`${base}?type=ranked&count=100&start=0`, { headers: h }).then(r => r.json()),
  ])

  // Also get page 2 for queue=420
  const q420p2 = await fetch(`${base}?queue=420&count=100&start=100`, { headers: h }).then(r => r.json())
  // And page 3
  const q420p3 = await fetch(`${base}?queue=420&count=100&start=200`, { headers: h }).then(r => r.json())
  // type=ranked page 2
  const typeRankedP2 = await fetch(`${base}?type=ranked&count=100&start=100`, { headers: h }).then(r => r.json())

  return NextResponse.json({
    all_page1: Array.isArray(all) ? all.length : all,
    q420_page1: Array.isArray(q420) ? q420.length : q420,
    q420_page2: Array.isArray(q420p2) ? q420p2.length : q420p2,
    q420_page3: Array.isArray(q420p3) ? q420p3.length : q420p3,
    q440_page1: Array.isArray(q440) ? q440.length : q440,
    type_ranked_page1: Array.isArray(typeRanked) ? typeRanked.length : typeRanked,
    type_ranked_page2: Array.isArray(typeRankedP2) ? typeRankedP2.length : typeRankedP2,
  })
}
