import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'UNEMPLOYED RANKING',
  description: 'Ranking de Solo/Duo Queue del grupo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
