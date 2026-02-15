import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/layout/Sidebar'
import Header from '@/components/layout/Header'
import { TranslationProvider } from '@/lib/translations'

export const metadata: Metadata = {
  title: 'SEO Marketing CRM - KAFLIX CLOUD',
  description: 'SEO分析・戦略・KPI管理ダッシュボード',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-bg-surface">
        <TranslationProvider>
          <div className="flex h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
              <Header />
              <main className="flex-1 overflow-auto p-6">
                {children}
              </main>
            </div>
          </div>
        </TranslationProvider>
      </body>
    </html>
  )
}
