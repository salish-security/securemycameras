# securemycameras.com — Implementation Guide
**Companion to:** `tasks/code-review-fe.md`
**Working directory:** `/Users/bmac/salish-workspace/securemycameras`

Execute the fixes below in the order listed. Each group is independent unless noted.
Read each file before editing. Do not refactor anything beyond what's specified.

---

## GROUP 1 — Pre-traffic critical fixes
These block all real revenue. Do first.

### Fix C-1: Remove Paddle sandbox mode
**Files:** `src/pages/index.astro`, `src/pages/upsell.astro`

In both files, delete this line:
```js
Paddle.Environment.set('sandbox');
```
And replace the test token `'test_4cc33c787bf309e13fcbb4dabec'` with the live client token (Brian to provide — format: `live_XXXXXXXXXXXXXXXXX`).

---

### Fix C-2: Replace guide price ID placeholder
**File:** `src/pages/index.astro`

Replace:
```js
items: [{ priceId: 'pri_01km3xxxxj43c9q84yeyn3k642', quantity: 1 }],
```
With:
```js
items: [{ priceId: 'LIVE_GUIDE_PRICE_ID', quantity: 1 }],
```
Brian to provide the real price ID from Paddle dashboard.

---

### Fix C-4: Replace Meta Pixel ID
**Files:** `src/pages/index.astro`, `src/pages/quiz.astro`

In both files, replace every occurrence of `XXXXXXXXXXXXXXXX` with the real pixel ID (Brian to provide from Meta Business Manager). There are 2 occurrences per file (one in `fbq('init', ...)` and one in the noscript img src).

---

### Fix H-1: iOS input zoom
**File:** `src/components/CameraSecurityQuiz.tsx`

Find the email input (around line 684). Change `fontSize: 15` to `fontSize: 16` in the inline style object.

---

## GROUP 2 — Pre-paid-ads UX fixes
Do before running any Meta or Google ad campaigns.

### Fix H-2 + H-3: Email gate error state and label (do together)
**File:** `src/components/CameraSecurityQuiz.tsx`

**Step 1 — Add error state:**
Add `const [emailError, setEmailError] = useState("")` to the state declarations at the top of the component (near line 183).

**Step 2 — Update validation logic in `handleEmailSubmit`:**
Replace:
```js
const handleEmailSubmit = async () => {
  if (!email || !email.includes("@") || submitting) return;
  setSubmitting(true);
```
With:
```js
const handleEmailSubmit = async () => {
  if (submitting) return;
  if (!email || !email.includes("@")) {
    setEmailError("Please enter a valid email address.");
    return;
  }
  setEmailError("");
  setSubmitting(true);
```

**Step 3 — Clear error when user types:**
On the `<input>` element, add to the `onChange` handler:
```js
onChange={(e) => { setEmail(e.target.value); if (emailError) setEmailError(""); }}
```

**Step 4 — Add `aria-label` to the input and wire up error display:**
On the `<input>` element, add these props:
```jsx
id="email-gate"
aria-label="Email address"
aria-describedby={emailError ? "email-error" : undefined}
aria-invalid={!!emailError}
autoComplete="email"
```

**Step 5 — Render error message below the input row:**
After the closing `</div>` of the flex row containing the input and button (around line 708), add:
```jsx
{emailError && (
  <p
    id="email-error"
    role="alert"
    style={{
      fontSize: 13,
      color: "#EF4444",
      marginTop: 6,
      fontFamily: "'Outfit', sans-serif",
    }}
  >
    {emailError}
  </p>
)}
```

---

### Fix M-3: Email/button row wrapping on narrow screens
**File:** `src/components/CameraSecurityQuiz.tsx`

Find the flex container div wrapping the email input and button (around line 663). Add `flexWrap: "wrap" as const` to its style:
```js
style={{
  display: "flex",
  gap: 10,
  marginBottom: 12,
  flexWrap: "wrap" as const,
}}
```
On the `<input>` element, add `minWidth: 0` to its style (prevents flex item overflow). The button already has `whiteSpace: "nowrap"` so it will stay on one line when there's room.

---

### Fix L-4: Add `autocomplete` to email input
**File:** `src/components/CameraSecurityQuiz.tsx`
Already handled in Fix H-2+H-3, Step 4 above (`autoComplete="email"`).

---

