# 신규 리드 소스 자동화 설계서

> 작성일: 2026-04-09
> 대상: kiosk-crm lead-scraper 확장
> 목적: 4개 신규 리드 소스를 기존 Cron 파이프라인에 자동 통합

---

## 0. 현재 아키텍처 요약

```
[Cron: lead-scraper]  매일 실행
       │
       ▼
runScraper({ prefectures: [3개씩 로테이션], sources: [...] })
       │
       ├── scrapeWebSearch()        → ScrapedLead[]
       ├── scrapeHomemate()         → ScrapedLead[]
       ├── scrapeITownPage()        → ScrapedLead[]
       ├── scrapeGooTownpage()      → ScrapedLead[]
       ├── scrapeIndeedJobs()       → ScrapedLead[] (현재 무효: 이메일 없음)
       └── scrapeKyujinBox()        → ScrapedLead[] (현재 무효: 이메일 없음)
       │
       ▼
deduplicateLeads() → 정규화된 회사명+현으로 중복 제거
       │
       ▼
DB 저장 (email 있으면 즉시 '未交渉', 없으면 enrichment 대기)
       │
       ▼
[Cron: lead-enrichment]  → 웹사이트 방문해서 이메일 추출

공통 인터페이스:
type ScrapedLead = {
  companyName: string
  prefecture: string
  phone?: string
  email?: string
  address?: string
  websiteUrl?: string
  contactUrl?: string
  source: string           // 'scraper:[소스명]'
  sourceDetail?: string    // 쿼리/URL 추적
}
```

**핵심: 새 소스도 `ScrapedLead[]`를 반환하면 기존 파이프라인(중복제거→저장→enrichment)에 자동 합류한다.**

---

## 1. Google Maps Places API 소스

### 왜 효과적인가
- 47현 × "レンタカー" 검색 → **실제 영업중인 업체만** 나옴 (폐업 업체 제외)
- 웹사이트 URL, 전화번호, 주소, 리뷰수, 영업시간이 구조화된 데이터로 제공
- 리뷰수 = 사업 규모의 프록시 (리드 스코어링에 활용)

### 기술 구현

```
googleapis (v169.0.0) 이미 설치됨
Google Service Account 이미 설정됨
→ Places API (New) 활성화 + API Key만 추가하면 됨
```

#### API 호출 구조

```typescript
// lib/lead-scraper.ts에 추가

async function scrapeGoogleMaps(
  prefecture: string, 
  maxResults: number
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  
  // Places API (New) - Text Search
  // POST https://places.googleapis.com/v1/places:searchText
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': [
        'places.displayName',
        'places.formattedAddress', 
        'places.nationalPhoneNumber',
        'places.websiteUri',
        'places.userRatingCount',    // 리뷰수 → 규모 추정
        'places.rating',
        'places.businessStatus',     // OPERATIONAL만 필터
        'places.types',
      ].join(',')
    },
    body: JSON.stringify({
      textQuery: `${prefectureShortName(prefecture)} レンタカー`,
      languageCode: 'ja',
      maxResultCount: maxResults,
      // 영업중인 곳만
    })
  })
  
  for (const place of response.places) {
    if (place.businessStatus !== 'OPERATIONAL') continue
    
    const name = place.displayName?.text
    if (!name || !isValidCompanyName(name)) continue
    
    leads.push({
      companyName: name,
      prefecture,
      phone: place.nationalPhoneNumber,
      address: place.formattedAddress,
      websiteUrl: place.websiteUri,        // ← enrichment에서 이메일 추출
      source: 'scraper:google-maps',
      sourceDetail: `${prefecture} rating:${place.rating} reviews:${place.userRatingCount}`,
    })
  }
  
  return leads
}
```

#### 리드 스코어 보너스

```typescript
// 리뷰수 기반 규모 추정 → leadScore에 반영
// sourceDetail에 reviews:N 포함 → AI SDR 스코어링에서 파싱
//
// reviews >= 100  → +15점 (대형 업체, 높은 가치)
// reviews >= 30   → +10점 (중형 업체)
// reviews >= 10   → +5점  (소형 업체)
// reviews < 10    → +0점  (신규/영세)
```

#### 비용 추정

