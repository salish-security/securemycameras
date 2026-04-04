# securemycameras.com — Senior FE Code Review
**Date:** 2026-03-26
**Reviewer:** Claude Code (senior FE perspective)
**Scope:** Email gate accessibility, mobile UX, Paddle checkout edge cases, Meta Pixel SPA behavior
**Files reviewed:** `CameraSecurityQuiz.tsx`, `worker.ts`, `index.astro`, `quiz.astro`, `upsell.astro`, `thank-you.astro`, `success.astro`

---

## CRITICAL (production blockers — do not ship)

### C-1: Paddle is still in sandbox mode with a test token
**File:** `src/pages/index.astro:646-648`, `src/pages/upsell.astro:264-266`
**What:** Both pages call `Paddle.Environment.set('sandbox')` and initialize with `token: 'test_4cc33c787bf309e13fcbb4dabec'`. No real purchases will process.
**Fix:** Remove the `Paddle.Environment.set('sandbox')` line entirely and replace the test token with the live client token from the Paddle dashboard.

---

### C-2: Main guide price ID is a placeholder (contains `xxxx`)
**File:** `src/pages/index.astro:660`
```js
items: [{ priceId: 'pri_01km3xxxxj43c9q84yeyn3k642', quantity: 1 }],
```
**What:** This is a placeholder, not a real Paddle price ID. Clicking "Get the Guide" will throw an error or open an invalid checkout.
**Fix:** Replace with the real live price ID from Paddle dashboard (`CLAUDE.md` notes this as pending: `PADDLE_GUIDE_PRODUCT_ID`).

---

### C-3: Upsell price ID is a literal placeholder string
**File:** `src/pages/upsell.astro:290`
```js
items: [{ priceId: 'UPSELL_PRICE_ID_PLACEHOLDER', quantity: 1 }],
```
**What:** Clicking "Add to My Order — $47" will cause a Paddle SDK error. The upsell CTA is completely non-functional.
**Fix:** Create the $47 network checklist product in Paddle, get the price ID, set `PADDLE_UPSELL_PRODUCT_ID` secret, and inject it here.

---

### C-4: Meta Pixel ID is a placeholder on all pages
**File:** `src/pages/index.astro:21,25,27`, `src/pages/quiz.astro:21,22,25`
```js
fbq('init', 'XXXXXXXXXXXXXXXX');
```
**What:** All Pixel events are firing against a fake ID. No leads, pageviews, or purchases are being tracked in Meta Business Manager.
**Fix:** Get the real Pixel ID from Meta Business Manager and replace all instances of `XXXXXXXXXXXXXXXX`. The noscript fallback image also needs updating (both pages, line 25/27 in each file).

---

## HIGH (significant UX gaps or security issues)

### H-1: iOS input zoom — email input font-size is 15px (triggers auto-zoom)
**File:** `src/components/CameraSecurityQuiz.tsx:684`
```js
fontSize: 15,
```
**What:** iOS Safari auto-zooms the viewport when an `<input>` receives focus if `font-size < 16px`. Users on iPhone will see the page zoom in on the email field and not zoom back out, breaking the layout mid-funnel. This is the most common mobile UX bug on email gates.
**Fix:** Change `fontSize` to `16` (or add `font-size: max(16px, 15px)` if you want the visual size preserved on desktop but need to prevent zoom on mobile).

---

### H-2: No error state on email gate — silent failure on empty/invalid submit
**File:** `src/components/CameraSecurityQuiz.tsx:211-213`
```js
const handleEmailSubmit = async () => {
  if (!email || !email.includes("@") || submitting) return;
```
**What:** If the user clicks "See My Score" with an empty field or invalid email, nothing happens — no error message, no border change, no feedback. The button doesn't shake, the input doesn't highlight. User has no idea what went wrong.
**Fix:** Add an `errorMsg` state. On validation failure, set it to a message (e.g., "Please enter a valid email address") and render it below the input with `role="alert"`. On the input, add `aria-invalid="true"` and `aria-describedby` pointing to the error element.

---

### H-3: No `<label>` on email input — screen reader inaccessible
**File:** `src/components/CameraSecurityQuiz.tsx:669-688`
**What:** The email input has no associated `<label>` element and no `aria-label` attribute. Screen readers will announce it as "edit text" with no context. The placeholder disappears on focus.
**Fix:**
```jsx
<label
  htmlFor="email-gate"
  style={{ /* visually-hidden styles */ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
>
  Email address
</label>
<input
  id="email-gate"
  type="email"
  aria-label="Email address"
  ...
/>
```
Minimum fix: add `aria-label="Email address"` to the input.

