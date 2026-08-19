# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: model-switching.spec.ts >> Agent model switching browser matrix >> OpenAI → Gemini switch with persistence
- Location: tests/e2e/release/model-switching.spec.ts:12:7

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 10
Received:   8
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e4]:
      - link "Rextora" [ref=e5] [cursor=pointer]:
        - /url: /dashboard
      - generic [ref=e7]:
        - img [ref=e8]
        - text: 모의 거래
      - group [ref=e10]:
        - generic "메뉴" [ref=e11] [cursor=pointer]
    - main [ref=e12]:
      - generic [ref=e13]:
        - generic [ref=e14]:
          - generic [ref=e15]:
            - paragraph [ref=e16]: AI TRADING EMPLOYEE
            - heading "대시보드" [level=1] [ref=e17]
            - paragraph [ref=e18]: AI 연구원에게 질문하고, 현재 연구와 승인이 필요한 다음 단계를 한눈에 확인합니다.
          - generic [ref=e20]: 모의 거래 · 실전 주문 차단
        - region "AI 트레이딩 직원" [ref=e21]:
          - generic [ref=e22]:
            - generic [ref=e23]:
              - img [ref=e25]
              - generic [ref=e37]:
                - generic [ref=e38]: AI 트레이딩 직원
                - generic [ref=e39]:
                  - generic [ref=e40]: 승인 후 실행
                  - generic [ref=e41]:
                    - generic [ref=e42]: AI 공급자
                    - combobox "AI 공급자" [ref=e43]:
                      - option "OpenAI" [selected]
                      - option "Google Gemini"
                    - generic [ref=e44]: 모델
                    - combobox "모델" [ref=e45]:
                      - option "GPT-5 mini (권장)" [selected]
                      - option "gpt-3.5-turbo"
                      - option "gpt-3.5-turbo-0125"
                      - option "gpt-3.5-turbo-1106"
                      - option "gpt-3.5-turbo-16k"
                      - option "gpt-3.5-turbo-instruct"
                      - option "gpt-3.5-turbo-instruct-0914"
                      - option "gpt-4"
                      - option "gpt-4-0613"
                      - option "gpt-4-turbo"
                      - option "gpt-4-turbo-2024-04-09"
                      - option "gpt-4.1"
                      - option "gpt-4.1-2025-04-14"
                      - option "gpt-4.1-mini"
                      - option "gpt-4.1-mini-2025-04-14"
                      - option "gpt-4.1-nano (경량)"
                      - option "gpt-4.1-nano-2025-04-14 (경량)"
                      - option "gpt-4o"
                      - option "gpt-4o-2024-05-13"
                      - option "gpt-4o-2024-08-06"
                      - option "gpt-4o-2024-11-20"
                      - option "gpt-4o-mini"
                      - option "gpt-4o-mini-2024-07-18"
                      - option "gpt-5"
                      - option "gpt-5-2025-08-07"
                      - option "gpt-5-chat-latest"
                      - option "gpt-5-codex"
                      - option "gpt-5-mini-2025-08-07"
                      - option "gpt-5-nano (경량)"
                      - option "gpt-5-nano-2025-08-07 (경량)"
                      - option "gpt-5-pro"
                      - option "gpt-5-pro-2025-10-06"
                      - option "gpt-5.1"
                      - option "gpt-5.1-2025-11-13"
                      - option "gpt-5.1-chat-latest"
                      - option "gpt-5.1-codex"
                      - option "gpt-5.1-codex-max"
                      - option "gpt-5.2"
                      - option "gpt-5.2-2025-12-11"
                      - option "gpt-5.2-chat-latest"
                      - option "gpt-5.2-codex"
                      - option "gpt-5.2-pro"
                      - option "gpt-5.2-pro-2025-12-11"
                      - option "gpt-5.3-chat-latest"
                      - option "gpt-5.3-codex"
                      - option "gpt-5.4"
                      - option "gpt-5.4-2026-03-05"
                      - option "gpt-5.4-mini"
                      - option "gpt-5.4-mini-2026-03-17"
                      - option "gpt-5.4-nano (경량)"
                      - option "gpt-5.4-nano-2026-03-17 (경량)"
                      - option "gpt-5.4-pro"
                      - option "gpt-5.4-pro-2026-03-05"
                      - option "gpt-5.5"
                      - option "gpt-5.5-2026-04-23"
                      - option "gpt-5.5-pro"
                      - option "gpt-5.5-pro-2026-04-23"
                      - option "gpt-5.6-luna"
                      - option "gpt-5.6-sol"
                      - option "gpt-5.6-terra"
                      - option "o1"
                      - option "o1-2024-12-17"
                      - option "o1-pro"
                      - option "o1-pro-2025-03-19"
                      - option "o3"
                      - option "o3-2025-04-16"
                      - option "o3-mini"
                      - option "o3-mini-2025-01-31"
                      - option "o4-mini"
                      - option "o4-mini-2025-04-16"
            - generic [ref=e46]:
              - button [ref=e47]:
                - img [ref=e48]
              - button "새 대화" [ref=e50]:
                - img [ref=e51]
          - generic [ref=e54]:
            - generic [ref=e55]: 대기 중인 승인 없음
            - button "워크스페이스 · 타임라인 · 이전 대화" [ref=e56]:
              - generic [ref=e57]: 워크스페이스 · 타임라인 · 이전 대화
              - img [ref=e58]
          - generic "에이전트 대화" [ref=e60]:
            - generic [ref=e62]:
              - generic [ref=e64]:
                - time [ref=e65]: 오후 11:20
                - generic [ref=e66]: 백태스트가 뭐야?
              - generic [ref=e67]:
                - img [ref=e69]
                - generic [ref=e81]:
                  - time [ref=e82]: 오후 11:20
                  - paragraph [ref=e84]: 백테스트는 과거 시장 데이터에 전략을 적용해 어떤 거래가 발생했는지 재현해 보는 검증 과정입니다. 성과만으로 판단하면 안 되며, 수수료·슬리피지, 거래수, 최대 낙폭 등 여러 지표를 함께 확인해야 합니다. 간단히 말해 백테스트는
                  - button "근거 자세히 보기" [ref=e87]:
                    - generic [ref=e88]:
                      - img [ref=e89]
                      - text: 근거 자세히 보기
                    - img [ref=e93]
                  - button "개발자 세부정보" [ref=e96]:
                    - generic [ref=e97]:
                      - img [ref=e98]
                      - text: 개발자 세부정보
                    - img [ref=e102]
          - generic [ref=e106]:
            - textbox "에이전트에게 질문" [ref=e107]:
              - /placeholder: 무엇이 궁금하신가요? 탐색 상태, 백테스트 결과, 전략 설명 등을 물어보세요.
            - button "전송" [disabled] [ref=e108]:
              - img [ref=e109]
        - generic [ref=e111]:
          - generic [ref=e112]:
            - generic [ref=e113]:
              - heading "운영 현황" [level=2] [ref=e114]
              - paragraph [ref=e115]: 현재 연구와 승인이 필요한 항목을 먼저 확인하세요.
            - link "진행 중인 탐색 보기" [ref=e116] [cursor=pointer]:
              - /url: /strategy-search?jobId=search_30d6cef4-d1e9-4d74-b6bd-b4f5e725315c
              - button "진행 중인 탐색 보기" [ref=e117]
          - paragraph [ref=e120]: 모의 거래 모드이며 실전 주문은 승인 게이트에서 차단됩니다.
          - generic [ref=e121]:
            - generic [ref=e122]:
              - heading "현재 연구" [level=2] [ref=e126]
              - generic [ref=e127]:
                - generic [ref=e128]:
                  - generic [ref=e129]: paused
                  - generic [ref=e130]: agent_draft_BTCUSDT_15m
                - generic [ref=e131]:
                  - generic [ref=e132]:
                    - generic [ref=e134]: 시장
                    - generic [ref=e135]: BTCUSDT
                  - generic [ref=e136]:
                    - generic [ref=e138]: 시간봉
                    - generic [ref=e139]: 15m
                  - generic [ref=e140]:
                    - generic [ref=e142]: 활성 경과
                    - generic [ref=e143]: 105시간 42분
                  - generic [ref=e144]:
                    - generic [ref=e146]: 재개 후 남은 시간
                    - generic [ref=e147]: 0초
                  - generic [ref=e148]:
                    - generic [ref=e150]: 평가한 전략
                    - generic [ref=e151]: "440"
                  - generic [ref=e152]:
                    - generic [ref=e154]: 합격
                    - generic [ref=e155]: "14"
                - paragraph [ref=e156]: "약점/세대: 파라미터 지터(안정성) 검증을 통과하지 못했습니다."
                - link "탐색 상세 보기" [ref=e157] [cursor=pointer]:
                  - /url: /strategy-search?jobId=search_30d6cef4-d1e9-4d74-b6bd-b4f5e725315c
                  - button "탐색 상세 보기" [ref=e158]
            - generic [ref=e159]:
              - heading "확인이 필요한 항목" [level=2] [ref=e163]
              - list [ref=e164]:
                - listitem [ref=e165]:
                  - paragraph [ref=e166]: "실전 차단: 설정에서 실전 거래 허용을 켜야 합니다."
                  - paragraph [ref=e167]: 실전 게이트·승인·위험 조건을 충족해야 합니다.
                  - 'link "권장 다음 단계: 실전 게이트 확인 →" [ref=e168] [cursor=pointer]':
                    - /url: /live-trading
          - generic [ref=e170]:
            - heading "현재 단계 요약" [level=2] [ref=e171]
            - paragraph [ref=e172]: 연구·모의·실전 단계를 서로 섞지 않고 확인합니다.
          - generic [ref=e173]:
            - generic [ref=e174]:
              - heading "연구" [level=2] [ref=e178]
              - generic [ref=e179]:
                - generic [ref=e180]:
                  - generic [ref=e182]: 상태
                  - generic [ref=e183]: 진행 중
                - generic [ref=e184]:
                  - generic [ref=e186]: 최근 완료
                  - generic [ref=e187]: 취소
              - link "연구 화면 열기 →" [ref=e188] [cursor=pointer]:
                - /url: /strategy-search?jobId=search_30d6cef4-d1e9-4d74-b6bd-b4f5e725315c
              - generic [ref=e189]:
                - link "탐색 결과" [ref=e190] [cursor=pointer]:
                  - /url: /results
                - link "백테스트" [ref=e191] [cursor=pointer]:
                  - /url: /backtest
            - generic [ref=e192]:
              - heading "모의 매매" [level=2] [ref=e196]
              - generic [ref=e197]:
                - generic [ref=e198]:
                  - generic [ref=e200]: 세션 전략
                  - generic [ref=e201]: VERIFY_PAPER2_1785644402829
                - generic [ref=e202]:
                  - generic [ref=e204]: 세션 상태
                  - generic [ref=e205]: pending_approval
                - generic [ref=e206]:
                  - generic [ref=e208]: 실현 손익
                  - generic [ref=e209]: 0.00 USDT
                - generic [ref=e210]:
                  - generic [ref=e212]: 미실현 손익
                  - generic [ref=e213]: 0.00 USDT
              - paragraph [ref=e214]: 모의 매매는 실제 주문 없이 세션 기록만 따릅니다. 시뮬레이션 전용이며 거래소 주문은 전송되지 않습니다.
              - link "모의 매매 확인 →" [ref=e215] [cursor=pointer]:
                - /url: /paper-trading
            - generic [ref=e216]:
              - heading "실전 매매" [level=2] [ref=e220]
              - generic [ref=e221]:
                - generic [ref=e222]:
                  - generic [ref=e224]: 실전 허용
                  - generic [ref=e225]: 비활성
                - generic [ref=e226]:
                  - generic [ref=e228]: 시작 가능
                  - generic [ref=e229]: 아니오
                - generic [ref=e230]:
                  - generic [ref=e232]: 포지션
                  - generic [ref=e233]: "0"
                - generic [ref=e234]:
                  - generic [ref=e236]: 긴급 정지
                  - generic [ref=e237]: 정상
              - paragraph [ref=e238]: 설정에서 실전 거래 허용을 켜야 합니다.
              - link "승인 게이트 확인 →" [ref=e239] [cursor=pointer]:
                - /url: /live-trading
      - button "AI 트레이딩 직원 열기" [ref=e240]:
        - img [ref=e241]
  - alert [ref=e253]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import {
  3  |   hasProviderKeys,
  4  |   scanPageSecrets,
  5  |   sendAgentQuery,
  6  |   waitForAgentAnswer,
  7  | } from "./helpers";
  8  | 
  9  | test.describe("Agent model switching browser matrix", () => {
  10 |   test.skip(!hasProviderKeys(), "Provider keys required");
  11 | 
  12 |   test("OpenAI → Gemini switch with persistence", async ({ page }) => {
  13 |     await page.goto("/dashboard");
  14 |     await page.getByTestId("dashboard-agent-workspace").waitFor();
  15 |     await page.getByTestId("agent-provider-select").waitFor({ timeout: 60_000 });
  16 | 
  17 |     const providerSelect = page.getByTestId("agent-provider-select");
  18 |     await providerSelect.waitFor();
  19 |     await providerSelect.selectOption("openai");
  20 |     const modelSelect = page.getByTestId("agent-model-select");
  21 |     await modelSelect.waitFor({ state: "visible" });
  22 |     const gpt5 = await modelSelect.evaluate((sel) => {
  23 |       const el = sel as HTMLSelectElement;
  24 |       for (const opt of Array.from(el.options)) {
  25 |         if (opt.value.includes("gpt-5-mini")) return opt.value;
  26 |       }
  27 |       return el.options[1]?.value ?? el.value;
  28 |     });
  29 |     if (gpt5) await modelSelect.selectOption(gpt5);
  30 | 
  31 |     await sendAgentQuery(page, "백태스트가 뭐야?");
  32 |     const a1 = await waitForAgentAnswer(page);
> 33 |     expect(a1.length).toBeGreaterThan(10);
     |                       ^ Error: expect(received).toBeGreaterThan(expected)
  34 |     expect(await scanPageSecrets(page)).toBe(0);
  35 | 
  36 |     await sendAgentQuery(page, "지금 난 뭘 해야 하지?");
  37 |     await waitForAgentAnswer(page);
  38 | 
  39 |     await providerSelect.selectOption("gemini");
  40 |     await modelSelect.waitFor({ state: "visible" });
  41 |     const geminiModel = await modelSelect.inputValue();
  42 |     expect(geminiModel).toMatch(/gemini.*flash/i);
  43 | 
  44 |     await sendAgentQuery(page, "그 이유를 좀 더 쉽게 설명해줘.");
  45 |     const a3 = await waitForAgentAnswer(page);
  46 |     expect(a3.length).toBeGreaterThan(5);
  47 | 
  48 |     await page.reload();
  49 |     await page.getByTestId("dashboard-agent-workspace").waitFor();
  50 |     await expect(page.getByTestId("agent-provider-select")).toHaveValue("gemini");
  51 | 
  52 |     await page.getByTestId("agent-new-conversation").click();
  53 |     await sendAgentQuery(page, "너는 뭘 할 수 있어?");
  54 |     await waitForAgentAnswer(page);
  55 |     expect(await scanPageSecrets(page)).toBe(0);
  56 |   });
  57 | });
  58 | 
```