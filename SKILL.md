---
name: web-vitals
description: 웹 프로젝트의 Core Web Vitals(LCP, CLS, INP, FCP, TTFB)를 로컬에서 측정하고 레포트를 생성할 때 사용. 성능 측정, 웹 퍼포먼스 분석, web vitals 확인 등.
argument-hint: [options]
allowed-tools: Bash, Read, Glob, Grep
disable-model-invocation: false
---

# web-vitals: Core Web Vitals 측정

웹 프로젝트 코드베이스에서 dev server를 실행하고, Core Web Vitals를 측정하여 터미널 출력 + Markdown 레포트를 생성한다.

## 사용법

```
/web-vitals                          # 기본 (desktop, 3회 측정)
/web-vitals --quick                  # 빠른 측정 (1회)
/web-vitals --device mobile          # 모바일 에뮬레이션 (iPhone 14)
/web-vitals --lighthouse             # Lighthouse 성능 감사 추가
/web-vitals --interactive            # 수동 조작 모드 (정확한 INP 측정)
/web-vitals --paths /,/about         # 여러 페이지 측정
/web-vitals --device mobile --quick --lighthouse
```

## 프로세스

아래 Phase를 순서대로 실행한다. 각 Phase에서 실패하면 해당 사유를 기록하고 중단한다.

### Phase 1: 프로젝트 탐지

1. package.json을 읽는다
2. scripts에서 dev, start, serve 키를 순서대로 찾는다
3. 찾은 스크립트에서 --port 플래그를 파싱한다. 없으면 기본 포트 후보: 3000, 3001, 5173
4. package.json이 없거나 적절한 script가 없으면 사용자에게 질문한다:
   - "dev server 실행 명령과 포트를 알려주세요 (예: npm run dev, port 3000)"
5. 명령과 포트를 알 수 없으면 중단: "프로젝트 실행 방법을 판단할 수 없습니다"

### Phase 2: 서버 준비

1. 포트 점유 확인: lsof -i :{port} -t
2. 포트가 열려있으면 기존 서버 사용. SERVER_STARTED=false로 기록
3. 포트가 비어있으면: {start_command}를 백그라운드로 실행. SERVER_STARTED=true로 기록
4. 서버 ready 대기 (최대 30초): curl 폴링
5. 30초 내 응답 없으면 중단: "서버가 30초 안에 시작되지 않았습니다"

### Phase 3: 의존성 확인

1. Playwright chromium 설치 여부 확인
2. 없으면 npx playwright install chromium

### Phase 4: 측정 실행

1. 기본 실행: node {skill_dir}/measure.js --url http://localhost:{port}
2. 사용자 옵션에 따라 플래그 추가:
   - --quick → 1회 측정 (기본 3회)
   - --device mobile → 모바일 에뮬레이션 (iPhone 14, 390x844)
   - --lighthouse → Lighthouse 성능 감사 추가
   - --interactive → headed 브라우저 30초 수동 조작 (INP 정확 측정)
3. --paths로 경로가 지정되면 각 경로별로 반복 실행
4. JSON 결과를 파싱한다
5. 모든 메트릭이 null이면 중단: "메트릭을 수집할 수 없었습니다"

### Phase 5: 레포트 생성

1. 터미널에 메트릭 테이블 출력 (Rating 이모지: Good → ✅, Needs Improvement → ⚠️, Poor → ❌, null → ➖)
2. report-template.md를 기반으로 docs/web-vitals/{YYYY-MM-DD-HH:mm}.md에 저장
3. docs/web-vitals/ 에 이전 측정 파일이 있으면 비교하여 개선/악화 트렌드를 언급한다

### Phase 6: 코드 기반 진단 (핵심)

레포트 저장 후, needs-improvement 또는 poor 메트릭이 있으면 **프로젝트 코드를 실제로 읽고** 구체적인 원인과 개선 방안을 대화로 제안한다. 일반적인 조언이 아닌, 이 프로젝트의 코드를 근거로 한 진단이어야 한다.

#### LCP (Largest Contentful Paint) — 가장 큰 콘텐츠의 렌더링 시간

조사할 곳:
- 뷰포트 상단의 큰 이미지: `<img>` 태그에 width/height 미지정, `loading="lazy"` 가 hero에 걸려있는지, 적절한 format(webp/avif) 사용 여부
- 웹폰트 로딩: `@font-face`의 `font-display` 설정, 폰트 preload 여부
- SSR/SSG 여부: CSR만 사용 시 JS 번들 파싱 후에야 LCP 요소가 렌더링됨
- Critical CSS: 초기 렌더링에 필요한 CSS가 인라인되었는지 또는 render-blocking인지

#### CLS (Cumulative Layout Shift) — 레이아웃 밀림

조사할 곳:
- 이미지/비디오에 width/height 또는 aspect-ratio 미지정
- 동적으로 삽입되는 배너, 광고, 공지 영역
- 웹폰트 로딩 시 fallback 폰트와의 크기 차이 (`font-display: swap` + size-adjust)
- 조건부 렌더링 컴포넌트 (로그인/비로그인 등)가 레이아웃을 밀어내는지

#### INP (Interaction to Next Paint) — 인터랙션 응답 속도

조사할 곳:
- 클릭/키 입력 이벤트 핸들러에서 무거운 동기 작업 (큰 리스트 re-render, 무거운 계산)
- React: 불필요한 리렌더링 (memo/useMemo/useCallback 미사용), 큰 컴포넌트 트리
- 메인 스레드를 차단하는 서드파티 스크립트
- null이면: SSR 사이트이거나 JS 이벤트 핸들러가 없는 정적 페이지일 수 있음. `--interactive` 모드를 안내

#### FCP (First Contentful Paint) — 첫 콘텐츠 렌더링

조사할 곳:
- Render-blocking 리소스: `<head>` 내 동기 `<script>`, render-blocking CSS
- 서버 응답 시간 (TTFB와 연관)
- CSS/JS 번들 크기: 번들 분석 도구 (webpack-bundle-analyzer 등) 안내
- 초기 HTML에 콘텐츠가 포함되는지 (SSR/SSG vs CSR)

#### TTFB (Time to First Byte) — 서버 응답 시간

주의: localhost 측정이므로 네트워크 지연이 없다. TTFB가 높으면 서버 자체의 처리 시간 문제.
조사할 곳:
- 서버 사이드 데이터 페칭 (getServerSideProps, loader 등)에서 느린 DB 쿼리나 외부 API 호출
- 미들웨어 체인에서의 병목
- dev 모드 특유의 오버헤드 (HMR, 소스맵 등) — 프로덕션 빌드와 비교 안내

#### 진단 원칙

- "이미지를 최적화하세요" 같은 일반론 금지. 구체적 파일명과 라인을 근거로 제안
- 코드를 읽어서 원인을 찾을 수 없으면, 솔직하게 "코드만으로는 원인 특정이 어렵습니다"라고 말하고 추가 조사 방법(DevTools, Lighthouse 등)을 안내
- good 메트릭은 언급하지 않거나 간략히만 ("LCP, CLS 양호"). poor/needs-improvement에 집중

### Phase 7: 정리

1. SERVER_STARTED=true인 경우에만 서버 프로세스 종료
2. 기존 서버는 건드리지 않는다

## 중단 조건

다음 경우 무리하게 재시도하지 말고 사유를 기록하고 종료한다:
- package.json이 없고 사용자가 실행 명령을 제공하지 않을 때
- 서버가 30초 내에 시작되지 않을 때
- 3회 측정 결과가 모두 빈 값일 때
