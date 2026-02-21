# Deployment Guide - Smart Stable Manager
# For: www.holidayskitak.uk on DigitalOcean droplet 138.68.162.91

## Step 1: Install Docker on the droplet

Paste these commands into your DigitalOcean console one block at a time:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Verify it works
docker --version
docker compose version
```

## Step 2: Clone the repo and set up

```bash
cd /opt
git clone https://github.com/Sheer-elbow/Horse-Manager.git stable-manager
cd stable-manager
git checkout claude/smart-stable-manager-mvp-7gVII
```

## Step 3: Create your .env file

```bash
cat > .env << 'ENVEOF'
# --- Database ---
DATABASE_URL=postgresql://stablemanager:PUT_A_STRONG_DB_PASSWORD_HERE@db:5432/stablemanager
POSTGRES_USER=stablemanager
POSTGRES_PASSWORD=PUT_A_STRONG_DB_PASSWORD_HERE
POSTGRES_DB=stablemanager

# --- JWT (generate with: openssl rand -hex 32) ---
JWT_SECRET=PUT_A_RANDOM_64_CHAR_STRING_HERE
JWT_REFRESH_SECRET=PUT_ANOTHER_RANDOM_64_CHAR_STRING_HERE
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# --- Initial Admin ---
ADMIN_EMAIL=gwward@me.com
ADMIN_PASSWORD=ChangeThisOnFirstLogin1!

# --- SMTP (Resend) ---
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=resend
SMTP_PASS=YOUR_RESEND_API_KEY_HERE
SMTP_FROM=noreply@holidayskitak.uk

# --- App ---
APP_URL=https://www.holidayskitak.uk
NODE_ENV=production
PORT=3000

# --- Domain ---
DOMAIN=www.holidayskitak.uk
ENVEOF
```

Now generate the random secrets and set your passwords:

```bash
# Generate random JWT secrets
JWT1=$(openssl rand -hex 32)
JWT2=$(openssl rand -hex 32)
DBPASS=$(openssl rand -hex 16)

# Replace the placeholders in .env
sed -i "s/PUT_A_STRONG_DB_PASSWORD_HERE/$DBPASS/g" .env
sed -i "s/PUT_A_RANDOM_64_CHAR_STRING_HERE/$JWT1/" .env
sed -i "s/PUT_ANOTHER_RANDOM_64_CHAR_STRING_HERE/$JWT2/" .env

# Now add your Resend API key (replace re_XXXX with your actual key):
sed -i "s/YOUR_RESEND_API_KEY_HERE/re_XXXX/" .env

# Verify the file looks right
cat .env
```

## Step 4: Set up Cloudflare DNS

In your Cloudflare dashboard for holidayskitak.uk:

1. Go to **DNS > Records**
2. Add a record:
   - Type: **A**
   - Name: **www**
   - IPv4 address: **138.68.162.91**
   - Proxy status: **DNS only (grey cloud)** ← important for initial setup!
3. Save

4. Go to **SSL/TLS > Overview**
   - Set encryption mode to **Full (strict)**

> We start with "DNS only" so Caddy can obtain its Let's Encrypt certificate.
> After the first deploy is working, you can turn on the orange cloud (Proxied).

## Step 5: Open firewall ports

```bash
# If UFW is enabled on your droplet:
ufw allow 80/tcp
ufw allow 443/tcp
ufw status
```

## Step 6: Deploy!

```bash
cd /opt/stable-manager
chmod +x deploy.sh
./deploy.sh
```

This will:
- Build the Docker containers (takes a few minutes the first time)
- Start PostgreSQL, the backend, the frontend, and Caddy
- Run database migrations
- Seed the admin user (gwward@me.com)

## Step 7: Verify

```bash
# Check all containers are running
docker compose ps

# Check logs if something seems wrong
docker compose logs -f
```

Then visit **https://www.holidayskitak.uk** in your browser.

- Login with: **gwward@me.com** and the ADMIN_PASSWORD from your .env
- You'll be forced to change the password on first login

## Step 8: Turn on Cloudflare proxy (optional, after confirming it works)

1. Go back to Cloudflare DNS
2. Edit the www A record
3. Toggle proxy status to **Proxied (orange cloud)**
4. Save

## Step 9: Set up daily backups

```bash
chmod +x /opt/stable-manager/scripts/backup.sh

# Add to crontab (runs daily at 3 AM):
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/stable-manager/scripts/backup.sh >> /var/log/stable-backup.log 2>&1") | crontab -

# Verify
crontab -l
```

---

## Resend: Verify your sending domain

For invite emails to actually deliver, you need to verify holidayskitak.uk in Resend:

1. Go to https://resend.com/domains
2. Add **holidayskitak.uk**
3. Resend will give you DNS records (SPF, DKIM, etc.) to add in Cloudflare
4. Add those records in Cloudflare DNS
5. Click "Verify" in Resend

Until this is done, invite emails will fail to send (but they'll be logged
in the backend container logs so you can still grab the invite link manually).

---

## Troubleshooting

**Containers won't start:**
```bash
docker compose logs backend   # Check backend logs
docker compose logs db         # Check database logs
docker compose logs caddy      # Check Caddy/HTTPS logs
```

**Caddy can't get HTTPS cert:**
- Make sure ports 80 and 443 are open
- Make sure Cloudflare is set to "DNS only" (grey cloud) during first deploy
- Check: `docker compose logs caddy`

**Can't reach the site:**
- Check `docker compose ps` - all should be "Up"
- Check DNS: `dig www.holidayskitak.uk` should return 138.68.162.91
- Check firewall: `ufw status`

**Reset everything and start fresh:**
```bash
cd /opt/stable-manager
docker compose down -v   # WARNING: deletes the database
docker compose up -d
docker compose exec -T backend sh -c "npx prisma migrate deploy && npx tsx prisma/seed.ts"
```
