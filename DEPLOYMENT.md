# Deployment Guide for mBAB

Since PythonAnywhere and similar shared hosting platforms don't support persistent background processes (like Ollama) or heavy resource usage, you have two main options for hosting this application.

## Option 1: The Cloud API Route (Recommended)
**Best for**: Fast, cheap, and reliable hosting.

Since you have a **DeepSeek API Key**, this is the perfect route. You can host the Django app on a free/cheap platform (like Render or Railway) and offload the heavy AI processing to DeepSeek's servers.

### 1. Prepare Your DeepSeek API Key
Ensure you have your key ready from [deepseek.com](https://deepseek.com).

### 2. Configure Production Settings
In your Django settings (or environment variables), you simply need to set:
*   `DEEPSEEK_API_KEY=your_actual_api_key_here`
*   `LLM_PROVIDER=deepseek` (Optional, as the system auto-detects the key, but good for clarity).

### 3. Host the Django App
*   **Render.com**: Offers a free tier for web services.
*   **Railway.app**: Very easy deployment, pay-as-you-go.
*   **Fly.io**: Good free allowance.

**Deployment Steps (Render example):**
1.  Push your code to GitHub (ensure the `develop` branch is pushed).
2.  Connect Repository to Render.
3.  **Build Command**: `pip install -r requirements.txt && python manage.py collectstatic --noinput`
4.  **Start Command**: `gunicorn mBAB.wsgi:application`
5.  **Environment Variables**:
    *   `SECRET_KEY`: (Generate a random string)
    *   `DEBUG`: `False`
    *   `DEEPSEEK_API_KEY`: (Paste your key here)

That's it! The app will automatically detect the key and use DeepSeek for "Explain with AI" and search processing.

---

## Option 2: The Self-Hosted Route (For Privacy/Local LLM)
**Best for**: Complete privacy, no reliance on external APIs, owning your data.

To run **Ollama** alongside Django, you need a **VPS** (Virtual Private Server) with at least 8GB RAM (16GB recommended).

### Providers
*   **Hetzner Cloud**: Great value (CPX31 or CPX41 instance).
*   **DigitalOcean**: Droplet with 8GB RAM.
*   **Kamatera**: High customization.

### Setup Steps (Ubuntu Server)

1.  **Install System Deps**:
    ```bash
    sudo apt update && sudo apt install python3-pip python3-venv nginx supervisor
    ```

2.  **Install & Run Ollama**:
    ```bash
    curl -fsSL https://ollama.com/install.sh | sh
    ollama pull llama3.2  # Download your model
    ```

3.  **Setup Django**:
    ```bash
    git clone your_repo
    cd mBAB
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    python manage.py collectstatic
    python manage.py migrate
    ```

4.  **Run with Gunicorn**:
    ```bash
    pip install gunicorn
    gunicorn --workers 3 mBAB.wsgi:application
    ```

5.  **Configure Nginx** as a reverse proxy to forward traffic to Gunicorn (port 8000).

## Recommendation
Start with **Option 1 (Groq API + Render/Railway)**. It eliminates the need to manage a server or worry about memory leaks from running an LLM locally. It is significantly faster and more stable for a web app.
