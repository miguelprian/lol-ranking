import type { Metadata } from 'next'
import './globals.css'
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: 'UNEMPLOYED RANKING',
  description: 'Ranking de Solo/Duo Queue del grupo',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={cn("dark font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  )
}
