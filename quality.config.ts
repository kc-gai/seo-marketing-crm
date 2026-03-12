const qualityConfig = {
  projectName: 'seo-marketing-crm',
  testRunner: 'none' as const,
  coverageThreshold: 0,
  hasPrisma: true,
  hasI18n: true,
  i18nLocales: ['ja', 'ko', 'en'],
  hasAPI: true,
  hasAuth: false,
  slop: {
    disablePatterns: [],
    warningAsError: [],
    excludePaths: ['scripts/', 'prisma/'],
  },
  gate: {
    failOnWarning: false,
    changedOnly: false,
  },
}

export default qualityConfig