```
Places API (New) Text Search:
- $32 / 1,000 요청 (Basic 필드)
- 47현 × 1요청 = 47요청/사이클 ≈ $1.50/사이클
- 월 2사이클 = $3/월 (매우 저렴)
```

#### Cron 통합

```typescript
// runScraper() 내부에 추가
if (sources.includes('google-maps')) {
  const mapsLeads = await scrapeGoogleMaps(prefecture, maxPerSource)
  allLeads.push(...mapsLeads)
  methodologyLog.perSourceCounts['google-maps'] = mapsLeads.length
}
```

---

## 2. 렌터카 협회/공공 DB 소스

### 대상 소스

| 소스 | URL | 데이터 |
|------|-----|--------|
| **全国レンタカー協会** | www.rentacar.or.jp | 회원 업체 목록, 지역별 |
| **国土交通省 レンタカー事業者** | 국토교통성 허가 업체 공개 목록 | 법인명, 주소, 허가번호 |
| **法人番号公表サイト** | houjin-bangou.nta.go.jp | "レンタカー" 포함 법인 검색 |

### 기술 구현

```typescript
// 협회 회원 스크래핑
async function scrapeRentacarAssociation(
  prefecture: string,
  maxResults: number
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  const slug = PREFECTURE_SLUG[prefecture]
  
  // 전국레ンタ카ー협회 지역별 회원 목록
  const url = `https://www.rentacar.or.jp/member/${slug}/`
  const html = await politeFetch(url)
  if (!html) return leads
  
  const $ = cheerio.load(html)
  
  // 회원 업체 정보 추출
  $('.member-item, .company-item, tr').each((_, el) => {
    if (leads.length >= maxResults) return
    
    const name = $(el).find('.company-name, td:first-child').text().trim()
    if (!name || !isValidCompanyName(name)) return
    
    const phone = $(el).find('.phone, td:nth-child(3)').text().trim()
    const address = $(el).find('.address, td:nth-child(2)').text().trim()
    const website = $(el).find('a[href^="http"]').attr('href')
    
    leads.push({
      companyName: name,
      prefecture,
      phone: phone || undefined,
      address: address || undefined,
      websiteUrl: website || undefined,
      source: 'scraper:association',
      sourceDetail: 'rentacar-association',
    })
  })
  
  return leads
}

// 국세청 법인번호 검색
async function scrapeHoujinBangou(
  prefecture: string,
  maxResults: number
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  
  // 법인번호 공표 API (무료)
  // https://www.houjin-bangou.nta.go.jp/webapi/
  const prefCode = PREFECTURE_CODE[prefecture]
  const url = `https://api.houjin-bangou.nta.go.jp/4/name?id=${API_APP_ID}` +
    `&name=レンタカー&type=02&mode=2&target=1` +
    `&address=${prefCode}&kind=&change=0&close=0` +  // close=0: 폐업 제외
    `&from=&to=&divide=1&history=0`
  
  const response = await fetch(url)
  const data = await response.json()
  
  for (const corp of data.corporation || []) {
    if (leads.length >= maxResults) return leads
    
    const name = corp.name
    if (!isValidCompanyName(name)) continue
    
    leads.push({
      companyName: name,
      prefecture,
      address: corp.prefectureName + corp.cityName + corp.streetNumber,
      source: 'scraper:houjin-db',
      sourceDetail: `法人番号:${corp.corporateNumber}`,
    })
  }
  
  return leads
}
```

### 특징
- **협회 회원 = 신뢰도 높은 리드** (영업중인 정규 업체)
- **법인번호 DB = 공식 데이터** (close=0으로 폐업 업체 제외)
- 법인번호 API는 **무료** (사전 등록만 필요)
- 두 소스 모두 이메일이 없으므로 → enrichment 파이프라인에서 웹사이트 방문 후 이메일 추출

---

## 3. OTA 등록 업체 소스

### 접근 전략

OTA 사이트(じゃらん, 楽天トラベル 등)를 직접 스크래핑하면 이용약관 위반 + 반복적 UI 변경으로 불안정하다.

**대안: OTA 검색 결과를 DuckDuckGo를 통해 간접 수집**

```typescript
async function scrapeOtaListedCompanies(
  prefecture: string,
  maxResults: number
): Promise<ScrapedLead[]> {
  // OTA에 등록된 레ンタ카 업체를 검색엔진으로 발견
  const otaQueries = [
    `site:jalan.net ${prefectureShortName(prefecture)} レンタカー 店舗`,
    `site:travel.rakuten.co.jp ${prefectureShortName(prefecture)} レンタカー`,
    `${prefectureShortName(prefecture)} レンタカー OTA 予約`,
    `${prefectureShortName(prefecture)} レンタカー Booking.com`,
  ]
  
  const leads: ScrapedLead[] = []
  
  for (const query of otaQueries) {
    if (leads.length >= maxResults) break
    
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const html = await politeFetch(searchUrl)
    if (!html) continue
    
    // 검색 결과에서 OTA 페이지의 업체명 추출
    const $ = cheerio.load(html)
    $('a.result__a').each((_, el) => {
      const title = $(el).text()
      const href = $(el).attr('href') || ''
      
      // OTA 페이지 타이틀에서 업체명 추출
      // 예: "○○レンタカー - じゃらんレンタカー" → "○○レンタカー"
      const companyName = extractCompanyFromOtaTitle(title)
      if (!companyName || !isValidCompanyName(companyName)) return
      
      leads.push({
        companyName,
        prefecture,
        source: 'scraper:ota-discovery',
        sourceDetail: query,
        // websiteUrl은 없음 → enrichment Phase B에서 "회사명 공식" 검색
      })
    })
    
    await sleep(1500) // 검색엔진 예의
  }
  
  return leads
}

