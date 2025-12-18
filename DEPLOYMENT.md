# Deployment Guide for mBAB

This guide covers how to deploy the Multi-Book Advanced Bible Search (mBAB) application to a production environment.

## Deployment Options Overview

| Option | Best For | Cost | AI Features |
|--------|----------|------|-------------|
| **Cloud API** | Fast, cheap hosting | Free-Low | ✅ Via DeepSeek/Groq |
| **Self-Hosted** | Privacy, local LLM | Medium | ✅ Via Ollama |
| **Static Hosting** | Simplest, limited | Free | ❌ No AI |

---

## Option 1: Cloud API Route (Recommended)

Host the Django app on a free/cheap platform and use a cloud AI provider for LLM features.

### Supported AI Providers

| Provider | API Key Env Var | Free Tier | Speed |
|----------|-----------------|-----------|-------|
| [DeepSeek](https://deepseek.com) | `DEEPSEEK_API_KEY` | Pay-as-you-go | Fast |
| [Groq](https://groq.com) | `GROQ_API_KEY` | Generous free tier | Very fast |
| [OpenAI](https://openai.com) | `OPENAI_API_KEY` | Pay-as-you-go | Fast |

The app auto-detects which API key is available and uses it automatically.

### Recommended Hosting Platforms

- **[Render.com](https://render.com)** - Free tier for web services
- **[Railway.app](https://railway.app)** - Easy deployment, pay-as-you-go
- **[Fly.io](https://fly.io)** - Good free allowance
- **[PythonAnywhere](https://pythonanywhere.com)** - Free tier, Django-friendly

### Deployment Steps (Render Example)

1. **Push code to GitHub**
   ```bash
   git push origin main
   ```

2. **Create a Render Web Service**
   - Connect your GitHub repository
   - Select the branch to deploy

3. **Configure Build Settings**
   - **Build Command**: 
     ```bash
     pip install -r requirements.txt && python manage.py collectstatic --noinput && python manage.py migrate
     ```
   - **Start Command**: 
     ```bash
     gunicorn mBAB.wsgi:application
     ```

4. **Set Environment Variables**
   | Variable | Value |
   |----------|-------|
   | `SECRET_KEY` | Generate a random 50+ character string |
   | `DEBUG` | `False` |
   | `DEEPSEEK_API_KEY` | Your API key (or use `GROQ_API_KEY` / `OPENAI_API_KEY`) |
   | `ALLOWED_HOSTS` | `your-app-name.onrender.com` |

5. **Deploy** - Render will automatically build and deploy your app.

---

## Option 2: Self-Hosted with Local LLM

For complete privacy and no reliance on external APIs, run Ollama alongside Django on a VPS.

### Requirements

- **VPS with 8GB+ RAM** (16GB recommended for larger models)
- Ubuntu 22.04 or similar Linux distribution

### Recommended VPS Providers

- **[Hetzner Cloud](https://hetzner.cloud)** - Great value (CPX31 or CPX41)
- **[DigitalOcean](https://digitalocean.com)** - Droplet with 8GB RAM
- **[Vultr](https://vultr.com)** - Various configurations
- **[Linode](https://linode.com)** - Good performance

### Setup Steps (Ubuntu Server)

```bash
# 1. Update system and install dependencies
sudo apt update && sudo apt install -y python3-pip python3-venv nginx supervisor git

# 2. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2  # Download your preferred model

# 3. Clone and setup the application
git clone https://github.com/aaronjs99/mBAB.git
cd mBAB
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt gunicorn

# 4. Configure environment
export SECRET_KEY="your-random-secret-key-here"
export DEBUG=False
export ALLOWED_HOSTS="your-domain.com"

# 5. Prepare static files and database
python manage.py collectstatic --noinput
python manage.py migrate

# 6. Run with Gunicorn
gunicorn --workers 3 --bind 0.0.0.0:8000 mBAB.wsgi:application
```

### Production Setup

For a production deployment, configure:

1. **Nginx** as a reverse proxy (forwards port 80/443 to Gunicorn)
2. **Supervisor** or **systemd** to keep Gunicorn running
3. **SSL/TLS** via Let's Encrypt for HTTPS
4. **Ollama as a service** to auto-start on boot

---

## Option 3: PythonAnywhere (Limited)

PythonAnywhere is free and Django-friendly, but **does not support local LLM** (no Ollama). AI features require a cloud API key.

1. Create a free account at [pythonanywhere.com](https://pythonanywhere.com)
2. Upload or clone your code via the Bash console
3. Create a new Web App → Manual configuration → Python 3.x
4. Configure WSGI file to point to `mBAB.wsgi`
5. Set environment variables in the Web app settings
6. Reload the app

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | ✅ | Django secret key (generate a random string) |
| `DEBUG` | ✅ | Set to `False` in production |
| `ALLOWED_HOSTS` | ✅ | Comma-separated list of allowed domains |
| `DEEPSEEK_API_KEY` | ⚪ | DeepSeek API key for AI features |
| `GROQ_API_KEY` | ⚪ | Groq API key (alternative to DeepSeek) |
| `OPENAI_API_KEY` | ⚪ | OpenAI API key (alternative) |

*At least one AI provider key is needed for "Explain with AI" functionality.*

---

## Troubleshooting

### AI Features Not Working
- Verify your API key is set correctly in environment variables
- Check that your API account has sufficient credits/balance
- The app falls back: Ollama → DeepSeek → Groq → OpenAI

### Static Files Not Loading
- Run `python manage.py collectstatic --noinput`
- Ensure your web server is configured to serve `/static/`

### Database Errors
- Ensure `databases/` folder contains the Bible `.db` files
- Run `python manage.py migrate` to apply migrations
