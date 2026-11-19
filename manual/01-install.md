# 1. 설치

## 설치 파일 받기

GitHub 저장소 [nanumspace/K-AIPA_DQ](https://github.com/nanumspace/K-AIPA_DQ)의 **Releases** 페이지에서 운영체제에 맞는 파일을 받습니다. 현재 릴리스는 v1.0.0 입니다.

| 운영체제 | 파일 |
|---|---|
| Windows 10/11 64비트 (일반 PC) | `K-AIPA-DQ-<버전>-win-x64.exe` |
| Windows 11 ARM (Snapdragon 등 ARM 노트북) | `K-AIPA-DQ-<버전>-win-arm64.exe` |
| macOS (Apple Silicon) | `K-AIPA-DQ-<버전>-mac-arm64.dmg` |

어느 것을 받을지 모르면 Windows 는 x64, Mac 은 arm64 를 받습니다. 32비트 Windows 와 Intel Mac 용은 제공하지 않습니다.

이전 이름(Quality Validator)의 v0.x 설치 파일은 [기존 저장소의 릴리스](https://github.com/nanumspace/KAI_DQ_App/releases)에 보존됩니다. 새 저장소에는 변경 이력이 이어지며, 이 설명서는 K-AIPA DQ v1.0.0 기준입니다.

설치 파일은 모두 코드 서명이 되어 있습니다. Windows 는 GlobalSign EV 인증서(게시자 Nanum Space Co,. Ltd), macOS 는 Apple Developer ID 서명과 공증입니다. 파일의 SHA-256 은 Release 페이지의 `SHA256SUMS.txt` 와 대조할 수 있습니다. 이 서명과 해시는 **설치 파일이 게시된 그대로인지** 확인하는 용도이며, 검증 결과 파일(`submission.json` 등)의 진본을 보증하지 않습니다([4장](04-output.md)).

## Windows

1. 받은 `.exe` 파일을 실행합니다. 파일 속성의 "디지털 서명" 탭에서 서명자 **Nanum Space Co,. Ltd** 를 확인할 수 있습니다.
2. 설치 위치를 확인하고 설치합니다. 관리자 권한 없이 사용자 폴더에 설치됩니다.
3. 설치가 끝나면 시작 메뉴의 **K-AIPA DQ**로 엽니다.

"Windows의 PC 보호" 경고가 뜨면 파일이 손상되었거나 다른 곳에서 받은 것입니다. Release 페이지에서 다시 받습니다.

## macOS

1. 받은 `.dmg`를 열고 **K-AIPA DQ**를 **Applications** 폴더로 끌어다 놓습니다.
2. Applications 폴더에서 앱을 엽니다. 공증된 앱이므로 경고 없이 열립니다.

"확인되지 않은 개발자" 경고가 뜨면 파일이 손상되었거나 다른 곳에서 받은 것입니다. Release 페이지에서 다시 받습니다.

## 설치 후 확인

- 프로그램은 인터넷 연결 없이 동작합니다. 방화벽이나 망 분리 환경에서도 그대로 쓸 수 있습니다. 프로그램에는 데이터를 외부로 자동 전송하는 기능이 없습니다.
- 명세와 검증 규칙은 프로그램 안에 들어 있습니다. 따로 받을 파일이 없습니다.
- 실행 결과와 이력은 사용자 컴퓨터의 앱 데이터 폴더에 저장됩니다. 위치는 **설정** 화면의 **데이터 위치**에서 볼 수 있고 **폴더 열기**로 열 수 있습니다.

| 운영체제 | 저장 위치 |
|---|---|
| Windows | `%APPDATA%\Quality Validator` |
| macOS | `~/Library/Application Support/Quality Validator` |

폴더 이름이 `Quality Validator` 인 것은 의도한 것입니다. 앱 이름은 K-AIPA DQ 로 바뀌었지만, 이전 판(v0.x, Quality Validator)을 쓰던 PC 에서 실행 이력·보고서·규칙 설정이 그대로 보이도록 폴더 이름을 옛 값으로 고정했습니다.

### 앱 데이터 폴더에 무엇이 있나

| 이름 | 내용 | 환자 단위 정보 |
|---|---|---|
| `history.duckdb` | 실행 이력 DB 파일 하나. 실행 요약, 규칙별 결과, 위반 행 목록(`findings`)이 들어 있습니다 | **있음** (위반 행의 환자 ID·행 키·상세) |
| `runs/<실행 ID>/` | 실행마다 폴더 하나. 정규화된 입력 `input/<TABLE>.csv`, 출력 파일 6종, `normalization.json` | **있음** (`input/`, `findings.csv`, `sufficiency.csv`) |
| `rule-overrides.json`, `rule-history.jsonl` | 이 PC 의 규칙 설정과 변경 이력([6장](06-rules.md)) | 없음 |
| `config.json` | 명세 위치, 검증 기준일 기본값 등 앱 설정 | 없음 |

즉 이 폴더 전체가 환자 단위 정보를 담은 **기관 내부 자료**입니다. 폴더가 있는 컴퓨터의 접근 통제·디스크 암호화·반출 금지는 기관의 정보보안 정책에 따릅니다. 프로그램이 따로 암호화하지 않습니다.

## 백업과 삭제

**백업.** 앱을 닫은 뒤 앱 데이터 폴더를 통째로 복사합니다. 이력 DB 와 `runs/` 폴더와 규칙 설정이 함께 있어야 같은 상태로 되살릴 수 있습니다. 백업본에도 환자 단위 정보가 들어 있으므로 기관의 보관·반출 정책을 따릅니다. 백업의 보관 기간과 위치는 프로그램이 정하지 않으며 **기관 정책으로 정합니다**.

**실행 기록 삭제.** **통계 모니터링**의 **삭제**는 그 실행의 DB 기록(요약, 규칙별 결과, 위반 행)과 `runs/<실행 ID>/` 폴더(입력과 출력 파일)를 지웁니다. 삭제 전에 확인 창이 뜹니다. **다음은 지워지지 않습니다.**

- **내보내기**나 **다른 이름으로 저장**으로 다른 폴더에 복사해 둔 파일
- 이미 전달한 `submission.json` 과 그 사본
- 앱 데이터 폴더의 백업본
- 병원이 원래 가지고 있는 코호트 테이블 파일

내보낸 사본과 백업본은 각자 찾아서 지워야 합니다. 삭제한 기록은 되돌릴 수 없습니다.

## 프로그램 삭제

Windows는 **설정 → 앱**에서, macOS는 Applications 폴더에서 앱을 지웁니다. **앱을 지워도 앱 데이터 폴더는 남습니다.** 실행 이력과 입력 사본까지 없애려면 위 저장 위치 폴더를 직접 지웁니다. 내보낸 사본과 백업본은 별도로 지웁니다.