---

### H-4: Phase transitions have no focus management — screen readers stranded
**File:** `src/components/CameraSecurityQuiz.tsx` — all phase transitions
**What:** When the phase changes from `quiz → gate` or `gate → results`, focus stays on whatever was last focused (the previous answer button, usually). Screen reader users don't know the content has changed; they'll Tab through stale content.
**Fix:** Add a `useRef` on each phase's heading (or the container `div`) and call `.focus()` after phase transitions. Use `tabIndex={-1}` on the target element to make it programmatically focusable without adding it to the natural tab order:
```jsx
const gateHeadingRef = useRef<HTMLHeadingElement>(null);
// after setPhase("gate"):
setTimeout(() => gateHeadingRef.current?.focus(), 50);
```

---

### H-5: Quiz answer buttons have no keyboard navigation — Tab/Enter flow broken
**File:** `src/components/CameraSecurityQuiz.tsx:533-574`
**What:** The answer buttons are `<button>` elements, so they're focusable and Enter/Space works. BUT there's no visual focus indicator (no `:focus` or `:focus-visible` style). The default browser outline may be suppressed by `* { box-sizing: border-box; }` depending on browser. Users who navigate by keyboard can't see which button is focused.
**Also:** The `animating` guard (`if (animating) return`) in `handleAnswer` prevents double-clicks but doesn't visually disable the buttons (`disabled` attribute is never set during animation). Keyboard users can still fire the handler if they spam Enter before the 400ms timeout clears `animating`.
**Fix:** Add an explicit `:focus-visible` outline in the `<style>` block inside the component. Add `disabled={animating}` to answer buttons.

---

### H-6: Download token does not sign the `file` parameter — checklist accessible with guide token
**File:** `src/worker.ts:276`, `src/worker.ts:310-315`
```js
// Token generation
return hmacSha256Hex(secret, `download:${expires}`);
// Token verification
const expected = await hmacSha256Hex(env.DOWNLOAD_SECRET, `download:${expiresStr}`);
```
**What:** The HMAC signs only `expires`. The `file` query parameter (`guide` or `checklist`) is not included in the signed payload. Anyone with a valid guide download URL can modify `file=checklist` in the URL and download the checklist PDF without purchasing it.
**Fix:** Include `file` in the signed message:
```js
// generation:
return hmacSha256Hex(secret, `download:${fileType}:${expires}`);
// verification — requires `file` param to be read before verification:
const fileParam = url.searchParams.get("file") || "guide";
const expected = await hmacSha256Hex(env.DOWNLOAD_SECRET, `download:${fileParam}:${expiresStr}`);
```
Note: this is a breaking change to any existing signed URLs in emails.

---

### H-7: Upsell page shows "Purchase confirmed" to anyone who navigates there directly
**File:** `src/pages/upsell.astro:211-214`
```html
<div class="status-icon">&#10003;</div>
<div class="status-label">Purchase confirmed — your guide is ready</div>
```
**What:** This confirmation is rendered unconditionally. Anyone can navigate to `/upsell` directly (bookmarked link, typed URL, or after pressing browser Back) and see a false "Purchase confirmed" message without buying anything. More importantly, `guideToken` and `guideExpires` are read from query params — if these are empty, `buildThankYouUrl()` generates `/thank-you?token=&expires=` which shows the "no token" fallback. This is recoverable but the "confirmed" banner is misleading.
**Fix:** Only show the confirmation banner if `token` and `expires` params are present:
```js
var hasToken = guideToken && guideExpires;
document.querySelector('.status-bar').style.display = hasToken ? 'block' : 'none';
```

---

## MEDIUM (meaningful UX gaps, non-blocking)

### M-1: No Paddle error event handler — checkout.error goes unhandled
**File:** `src/pages/index.astro:649-654`, `src/pages/upsell.astro:267-271`
**What:** The `eventCallback` only handles `checkout.completed`. Payment failures (`checkout.error`, `checkout.payment.failed`) are silently ignored. If a card is declined or 3DS fails, the user sees the Paddle overlay error state but there's no recovery UX on the page (no toast, no guidance to retry).
**Fix:**
```js
eventCallback: function(event) {
    if (event.name === 'checkout.completed') {
        handleCheckoutComplete(event.data);
    }
    if (event.name === 'checkout.error') {
        console.error('Paddle checkout error:', event.data);
        // Optionally show a toast or banner
    }
}
```

