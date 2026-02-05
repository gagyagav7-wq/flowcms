"""
GitFlow-CMS Backend - Main Application Entry Point

A production-grade API for intelligent code management with:
- Secret scanning before commits
- AST-based smart code replacement
- GitHub integration with optimistic locking
- Groq AI chat integration
"""

import os
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import routers
from security import router as security_router, scan_for_secrets
from smart_logic import router as smart_logic_router
from git_ops import router as git_ops_router
from system_ops import router as system_ops_router
from ai_chat import router as ai_chat_router


# ============================================================================
# Pydantic Models for Request/Response
# ============================================================================

class HealthResponse(BaseModel):
    status: str
    version: str
    services: dict


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    code: str


# ============================================================================
# Application Lifecycle
# ============================================================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    # Startup
    print("🚀 GitFlow-CMS Backend starting...")
    print(f"   CORS Origins: {os.getenv('CORS_ORIGINS', 'http://localhost:3000')}")
    print(f"   Groq AI: {'Enabled' if os.getenv('GROQ_API_KEY') else 'Disabled'}")
    yield
    # Shutdown
    print("👋 GitFlow-CMS Backend shutting down...")


# ============================================================================
# FastAPI Application
# ============================================================================

app = FastAPI(
    title="GitFlow-CMS API",
    description="Intelligent Code Management System Backend",
    version="1.0.0",
    lifespan=lifespan,
)


# ============================================================================
# Middleware Configuration
# ============================================================================

# CORS Middleware
cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Rate Limiting (Simple in-memory implementation)
from collections import defaultdict
from time import time

rate_limit_store: dict[str, list[float]] = defaultdict(list)
RATE_LIMIT_REQUESTS = 100  # requests
RATE_LIMIT_WINDOW = 60  # seconds


@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    """Simple rate limiting middleware."""
    client_ip = request.client.host if request.client else "unknown"
    current_time = time()
    
    # Clean old entries
    rate_limit_store[client_ip] = [
        t for t in rate_limit_store[client_ip] 
        if current_time - t < RATE_LIMIT_WINDOW
    ]
    
    # Check rate limit
    if len(rate_limit_store[client_ip]) >= RATE_LIMIT_REQUESTS:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded", "code": "RATE_LIMIT"}
        )
    
    rate_limit_store[client_ip].append(current_time)
    response = await call_next(request)
    return response


# ============================================================================
# GitHub Token Dependency
# ============================================================================

async def get_github_token(request: Request) -> str:
    """Extract and validate GitHub token from Authorization header."""
    auth_header = request.headers.get("Authorization")
    
    if not auth_header:
        raise HTTPException(
            status_code=401,
            detail="Authorization header required"
        )
    
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization format. Use 'Bearer <token>'"
        )
    
    token = auth_header.replace("Bearer ", "")
    
    if not token or len(token) < 20:
        raise HTTPException(
            status_code=401,
            detail="Invalid GitHub token"
        )
    
    return token


# ============================================================================
# Routes
# ============================================================================

@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with API information."""
    return {
        "name": "GitFlow-CMS API",
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health"
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint for monitoring."""
    groq_enabled = bool(os.getenv("GROQ_API_KEY"))
    
    return HealthResponse(
        status="healthy",
        version="1.0.0",
        services={
            "api": "up",
            "groq_ai": "enabled" if groq_enabled else "disabled",
            "security_scanner": "enabled",
            "smart_logic": "enabled"
        }
    )


# ============================================================================
# Register Routers
# ============================================================================

app.include_router(security_router, prefix="/api/security", tags=["Security"])
app.include_router(smart_logic_router, prefix="/api/smart", tags=["Smart Logic"])
app.include_router(git_ops_router, prefix="/api/git", tags=["Git Operations"])
app.include_router(system_ops_router, prefix="/api/system", tags=["System Operations"])
app.include_router(ai_chat_router, prefix="/api/ai", tags=["AI Chat"])


# ============================================================================
# Global Exception Handler
# ============================================================================

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler for unhandled errors."""
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "detail": str(exc) if os.getenv("DEBUG") == "true" else None,
            "code": "INTERNAL_ERROR"
        }
    )


# ============================================================================
# Run with Uvicorn
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", 8000)),
        reload=os.getenv("DEBUG") == "true"
    )