### Fix M-5: Hide letter indicators from screen readers
**File:** `src/components/CameraSecurityQuiz.tsx`

Find the `<span>` that renders the letter (A/B/C) inside each answer button (around line 554). Add `aria-hidden="true"`:
```jsx
<span
  aria-hidden="true"
  style={{
    width: 26,
    height: 26,
    ...
  }}
>
```

---

### Fix M-7: Move ViewContent pixel to quiz start
**File:** `src/pages/quiz.astro`

Remove the `fbq('track', 'ViewContent', ...)` call from the inline script in `<head>` (line ~23).

In `src/components/CameraSecurityQuiz.tsx`, find the "Run Security Scan" button's `onClick` (around line 372):
```jsx
onClick={() => setPhase("quiz")}
```
Replace with:
```jsx
onClick={() => {
  setPhase("quiz");
  if (typeof window !== "undefined" && (window as any).fbq) {
    (window as any).fbq("track", "ViewContent", { content_name: "Camera Security Quiz" });
  }
}}
```

---

### Fix M-8: Move Lead pixel fire into success path only
**File:** `src/components/CameraSecurityQuiz.tsx`

In `handleEmailSubmit`, the `fbq('track', 'Lead')` call is currently before the `catch` block, running regardless of API success. Move it inside the `try` block, after the `await fetch(...)` call and only if `!kitRes` didn't throw:

Current structure:
```js
try {
  await fetch("/api/subscribe", { ... });
  // Fire Meta Pixel Lead event
  if (typeof window !== "undefined" && (window as any).fbq) {
    (window as any).fbq("track", "Lead");
  }
} catch {
  // Silent fail
}
```
This is actually already inside the `try` block — it fires after the fetch resolves (whether the response is ok or not). Update to only fire on a successful response:
```js
try {
  const res = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      firstName: "",
      score,
      tier: getRiskLevel(score).level,
    }),
  });
  if (res.ok) {
    if (typeof window !== "undefined" && (window as any).fbq) {
      (window as any).fbq("track", "Lead");
    }
  }
} catch {
  // Silent fail — don't block user from seeing results
}
```

---

## GROUP 3 — Before upsell launch
**These three fixes have a hard dependency between them. Do all three in the same PR/deploy.**

### Fix C-3: Replace upsell price ID placeholder
**File:** `src/pages/upsell.astro`

Replace:
```js
items: [{ priceId: 'UPSELL_PRICE_ID_PLACEHOLDER', quantity: 1 }],
```
With:
```js
items: [{ priceId: 'LIVE_UPSELL_PRICE_ID', quantity: 1 }],
```
Brian to provide from Paddle dashboard.

---

### Fix H-6 + M-2: Sign `file` param in download token (breaking change — do with C-3)

**IMPORTANT:** This changes the token format. Any tokens already in circulation (in sent emails) will break after this deploy. Only deploy this when you're ready to rotate. Tokens generated before this change will return 403. The email fallback copy already exists on `thank-you.astro`.

**Step 1 — Update `generateDownloadToken` in `src/worker.ts`:**

Change:
```ts
async function generateDownloadToken(transactionId: string, expires: number, secret: string): Promise<string> {
  return hmacSha256Hex(secret, `download:${expires}`);
}
```
To:
```ts
async function generateDownloadToken(transactionId: string, expires: number, secret: string, fileType: string = "guide"): Promise<string> {
  return hmacSha256Hex(secret, `download:${fileType}:${expires}`);
}
```

**Step 2 — Update `handlePdfDownload` in `src/worker.ts` to verify with file param:**

In `handlePdfDownload`, the `file` param must be read BEFORE verification. Currently `fileParam` is read after verification (line 282). Reorder so verification uses the file param.

