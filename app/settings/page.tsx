'use client'

import { useState, useEffect } from 'react'
import { Save, ExternalLink, Database, Link2, Calendar, Bell, Mail, FileText, ChevronDown, Info } from 'lucide-react'
import { useTranslation } from '@/lib/translations'
import { TEMPLATE_VARIABLES } from '@/lib/email-constants'

type EmailSettingsData = {
  id?: string
  senderEmail: string
  senderName: string
  dailyLimit: number
  intervalSeconds: number
  batchSize: number
  batchIntervalMin: number
  followUpDays: number
}

type EmailTemplateData = {
  id?: string
  name: string
  contactRound: number
  subject: string
  bodyHtml: string
  bodyText: string
  isActive: boolean
}

export default function SettingsPage() {
  const { t, locale } = useTranslation()
  const [lookerGA4, setLookerGA4] = useState(
    'https://lookerstudio.google.com/embed/reporting/109d0457-5196-442d-a5d2-6f2d00cf09a3/page/oPpTF'
  )
  const [lookerGSC, setLookerGSC] = useState(
    'https://lookerstudio.google.com/embed/reporting/c55f978e-b76b-4165-872a-605bec263e41/page/OScFF'
  )

  // Email Settings State
  const [emailSettings, setEmailSettings] = useState<EmailSettingsData>({
    senderEmail: 'sales@kaflixcloud.co.jp',
    senderName: 'KAFLIX CLOUD 営業部',
    dailyLimit: 50,
    intervalSeconds: 30,
    batchSize: 10,
    batchIntervalMin: 5,
    followUpDays: 7,
  })
  const [emailSettingsSaving, setEmailSettingsSaving] = useState(false)
  const [emailSettingsSaved, setEmailSettingsSaved] = useState(false)

  // Template State
  const [templates, setTemplates] = useState<EmailTemplateData[]>([])
  const [activeTemplateRound, setActiveTemplateRound] = useState(1)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)

  // Load email settings
  useEffect(() => {
    fetch('/api/email-settings')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          setEmailSettings(result.data)
        }
      })
      .catch(console.error)

    fetch('/api/email-templates')
      .then(res => res.json())
      .then(result => {
        if (result.success && result.data) {
          setTemplates(result.data)
        }
      })
      .catch(console.error)
  }, [])

  // Save email settings
  const saveEmailSettings = async () => {
    setEmailSettingsSaving(true)
    try {
      const res = await fetch('/api/email-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emailSettings),
      })
      const result = await res.json()
      if (result.success) {
        setEmailSettingsSaved(true)
        setTimeout(() => setEmailSettingsSaved(false), 2000)
      }
    } catch (error) {
      console.error('Failed to save email settings:', error)
    } finally {
      setEmailSettingsSaving(false)
    }
  }

  // Get/Create template for a round
  const getTemplateForRound = (round: number): EmailTemplateData => {
    const existing = templates.find(t => t.contactRound === round)
    if (existing) return existing
    const roundLabels: { [key: number]: { ja: string; ko: string } } = {
      1: { ja: '初回ご連絡', ko: '첫 번째 연락' },
      2: { ja: '2回目ご連絡', ko: '두 번째 연락' },
      3: { ja: '3回目ご連絡', ko: '세 번째 연락' },
      4: { ja: '4回目ご連絡', ko: '네 번째 연락' },
      5: { ja: '5回目以上ご連絡', ko: '다섯 번째 이상 연락' },
    }
    return {
      name: roundLabels[round]?.ja || `${round}回目`,
      contactRound: round,
      subject: `【KAFLIX CLOUD】{{会社名}} 様へのご案内（${round}回目）`,
      bodyText: `{{会社名}} 御中\n\nお世話になっております。\nKAFLIX CLOUDの{{送信者名}}です。\n\nレンタカー管理システム「REborn」のご案内をさせていただいております。\n\n何かご不明な点がございましたら、お気軽にご連絡ください。\n\nよろしくお願いいたします。`,
      bodyHtml: '',
      isActive: true,
    }
  }

  // Save template
  const saveTemplate = async (round: number) => {
    setTemplateSaving(true)
    const template = getTemplateForRound(round)
    try {
      const res = await fetch('/api/email-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...template,
          bodyHtml: template.bodyHtml || `<div>${template.bodyText.replace(/\n/g, '<br>')}</div>`,
        }),
      })
      const result = await res.json()
      if (result.success) {
        // Update templates list
        setTemplates(prev => {
          const filtered = prev.filter(t => t.contactRound !== round)
          return [...filtered, result.data].sort((a, b) => a.contactRound - b.contactRound)
        })
        setTemplateSaved(true)
        setTimeout(() => setTemplateSaved(false), 2000)
      }
    } catch (error) {
      console.error('Failed to save template:', error)
    } finally {
      setTemplateSaving(false)
    }
  }

  // Update template in local state
  const updateTemplate = (round: number, field: keyof EmailTemplateData, value: string | boolean) => {
    setTemplates(prev => {
      const existing = prev.find(t => t.contactRound === round)
      if (existing) {
        return prev.map(t => t.contactRound === round ? { ...t, [field]: value } : t)
      }
      const newTemplate = getTemplateForRound(round)
      return [...prev, { ...newTemplate, [field]: value }]
    })
  }

  const roundLabels = [
    { round: 1, label: locale === 'ja' ? '1回目' : '1회차' },
    { round: 2, label: locale === 'ja' ? '2回目' : '2회차' },
    { round: 3, label: locale === 'ja' ? '3回目' : '3회차' },
    { round: 4, label: locale === 'ja' ? '4回目' : '4회차' },
    { round: 5, label: locale === 'ja' ? '5回目+' : '5회차+' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">⚙️ {t.settingsTitle}</h1>
        <p className="text-gray-500 mt-1">{t.settingsSubtitle}</p>
      </div>

      {/* Looker Studio Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            {t.lookerStudioUrl}
          </h3>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t.ga4ReportUrl}
            </label>
            <input
              type="url"
              value={lookerGA4}
              onChange={(e) => setLookerGA4(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="https://lookerstudio.google.com/embed/..."
            />
            <p className="text-xs text-gray-500 mt-1">
              {t.lookerHint}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t.gscReportUrl}
            </label>
            <input
              type="url"
              value={lookerGSC}
              onChange={(e) => setLookerGSC(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              placeholder="https://lookerstudio.google.com/embed/..."
            />
          </div>
          <div className="pt-4">
            <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
              <Save className="w-4 h-4" />
              {t.save}
            </button>
          </div>
        </div>
      </div>

      {/* Analysis Period */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            {t.periodSettings}
          </h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.startDate}
              </label>
              <input
                type="date"
                defaultValue="2025-11-01"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.endDate}
              </label>
              <input
                type="date"
                defaultValue="2026-02-02"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Bell className="w-5 h-5" />
            {t.notificationSettings}
          </h3>
        </div>
        <div className="card-body space-y-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 text-primary" defaultChecked />
            <span className="text-sm text-gray-700">{t.weeklyReminder}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 text-primary" defaultChecked />
            <span className="text-sm text-gray-700">{t.monthlyReminder}</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 text-primary" />
            <span className="text-sm text-gray-700">{t.taskReminder}</span>
          </label>
        </div>
      </div>

      {/* Email Settings */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Mail className="w-5 h-5" />
            {t.emailSettings}
          </h3>
        </div>
        <div className="card-body space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.senderEmail}</label>
              <input
                type="email"
                value={emailSettings.senderEmail}
                onChange={e => setEmailSettings(s => ({ ...s, senderEmail: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t.senderName}</label>
              <input
                type="text"
                value={emailSettings.senderName}
                onChange={e => setEmailSettings(s => ({ ...s, senderName: e.target.value }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.dailyLimitLabel} ({t.emails})
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={emailSettings.dailyLimit}
                onChange={e => setEmailSettings(s => ({ ...s, dailyLimit: parseInt(e.target.value) || 50 }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.sendInterval} ({t.seconds})
              </label>
              <input
                type="number"
                min={10}
                max={120}
                value={emailSettings.intervalSeconds}
                onChange={e => setEmailSettings(s => ({ ...s, intervalSeconds: parseInt(e.target.value) || 30 }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.followUpDays} ({locale === 'ja' ? '日' : '일'})
              </label>
              <input
                type="number"
                min={1}
                max={90}
                value={emailSettings.followUpDays}
                onChange={e => setEmailSettings(s => ({ ...s, followUpDays: parseInt(e.target.value) || 7 }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.batchSize} ({t.emails})
              </label>
              <input
                type="number"
                min={1}
                max={50}
                value={emailSettings.batchSize}
                onChange={e => setEmailSettings(s => ({ ...s, batchSize: parseInt(e.target.value) || 10 }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t.batchInterval} ({t.minutes})
              </label>
              <input
                type="number"
                min={1}
                max={30}
                value={emailSettings.batchIntervalMin}
                onChange={e => setEmailSettings(s => ({ ...s, batchIntervalMin: parseInt(e.target.value) || 5 }))}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              {locale === 'ja'
                ? `スパム防止: ${emailSettings.batchSize}通ごとに${emailSettings.batchIntervalMin}分間隔、メール間${emailSettings.intervalSeconds}秒のランダム遅延`
                : `스팸 방지: ${emailSettings.batchSize}통마다 ${emailSettings.batchIntervalMin}분 간격, 메일 간 ${emailSettings.intervalSeconds}초 랜덤 딜레이`}
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={saveEmailSettings}
              disabled={emailSettingsSaving}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {emailSettingsSaved ? t.saved : t.save}
            </button>
          </div>
        </div>
      </div>

      {/* Email Templates */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {t.templateSettings}
          </h3>
        </div>
        <div className="card-body space-y-4">
          {/* Round Tabs */}
          <div className="flex gap-1 border-b border-gray-200">
            {roundLabels.map(({ round, label }) => {
              const hasTemplate = templates.some(t => t.contactRound === round)
              return (
                <button
                  key={round}
                  onClick={() => setActiveTemplateRound(round)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTemplateRound === round
                      ? 'border-primary text-primary'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {label}
                  {hasTemplate && <span className="ml-1 w-1.5 h-1.5 bg-green-500 rounded-full inline-block" />}
                </button>
              )
            })}
          </div>

          {/* Template Editor */}
          {(() => {
            const template = getTemplateForRound(activeTemplateRound)
            return (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t.mailSubject}</label>
                  <input
                    type="text"
                    value={template.subject}
                    onChange={e => updateTemplate(activeTemplateRound, 'subject', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">{t.mailBody}</label>
                  <textarea
                    value={template.bodyText}
                    onChange={e => updateTemplate(activeTemplateRound, 'bodyText', e.target.value)}
                    rows={10}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm"
                  />
                </div>
                {/* Variable Guide */}
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">{t.variableGuide}</p>
                  <div className="flex flex-wrap gap-2">
                    {TEMPLATE_VARIABLES.map(v => (
                      <button
                        key={v.key}
                        onClick={() => {
                          const currentBody = template.bodyText
                          updateTemplate(activeTemplateRound, 'bodyText', currentBody + v.key)
                        }}
                        className="px-2 py-1 text-xs bg-gray-100 border border-gray-200 rounded hover:bg-gray-200 transition-colors"
                        title={locale === 'ja' ? v.description : v.descriptionKo}
                      >
                        {v.key}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => saveTemplate(activeTemplateRound)}
                    disabled={templateSaving}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {templateSaved ? t.saved : t.save}
                  </button>
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={template.isActive}
                      onChange={e => updateTemplate(activeTemplateRound, 'isActive', e.target.checked)}
                      className="w-4 h-4 text-primary"
                    />
                    {locale === 'ja' ? '有効' : '활성화'}
                  </label>
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Database */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title flex items-center gap-2">
            <Database className="w-5 h-5" />
            {t.database}
          </h3>
        </div>
        <div className="card-body">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">SQLite Database</p>
              <p className="text-sm text-gray-500">{t.localFile}: prisma/dev.db</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                {t.backup}
              </button>
              <button className="px-3 py-1.5 text-sm bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                {t.reset}
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            {locale === 'ja' ? 'データベース管理' : '데이터베이스 관리'}: <code className="bg-gray-100 px-1 rounded">npm run db:studio</code>
          </p>
        </div>
      </div>

      {/* Links */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t.quickLinks}</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-2 gap-4">
            <a
              href="https://lookerstudio.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>Looker Studio</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>
            <a
              href="https://search.google.com/search-console"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>Search Console</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>
            <a
              href="https://analytics.google.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>Google Analytics</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>
            <a
              href="https://perplexity.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <span>Perplexity AI</span>
              <ExternalLink className="w-4 h-4 text-gray-400" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
