# Changelog

## [1.0.0-rc.3](https://github.com/email-utils/sanitizer/compare/v1.0.0-rc.2...v1.0.0-rc.3) (2026-10-06)


### Bug Fixes

* **deps:** bump @email-utils/* dependencies ([#49](https://github.com/email-utils/sanitizer/issues/49)) ([98f1aab](https://github.com/email-utils/sanitizer/commit/98f1aab1af92e8dbe21aef45e43f9d78102b0aea))
* **deps:** bump @email-utils/classifier from 1.0.0-rc.2 to 1.0.0-rc.4 in the email-utils group ([#33](https://github.com/email-utils/sanitizer/issues/33)) ([4fd4e53](https://github.com/email-utils/sanitizer/commit/4fd4e535cfac66ac8319c00b16184b4079c62f4c))
* **deps:** bump @email-utils/validator-syntax from 1.0.0-rc.3 to 1.0.0-rc.4 in the email-utils group ([#47](https://github.com/email-utils/sanitizer/issues/47)) ([b184390](https://github.com/email-utils/sanitizer/commit/b1843907d4da64d7423208ebf0ccad051207efbc))
* **providers:** skip a domain alias that would make the key too long ([#43](https://github.com/email-utils/sanitizer/issues/43)) ([3b531a6](https://github.com/email-utils/sanitizer/commit/3b531a6a154f1d59e7ae94245cfa11ea5d38a45e))
* reject oversized input before trimming ([#31](https://github.com/email-utils/sanitizer/issues/31)) ([0691917](https://github.com/email-utils/sanitizer/commit/069191741cefa18caf686fdbb17a932bacadd162))
* throw on unknown options ([#44](https://github.com/email-utils/sanitizer/issues/44)) ([78b766f](https://github.com/email-utils/sanitizer/commit/78b766f237441997b044266d0dda73087ec8864d))

## [1.0.0-rc.2](https://github.com/email-utils/sanitizer/compare/v1.0.0-rc.1...v1.0.0-rc.2) (2026-09-30)


### Bug Fixes

* make the key normalize to itself ([#26](https://github.com/email-utils/sanitizer/issues/26)) ([da4fa0f](https://github.com/email-utils/sanitizer/commit/da4fa0fa83b2490a450b5593db9af093901e6f62))

## [1.0.0-rc.1](https://github.com/email-utils/sanitizer/compare/v1.0.0-rc.0...v1.0.0-rc.1) (2026-09-30)


### ⚠ BREAKING CHANGES

* replace EmailSanitizer with normalizeEmail and provider rules ([#21](https://github.com/email-utils/sanitizer/issues/21))

### Features

* add the /fixtures corpus and previewSanitizerOptions ([#23](https://github.com/email-utils/sanitizer/issues/23)) ([f518d85](https://github.com/email-utils/sanitizer/commit/f518d85384f47ccd2fd3db2f8642b702a42b8f4a))
* replace EmailSanitizer with normalizeEmail and provider rules ([#21](https://github.com/email-utils/sanitizer/issues/21)) ([559f709](https://github.com/email-utils/sanitizer/commit/559f70937cce2c259ea00d66d4f6fde8425b440f))
