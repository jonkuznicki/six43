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
  alternates: {
    canonical: 'https://six43.com',
  },
  openGraph: {
    type: 'website',
    url: 'https://six43.com',
    siteName: 'Six43',
    title: 'Six43 — Youth Baseball Lineup Manager',
    description: 'Build fair lineups and track playing time for every kid on your roster. The lineup management app built for youth baseball and softball coaches.',
    images: [
      {
        url: 'https://six43.com/screenshot-lineup.png',
        width: 1200,
        height: 630,
        alt: 'Six43 lineup builder showing position assignments by inning',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Six43 — Youth Baseball Lineup Manager',
    description: 'Build fair lineups and track playing time for every kid on your roster.',
    images: ['https://six43.com/screenshot-lineup.png'],
  },
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'Six43',
            url: 'https://six43.com',
            applicationCategory: 'SportsApplication',
            operatingSystem: 'Web, iOS, Android',
            offers: {
              '@type': 'Offer',
              price: '0',
              priceCurrency: 'USD',
              description: 'Free to use. Pro plan available.',
            },
            description: 'Youth baseball and softball lineup management app. Build fair lineups, track playing time by position, manage pitching, and sync your schedule from GameChanger.',
            screenshot: 'https://six43.com/screenshot-lineup.png',
            featureList: [
              'Inning-by-inning lineup builder',
              'Playing time tracking by position',
              'Bench fairness analysis',
              'GameChanger schedule sync',
              'Pitching log and innings limits',
              'Player evaluations and notes',
              'Staff coach sharing with permissions',
              'Printable lineup cards and exchange card',
            ],
          }) }}
        />
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
