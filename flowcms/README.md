# GitFlow-CMS

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/FastAPI-0.109-009688?logo=fastapi" alt="FastAPI" />
  <img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Python-3.11-3776AB?logo=python" alt="Python" />
</p>

A **production-grade Web CMS** for managing GitHub repositories with AI-powered **Smart Editing** capabilities. Built for mobile-first usage via Cloudflare Tunnel.

## ✨ Features

### 🔐 Security Guard
- **Secret Scanner** - Blocks commits containing API keys, tokens, AWS credentials, Solana private keys
- **Syntax Validator** - Validates Python/JS/TS syntax before pushing
- **Optimistic Locking** - Prevents overwriting concurrent changes

### 🪄 Magic Paste (Smart Replace)
- Paste AI-generated code and it **surgically replaces** matching functions/classes
- Uses Python AST for precise identification
- Shows **diff view** before accepting changes
- Auto-formats with Black (Python) or Prettier (JS/TS)

### 🤖 AI Assistant
- Built-in **Llama3-70b** chat via Groq
- Context-aware code generation
- **"Insert at Cursor"** button to inject code directly

### 📱 Mobile-First Design
- Responsive layout with collapsible sidebar
- **44px minimum** touch targets
- Disabled pull-to-refresh to prevent editor conflicts
- Auto-save to localStorage every 30 seconds
- Local backup recovery if browser crashes

### ⚡ Quick Actions
- Install dependencies (auto-detects npm/yarn/pip)
- Run dev server / build
- Restart services

---

## 📦 Installation

### Prerequisites
- **Node.js 18+** and npm
- **Python 3.11+**
- **GitHub OAuth App** ([Create one here](https://github.com/settings/developers))

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/gitflow-cms.git
cd gitflow-cms
```

### 2. Backend Setup (Python FastAPI)
```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# OR
.\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt

# Copy environment file
cp .env.example .env
# Edit .env and add your GROQ_API_KEY (optional for AI features)

# Run the server
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup (Next.js)
```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.local.example .env.local
```

Edit `.env.local`:
```env
# GitHub OAuth (from https://github.com/settings/developers)
GITHUB_ID=your_client_id
GITHUB_SECRET=your_client_secret

# Generate with: openssl rand -base64 32
NEXTAUTH_SECRET=your_random_secret_here
NEXTAUTH_URL=http://localhost:3000

# Backend URL
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Start the dev server:
```bash
npm run dev
```

### 4. Access the Application
Open http://localhost:3000 in your browser.

---

## 🔧 Environment Variables

### Frontend (`.env.local`)
| Variable | Description | Required |
|----------|-------------|----------|
| `GITHUB_ID` | GitHub OAuth App Client ID | ✅ |
| `GITHUB_SECRET` | GitHub OAuth App Client Secret | ✅ |
| `NEXTAUTH_SECRET` | Random string for session encryption | ✅ |
| `NEXTAUTH_URL` | Base URL of your frontend | ✅ |
| `NEXT_PUBLIC_BACKEND_URL` | FastAPI backend URL | ✅ |

### Backend (`.env`)
| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Groq API key for AI features | ❌ |
| `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | ❌ |

---

## 📖 Usage Guide

### Using Magic Paste

1. **Generate code** using AI chat or an external tool (ChatGPT, Copilot, etc.)
2. Copy the function/class you want to inject
3. Click **"Magic Paste"** button in the editor toolbar
4. Paste your code in the modal
5. Click **"Apply Magic"**
6. Review the **diff view** showing what will change
7. Click **"Accept Changes"** or **"Reject"**

The system will:
- Detect the function/class name in your snippet
- Find the existing function/class in the file
- Surgically replace only that section
- Auto-format the result

### Using Safe Push

1. Make your changes in the Monaco editor
2. Click **"Safe Push"**

The system will automatically:
1. **Scan for secrets** (API keys, tokens, etc.)
2. **Validate syntax** (Python/JS/TS)
3. **Check for conflicts** (optimistic locking)
4. **Commit and push** to GitHub

If any check fails, you'll get a toast notification with details.

### Using Quick Actions

Click the **"Quick Actions"** button in the header to:
- **Install Dependencies** - Auto-detects package manager
- **Run Dev Server** - Starts `npm run dev` or equivalent
- **Run Build** - Runs production build
- **Restart Service** - If using systemd/Docker

Output is shown in a modal for mobile visibility.

---

## 🌐 Cloudflare Tunnel Setup

For accessing on mobile:

```bash
# Install cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Quick tunnel (no config needed)
cloudflared tunnel --url http://localhost:3000
```

Update your GitHub OAuth callback URL to match the tunnel URL.

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Radix UI** (Shadcn/UI primitives)
- **Monaco Editor** (VS Code experience)
- **Framer Motion** (animations)
- **NextAuth.js v5** (authentication)

### Backend
- **FastAPI** (Python)
- **PyGithub** (GitHub API)
- **Python AST** (code analysis)
- **Black** (Python formatter)
- **Groq SDK** (AI integration)

---

## 📁 Project Structure

```
gitflow-cms/
├── backend/
│   ├── main.py           # FastAPI entry point
│   ├── security.py       # Secret scanner
│   ├── smart_logic.py    # AST-based smart replace
│   ├── git_ops.py        # GitHub operations
│   ├── system_ops.py     # System commands
│   ├── ai_chat.py        # Groq AI integration
│   └── requirements.txt
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx           # Login page
    │   │   ├── dashboard/page.tsx # Main dashboard
    │   │   └── api/auth/          # NextAuth routes
    │   ├── components/
    │   │   ├── ui/                # Shadcn components
    │   │   ├── FileExplorer.tsx
    │   │   ├── SmartEditor.tsx
    │   │   ├── AIChat.tsx
    │   │   └── QuickActions.tsx
    │   ├── lib/
    │   │   ├── api.ts            # API client
    │   │   └── utils.ts          # Utilities
    │   ├── auth.ts               # NextAuth config
    │   └── middleware.ts         # Route protection
    └── package.json
```

---

## 📄 License

MIT License - feel free to use for personal and commercial projects.

---

## 🤝 Contributing

Contributions welcome! Please open an issue first to discuss major changes.

---

Built with ❤️ for mobile coding
