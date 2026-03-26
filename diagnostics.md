# Web Vitals 진단 가이드

needs-improvement 또는 poor 메트릭에 대해 **프로젝트 코드를 실제로 읽고** 구체적인 원인과 개선 방안을 대화로 제안한다. 일반적인 조언이 아닌, 이 프로젝트의 코드를 근거로 한 진단이어야 한다.

## LCP (Largest Contentful Paint) — 가장 큰 콘텐츠의 렌더링 시간

조사할 곳:
- 뷰포트 상단의 큰 이미지: `<img>` 태그에 width/height 미지정, `loading="lazy"` 가 hero에 걸려있는지, 적절한 format(webp/avif) 사용 여부
- 웹폰트 로딩: `@font-face`의 `font-display` 설정, 폰트 preload 여부
- SSR/SSG 여부: CSR만 사용 시 JS 번들 파싱 후에야 LCP 요소가 렌더링됨
- Critical CSS: 초기 렌더링에 필요한 CSS가 인라인되었는지 또는 render-blocking인지

## CLS (Cumulative Layout Shift) — 레이아웃 밀림

조사할 곳:
- 이미지/비디오에 width/height 또는 aspect-ratio 미지정
- 동적으로 삽입되는 배너, 광고, 공지 영역
- 웹폰트 로딩 시 fallback 폰트와의 크기 차이 (`font-display: swap` + size-adjust)
- 조건부 렌더링 컴포넌트 (로그인/비로그인 등)가 레이아웃을 밀어내는지

## INP (Interaction to Next Paint) — 인터랙션 응답 속도

조사할 곳:
- 클릭/키 입력 이벤트 핸들러에서 무거운 동기 작업 (큰 리스트 re-render, 무거운 계산)
- React: 불필요한 리렌더링 (memo/useMemo/useCallback 미사용), 큰 컴포넌트 트리
- 메인 스레드를 차단하는 서드파티 스크립트
- null이면: SSR 사이트이거나 JS 이벤트 핸들러가 없는 정적 페이지일 수 있음. `--interactive` 모드를 안내

## FCP (First Contentful Paint) — 첫 콘텐츠 렌더링

조사할 곳:
- Render-blocking 리소스: `<head>` 내 동기 `<script>`, render-blocking CSS
- 서버 응답 시간 (TTFB와 연관)
- CSS/JS 번들 크기: 번들 분석 도구 (webpack-bundle-analyzer 등) 안내
- 초기 HTML에 콘텐츠가 포함되는지 (SSR/SSG vs CSR)

## TTFB (Time to First Byte) — 서버 응답 시간

주의: localhost 측정이므로 네트워크 지연이 없다. TTFB가 높으면 서버 자체의 처리 시간 문제.
조사할 곳:
- 서버 사이드 데이터 페칭 (getServerSideProps, loader 등)에서 느린 DB 쿼리나 외부 API 호출
- 미들웨어 체인에서의 병목
- dev 모드 특유의 오버헤드 (HMR, 소스맵 등) — 프로덕션 빌드와 비교 안내

## Lighthouse 결과 해석

### Score 0 또는 대부분의 메트릭이 null인 경우

Lighthouse mobile 모드는 Slow 4G throttling(RTT 150ms, 다운로드 1.6Mbps)을 적용한다. dev 서버의 TTFB가 높으면(예: 1초 이상) throttling과 합산되어 페이지 로드가 Lighthouse 제한 시간을 초과하고, 대부분의 메트릭이 null → score 0이 된다.

이것은 버그가 아니라 정직한 결과다. 다음과 같이 안내:
- "dev 서버의 TTFB가 높아 Lighthouse throttling과 합산 시 타임아웃됩니다"
- "프로덕션 빌드 또는 프로덕션 URL로 재측정을 권장합니다"
- "Playwright web-vitals 결과는 throttling 없이 측정되므로 dev 서버 성능 파악에 더 적합합니다"

throttling 비활성화를 제안하지 않는다 — Lighthouse의 의미가 사라진다.

### Playwright와 Lighthouse 결과가 크게 다른 경우

정상이다. Playwright는 로컬 네트워크로 직접 접속(throttling 없음)하고, Lighthouse는 실제 모바일 네트워크를 시뮬레이션한다. 두 결과의 차이가 "네트워크 환경이 성능에 미치는 영향"을 보여준다.

## 진단 원칙

- "이미지를 최적화하세요" 같은 일반론 금지. 구체적 파일명과 라인을 근거로 제안
- 코드를 읽어서 원인을 찾을 수 없으면, 솔직하게 "코드만으로는 원인 특정이 어렵습니다"라고 말하고 추가 조사 방법(DevTools, Lighthouse 등)을 안내
- good 메트릭은 언급하지 않거나 간략히만 ("LCP, CLS 양호"). poor/needs-improvement에 집중
