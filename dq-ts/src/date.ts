// 검증 기준일 기본값. 기관마다 같은 날짜를 쓰도록 한국 시간(Asia/Seoul)의 달력 날짜로 고정한다.
// UTC 날짜를 쓰면 한국 시간 00:00~08:59 에 전날이 되어 당일 기록이 미래 날짜로 판정된다.

const FMT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

/** now 시각의 한국 날짜 (YYYY-MM-DD) */
export function seoulToday(now: Date = new Date()): string {
  return FMT.format(now);
}
