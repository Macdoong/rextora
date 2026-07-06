# Rextora 환경변수 설정 가이드

이 문서는 Rextora를 Binance와 Telegram에 **안전하게** 연결하기 위한 초보자용 안내입니다.  
실제 API 키나 토큰 값은 이 문서에 적지 마세요.

## 1. `.env.local` 파일 만들기

프로젝트 루트(`Rextora` 폴더)에 `.env.example` 파일이 있습니다. 이 파일을 복사해 `.env.local`을 만듭니다.

**Windows (PowerShell):**

```powershell
Copy-Item .env.example .env.local
```

**macOS / Linux:**

```bash
cp .env.example .env.local
```

`.env.local`은 Git에 올라가지 않습니다. 비밀값은 이 파일에만 저장하세요.

## 2. Binance API Key / Secret 입력

`.env.local`을 열고 아래 항목을 찾아 본인의 값을 입력합니다.

```env
BINANCE_API_KEY=여기에_키_입력
BINANCE_API_SECRET=여기에_시크릿_입력
```

- Binance 웹사이트 → API 관리에서 Futures(USD-M)용 키를 발급합니다.
- 처음에는 **읽기 전용**으로 테스트하는 것을 권장합니다.
- IP 제한을 설정하면 더 안전합니다.

**중요:** Rextora 화면(설정, 시스템 상태 등)에는 API 키 **원문이 표시되지 않습니다.**  
「설정됨 / 미설정」만 확인할 수 있습니다.

## 3. Telegram Token / Chat ID 입력

같은 `.env.local` 파일에서:

```env
TG_TOKEN=여기에_봇_토큰_입력
TG_CHAT_ID=여기에_채팅_ID_입력
```

- [@BotFather](https://t.me/BotFather)에서 봇을 만들고 Token을 받습니다.
- Chat ID는 본인과 봇이 대화한 채팅의 ID입니다.

Telegram도 화면에 토큰 원문은 표시되지 않습니다.

## 4. 서버 재시작

환경변수는 서버를 시작할 때 읽습니다. `.env.local`을 수정한 뒤 **반드시 서버를 재시작**하세요.

```bash
# 개발 서버 중지 (Ctrl+C) 후
npm run dev
```

## 5. 연결 확인 순서

1. 브라우저에서 **설정** 페이지를 엽니다.
2. **실전 연결 준비 순서** 카드의 단계를 따라갑니다.
3. **시스템 상태** 페이지에서 다음을 확인합니다.
   - Binance 연결 상태
   - 잔고 조회 상태
   - 포지션 조회 상태
   - 주문 권한 상태
   - Telegram 테스트 상태
   - 서버 TP/SL 준비 상태
4. **자동매매(Trading)** 페이지의 LIVE 체크리스트를 확인합니다.

## 6. LIVE(실전 거래)는 설정만으로 열리지 않습니다

다음이 **모두** 충족되어야 LIVE 주문이 가능합니다.

- `.env.local`에 필요한 값이 설정됨
- `REXTORA_LIVE_APPROVED=true` 등 실전 승인 환경변수 (별도 안내 참고)
- 설정에서 실전 거래 활성화
- 리스크 설정 확인
- 서버 TP/SL 준비
- Telegram 알림 설정 (설정에 따라 필수)
- 실전 확인 문구 일치
- 전략 실전 승인 상태
- 기타 LIVE 안전 체크리스트 항목

**기본값은 PAPER(모의 거래)** 입니다. 체크리스트를 통과하지 않으면 LIVE는 계속 **차단**됩니다.

## 7. 실전 주문 전 필수 확인 목록

실제 돈이 움직이기 전에 아래를 다시 한 번 확인하세요.

- [ ] API 키 권한(읽기/거래/Futures)이 의도와 일치하는가?
- [ ] 테스트넷이 아닌 **실계정**인지 확인했는가? (`BINANCE_TESTNET` 값 확인)
- [ ] 시스템 상태에서 잔고·연결이 정상인가?
- [ ] Telegram 테스트 메시지가 도착하는가?
- [ ] 서버 TP/SL이 활성 상태인가?
- [ ] 리스크 한도(일일 손실, 최대 포지션 등)가 본인 기준에 맞는가?
- [ ] LIVE 체크리스트가 **전부 통과**했는가?
- [ ] 실전 확인 문구를 정확히 입력할 준비가 되었는가?

## 8. 문제 해결

| 증상 | 확인할 것 |
|------|-----------|
| Binance 연결 미설정 | `.env.local` 키/시크릿, 서버 재시작 |
| 잔고 조회 실패 | API 키 권한, IP 제한, Futures 계정 |
| Telegram 미설정 | `TG_TOKEN`, `TG_CHAT_ID`, 봇과 `/start` 대화 |
| LIVE 계속 차단 | Trading 페이지 차단 이유 목록, 시스템 상태 「차단 이유」 |

---

Rextora는 투자 조언이 아닙니다. 모든 거래 책임은 사용자 본인에게 있습니다.
