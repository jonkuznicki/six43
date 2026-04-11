import type { Metadata } from 'next'
import './globals.css'
import ThemeProvider from './ThemeProvider'
import BottomNav from './BottomNav'
import AppHeader from './AppHeader'
import Sidebar from './Sidebar'
import InstallPrompt from './InstallPrompt'

export const metadata: Metadata = {
  title: 'Six43 — Youth Baseball Lineup Manager',
  description: 'Build fair lineups and track playing time for every kid on your roster. Six43 is the lineup management app built for youth baseball and softball coaches.',
  keywords: ['youth baseball lineup manager', 'baseball lineup app', 'travel baseball lineup', 'little league lineup app', 'youth softball lineup manager', 'baseball lineup maker', 'pitch count tracker'],
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/icons/six43-favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icons/six43-favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/six43-favicon-64x64.png', sizes: '64x64', type: 'image/png' },
    ],
    apple: '/icons/six43-favicon-128x128.png',
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
          <Sidebar />
          <AppHeader />
          <div className="app-content">
            {children}
          </div>
          <BottomNav />
          <InstallPrompt />
        </ThemeProvider>
      </body>
    </html>
  )
}
