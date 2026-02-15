# Apps Script - GA4 Conversion 이벤트 연동 가이드

## 개요
デモ申し込み, お問合せ, 営業リード数를 GA4 이벤트에서 자동으로 가져오기 위한 Apps Script 업데이트 가이드입니다.

## 1. GA4에서 이벤트 설정

웹사이트(kaflixcloud.co.jp)에서 다음 이벤트를 설정해야 합니다:

### 이벤트 매핑
| 지표 | GA4 이벤트 이름 | 트리거 |
|------|----------------|--------|
| デモ申し込み | `demo_request` | 데모 신청 폼 제출 시 |
| お問合せ | `contact_form_submit` | 문의 폼 제출 시 |
| 営業リード数 | (위 두 개의 합계) | 자동 계산 |

### GTM 또는 웹사이트에 추가할 코드
```javascript
// 데모 신청 폼 제출 시
gtag('event', 'demo_request', {
  event_category: 'conversion',
  event_label: 'demo_form'
});

// 문의 폼 제출 시
gtag('event', 'contact_form_submit', {
  event_category: 'conversion',
  event_label: 'contact_form'
});
```

## 2. Apps Script 업데이트

기존 Apps Script에 다음 함수를 추가하세요:

```javascript
// GA4 Data API를 사용하여 이벤트 데이터 가져오기
function getGA4ConversionData(startDate, endDate, prevStartDate, prevEndDate) {
  const propertyId = 'YOUR_GA4_PROPERTY_ID'; // GA4 속성 ID

  // 현재 기간 데이터
  const currentData = runGA4EventReport(propertyId, startDate, endDate);

  // 이전 기간 데이터 (트렌드 계산용)
  const prevData = runGA4EventReport(propertyId, prevStartDate, prevEndDate);

  // 이벤트 카운트 추출
  const demoRequests = currentData['demo_request'] || 0;
  const inquiries = currentData['contact_form_submit'] || 0;
  const salesLeads = demoRequests + inquiries;

  const prevDemoRequests = prevData['demo_request'] || 0;
  const prevInquiries = prevData['contact_form_submit'] || 0;
  const prevSalesLeads = prevDemoRequests + prevInquiries;

  return {
    demoRequests: demoRequests,
    demoRequestsTrend: calculateTrend(demoRequests, prevDemoRequests),
    inquiries: inquiries,
    inquiriesTrend: calculateTrend(inquiries, prevInquiries),
    salesLeads: salesLeads,
    salesLeadsTrend: calculateTrend(salesLeads, prevSalesLeads)
  };
}

// GA4 이벤트 리포트 실행
function runGA4EventReport(propertyId, startDate, endDate) {
  const request = AnalyticsData.newRunReportRequest();

  request.dateRanges = [AnalyticsData.newDateRange()];
  request.dateRanges[0].startDate = startDate;
  request.dateRanges[0].endDate = endDate;

  request.dimensions = [AnalyticsData.newDimension()];
  request.dimensions[0].name = 'eventName';

  request.metrics = [AnalyticsData.newMetric()];
  request.metrics[0].name = 'eventCount';

  // 특정 이벤트만 필터링
  request.dimensionFilter = AnalyticsData.newFilterExpression();
  request.dimensionFilter.filter = AnalyticsData.newFilter();
  request.dimensionFilter.filter.fieldName = 'eventName';
  request.dimensionFilter.filter.inListFilter = AnalyticsData.newInListFilter();
  request.dimensionFilter.filter.inListFilter.values = ['demo_request', 'contact_form_submit'];

  const response = AnalyticsData.Properties.runReport(request, 'properties/' + propertyId);

  const result = {};
  if (response.rows) {
    response.rows.forEach(row => {
      const eventName = row.dimensionValues[0].value;
      const count = parseInt(row.metricValues[0].value);
      result[eventName] = count;
    });
  }

  return result;
}

// 트렌드 계산 (퍼센트)
function calculateTrend(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100 * 10) / 10;
}
```

## 3. 메인 함수 수정

기존 `doGet` 함수에서 conversion 데이터를 포함하도록 수정:

```javascript
function doGet(e) {
  // ... 기존 코드 ...

  // Conversion 데이터 가져오기
  const conversionData = getGA4ConversionData(startDate, endDate, prevStartDate, prevEndDate);

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    timestamp: new Date().toISOString(),
    period: {
      startDate: startDate,
      endDate: endDate,
      prevStartDate: prevStartDate,
      prevEndDate: prevEndDate
    },
    data: {
      gsc: gscData,
      ga4: ga4Data,
      conversion: conversionData  // 추가
    }
  })).setMimeType(ContentService.MimeType.JSON);
}
```

## 4. Apps Script 서비스 활성화

1. Apps Script 에디터에서 **서비스** 클릭
2. **Google Analytics Data API** 추가
3. 스크립트 재배포

## 5. 테스트

배포 후 API 호출 테스트:
```
https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec?action=all&period=1m
```

응답에 `conversion` 객체가 포함되어 있는지 확인하세요.