---

### M-2: Upsell `handleUpsellComplete` doesn't create a new download token for the checklist
**File:** `src/pages/upsell.astro:295-297`
```js
async function handleUpsellComplete(data) {
    window.location.href = buildThankYouUrl(true);
}
```
**What:** On upsell completion, the redirect adds `upsell=true` to the thank-you URL and uses the same `token`/`expires` from the guide purchase. `thank-you.astro` then constructs a checklist download URL with that same token. Because the guide token doesn't sign the `file` param (see H-6), this technically works — but only because the security boundary is already broken. Once H-6 is fixed (file param signed), the upsell checklist will stop working because the guide token signs `file=guide`. Will need to generate a new token or make the token file-agnostic for multiple purchases.
**Fix:** After upsell checkout completes, call `/api/create-download-token` to get a checklist-specific token, or refactor the token scheme to support multiple files.

---

### M-3: Email gate in-row layout breaks on narrow screens
**File:** `src/components/CameraSecurityQuiz.tsx:663-708`
```js
display: "flex",
gap: 10,
```
**What:** The email input and "See My Score →" button share a single flex row with no `flex-wrap`. On screens narrower than ~380px, the button text gets truncated or the input becomes too narrow to type in. The button uses `whiteSpace: "nowrap"` making it worse.
**Fix:** Add a breakpoint or use CSS media query to stack them vertically on small screens:
```js
// Or: wrap at a reasonable size threshold
flexWrap: "wrap",
// with input: flex: "1 1 200px" and button: flex: "0 0 auto"
```
Since this is inline styles in JSX, consider moving to a CSS module or Tailwind class if refactoring.

---

### M-4: `aria-busy` not set on submit button during loading
**File:** `src/components/CameraSecurityQuiz.tsx:689-707`
**What:** The button changes text to "Sending…" and becomes visually grayed out, but doesn't set `aria-busy="true"` or `aria-live` on any element. Screen reader users won't know the page is working.
**Fix:**
```jsx
<button
  aria-busy={submitting}
  aria-label={submitting ? "Sending your email, please wait" : "See my security score"}
  ...
>
```

---

### M-5: Letter indicators in quiz answer buttons read aloud by screen readers
**File:** `src/components/CameraSecurityQuiz.tsx:554-571`
```jsx
<span>
  {String.fromCharCode(65 + i)}  {/* renders A, B, C */}
</span>
{opt}
```
**What:** Screen readers will announce "A Yes", "B No", "C Not sure" for the answer options. The letter is a visual affordance, not meaningful content.
**Fix:** Add `aria-hidden="true"` to the letter `<span>`:
```jsx
<span aria-hidden="true" style={{...}}>
  {String.fromCharCode(65 + i)}
</span>
```

---

### M-6: Browser back button during/after Paddle overlay loses checkout state
**File:** `src/pages/index.astro`, `src/pages/upsell.astro`
**What:** Paddle v2 opens as a modal overlay without pushing to browser history. On mobile Safari, pressing the hardware/gesture back button closes the entire page (navigates to previous page) while the overlay is open. If the user backs out and returns, `handleCheckoutComplete` will never fire and the user will have no immediate download link (only the email fallback).
**This is expected Paddle behavior** — but users should know to check email. Consider adding microcopy near the buy button: "You'll also receive a download link by email."
**Fix:** Add a "check email for your download link" note to the page body as a fallback expectation-setter. No code change needed if the email fallback is working.

---

### M-7: `ViewContent` fires before user interacts with quiz
**File:** `src/pages/quiz.astro:23`
```js
fbq('track', 'ViewContent', { content_name: 'Camera Security Quiz' });
```
**What:** `ViewContent` fires on page load, before the user starts the quiz. Meta's best practice is to fire `ViewContent` when the content is meaningfully engaged with. This may overcount quiz starts in campaign reporting.
**Severity:** Low impact if used only for audience building; medium if used for bid optimization. Depends on how you use this event in Meta.
**Fix:** Move the `fbq('track', 'ViewContent', ...)` call into the React component's `onClick` handler for the "Run Security Scan" button, where the quiz actually starts.

---

