import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Six43',
  description: 'Baseball lineup manager',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
} 
