# Vercel에서 Gemini API 연결하기

작성: 2026-11-01, Asia/Seoul. 코드와 로컬 모의 검사를 준비한 상태다. 실제 Vercel 빌드·배포와 사용자 키의 Gemini 연결은 아직 확인하지 않았다. 재배포는 사용자가 진행한다.

## 요청이 실행되는 방식

휴대폰의 ‘내 상태에 맞는 길 찾기’ → 같은 사이트의 `POST /api/analyze-condition` → Vercel Node.js 함수 → Gemini → 검증된 이동 조건 → 기존 브라우저 경로 엔진 순서다. 브라우저는 상태 문장만 보내고, 서버 함수가 환경변수의 키를 사용한다. 지도 좌표·이동 기록을 Gemini에 보내지 않는다. 함수 실행 버튼이나 별도 AI 버튼을 추가할 필요는 없다.

- `api/index.mjs`: Vercel이 요청마다 호출하는 Node.js 함수 진입점. `app.listen()` 없이 기본 내보내기 함수로 요청을 받는다.
- `vercel.json`: 실제 화면은 `donghaeng-nav/dist/`에서 제공하고, `/api/status`와 `/api/analyze-condition`을 하나의 함수로 연결한다.
- `donghaeng-nav/scripts/condition-api.mjs`: 로컬 서버와 Vercel이 함께 쓰는 Gemini 요청·입력/응답 검증·오류 처리.
- 로컬 전용 `/setup`과 `/api/config`는 Vercel 함수에서 제공하지 않는다. 배포 함수는 `.env` 파일을 읽거나 키를 파일로 저장하지 않는다.

Vercel의 공식 [Node.js 함수](https://vercel.com/docs/functions/runtimes/node-js), [함수 시작 안내](https://vercel.com/docs/functions/quickstart), [설정 파일](https://vercel.com/docs/project-configuration/vercel-json)에 맞춘 구성이다. 함수 내부 공유 코드는 `api/` 밖에 두어 별도의 공개 함수가 생기지 않게 했다.

## Vercel 화면에서 할 일

1. 코드 변경을 커밋·푸시한 뒤, 해당 커밋으로 배포를 생성한다. 기존 커밋을 Redeploy하는 것만으로 새 API 파일이 생기지는 않는다.
2. 프로젝트 Root Directory는 저장소 최상위 `/`로 유지한다. `donghaeng-nav/dist`를 Root Directory로 바꾸면 최상위 `api/`와 `vercel.json`을 읽을 수 없다.
3. Application Preset은 `Other`를 유지한다. `vercel.json`에서 Build Command와 Install Command를 빈 문자열, Output Directory를 `donghaeng-nav/dist`로 지정했다. 별도 npm 패키지 설치는 필요 없다.
4. 프로젝트 Settings → Environment Variables에서 아래 값을 확인한다. 이미 `.env`를 import했다면 이름과 환경 범위를 확인한다. 값은 채팅이나 코드에 붙여넣지 않는다.

| 이름 | 값·범위 |
| --- | --- |
| `GEMINI_API_KEY` | 실제 키. 운영 주소는 Production 범위에 설정해야 한다. Preview 주소에서도 검사하려면 Preview에도 설정한다. |
| `GEMINI_MODEL` | 로컬에서 연결을 확인한 모델명. 생략하면 기존 서버 기본값을 사용한다. |

이 함수에는 `PORT` 설정이 필요 없다. 환경변수를 바꾼 뒤에는 새 배포가 필요하다. [Vercel 환경변수 안내](https://vercel.com/docs/environment-variables).

5. 최신 배포가 Ready이면 Production · Current 상태를 확인하거나 Promote한다. 재배포·운영 전환은 사용자가 직접 진행한다.

## 배포 후 확인하기

먼저 [현재 운영 주소의 API 상태](https://aiaiaiaiaiaiaiai.vercel.app/api/status)를 연다. JSON의 `configured: true`는 **함수가 키를 읽었다는 뜻**이며, Google 인증이나 모델 호출 성공을 확인한 결과가 아니다. 이 상태 확인은 Gemini를 호출하지 않는다.

다음으로 앱 화면에서 상태 문장을 입력하고 기존 길 찾기 버튼을 누른다. 화면에 ‘Gemini 해석’이 표시되는지 확인한다. 실패하면 기존 기기 내 해석으로 대체되며 오류 설명을 표시한다. 실제 키·모델·할당량의 검증은 이 요청이 성공해야 완료된다.

| 증상 | 확인할 항목 |
| --- | --- |
| `/api/status`가 404 | 새 API 파일이 있는 커밋을 배포했는지, Root Directory가 저장소 최상위인지 확인 |
| `configured: false` | `GEMINI_API_KEY` 이름과 Production/Preview 범위, 변수 저장 후 새 배포 여부 확인 |
| `/api/analyze-condition`을 주소창에서 열면 405 | 이 경로는 JSON POST 전용이므로 정상적인 메서드 제한. 상태 확인은 `/api/status` 사용 |
| 요청에 502, 화면에 AI 연결 실패 | Vercel Runtime Logs와 Google의 키·모델·접근 권한 확인. 함수는 키나 Google의 원문 오류를 응답에 포함하지 않음 |
| 429 | Google 할당량 또는 해당 함수 인스턴스의 동시 요청 제한 확인 |

브라우저 코드는 이미 다음 형태의 요청을 보낸다. 직접 새 코드를 입력하거나 키를 브라우저에 넣을 필요는 없다.

```js
fetch('/api/analyze-condition', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({condition: '계단을 피하고 중간에 벤치에서 쉬고 싶어요.'})
});
```

## 검증과 범위

- `node donghaeng-nav/scripts/test-vercel-api.mjs`: 내보낸 Node 핸들러·rewrite URL·원래 URL·파싱 전/후 본문, 상태·키 누락·메서드·잘못된 입력·다른 Origin·비공개 경로·상위 오류·시간 초과·인스턴스 동시 요청 제한 검사. 결과는 [vercel-api-results.json](vercel-api-results.json)에 있다.
- `node donghaeng-nav/scripts/test-condition-api.mjs`: 기존 로컬 API·키 설정 후 같은 핸들러에 즉시 적용되는 동작 검사. 실제 사용자 `.env`를 변경하지 않고 임시 모의 키 파일을 사용한다.
- `CHROME_PATH`를 실제 Chrome 경로로 지정하고 `node donghaeng-nav/scripts/test-auto-plan-ui.cjs`: 기존 버튼의 자동 AI 해석과 기기 내 대체 동작 검사.
- 검사는 로컬 Node·Chrome과 모의 Google 응답을 사용한다. 실제 Vercel 런타임·빌드 성공, 실제 Gemini 인증·할당량은 미검증이다.
- 인스턴스 내 동시 요청 제한은 3개이며 전역 사용량 제한이 아니다. 실제 GPS·경로 데이터·35m 정책·HTML은 변경하지 않았다. `research/`는 수정하거나 배포 함수 의존성으로 추가하지 않았다.