function extractCompanyFromOtaTitle(title: string): string | null {
  // "○○レンタカー｜じゃらんレンタカー" → "○○レンタカー"
  // "○○レンタカー - 楽天トラベル" → "○○レンタカー"
  const cleaned = title
    .replace(/[|｜\-ー–—].*(じゃらん|楽天|Booking|トリップ|skyticket).*/i, '')
    .replace(/(の予約|の料金|のクチコミ|の口コミ|の評判).*$/, '')
    .trim()
  
  return cleaned.length >= 2 ? cleaned : null
}
```

### 가치
- **OTA에 등록 = 온라인 예약 시스템을 이미 사용 중** → DX 관심도 높음
- OTA 수수료 부담 → 자체 시스템 도입 동기 강함
- "OTA 수수료 절감" 메시지로 콜드 이메일 개인화 가능

---

## 4. 구인사이트 확장 — "채용 = 확장" 시그널

### 현재 문제

Indeed/求人ボックス가 **이메일 없이 회사명만 추출**해서 사실상 무효 처리됨.

### 해결: 구인 → 회사 공식사이트 → 이메일 추출 파이프라인

```typescript
async function scrapeHiringSignals(
  prefecture: string,
  maxResults: number
): Promise<ScrapedLead[]> {
  const leads: ScrapedLead[] = []
  const seen = new Set<string>()
  
  // 확장 시그널 쿼리 (기존 6개 → 15개+)
  const hiringQueries = [
    // 채용 = 사업 확장 시그널
    `${prefectureShortName(prefecture)} レンタカー 店長 採用`,
    `${prefectureShortName(prefecture)} レンタカー 正社員 募集`,
    `${prefectureShortName(prefecture)} レンタカー オープニング`,  // 신규 오픈
    `${prefectureShortName(prefecture)} レンタカー 急募`,          // 긴급 채용
    `${prefectureShortName(prefecture)} レンタカー 複数名`,        // 다수 채용
    // 규모 확장 시그널
    `${prefectureShortName(prefecture)} レンタカー 新店舗`,        // 신규 점포
    `${prefectureShortName(prefecture)} レンタカー 事業拡大`,      // 사업 확대
    `${prefectureShortName(prefecture)} レンタカー フランチャイズ 募集`,
  ]
  
  for (const query of hiringQueries) {
    if (leads.length >= maxResults) break
    
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const html = await politeFetch(searchUrl)
    if (!html) continue
    
    const $ = cheerio.load(html)
    const urls = extractDuckDuckGoUrls(html)
    
    for (const url of urls.slice(0, 4)) {
      if (leads.length >= maxResults) break
      
      // 구인 사이트 URL → 회사명 추출
      const pageHtml = await politeFetch(url)
      if (!pageHtml) continue
      
      const companyName = extractCompanyNameFromTitle(pageHtml)
      if (!companyName || !isValidCompanyName(companyName)) continue
      if (seen.has(normalizeCompanyName(companyName))) continue
      seen.add(normalizeCompanyName(companyName))
      
      // 확장 시그널 감지
      const signals = detectExpansionSignals(pageHtml, query)
      
      // 회사 공식 사이트 찾기 (enrichment 대신 즉시)
      const officialSite = await findOfficialSite(companyName, prefecture)
      let email: string | undefined
      
      if (officialSite) {
        const contact = await extractEmailFromSite(officialSite)
        email = contact.email
      }
      
      leads.push({
        companyName,
        prefecture,
        email,
        websiteUrl: officialSite || undefined,
        source: 'scraper:hiring-signal',
        sourceDetail: JSON.stringify({
          query,
          signals,               // ['신규오픈', '다수채용', '사업확대']
          signalStrength: signals.length,  // 시그널 강도
        }),
      })
    }
    
    await sleep(1500)
  }
  
  return leads
}
```

### 확장 시그널 감지 함수

```typescript
function detectExpansionSignals(html: string, query: string): string[] {
  const signals: string[] = []
  const text = cheerio.load(html).text()
  
  // 신규 오픈 시그널
  if (/新(規)?オープン|新店舗|OPEN|グランドオープン/.test(text)) {
    signals.push('NEW_STORE')
  }
  
  // 다수 채용 시그널 (= 사업 규모 확대)
  if (/複数(名)?募集|大量募集|10名以上|急募/.test(text)) {
    signals.push('MASS_HIRING')
  }
  
  // 사업 확대 시그널
  if (/事業拡大|業績好調|増車|車両増加|台数増/.test(text)) {
    signals.push('BUSINESS_EXPANSION')
  }
  
  // 관리직 채용 (= 조직 성장)
  if (/店長|マネージャー|管理者|幹部/.test(text)) {
    signals.push('MANAGER_HIRING')
  }
  
  // 프랜차이즈 모집 (= 가맹점 확대)
  if (/フランチャイズ|FC(募集|加盟)|加盟店/.test(text)) {
    signals.push('FRANCHISE_EXPANSION')
  }
  
  // IT/DX 관련 키워드 (= 시스템 도입 관심)
  if (/DX|IT化|システム導入|業務効率|デジタル/.test(text)) {
    signals.push('DX_INTEREST')
  }
  
  // 인바운드 대응 (= 키오스크 수요)
  if (/インバウンド|多言語|外国人|訪日|国際/.test(text)) {
    signals.push('INBOUND_DEMAND')
  }
  
  return signals
}
```

### 시그널 기반 리드 스코어 보너스

```typescript
// lib/ai-sdr/lead-scoring.ts 확장

