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
/web-vitals
/web-vitals --lighthouse
/web-vitals --paths /,/about,/products
/web-vitals --interactive
/web-vitals --quick
/web-vitals --device desktop
/web-vitals --device mobile --lighthouse
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

1. 기본 실행: node {skill_dir}/measure.js --url http://localhost:{port} --runs 3
2. --device 옵션: desktop(기본) 또는 mobile. 데스크톱은 1920x1080, 모바일은 iPhone 14 에뮬레이션(390x844, 터치, 모바일 UA)
3. 사용자가 옵션을 지정한 경우 플래그 추가
3. --paths로 추가 경로가 지정되면 각 경로별로 반복 실행
4. JSON 결과를 파싱한다
5. 모든 메트릭이 null이면 중단: "메트릭을 수집할 수 없었습니다"

### Phase 5: 레포트 생성

1. 터미널에 메트릭 테이블 출력 (Rating 이모지: Good → ✅, Needs Improvement → ⚠️, Poor → ❌, null → ➖)
2. report-template.md를 기반으로 docs/web-vitals/{YYYY-MM-DD-HH:mm}.md에 저장
3. Poor 항목 있으면 개선 권고 코멘트 추가

### Phase 6: 정리

1. SERVER_STARTED=true인 경우에만 서버 프로세스 종료
2. 기존 서버는 건드리지 않는다

## 중단 조건

다음 경우 무리하게 재시도하지 말고 사유를 기록하고 종료한다:
- package.json이 없고 사용자가 실행 명령을 제공하지 않을 때
- 서버가 30초 내에 시작되지 않을 때
- 3회 측정 결과가 모두 빈 값일 때
