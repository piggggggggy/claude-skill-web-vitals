# Web Vitals Report

**URL:** {{url}}
**Date:** {{timestamp}}
**Runs:** {{runs}}

## Core Web Vitals

| Metric | Value | Rating |
|--------|-------|--------|
| LCP (Largest Contentful Paint) | {{LCP_value}} | {{LCP_rating}} |
| CLS (Cumulative Layout Shift) | {{CLS_value}} | {{CLS_rating}} |
| INP (Interaction to Next Paint) | {{INP_value}} | {{INP_rating}} |
| FCP (First Contentful Paint) | {{FCP_value}} | {{FCP_rating}} |
| TTFB (Time to First Byte) | {{TTFB_value}} | {{TTFB_rating}} |

### Rating 기준
- Good: 사용자 경험 양호
- Needs Improvement: 개선 필요
- Poor: 즉시 개선 권장

{{#if lighthouse}}
## Lighthouse Performance

**Score:** {{lighthouse_score}} / 100

### 개선 기회
{{lighthouse_opportunities}}
{{/if}}

{{#if recommendations}}
## 권고사항
{{recommendations}}
{{/if}}

---
*Measured by web-vitals skill | Median of {{runs}} runs*