function getSignalBonus(sourceDetail: string): number {
  try {
    const data = JSON.parse(sourceDetail)
    if (!data.signals) return 0
    
    let bonus = 0
    const signals: string[] = data.signals
    
    if (signals.includes('NEW_STORE'))           bonus += 15  // 신규 오픈 → 시스템 필요
    if (signals.includes('BUSINESS_EXPANSION'))   bonus += 12  // 사업 확대 → 투자 여력
    if (signals.includes('DX_INTEREST'))          bonus += 15  // DX 관심 → 직접적 니즈
    if (signals.includes('INBOUND_DEMAND'))       bonus += 15  // 인바운드 → 키오스크 필요
    if (signals.includes('FRANCHISE_EXPANSION'))  bonus += 10  // FC 확장 → 대량 도입
    if (signals.includes('MASS_HIRING'))          bonus += 8   // 대량 채용 → 성장 기업
    if (signals.includes('MANAGER_HIRING'))       bonus += 5   // 관리직 → 조직 성장
    
    return Math.min(bonus, 30) // 최대 30점 보너스 (기존 100점 + 30 = 130점 만점)
  } catch {
    return 0
  }
}
```

### AI 이메일 개인화에 시그널 활용

```typescript
// lib/ai-sdr/email-generation.ts 확장
// 프롬프트에 시그널 정보 추가

