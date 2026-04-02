import type { Metadata } from 'next'
import './globals.css'
import ThemeProvider from './ThemeProvider'
import BottomNav from './BottomNav'
import AppHeader from './AppHeader'
import InstallPrompt from './InstallPrompt'

export const metadata: Metadata = {
  title: 'Six43 — Youth Baseball Lineup Manager',
  description: 'Build fair lineups and track playing time for every kid on your roster. Six43 is the lineup management app built for youth baseball coaches.',
  manifest: '/manifest.json',
  icons: {
    icon: '/favicon.png',
    apple: '/icons/icon-192.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Six43',
  },
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
        <meta name="theme-color" content="#0B1F3A" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
        <ThemeProvider>
          <AppHeader />
          {children}
          <BottomNav />
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  )
}
