# identity API

Taban: `/api/sinav-service-identity/v1`. Yanıt zarfı: `{ success:true, data }` / `{ success:false, error:{ code, message, details? } }`. Web: çerez+CSRF (axios `withCredentials`, `sinav_xsrf`→`X-XSRF-TOKEN`). Mobil: her istekte `X-Auth-Transport: bearer`, `Authorization: Bearer <access>`.

## Oturum açan uçlar (gateway oturumu açar)
Aşağıdaki uçların başarılı yanıtı **session payload**'dır; web'de gateway çerezleri basar, mobilde (`X-Auth-Transport: bearer`) yanıta `data.auth` eklenir:
```json
{ "user": { "userAccountId": 12, "userAccountCode": 43, "userAccountTenantCode": 1, "userAccountOrganizationId": 9,
            "userAccountRole": "guest|learner|content_editor|content_reviewer|platform_support|superadmin",
            "userAccountOrganizationType": "individual|platform", "membershipCode": 44, "displayName": "Elif|null", "email": "…|null",
            "status": "guest|active|pending_deletion", "isGuest": false, "locale": "tr", "timezone": "Europe/Istanbul", "permissions": ["…"] },
  "auth": { "accessToken": "…", "accessTokenExpiresAt": 1760000000000, "refreshToken": "…", "refreshTokenExpiresAt": 1765000000000 } }
```
(`auth` yalnız bearer modunda.) `permissions` rol izinleridir.

| Uç | Erişim | İstek | Not |
|---|---|---|---|
| `POST /auth/guest` | public | `{ locale?, timezone? }` | Misafir hesap + kişisel organizasyon. Onboarding "Başla"da çağrılır. |
| `POST /auth/email/code` | public | `{ email, purpose: login\|signup\|password_reset }` | `{ sent, expiresInSeconds:600, retryAfterSeconds:45 }`. login/password_reset için hesap yoksa da `sent:true` (sızdırmaz). signup'ta hesap varsa 409 `AUTH_EMAIL_ALREADY_REGISTERED`. 45 sn bekleme: 429 `AUTH_CODE_RATE_LIMITED` (`details.retryAfter`). |
| `POST /auth/email/verify` | public | `{ email, code }` | Kodla **giriş**. Hata: `AUTH_CODE_INVALID` (400), `AUTH_CODE_LOCKED` (429), `ACCOUNT_SUSPENDED`, `ACCOUNT_LOCKED`. Silme bekleyen hesap girişle iptal olur. |
| `POST /auth/password/login` | public | `{ email, password }` | 401 `AUTH_INVALID_CREDENTIALS`; 5 hatada 15 dk kilit. |
| `POST /auth/password/reset/request` | public | `{ email }` | kod gönderir. |
| `POST /auth/password/reset/confirm` | public | `{ email, code, newPassword }` | tüm oturumlar kapanır; `PASSWORD_WEAK` (<8). |
| `POST /auth/register` | `account:manage` (misafir) | `{ email, code, displayName?, consents:[{type:'kvkk_notice'\|'terms_of_use'\|'marketing_email', granted}] }` | **Misafir → öğrenci**: önce `/auth/email/code` (`purpose:'signup'`). Yeni session payload döner (rol `learner`); veri taşınmaz, aynı kullanıcıdır. |
| `POST /session/switch` | `session:switch` | `{ membershipCode }` | personel için rol/organizasyon değiştirir. |

