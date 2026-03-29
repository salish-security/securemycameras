# Camera Security Email Sequence — ConvertKit Reference

## Setup Instructions

**Trigger:** `quiz-completed` tag added (applied automatically by `/api/subscribe`)
**Exit condition:** `purchased-guide` tag added → remove from sequence immediately
**Timing:** 5 emails over 9 days (Day 0 → 2 → 4 → 6 → 9)
**From:** `Salish AI Security Lab <security@mail.securemycameras.com>`

### Custom Fields Available
- `camera_score` — numeric (0-100)
- `camera_tier` — LOW / MODERATE / HIGH / CRITICAL

### ConvertKit Automations to Create
1. **Quiz completion → sequence:** Trigger on `quiz-completed` tag → subscribe to this sequence
2. **Purchase suppression:** Trigger on `purchased-guide` tag → remove from this sequence
3. **Upsell delivery:** Trigger on `purchased-network-checklist` tag → send delivery email with download link

---

## EMAIL 1 — Immediate (on quiz completion)

**Subject:** Your camera security score: {{ subscriber.camera_score }}/100
**Preview text:** Here's what it means — and the one thing to fix first.

**Body:**

You just took the camera security quiz and scored {{ subscriber.camera_score }} out of 100.

{% if subscriber.camera_tier == "CRITICAL" %}
That puts you in the Critical Risk category. Your camera setup has multiple open vulnerabilities that could be exploited right now.
{% endif %}

{% if subscriber.camera_tier == "HIGH" %}
That puts you in the High Risk category. You've got some basics covered, but there are gaps an attacker could walk through.
{% endif %}

{% if subscriber.camera_tier == "MODERATE" %}
That's a Medium Risk score. You're doing better than most, but there are still openings that matter.
{% endif %}

{% if subscriber.camera_tier == "LOW" %}
That's a Low Risk score — you're ahead of most people. But "low risk" isn't "no risk," and the gaps that remain tend to be the ones people never think to check.
{% endif %}

Here's the single highest-impact thing you can do today:

If your cameras are on the same WiFi network as your laptop and phone, a compromised camera gives an attacker a path to everything. Move your cameras to a guest network. It takes 10 minutes and it's the #1 thing security professionals do at home.

Tomorrow I'll send you the most common way Ring and Nest cameras actually get hacked. It's not what most people think.

— Salish AI Security Lab