const signalContext = signals.includes('NEW_STORE')
  ? '新店舗のオープンおめでとうございます。新規出店に際して...'
  : signals.includes('INBOUND_DEMAND')
  ? 'インバウンド対応でお忙しい中...'
  : signals.includes('BUSINESS_EXPANSION')
  ? '事業拡大中とお伺いしました...'
  : ''

// → 콜드 이메일이 일반적 영업이 아닌 "상황에 맞는 제안"이 됨
```

---

## 5. 통합 아키텍처

### Cron 실행 흐름 (확장 후)

```
[Cron: lead-scraper]  매일 실행
       │
       ▼
runScraper({ prefectures: [3개씩 로테이션] })
       │
       ├── [기존 소스]
       │   ├── scrapeWebSearch()           → 웹 검색
       │   ├── scrapeHomemate()            → 디렉토리
       │   ├── scrapeITownPage()           → 디렉토리
       │   └── scrapeGooTownpage()         → 디렉토리
       │
       ├── [신규 소스]
       │   ├── scrapeGoogleMaps()          → ★ 영업중 업체 + 리뷰수
       │   ├── scrapeRentacarAssociation() → ★ 협회 회원
       │   ├── scrapeHoujinBangou()        → ★ 법인번호 DB
       │   ├── scrapeOtaListedCompanies()  → ★ OTA 등록 업체
       │   └── scrapeHiringSignals()       → ★ 채용=확장 시그널
       │
       ▼
deduplicateLeads()   ← 기존 로직 그대로 (정규화+현 기준 중복 제거)
       │
       ▼
DB 저장 + 시그널 메타데이터 보존
       │
       ▼
[Cron: lead-enrichment]  ← email 없는 리드 → 웹사이트 방문 → 이메일 추출
       │
       ▼
[Cron: ai-lead-scorer]   ← 시그널 보너스 반영한 리드 스코어링
       │
       ▼
[Cron: auto-cold-email]  ← 시그널 기반 개인화 이메일 발송
```

### 소스 간 역할 분담

```
┌──────────────────────────────────────────────────────────┐
│                    리드 발굴 레이어                        │
├──────────────┬──────────────┬──────────────┬─────────────┤
│  양(Volume)   │  질(Quality)  │ 시그널(Intent) │ 공식(Trust) │
├──────────────┼──────────────┼──────────────┼─────────────┤
│ Web Search   │ Google Maps  │ Hiring Signal│ Association │
│ Directories  │ OTA Listed   │              │ Houjin DB   │
│ (기존)       │ (신규)       │ (신규)        │ (신규)       │
├──────────────┼──────────────┼──────────────┼─────────────┤
│ 넓은 그물    │ 영업중 확인   │ 투자 의향     │ 허가/등록   │
│ 이메일 유무  │ 리뷰수=규모   │ 성장 단계     │ 법인 실재   │
│ 불확실       │ 높은 정확도   │ 높은 전환율   │ 높은 신뢰도  │
└──────────────┴──────────────┴──────────────┴─────────────┘
```

### 리드 스코어 체계 (확장)

```
기존 스코어 (최대 100점)
├── 이메일 보유: +25
├── 전화번호: +10  
├── 웹사이트: +15
├── 대규모 현(도쿄/오사카 등): +10
├── 회사명에 レンタカー: +10
├── 연락처 URL: +5
├── 차량 규모 정보: +10
└── 멀티채널(3개+): +15

+ 신규 보너스 (최대 30점)
├── 시그널 보너스 (채용/확장/DX): 0~30
├── Google Maps 리뷰수: 0~15
└── 소스 신뢰도: 협회(+5), 법인DB(+5)