### M-8: Lead event fires even when API call fails / duplicate fire on retake
**File:** `src/components/CameraSecurityQuiz.tsx:226-228`
```js
if (typeof window !== "undefined" && (window as any).fbq) {
    (window as any).fbq("track", "Lead");
}
```
**What:** Two issues:
1. `Lead` fires regardless of whether the ConvertKit API call succeeded. If the backend fails, the pixel says "Lead" but no email was captured.
2. If a user clicks "Retake quiz", completes it again, and submits a different email, `Lead` fires a second time. This may double-count in Meta reporting.
**Fix for (1):** Move pixel fire inside the `try` block after confirming a successful API response. For (2): acceptable behavior but worth noting for ad attribution.

---

### M-9: `success.astro` builds download URL without `file` param
**File:** `src/pages/success.astro:142`
```js
downloadLink.href = '/api/download?token=' + ... + '&expires=' + ...;
// No &file= parameter
```
**What:** Missing `file` param, so `handlePdfDownload` in worker.ts defaults to `file=guide` (line 282). This is functionally correct for the legacy page but is a silent reliance on a default behavior.
**Note:** This page is marked as a legacy backward-compat page, so fixing it is low priority. Just be aware: if the default changes in the worker, this page breaks silently.

---

## LOW (minor issues, cleanup, edge cases)

### L-1: `@import` inside component `<style>` tag — potential FOUT
**File:** `src/components/CameraSecurityQuiz.tsx:266-267`
```js
<style>{`
  @import url('https://fonts.googleapis.com/css2?...');
