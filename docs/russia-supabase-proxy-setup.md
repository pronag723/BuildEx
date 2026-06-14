> ⚠️ **DEPRECATED — not part of the current architecture.**
> BuildEx has pivoted to a **global, English-speaking market** (see
> `C:\Users\K\.claude\plans\hi-claude-this-is-ticklish-kurzweil.md`). The app now
> talks to managed Supabase directly (`NEXT_PUBLIC_SUPABASE_URL` points straight at
> `*.supabase.co`), so this Russia-only Caddy/Oracle proxy is **no longer needed and
> should not be deployed.** Kept for reference only, in case a Russia-targeted mode is
> ever revisited.

---

# Setup: Russia-reachable Supabase proxy (free, WebSocket-capable)

This is the click-by-click setup for the workaround that makes BuildEx work from Russia
without a VPN.

**What you'll build:** an always-on Caddy reverse proxy on an Oracle Cloud Always-Free VM
that forwards REST + Auth + Storage + Realtime WebSockets to the real Supabase host. The
app's `NEXT_PUBLIC_SUPABASE_URL` is repointed at this proxy, so the supabase-js SDK derives
every URL (incl. realtime WS) from the reachable host.

**Cost:** $0. Oracle Always-Free + DuckDNS + Caddy + Let's Encrypt.

**Time:** ~45 min the first time (mostly waiting for Oracle account verification + DNS).

---

## 0. Prerequisites

- A credit card for **Oracle identity verification only** (no charge — Always-Free resources
  are never billed). Use a virtual/disposable card if you prefer.
- A working email address.
- ~10 minutes of patience for Oracle's signup flow.

---

## 1. Create the Oracle Cloud Always-Free account

1. Go to <https://www.oracle.com/cloud/free/> → **Start for free**.
2. Pick a "Home Region" with **good latency to Russia** and likely-available ARM capacity.
   In order of preference:
   - `eu-frankfurt-1` (Germany)
   - `eu-amsterdam-1` (Netherlands)
   - `uk-london-1` (UK)
   - Avoid US regions — too much RTT to RU.
   ⚠️ **Home region cannot be changed later.** Choose carefully.
3. Finish the signup (verify email, phone, card). Wait until the dashboard loads.

---

## 2. Provision the VM

### 2a. Try the ARM shape first (best price/perf — 4 cores, 24 GB RAM)

1. Dashboard → **Compute → Instances → Create instance**.
2. Name: `buildex-proxy`.
3. **Image and shape → Change shape →** "Ampere" → **VM.Standard.A1.Flex** → set 1 OCPU,
   6 GB RAM (way more than needed; leaves headroom in your free quota).
4. Image: **Canonical Ubuntu 22.04** (or latest LTS).
5. **Networking:** keep "Create a new VCN" defaults. Confirm "Assign a public IPv4 address"
   is ON.
6. **SSH keys:** click "Generate a key pair for me" → **download both** private and public
   keys. Save the `.key` (private) file somewhere safe — you can't re-download it.
7. **Create.** If you see **"Out of host capacity"** for ARM, that's normal — Oracle's ARM
   pool is famously oversubscribed in EU regions. Retry over a few hours, or jump to 2b.

### 2b. Fallback: AMD micro shape (always available)

If ARM is unavailable, on the same Create-instance form pick:
- Shape: **VM.Standard.E2.1.Micro** (AMD, 1/8 OCPU, 1 GB RAM).
  This is a separate Always-Free quota that's basically never full. 1 GB RAM is plenty for
  Caddy doing pure pass-through.

### 2c. Note the public IP

Once the instance is **Running**, copy its **Public IPv4 Address** from the instance page.
You'll need it twice below.

---

## 3. Open ports 80 and 443

Oracle blocks inbound traffic in two places — you must open both.

### 3a. VCN Security List (cloud firewall)

1. Instance page → click the VCN name → **Subnets** → click the subnet → **Security Lists**
   → click the default security list.
2. **Add Ingress Rules** (button), add two rules:
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **80**.
   - Source CIDR `0.0.0.0/0`, IP Protocol **TCP**, Destination Port **443**.
3. Save.

### 3b. Instance firewall (iptables, only matters on Ubuntu Oracle images)

SSH in (from Windows PowerShell, using the `.key` you downloaded):

```powershell
ssh -i C:\path\to\ssh-key.key ubuntu@<PUBLIC_IP>
```

Then on the VM:

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

(Oracle Ubuntu ships with a restrictive iptables that drops everything except SSH by
default — without these two lines, the cloud-firewall change above does nothing.)

---

## 4. Free hostname via DuckDNS

The proxy needs HTTPS (the GitHub Pages site is HTTPS, and browsers block mixed content).
HTTPS needs a hostname. DuckDNS gives you one for free.

1. Go to <https://www.duckdns.org/> → sign in (GitHub / Google / etc.).
2. Pick a subdomain, e.g. `buildex-api` → **add domain**. You'll get
   `buildex-api.duckdns.org`.
3. In the **current ip** field for that row, paste your Oracle VM's public IP → **update ip**.
4. Verify from any machine: `nslookup buildex-api.duckdns.org` should return your VM's IP
   (may take ~1 min to propagate).

---

## 5. Install Caddy on the VM

SSH back into the VM. These are the official Caddy install steps for Ubuntu:

