# ConvertKit (Kit) Setup Status — securemycameras.com

## Completed (done in Kit UI + API)

### Tags Created
| Tag | ID | Purpose |
|-----|-----|---------|
| `quiz-completed` | `17844504` | Applied by Worker when quiz email is submitted |
| `purchased-guide` | `17844523` | Applied by Worker on $29 guide purchase |
| `purchased-network-checklist` | `17844524` | Applied by Worker on $47 upsell purchase |
| `securemycameras-purchased` | `17690846` | Legacy tag (existing) |

### Custom Fields
| Field | ID | Purpose |
|-------|-----|---------|
| `camera_score` | `1224108` | Numeric quiz score (0-100) |
| `camera_tier` | `1224109` | Risk level: low/medium/high/critical |
| `download_url` | `1224106` | Signed download URL for guide PDF |
| `checklist_download_url` | `1227608` | Signed download URL for upsell PDF |
| `source` | `1224110` | Lead source tracking |
| `transaction_id` | `1224107` | Paddle transaction ID |

### Email Sequence: "Camera Security Sequence" (ID: 2696315)
5 emails, all DRAFT status. Body copy entered via UI.

| # | Subject | Delay | Content |
|---|---------|-------|---------|
| 1 | Your camera security score: {{ subscriber.camera_score }}/100 | Immediately | Score + conditional risk-level paragraph (Liquid `{% if %}`) + network isolation tip + PS guide CTA |
| 2 | This is how Ring and Nest cameras actually get hacked | 1 day | Credential stuffing explainer + 2FA urgency + guide CTA |
| 3 | Someone might be watching your camera right now | 2 days | Insecam.org fear hook + exposure risk + guide CTA |
| 4 | The camera setting most people never check | 2 days | UPnP/router hardening + router-specific guide CTA |
| 5 | Last thing — then I'll stop emailing you about this | 1 day | Recap all vulnerabilities + final $29 push + graceful close |

**Sequence settings configured:**
- Exclusion filter: `purchased-guide` tag → subscribers with this tag are excluded from receiving emails
- Restart: disabled (subscribers only receive emails once)
- Schedule: all days enabled

### Automations
| Name | Trigger | Action | Status |
|------|---------|--------|--------|
| Quiz → Camera Security Sequence | `quiz-completed` tag added | Subscribe to Camera Security Sequence | **Inactive** (activate when ready) |

Purchase suppression is handled via sequence exclusion filter (not a separate automation).

### Sending Identity
- **From address:** "Secure My Cameras" `hello@securemycameras.com` — added, **pending email confirmation**
- **Sending domain:** `securemycameras.com` — added, **DNS validation failing** (see below)

---

## Needs Manual Action (Brian)

### 1. Confirm sending email address
- Check inbox for `hello@securemycameras.com` for Kit confirmation email
- Click the confirmation link

### 2. Fix DNS records for sending domain
The Kit sending domain `securemycameras.com` is failing validation. The Cloudflare account with this domain isn't on the mitchellanalytics.com CF account — you need to log into the correct Cloudflare account.

**Required DNS records (all CNAME, proxy OFF / grey cloud):**
```
ckespa.securemycameras.com        → spf.dm-0e042415.sg7.convertkit.com
cka._domainkey.securemycameras.com → dkim.dm-84998785.sg7.convertkit.com
cka2._domainkey.securemycameras.com → dkim2.dm-bf8f8919.sg7.convertkit.com
```

**TXT record:**
```
_dmarc.securemycameras.com → v=DMARC1; p=none (check Kit for exact value)
```

**Critical:** All CNAME records MUST have Cloudflare proxy **OFF** (grey cloud). Proxied CNAMEs get rewritten to A records and break email authentication.

After adding/fixing records, go to Kit → Settings → Email → click **Validate**.

### 3. Publish sequence emails
Each of the 5 emails is in DRAFT. To go live:
- Go to each email in the sequence
- Toggle "Published" ON
- Review the body copy first — especially Email 1's Liquid conditionals

### 4. Activate the automation
- Go to Automations → "Quiz → Camera Security Sequence"
- Toggle **Active** ON

### 5. Delete orphaned automation
- "Visual Automation 4" was accidentally created and is empty — delete it

### 6. Update sequence "Send emails as"
- Currently defaults to `kit@salishpe.com`
- After confirming `hello@securemycameras.com`, update the sequence's Settings → "Send emails as" to use the securemycameras.com address

---

## Env Vars (`.dev.vars` — already updated)
```
KIT_API_KEY=smc_kTS5Prqzyt2vKH3b1g
CONVERTKIT_API_SECRET=sGcml7EGYYSoSM-TULmp5wOeYI_Kqr7P8kYWkJaLuPk
KIT_FORM_ID=9226700
CONVERTKIT_PURCHASE_TAG=17690846
CONVERTKIT_QUIZ_TAG=17844504
CONVERTKIT_GUIDE_TAG=17844523
CONVERTKIT_UPSELL_TAG=17844524
```

---

## For Claude Code: Worker Integration Points

The Worker (`src/worker.ts`) needs these API calls:

### POST /api/quiz-subscribe
When quiz email is submitted:
1. Subscribe email to Kit form (`KIT_FORM_ID`)
2. Tag with `quiz-completed` (`CONVERTKIT_QUIZ_TAG`)
3. Set custom fields: `camera_score` (number), `camera_tier` (low/medium/high/critical)
4. The automation handles enrolling them in the Camera Security Sequence

### Paddle webhook handler (purchase)
When guide is purchased:
1. Tag subscriber with `purchased-guide` (`CONVERTKIT_GUIDE_TAG`)
2. Set `download_url` custom field with signed R2 URL
3. The sequence exclusion filter automatically stops sales emails

### Paddle webhook handler (upsell)
When network checklist is purchased:
1. Tag subscriber with `purchased-network-checklist` (`CONVERTKIT_UPSELL_TAG`)
2. Set `checklist_download_url` custom field with signed R2 URL
