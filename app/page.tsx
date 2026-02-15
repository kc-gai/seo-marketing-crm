'use client'

import { useState, useEffect, useCallback } from 'react'
import { Eye, MousePointer, Percent, Hash, Users, FileText, Target, RefreshCw, AlertCircle } from 'lucide-react'
import StatCard from '@/components/dashboard/StatCard'
import DeviceChart from '@/components/dashboard/DeviceChart'
import RegionChart from '@/components/dashboard/RegionChart'
import DateRangePicker from '@/components/dashboard/DateRangePicker'
import { useTranslation } from '@/lib/translations'

type AnalyticsData = {
  gsc: {
    impressions: number
    impressionsTrend: number
    clicks: number
    clicksTrend: number
    ctr: number
    ctrTrend: number
    position: number
    positionTrend: number
  } | null
  ga4: {
    users: number
    usersTrend: number
    pageviews: number
    pageviewsTrend: number
  } | null
  period: {
    startDate: string
    endDate: string
  }
}

export default function DashboardPage() {
  const { t, locale } = useTranslation()
  const [period, setPeriod] = useState('3m')
  const [customRange, setCustomRange] = useState<{ start: string; end: string } | null>(null)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      let url = `/api/analytics?period=${period}`
      if (customRange) {
        url = `/api/analytics?startDate=${customRange.start}&endDate=${customRange.end}`
      }

      const res = await fetch(url)
      const result = await res.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch data')
      }

      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [period, customRange])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handlePeriodChange = (newPeriod: string, range?: { start: string; end: string }) => {
    setPeriod(newPeriod)
    setCustomRange(range || null)
  }

  const formatDateRange = () => {
    if (!data?.period) return ''
    const { startDate, endDate } = data.period
    return `${startDate} ~ ${endDate}`
  }

  // Default values when data is not available
  const gsc = data?.gsc || {
    impressions: 0,
    impressionsTrend: 0,
    clicks: 0,
    clicksTrend: 0,
    ctr: 0,
    ctrTrend: 0,
    position: 0,
    positionTrend: 0,
  }

  const ga4 = data?.ga4 || {
    users: 0,
    usersTrend: 0,
    pageviews: 0,
    pageviewsTrend: 0,
  }

  const isConfigured = data?.gsc !== null || data?.ga4 !== null

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t.dashboardTitle}</h1>
          <p className="text-gray-500 mt-1">
            {data?.period ? formatDateRange() : t.dashboardSubtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DateRangePicker value={period} onChange={handlePeriodChange} />
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            title={t.update}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* API Not Configured Warning */}
      {!loading && !isConfigured && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-yellow-800">
              {locale === 'ja' ? 'Google API未設定' : 'Google API 미설정'}
            </p>
            <p className="text-sm text-yellow-700 mt-1">
              {locale === 'ja'
                ? '.envファイルにGoogle Service Account情報を設定してください。'
                : '.env 파일에 Google Service Account 정보를 설정해주세요.'}
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">
              {locale === 'ja' ? 'エラーが発生しました' : '오류가 발생했습니다'}
            </p>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* GSC Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title={t.searchExposure}
          value={loading ? '-' : gsc.impressions.toLocaleString()}
          trend={gsc.impressionsTrend}
          trendLabel={t.vsLastPeriod}
          icon={Eye}
          color="blue"
          loading={loading}
        />
        <StatCard
          title={t.clicks}
          value={loading ? '-' : gsc.clicks.toLocaleString()}
          trend={gsc.clicksTrend}
          trendLabel={t.vsLastPeriod}
          icon={MousePointer}
          color={gsc.clicksTrend < 0 ? 'orange' : 'green'}
          loading={loading}
        />
        <StatCard
          title={t.ctr}
          value={loading ? '-' : `${gsc.ctr}%`}
          trend={gsc.ctrTrend}
          trendLabel={t.vsLastPeriod}
          icon={Percent}
          color={gsc.ctrTrend < 0 ? 'red' : 'green'}
          loading={loading}
        />
        <StatCard
          title={t.avgPosition}
          value={loading ? '-' : locale === 'ja' ? `${gsc.position}位` : `${gsc.position}위`}
          trend={gsc.positionTrend}
          trendLabel={gsc.positionTrend > 0 ? t.deterioration : t.vsLastPeriod}
          icon={Hash}
          color={gsc.positionTrend > 0 ? 'orange' : 'green'}
          loading={loading}
        />
      </div>

      {/* GA4 + Strategy Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          title={t.users}
          value={loading ? '-' : ga4.users.toLocaleString()}
          trend={ga4.usersTrend}
          icon={Users}
          color="purple"
          loading={loading}
        />
        <StatCard
          title={t.pageviews}
          value={loading ? '-' : ga4.pageviews.toLocaleString()}
          trend={ga4.pageviewsTrend}
          icon={FileText}
          color="cyan"
          loading={loading}
        />
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">{t.selectedStrategy}</p>
              <p className="text-lg font-semibold text-gray-900 mt-1">A + B + AEO/GEO</p>
              <div className="flex gap-2 mt-2">
                <span className="badge badge-info">{locale === 'ja' ? 'CTR改善' : 'CTR개선'}</span>
                <span className="badge badge-success">{locale === 'ja' ? 'インバウンド' : '인바운드'}</span>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-green-50 text-success">
              <Target className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DeviceChart />
        <RegionChart />
      </div>

    </div>
  )
}