## Hesap
| Uç | İzin | Not |
|---|---|---|
| `GET /account` | account:read | `{ code, email, displayName, status, isGuest, emailVerified, hasPassword, locale, timezone, createdAt, deletionScheduledFor, memberships:[{code, role, isDefault, organizationType, organizationName, current}], consents:[{type, granted, recordedAt}] }` |
| `PATCH /account` | account:manage | `{ displayName?, locale?, timezone? }` → hesap |
| `PUT /account/password` | account:manage | `{ currentPassword?, newPassword }` (ilk şifre eklemede currentPassword yok). Misafir 403 `ACCOUNT_GUEST_FORBIDDEN`. |
| `POST /account/deletion/code` | account:manage | silme kodu e-postası |
| `POST /account/deletion` | account:manage | `{ code }` → `{ scheduledFor }`; oturumlar kapanır (30 gün içinde girişle iptal). |
| `POST /account/data-export` / `GET /account/data-export` | manage / read | `{ code, status: requested\|processing\|ready\|failed, requestedAt, completedAt, expiresAt }`; hazır olunca e-postayla bağlantı (48 sa). |
| `GET /memberships` | account:read | üyelikler |
| `GET/PATCH /preferences` | read / manage | `{ theme: system\|light\|dark, uiTextScale -1..2, readingFont: literata\|figtree\|atkinson_hyperlegible, readingTextScale -1..2, readingLineSpacing 0..1, reduceMotion, hapticsEnabled, soundEnabled, keyboardShortcutsEnabled, showExamTimer }` |
| `GET/PATCH /notification-preferences` | read / manage | `{ dailyReminderEnabled, dailyReminderTime "HH:MM"\|null, reviewRemindersEnabled, mockSuggestionsEnabled, weeklyReportEmailEnabled, quietHoursStart, quietHoursEnd }` |
| `POST /devices` | manage | `{ platform: web\|ios\|android, tokenProvider?, pushToken, appVersion?, deviceName?, locale?, permissionGranted? }` |
| `POST /devices/remove` | manage | `{ pushToken }` |
| `GET /consents`, `POST /consents` | read / manage | `{ type, granted }` → güncel onaylar listesi |
| `GET /notifications?limit`, `POST /notifications/{code}/opened` | read / manage | `{ code, kind, title, body, deepLink, createdAt, readAt }` |
| `POST /contact-messages` | account:read | `{ email, name?, topic: account\|payment\|plan\|tutor\|exam_info\|content_error\|other, subject?, body (5–5000), platform?, appVersion? }` |

## Public
| Uç | Not |
|---|---|
| `GET /public/ping` | `"pong"` |
| `GET /public/legal-documents?locale=tr` | `[ {type, title, version, publishedAt} ]` |
| `GET /public/legal-documents/{type}?locale=tr` | `{ code, type, version, locale, title, summaryMd, bodyMd, publishedAt }`; type: kvkk_notice, privacy_policy, terms_of_use, cookie_policy, pre_information, distance_sales, cancellation_refund, marketing_consent_text |
| `POST /public/waitlist` | `{ email, examKey?, source?, utm?, marketingConsent? }` → `{ joined:true }` (çift onay e-postası) |
| `POST /public/contact-messages` | iletişim formu (kimliksiz), gövde yukarıdaki gibi |
| `GET /public/data-exports/{token}` | JSON indirme |

Gateway: `GET /api/gateway/me`, `POST /api/gateway/refresh` (web: çerez, mobil: `{ refreshToken }` + `X-Auth-Transport: bearer` → `data.auth`), `POST /api/gateway/logout` (mobil: gövdede `{ refreshToken }` opsiyonel), `POST /api/gateway/logout-all`.

Hata kodları: `AUTH_EMAIL_INVALID`, `AUTH_EMAIL_ALREADY_REGISTERED`, `AUTH_CODE_INVALID`, `AUTH_CODE_LOCKED`, `AUTH_CODE_RATE_LIMITED`, `AUTH_INVALID_CREDENTIALS`, `ACCOUNT_SUSPENDED`, `ACCOUNT_LOCKED`, `ACCOUNT_GUEST_FORBIDDEN`, `PASSWORD_WEAK`, `PREFERENCE_INVALID`, `MEMBERSHIP_NOT_FOUND`, `CONTACT_BODY_INVALID` (çeviriler `packages/i18n/keys/apiErrorsIdentityKeys.js`).