Find the verification block (around line 276) and replace the entire section from after the expiry check to before the R2 lookup:
```ts
  // Read file param before verification (file is part of the signed payload)
  const fileParam = url.searchParams.get("file") || "guide";
  const FILES: Record<string, { r2Key: string; filename: string }> = {
    guide: {
      r2Key: "secure-your-cameras-guide.pdf",
      filename: "Secure-Your-Cameras-Guide.pdf",
    },
    checklist: {
      r2Key: "home-network-security-checklist.pdf",
      filename: "Home-Network-Security-Checklist.pdf",
    },
  };
  const fileInfo = FILES[fileParam] || FILES.guide;

  // Verify HMAC — token signs expires + fileType
  const expected = await hmacSha256Hex(env.DOWNLOAD_SECRET, `download:${fileParam}:${expiresStr}`);
  if (!timingSafeEqualHex(expected, token)) {
    return new Response("Invalid download link.", { status: 403 });
  }

  const obj = await env.PRIVATE_FILES.get(fileInfo.r2Key);
```
Remove the old `FILES` and `fileParam` declarations below (they'll be duplicates now).

**Step 3 — Update `processPaddleEvent` in `src/worker.ts` to generate file-specific tokens:**

Find where `guideDownloadUrl` and `checklistDownloadUrl` are built (around line 190). Update to pass the file type to `generateDownloadToken`:
```ts
    const guideToken = await generateDownloadToken(transactionId, expires, env.DOWNLOAD_SECRET, "guide");
    guideDownloadUrl = `${origin}/api/download?token=${guideToken}&expires=${expires}&file=guide`;

    const checklistToken = await generateDownloadToken(transactionId, expires, env.DOWNLOAD_SECRET, "checklist");
    checklistDownloadUrl = `${origin}/api/download?token=${checklistToken}&expires=${expires}&file=checklist`;
```

**Step 4 — Update `handleCreateDownloadToken` to accept and return file type:**

Change `handleCreateDownloadToken` to accept `fileType` from the request body and pass it to `generateDownloadToken`:
```ts
  const { transactionId, fileType } = body;
  if (!transactionId || typeof transactionId !== "string") {
    return json({ ok: false, error: "Missing transactionId" }, 400);
  }
  const file = (fileType === "checklist") ? "checklist" : "guide";
  const expires = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_IMMEDIATE;
  const token = await generateDownloadToken(transactionId, expires, env.DOWNLOAD_SECRET, file);
  return json({ ok: true, token, expires, file }, 200);
```

**Step 5 — Update `index.astro` checkout handler to request a guide-specific token:**

In the `handleCheckoutComplete` function (around line 681), update the fetch to include `fileType`:
```js
body: JSON.stringify({ transactionId: transactionId, fileType: 'guide' }),
```

**Step 6 — Update `upsell.astro` to generate a checklist-specific token on upsell complete:**

Replace `handleUpsellComplete`:
```js
async function handleUpsellComplete(data) {
    var transactionId = data && data.transaction_id;
    if (transactionId) {
        try {
            var res = await fetch('/api/create-download-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transactionId: transactionId, fileType: 'checklist' }),
            });
            var result = await res.json();
            if (result.ok && result.token && result.expires) {
                // Build thank-you URL with both guide token (from page params) and upsell token
                var url = '/thank-you'
                    + '?token=' + encodeURIComponent(guideToken)
                    + '&expires=' + encodeURIComponent(guideExpires)
                    + '&upsell=true'
                    + '&utoken=' + encodeURIComponent(result.token)
                    + '&uexpires=' + encodeURIComponent(result.expires);
                window.location.href = url;
                return;
            }
        } catch (err) {
            console.error('Upsell token creation failed:', err);
        }
    }
    window.location.href = buildThankYouUrl(true);
}
```

**Step 7 — Update `thank-you.astro` to read separate upsell token:**

In the script block, after reading `token` and `expires`, also read `utoken` and `uexpires`:
```js
var utoken = params.get('utoken');
var uexpires = params.get('uexpires');
```
For the checklist link, use the upsell token if present, otherwise fall back to the guide token (pre-H-6-fix behavior as a grace-period fallback):
```js
if (upsell === 'true') {
    var cToken = utoken || token;
    var cExpires = uexpires || expires;
    checklistLink.href = '/api/download?token=' + encodeURIComponent(cToken)
        + '&expires=' + encodeURIComponent(cExpires)
        + '&file=checklist';
    checklistLink.style.display = 'inline-flex';
}
```

---

### Fix H-7: Hide false "Purchase confirmed" banner on direct navigation
**File:** `src/pages/upsell.astro`

In the inline `<script>` block, after reading `guideToken` and `guideExpires` from params, add:
```js
// Hide confirmation banner if no valid token (direct navigation, not post-checkout)
if (!guideToken || !guideExpires) {
    var statusBar = document.querySelector('.status-bar');
    if (statusBar) statusBar.style.display = 'none';
}
```

---

## GROUP 4 — Accessibility pass (post-launch polish)

### Fix H-4: Focus management on phase transitions
**File:** `src/components/CameraSecurityQuiz.tsx`

**Step 1 — Add refs for phase heading targets:**
```jsx
const gateHeadingRef = useRef<HTMLHeadingElement>(null);
const resultsHeadingRef = useRef<HTMLDivElement>(null);
```

**Step 2 — Move focus after phase change in `handleAnswer`:**
When transitioning to `"gate"`:
```js
setPhase("gate");
setTimeout(() => gateHeadingRef.current?.focus(), 50);
```

**Step 3 — Move focus after phase change in `handleEmailSubmit`:**
```js
setPhase("results");
setTimeout(() => { resultsHeadingRef.current?.focus(); setShowResult(true); }, 300);
```
(Remove the existing separate `setTimeout(() => setShowResult(true), 300)` and fold it into the one above.)

**Step 4 — Add `ref` and `tabIndex` to the target elements:**

On the gate phase `<h2>` (around line 638):
```jsx
<h2
  ref={gateHeadingRef}
  tabIndex={-1}
  style={{ outline: "none", ... }}
>
  Your Camera Security Score Is Ready
</h2>
```

On the results phase score container `<div>` (around line 777):
```jsx
<div
  ref={resultsHeadingRef}
  tabIndex={-1}
  style={{ outline: "none", display: "flex", ... }}
>
```

---

### Fix H-5: Focus-visible style on quiz buttons
**File:** `src/components/CameraSecurityQuiz.tsx`

In the `<style>` block inside the component (around line 265), add:
```css
button:focus-visible {
  outline: 2px solid #EF4444;
  outline-offset: 2px;
}
```

Also add `disabled={animating}` to each answer button to prevent double-submission during the 400ms animation timeout.

---

### Fix M-4: `aria-busy` on submit button
**File:** `src/components/CameraSecurityQuiz.tsx`

On the submit button in the gate phase, add:
```jsx
aria-busy={submitting}
aria-label={submitting ? "Sending, please wait" : "See my security score"}
```

---

## GROUP 5 — Low priority cleanup

### Fix L-1: Move Google Fonts out of React component
**File:** `src/components/CameraSecurityQuiz.tsx`, `src/pages/quiz.astro`

In `quiz.astro` `<head>`, add:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
```

In `CameraSecurityQuiz.tsx`, remove the `@import` line from the `<style>` block (keep the keyframe animations and `* { box-sizing: border-box; }`).

---

### Fix L-2: Progress bar off-by-one
**File:** `src/components/CameraSecurityQuiz.tsx`

Find (around line 484):
```js
width: `${((currentQ + 1) / QUESTIONS.length) * 100}%`,
```
Change to:
```js
width: `${(currentQ / QUESTIONS.length) * 100}%`,
```

---

### Fix L-5: FAQ accordion max-height
**File:** `src/pages/index.astro`

Find (around line 386):
```css
.faq-item.open .faq-a { max-height: 300px; }
```
Change to:
```css
.faq-item.open .faq-a { max-height: 800px; }
```

---

## Verification checklist after each group

**After Group 1:**
- [ ] Click "Get the Guide" — Paddle overlay opens with real pricing
- [ ] Pixel events appear in Meta Events Manager (use Test Events tool)

**After Group 2:**
- [ ] On iOS Safari, tap email input — page does NOT zoom
- [ ] Submit empty email — red error message appears
- [ ] Tab through quiz on desktop — focus ring is visible on buttons
- [ ] `ViewContent` no longer fires on quiz page load (check Meta Events Manager)
- [ ] `Lead` only fires after successful API response

**After Group 3:**
- [ ] Upsell "Add to My Order" opens a real Paddle checkout
- [ ] Download guide with valid token, then manually change `file=checklist` in URL — should get 403
- [ ] Complete upsell purchase — checklist download link works on thank-you page
- [ ] Navigate to `/upsell` directly without params — "Purchase confirmed" banner is hidden

**After Group 4:**
- [ ] Run WAVE or axe accessibility scan — no critical errors
- [ ] Tab through entire quiz flow with keyboard only — all interactive elements reachable
- [ ] Test with VoiceOver (macOS) or NVDA — phase transitions announce new content
