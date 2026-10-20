# 비밀편지 앱 (안드로이드 시제품)

현재 GitHub Pages의 `index.html`은 기존 9차 웹 시제품입니다. **수정하지 마세요.**

## Cloudflare 서버 한 번에 설치

[**Cloudflare에서 비밀편지 서버 설치하기**](https://deploy.workers.cloudflare.com/?url=https://github.com/wjsdbswn-star/secret-lette/tree/main/worker)

클릭 → Cloudflare 로그인 승인 → 배포 진행. Cloudflare는 새 비밀편지 Worker와 별도 D1 데이터베이스를 생성·연결합니다. 기존 9차 서버를 사용하거나 변경하지 않습니다.

배포가 끝나면 화면에 표시되는 `https://...workers.dev` 주소를 알려주세요. 서버의 `/v10/health`가 정상인지 확인하고, GitHub의 공개 `server-config.json`에 **주소만** 등록해 앱이 자동으로 연결되도록 마무리하겠습니다. **비밀번호/API 토큰은 절대 채팅에 보내지 마세요.**

현재 APK 자동 빌드는 [GitHub Actions](https://github.com/wjsdbswn-star/secret-lette/actions/workflows/android-apk.yml)에서 진행됩니다.

서버에는 편지 원문과 복호화 키를 저장하지 않고 암호문만 저장합니다. 링크를 먼저 연 사람에게 열람 권한이 주어지며, 받은 사람이 누구인지는 인증하지 않습니다. 만료 이후에도 이미 본 사람의 캡처는 삭제할 수 없습니다.

개발·시험용 시제품입니다. 실사용 보안 감사와 악용 방지 정책은 아직 완료되지 않았습니다.