총 최대: 130점 → 정규화해서 100점 만점으로
```

---

## 6. 구현 우선순위

### Phase 1 (즉시 구현, 1-2일)

| # | 소스 | 난이도 | 비용 | 기대 리드수/월 |
|---|------|--------|------|----------------|
| 1 | **Google Maps Places API** | 낮음 | ~$3/월 | 200-500 |
| 2 | **채용 시그널 확장** | 낮음 | 무료 | 50-100 (고품질) |

**이유:** googleapis 이미 설치됨, 기존 스크래퍼 패턴 그대로 추가, 즉시 효과

### Phase 2 (1주)

| # | 소스 | 난이도 | 비용 | 기대 리드수/월 |
|---|------|--------|------|----------------|
| 3 | **법인번호 DB** | 낮음 | 무료 | 100-300 |
| 4 | **렌터카 협회** | 중간 | 무료 | 50-150 |

**이유:** 공공 API라 안정적, 사이트 구조 파악 필요

### Phase 3 (2주)

| # | 소스 | 난이도 | 비용 | 기대 리드수/월 |
|---|------|--------|------|----------------|
| 5 | **OTA 간접 수집** | 중간 | 무료 | 100-200 |

**이유:** 검색 결과 파싱이라 정확도 튜닝 필요

---

## 7. 필요한 변경 사항

### 파일 변경 목록

| 파일 | 변경 내용 |
|------|-----------|
| `lib/lead-scraper.ts` | 5개 신규 함수 추가, runScraper() 소스 등록 |
| `lib/ai-sdr/lead-scoring.ts` | 시그널 보너스, 리뷰수 보너스 추가 |
| `lib/ai-sdr/email-generation.ts` | 시그널 기반 개인화 컨텍스트 추가 |
| `app/api/cron/lead-scraper/route.ts` | 신규 소스 default 등록 |
| `app/api/lead-scraper/route.ts` | 수동 트리거에 신규 소스 옵션 추가 |
| `.env` | `GOOGLE_MAPS_API_KEY`, `HOUJIN_API_APP_ID` 추가 |
| `prisma/schema.prisma` | Company 모델에 `expansionSignals String?` 필드 추가 (선택) |

### 환경 설정

```bash
# .env 추가
GOOGLE_MAPS_API_KEY=xxx           # Google Cloud Console에서 발급
HOUJIN_API_APP_ID=xxx             # 국세청 법인번호 API 앱 ID (무료 등록)
```

### Google Cloud Console 설정

```
1. APIs & Services → Library → "Places API (New)" 활성화
2. Credentials → API Key 생성 (서버 IP 제한 권장)
3. 예산 알림 설정 ($10/월 상한)
```

---

## 8. 리스크 & 대응

| 리스크 | 대응 |
|--------|------|
| Google Maps API 비용 초과 | 월 예산 상한 $10 설정, 요청 수 제한 |
| 협회 사이트 구조 변경 | Cheerio 셀렉터 실패 시 graceful fallback (빈 배열 반환) |
| 법인번호 API 속도 제한 | 1초/요청 제한 준수, 배치 크기 조정 |
| OTA 간접 수집 정확도 | extractCompanyFromOtaTitle() 정규식 튜닝 필요 |
| 중복 리드 증가 | 소스 다양화로 동일 업체 복수 발견 → deduplicateLeads() 기존 로직으로 처리 |
| 구인사이트 차단 | User-Agent 로테이션, politeFetch() 지연 시간 준수 |

---

## 9. 기대 효과

### 리드 양 변화

```
현재: 7개 소스 (3개 무효) → 실질 4개 소스
       월 ~100-200 신규 리드 (중복 제거 후)

확장 후: 9개 유효 소스 (4개 기존 + 5개 신규)
         월 ~500-1,000 신규 리드 (추정)
         
         소스별 기대:
         ├── Google Maps:  200-500 (영업중 확인된 업체)
         ├── 법인번호 DB:  100-300 (공식 등록 법인)
         ├── 협회 회원:     50-150 (정규 회원)
         ├── OTA 간접:    100-200 (온라인 활발한 업체)
         └── 채용 시그널:   50-100 (성장 기업, 높은 전환율)
```

### 리드 질 변화

```
현재: 이메일 발견율 ~30%, 스코어 기준 이메일 유무만
       → 동일 메시지로 전체 발송

확장 후: 시그널 기반 우선순위화
         ├── Tier 1 (시그널 있음): 개인화 이메일 + 즉시 발송
         │   "신규 오픈 축하합니다" / "인바운드 대응 지원"
         │
         ├── Tier 2 (대형/활발): 표준 이메일 + 순차 발송  
         │   리뷰수 30+, OTA 등록, 협회 회원
         │
         └── Tier 3 (기본): 일반 콜드 이메일
             기존 소스의 기본 리드
```
