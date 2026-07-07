# Moving hetyres.co.uk away from GoDaddy — notes for Emma & Howard

> **What this covers:** transferring the domain name `hetyres.co.uk` from GoDaddy
> to Krystal, so the site and email are all managed in one place.

## The good news first

Because `hetyres.co.uk` is a **UK domain**, the transfer is run by **Nominet**
(the UK domain registry), not by the usual international system. That makes it
much simpler than a `.com`:

- **No "auth code" / EPP code** to copy and paste (that's only for `.com`, `.net`, etc.)
- **No renewal fee to transfer** — you keep your existing expiry date; nothing added, nothing lost
- **No 5–7 day waiting period** — it can complete within the hour
- It works by changing one thing: the **"IPS tag"** — a short label that tells
  Nominet which company looks after the domain

The slowest part is usually just waiting on GoDaddy's support queue.

## What actually needs to happen

The domain moves the moment **GoDaddy** changes its IPS tag to **Krystal's**
tag (`KRYSTAL`, all caps, no spaces).

**Important:** for a `.uk` domain, only the *losing* registrar (GoDaddy) can
change the IPS tag — Krystal **cannot** pull the domain across the way a `.com`
transfer works. So whatever we do, the tag change happens on the GoDaddy side.

**The steps:**
1. Place a (free) transfer order with **Krystal** for hetyres.co.uk — Krystal's
   IPS tag is **`KRYSTAL`**. Krystal then waits to catch the domain.
2. In **GoDaddy**: log in → find hetyres.co.uk → **Domain Settings / Additional
   Settings** → **"Transfer domain away from GoDaddy"** → enter the IPS tag
   **`KRYSTAL`** → **Complete Transfer**.
3. Nominet propagates the change in real time; the domain lands in the Krystal
   account, usually within a few hours. No downtime.

**Can Krystal do it all so Emma & Howard don't touch GoDaddy?** Not the tag
change — that's physically GoDaddy-only. The only way to avoid the GoDaddy login
task is to ask **GoDaddy support** to set the tag to `KRYSTAL` on your behalf,
but you'd still need to authenticate as the account owner to instruct them.

## Before you start — the two things that can block it

1. **The 60-day lock.** A `.uk` domain can't be moved within 60 days of being
   registered or having its owner/contact details changed. If nothing's changed
   recently, you're fine. Worth checking the registration date isn't within the
   last two months.
2. **Account access.** You need the GoDaddy login (username + password). If
   2-step verification is on, GoDaddy sends a code by text or email to approve
   the change — so make sure you can get to whatever phone/email is on the
   account. **This is the single most common thing that stalls a transfer** — if
   the account was set up years ago on an old email, sort that out first.

## "It says turn off Domain Privacy — does that expose us to spam?"

Short answer: **for a `.co.uk`, exposure is momentary and minimal.**

- Every domain has a public **WHOIS record** (owner name/address/email/phone).
  "Domain Privacy" hides those behind placeholder details. It's GoDaddy's own
  paid product, so it can't travel to Krystal — that's why it gets switched off
  as part of the handover. This is standard everywhere, not a GoDaddy quirk.
- **Nominet does not publish individuals' home addresses by default** for `.uk`
  domains registered to a non-trading individual — it's withheld automatically
  and for free. There's no privacy add-on to lose.
- If registered to **H E Tyres Ltd (a company)**, the company name + registered
  address show — but that's already public on Companies House, so nothing new
  is exposed.
- The window where real details are briefly visible is **minutes to a couple of
  hours** for a `.uk` tag change, not days. Krystal then applies `.uk` privacy
  by default, so it's protected again.

So the scary-sounding "turn off Domain Privacy" step is really a `.com`-world
concern. It doesn't meaningfully open Emma & Howard up to spam or cold callers.

## What won't break

- The **website stays live** throughout — a tag change doesn't take the site down.
- **Email** is unaffected by the tag change itself, but DNS/email settings must be
  set up correctly at Krystal's end (Zoho) — Nick handles that so nothing drops.
- You **don't lose the domain or the name** — same domain, same expiry, just a
  different company managing it.

## Suggested next step

Get Nick (or Krystal) **Krystal's IPS tag**, and confirm the GoDaddy login works
with a current email/phone for the security code. With those two things, this is
a ~15-minute job with no downtime.

---

### One flag for Nick

These notes assume the domain is **`hetyres.co.uk`** (the `.uk` IPS-tag process).
If it turns out to be a `.com`, the process is different — auth code + 5–7 day
wait + a renewal fee. Confirm the exact domain ending before relying on this.

**Sources:**
- GoDaddy — Transfer my domain away from GoDaddy: https://www.godaddy.com/help/transfer-my-domain-away-from-godaddy-3560
- GoDaddy — About .uk Domains (GB): https://www.godaddy.com/en-uk/help/about-uk-domains-5854
- Maxinames — Transfer a .co.uk domain (IPS tag, no EPP code): https://www.maxinames.com/blog/co-uk-domain-transfer-ips-tag/
- GoDaddy — Unlock or lock my domain: https://www.godaddy.com/help/unlock-or-lock-my-domain-410