```
**What:** This `<style>` tag is injected by React on client hydration. Before JS loads, the component renders with system fonts. After hydration, the Google Fonts import fires. Users may see a flash of the wrong font (FOUT) on slower connections. The `@import` inside a React-injected `<style>` tag also bypasses Astro's normal font preloading.
**Fix:** Move the Google Fonts `<link>` tag to `quiz.astro`'s `<head>`, matching how `index.astro` loads `DM Sans`. Remove the `@import` from the component.

---

### L-2: Progress bar percentage logic off-by-one
**File:** `src/components/CameraSecurityQuiz.tsx:484`
```js
width: `${((currentQ + 1) / QUESTIONS.length) * 100}%`,
```
**What:** The progress bar starts at `1/9 = 11%` on question 1 and hits 100% on the last question. This means the bar shows "complete" before the user answers the last question. Consider using `currentQ / QUESTIONS.length` so it reaches 100% after answering all questions (when transitioning to the gate).
**Impact:** Minor cosmetic issue.

---

### L-3: `handleSubscribe` worker returns 502 on ConvertKit error — exposes internal status
**File:** `src/worker.ts:93`
```js
return json({ ok: false }, 502);
```
**What:** Returning 502 (Bad Gateway) when an upstream API fails is semantically correct but exposes that there's an upstream service. A `500` or `503` is more typical here. Low impact.

---

### L-4: No `autocomplete` attribute on email input
**File:** `src/components/CameraSecurityQuiz.tsx:669`
**What:** `<input type="email">` without `autocomplete="email"` means iOS/Android won't offer to auto-fill email from the keychain. This adds friction in the mid-funnel email gate.
**Fix:** Add `autoComplete="email"` to the input props.

---

### L-5: FAQ accordion `max-height: 300px` could clip long answers
**File:** `src/pages/index.astro:386`
```css
.faq-item.open .faq-a { max-height: 300px; }
```
**What:** Answers longer than ~300px of rendered height will be clipped. Current FAQ answers are short but if content is ever updated, answers could be silently cut off.
**Fix:** Use `max-height: 1000px` as a safe ceiling, or use a JS-calculated exact height approach.

---

### L-6: Paddle initialized twice if user navigates between index and upsell (but they won't — separate page loads)
Not an actual issue given Astro static output, but worth noting: if the Paddle SDK is ever consolidated to a shared layout, the double-init guard `if(f.fbq)return` pattern should be applied to Paddle too.

---

### L-7: `boughtGuide` fallback is too permissive
**File:** `src/worker.ts:180`
```js
const boughtGuide = !env.PADDLE_GUIDE_PRODUCT_ID || productIds.includes(...) || productIds.length === 0;
```
**What:** If `PADDLE_GUIDE_PRODUCT_ID` env var is not set, every transaction is tagged as a guide purchase, even future unrelated products. This is a safe fallback for current state but will cause incorrect tagging once a second product exists.
**Fix:** Once `PADDLE_GUIDE_PRODUCT_ID` and `PADDLE_UPSELL_PRODUCT_ID` are set, this fallback becomes harmless. Just make sure to set both before launching the upsell.

---

## Summary Table

| ID | Severity | Area | Issue | File |
|----|----------|------|-------|------|
| C-1 | Critical | Checkout | Paddle sandbox mode — no real purchases | `index.astro:646`, `upsell.astro:264` |
| C-2 | Critical | Checkout | Guide price ID is a placeholder | `index.astro:660` |
| C-3 | Critical | Checkout | Upsell price ID is a literal placeholder | `upsell.astro:290` |
| C-4 | Critical | Meta Pixel | Pixel ID is `XXXXXXXXXXXXXXXX` everywhere | `index.astro:21`, `quiz.astro:21` |
| H-1 | High | Mobile UX | Email input `fontSize: 15` triggers iOS zoom | `CameraSecurityQuiz.tsx:684` |
| H-2 | High | Accessibility | No error state on invalid email submit | `CameraSecurityQuiz.tsx:211` |
| H-3 | High | Accessibility | No `<label>` on email input | `CameraSecurityQuiz.tsx:669` |
| H-4 | High | Accessibility | No focus management on phase transitions | `CameraSecurityQuiz.tsx` (all phases) |
| H-5 | High | Accessibility | No focus-visible style on quiz buttons | `CameraSecurityQuiz.tsx:533` |
| H-6 | High | Security | `file` param not signed in download token | `worker.ts:276` |
| H-7 | High | UX | Upsell "Purchase confirmed" shows unconditionally | `upsell.astro:211` |
| M-1 | Medium | Checkout | No error handler for `checkout.error` event | `index.astro:649`, `upsell.astro:267` |
| M-2 | Medium | Checkout | Upsell token scheme breaks if H-6 is fixed | `upsell.astro:295` |
| M-3 | Medium | Mobile UX | Email+button row doesn't wrap on narrow screens | `CameraSecurityQuiz.tsx:663` |
| M-4 | Medium | Accessibility | `aria-busy` not set during form submission | `CameraSecurityQuiz.tsx:689` |
| M-5 | Medium | Accessibility | Letter indicators (A/B/C) read by screen readers | `CameraSecurityQuiz.tsx:554` |
| M-6 | Medium | Checkout | Back button on mobile exits Paddle overlay | `index.astro`, `upsell.astro` |
| M-7 | Medium | Meta Pixel | `ViewContent` fires before quiz interaction | `quiz.astro:23` |
| M-8 | Medium | Meta Pixel | Lead fires on API failure, double-fires on retake | `CameraSecurityQuiz.tsx:226` |
| M-9 | Medium | Checkout | `success.astro` download URL missing `file` param | `success.astro:142` |
| L-1 | Low | Performance | Google Fonts `@import` in React style causes FOUT | `CameraSecurityQuiz.tsx:266` |
| L-2 | Low | UX | Progress bar hits 100% before final answer | `CameraSecurityQuiz.tsx:484` |
| L-3 | Low | API | 502 returned on ConvertKit error | `worker.ts:93` |
| L-4 | Low | Mobile UX | No `autocomplete="email"` on email input | `CameraSecurityQuiz.tsx:669` |
| L-5 | Low | UX | FAQ accordion `max-height: 300px` clips long answers | `index.astro:386` |
| L-7 | Low | Backend | `boughtGuide` fallback too permissive without env var | `worker.ts:180` |

---

## Prioritized Fix Order

**Before any real traffic:**
1. C-1: Remove sandbox mode, use live Paddle token
2. C-2: Replace guide price ID placeholder
3. C-4: Replace Meta Pixel ID
4. H-1: Fix iOS zoom (1-line change)

**Before paid ad campaigns:**
5. H-2 + H-3: Email gate error state + label (same PR)
6. M-3: Email/button row wrapping on mobile
7. L-4: Add `autocomplete="email"`
8. M-7: Move `ViewContent` to quiz start click
9. M-8: Move Lead pixel into success path

**Before upsell launch:**
10. C-3: Create upsell product in Paddle, replace placeholder
11. H-6: Sign `file` param in download token
12. M-2: Update upsell token scheme to match H-6 fix
13. H-7: Hide false "confirmed" banner when no token

**After launch / polish:**
14. H-4 + H-5: Focus management and focus-visible (accessibility pass)
15. M-4 + M-5: aria-busy and aria-hidden for screen readers
16. L-1: Move fonts to Astro head
17. L-2: Progress bar off-by-one
18. L-5: FAQ max-height
