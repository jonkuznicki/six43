import type { Metadata } from 'next'
import './globals.css'
import ThemeProvider from './ThemeProvider'
import BottomNav from './BottomNav'

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
      {/* Anti-FOUC: apply stored theme before first paint */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          try {
            var t = localStorage.getItem('six43-theme') || 'dark';
            document.documentElement.setAttribute('data-theme', t);
          } catch(e) {}
        `}} />
      </head>
      <body style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
        <ThemeProvider>
          {children}
          <BottomNav />
        </ThemeProvider>
      </body>
    </html>
  )
}
