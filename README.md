# 유찬이의 칭찬 스티커판

30칸 스티커판에 미션 스티커(영어책, 축구, 농구 등)를 붙이고, 다 채우면 보상을 받고 새 판을 시작하는 웹앱이에요.

- 화면: GitHub Pages
- 데이터: Firebase Firestore (가족 구글 계정만 접근 가능)
- `firebase-config.js`를 채우기 전에는 **체험 모드**로 동작해요. (이 기기 브라우저에만 저장)

## 1. Firebase 프로젝트 만들기

1. https://console.firebase.google.com 에서 **Firebase 프로젝트를 설정하여 시작하기**
2. 프로젝트 이름: 예) `yuchan-sticker` → 약관 동의 → 계속
3. Gemini, Google 애널리틱스는 꺼도 돼요 → 프로젝트 만들기
   (무료 Spark 요금제, 카드 등록 필요 없음)

## 2. 구글 로그인 켜기

1. 왼쪽 메뉴 **빌드 → Authentication → 시작하기**
2. **로그인 방법** 탭 → **Google** → 사용 설정 → 지원 이메일 선택 → 저장
3. **설정** 탭 → **승인된 도메인** → 도메인 추가 → `heby1012.github.io`

## 3. 데이터베이스 만들기

1. **빌드 → Firestore Database → 데이터베이스 만들기**
2. 위치: **asia-northeast3 (서울)**
3. **프로덕션 모드**로 시작 → 만들기
4. **규칙** 탭에 `firestore.rules` 내용을 붙여넣고,
   `parent1@gmail.com`, `parent2@gmail.com`을 실제 가족 구글 계정으로 바꾼 뒤 **게시**

## 4. 웹 앱 등록 → 설정값 넣기

1. 왼쪽 위 **톱니바퀴 → 프로젝트 설정** → **내 앱**에서 웹 아이콘 `</>`
2. 앱 닉네임 입력 (Firebase 호스팅은 체크하지 않음) → 앱 등록
3. 나오는 `firebaseConfig`의 `apiKey`, `authDomain`, `projectId`, `appId`를 `firebase-config.js`에 넣기

## 5. GitHub Pages에 올리기

1. GitHub에서 새 저장소 만들기 (예: `sticker`, **Public**)
2. 이 폴더의 파일을 모두 올리기 (`index.html`, `app.js`, `store.js`, `style.css`, `firebase-config.js`)
3. 저장소 **Settings → Pages** → Source: **Deploy from a branch** → `main` / `(root)` → Save
4. 1~2분 뒤 `https://heby1012.github.io/sticker/` 로 접속

## 사용 방법

- 유찬이가 쓰는 기기에서 부모 구글 계정으로 **한 번만** 로그인해 두면 계속 유지돼요.
- **⭐ 스티커 붙이기** → 미션 고르기 → 다음 칸에 스티커가 붙어요.
- 30칸을 다 채우면 축하 화면이 나오고, **새 스티커판 시작하기**로 다음 판을 시작해요.
- **기록** 탭: 이번 판 미션 통계, 날짜별 기록(잘못 붙인 스티커 지우기), 완성한 판과 보상 지급 여부
- **설정** 탭: 이름, 보상, 칸 수, 미션 스티커 추가/수정/숨기기, 백업 내려받기
- 휴대폰에서 브라우저 메뉴의 **홈 화면에 추가**를 하면 앱처럼 쓸 수 있어요.

## 내 컴퓨터에서 미리 보기

```bash
npx http-server D:/Sample/sticker-board -p 5173 -c-1
```