P.S. If you want to fix everything at once, the Secure Setup Guide walks you through all 10 hardening steps in one sitting: [Get the Guide — $29](https://securemycameras.com/#buy)

---

## EMAIL 2 — Day 2

**Subject:** This is how Ring and Nest cameras actually get hacked
**Preview text:** It's not hackers breaking encryption. It's much simpler.

**Body:**

{% if subscriber.camera_tier == "CRITICAL" or subscriber.camera_tier == "HIGH" %}
Given your risk level, this applies directly to your setup.
{% endif %}

The #1 way home cameras get compromised isn't some sophisticated hack.

It's credential stuffing.

Here's how it works: you use the same email and password for your camera app that you used for some other website. That other website gets breached (happens constantly — check haveibeenpwned.com). Now your camera login is in a database that gets sold for pennies.

Automated tools try those credentials against Ring, Nest, Arlo, and Wyze accounts 24/7. When they get in, they can watch your feed, talk through your speakers, and access your recordings.

This is how every major "hacked baby monitor" news story happens.

Two things stop it cold:
1. A unique password for your camera account (use a password manager)
2. Two-factor authentication (2FA) — even a stolen password is useless without your phone

If you haven't enabled 2FA on your camera app yet, do it right now. It takes 2 minutes.

Tomorrow: there's a camera setting enabled by default on almost every brand. Most people never check it.

— Salish AI Security Lab

P.S. The Secure Setup Guide includes exact 2FA instructions for Ring, Nest, Arlo, Wyze, Eufy, and Reolink — plus 8 more hardening steps most people skip: [Get the Guide — $29](https://securemycameras.com/#buy)

---

## EMAIL 3 — Day 4

**Subject:** The camera setting most people never check
**Preview text:** It's enabled by default on almost every brand.

**Body:**

{% if subscriber.camera_tier == "CRITICAL" or subscriber.camera_tier == "HIGH" %}
Given your risk level, this applies directly to your setup.
{% endif %}

There's a feature on most routers called UPnP (Universal Plug and Play).

It's enabled by default. It lets devices on your network — including cameras — automatically punch holes in your firewall to allow incoming connections from the internet.

This is how some cameras enable "remote viewing" without any setup. Convenient? Yes. Secure? Absolutely not.

Any malware on your network can use UPnP to open a door to the outside world. And that door stays open until you close it.

Most people have never logged into their router's admin page, which means:
- The admin password is still "admin" or "password"
- UPnP is enabled
- WPS is enabled (another known vulnerability)
- There's no guest network separating cameras from personal devices

The WiFi hardening section of the Secure Setup Guide walks you through fixing all of this, with router-specific instructions for TP-Link, Netgear, Eero, Google Wifi, Xfinity, and ASUS.

[Lock Down My Network — $29](https://securemycameras.com/#buy)

Next up: the website that might be streaming your camera feed right now.

— Salish AI Security Lab

---

## EMAIL 4 — Day 6

**Subject:** This website might be streaming your camera right now
**Preview text:** Insecam.org broadcasts thousands of unsecured cameras. Here's how to make sure yours isn't one of them.

**Body:**

{% if subscriber.camera_tier == "CRITICAL" or subscriber.camera_tier == "HIGH" %}
Given your risk level, this applies directly to your setup.
{% endif %}

{% if subscriber.camera_tier == "LOW" %}
You're ahead of most people — but the cameras on Insecam aren't people who failed the obvious tests. Many of them had changed their passwords. What they missed was leaving a port open. Here's how to check yours.
{% endif %}

There's a website called Insecam.org that aggregates live feeds from unsecured cameras around the world.

Baby monitors. Doorbell cameras. Backyard cameras. Living rooms. Bedrooms.

All streaming publicly because the owners never changed a default password or left a port open.

Last I checked, there were cameras from all 50 states listed.

The owners have no idea.

I'm not linking to it — but it's easy to find, and it's completely legal to view because these cameras are broadcasting on the open internet. The camera owners made them public by not securing them.

Here's the thing: you don't need to be on that specific site to be exposed. Any camera with default credentials or UPnP enabled is discoverable by automated scanners that run 24/7.

The 10-step checklist in our Secure Setup Guide specifically closes every one of these attack vectors. It takes 30 minutes per camera and you only do it once.

[Secure My Cameras — $29](https://securemycameras.com/#buy)

— Salish AI Security Lab

---

## EMAIL 5 — Day 9 (final push)

**Subject:** Last thing — then I'll stop emailing you about this
**Preview text:** A 30-minute checklist that closes every opening.

**Body:**

Over the past week I've shown you:

→ How credential stuffing compromises camera accounts
→ How websites broadcast unsecured camera feeds publicly
→ How UPnP and default router settings leave your network wide open

If any of that made you uncomfortable, good. That's the appropriate response.

Here's the reality: every one of these vulnerabilities is fixable. Not by a professional. Not with expensive equipment. By you, in one afternoon, following a step-by-step checklist.

That's what the Secure Setup Guide is. 22 pages. 10 steps. 30 minutes per camera. A printable cheat sheet for quarterly check-ups.

$29. No subscription. Do it once and your cameras actually protect you instead of putting you at risk.

[Get the Secure Setup Guide — $29](https://securemycameras.com/#buy)

This is the last email in this series. If you're not interested, no hard feelings — the quiz tips I sent earlier will still help.

— Salish AI Security Lab
