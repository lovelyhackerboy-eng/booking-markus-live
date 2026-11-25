# Verification

39 text source files captured from Live hosting; original SHA-256 checked before sanitization. index.html uses exact public HTTP source because cPanel rewrote its charset tag. Five public text assets match the captured hashes; the Live logo is also included.

29 PHP files pass PHP 8.3 syntax lint; 3 JS files pass node --check. No live mutation, login, AI, payment or full end-to-end test was performed during packaging. PHP 7.4 runtime compatibility was not retested. This is a packaging check, not security certification.

**25/11/2026:** `README.md` và `SETUP.md` được thêm cảnh báo "v1 đã ngừng, không deploy `public/`" (v2 trong `platform/` là bản chính thức), và mã SHA-256 của hai file này trong `SHA256.json` đã cập nhật theo. Mã gốc lúc bàn giao nằm trong lịch sử git (commit `705b435`). Mã nguồn v1 trong `public/` không đổi.