```bash
sudo apt update
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Verify: `caddy version` prints a version string.

---

## 6. Configure Caddy

Replace the default Caddyfile:

```bash
sudo tee /etc/caddy/Caddyfile > /dev/null <<'EOF'
buildex-api.duckdns.org {
    reverse_proxy https://czorlwcjseiwpjuwtpry.supabase.co {
        header_up Host czorlwcjseiwpjuwtpry.supabase.co
    }
}
EOF
sudo systemctl restart caddy
sudo systemctl status caddy --no-pager
```

What this does:
- Caddy listens on 80/443, auto-provisions a Let's Encrypt cert for `buildex-api.duckdns.org`.
- Every request (HTTP, WS upgrade, anything) is forwarded to the real Supabase host.
- `header_up Host` rewrites the SNI/Host so Supabase's edge routes the request correctly —
  without it Supabase returns a project-not-found error.
- Realtime WebSockets at `/realtime/v1/websocket` are upgraded transparently — no extra
  config needed.

**Watch the log on first start** (Let's Encrypt provisioning takes ~30s):
```bash
sudo journalctl -u caddy -f
```
You want to see `certificate obtained successfully` for `buildex-api.duckdns.org`. If you
see errors about port 80 / HTTP-01 challenge, check step 3 — both firewalls must be open.

---

## 7. Smoke-test the proxy

From your laptop (Windows PowerShell):

```powershell
# Should return Supabase's "no apikey" 401 JSON — proves REST routing works
curl.exe https://buildex-api.duckdns.org/rest/v1/

# Should return 200 with Supabase's auth settings
curl.exe https://buildex-api.duckdns.org/auth/v1/settings
```

If those return Supabase JSON, you're good. If they return Caddy's "no upstream" page or
a TLS error, recheck steps 3, 4, and the Caddyfile.

For the WebSocket upgrade, the easiest browser-free test is to keep going to step 8 and
load the app — chat will exercise it.

---

## 8. Repoint the app at the proxy

1. **GitHub → repo → Settings → Secrets and variables → Actions → Repository secrets.**
2. Edit `NEXT_PUBLIC_SUPABASE_URL`. Old value: `https://czorlwcjseiwpjuwtpry.supabase.co`.
   New value: `https://buildex-api.duckdns.org`.
3. Save.
4. **Actions → Deploy workflow → Run workflow** (or just push any commit to `main`).
5. Wait for the workflow green tick.

That's it — the app code already knows how to handle this. `lib/supabase/client.js` reads
the env var; supabase-js derives every URL from it. The `lib/supabase/storageUrl.js`
rewriter (restored in this same change) handles avatar/portfolio rows that were uploaded
with the old absolute host, so old images don't break.

---

## 9. Verify end-to-end

1. **You (from anywhere):** open <https://pronag723.github.io/BuildEx/builders/> → profiles
   and images should still load identically to before.
2. **You:** open the chat with someone, send a message — the recipient should see it appear
   live (proves WebSocket pass-through works).
3. **The real test — your friend in Russia, NO VPN:** they open the same `/builders` page.
   Real builder profiles + avatars + portfolio thumbnails should load. They open a chat,
   you send a message from your side — it should appear without them refreshing.

If step 3 passes, the Russia problem is solved.

---

## Troubleshooting

**"My friend still sees no data."**
- Confirm via <https://check-host.net/check-http?host=buildex-api.duckdns.org> from Russia
  nodes that the proxy hostname resolves and responds. If it doesn't, the Oracle IP itself
  is being throttled in RU — destroy the instance, create a new one (possibly in a different
  EU region), repoint DuckDNS at the new IP.

**"Let's Encrypt cert never issues."**
- Port 80 must be reachable from the public Internet for the HTTP-01 challenge. Re-run the
  `iptables` commands in step 3b. From outside: `curl http://buildex-api.duckdns.org/` —
  if it hangs, port 80 is blocked.

**"OAuth login (Discord/Google) still fails in Russia."**
- Expected. Discord is blocked and Google throttled at the provider level — the proxy
  can't fix that. Public anon-key browsing works; logged-in features in Russia will need
  email/OTP auth (separate work) or a Russia-friendly OAuth provider.

**"Oracle reclaimed my ARM instance after a few weeks of low usage."**
- Oracle reclaims *idle* Always-Free ARM instances. Either keep something light running
  on it (a cron job that ticks), or switch to the AMD `E2.1.Micro` shape (never reclaimed).

**"Bandwidth getting tight."**
- Unlikely — Always-Free egress is 10 TB/mo, ~100× what Deno gave you. If you actually
  approach it, that's a "good problem" — buy a domain + Supabase Custom Domain add-on
  (~$10/mo) and retire the proxy.

---

## When to retire this setup

Once you buy your real launch domain + paid server:
- **Option A (cheapest):** repoint Caddy at `api.yourdomain.com` (one Caddyfile line + one
  GH secret value) and keep the Oracle VM running.
- **Option B (cleanest):** buy Supabase's **Custom Domain** add-on (~$10/mo). Supabase
  serves Auth + REST directly from `api.yourdomain.com` — no Cloudflare host involved at
  all — and the proxy goes away entirely. Repoint `NEXT_PUBLIC_SUPABASE_URL` at the
  custom domain, decommission the Oracle VM.
