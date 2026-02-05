"""
GitFlow-CMS AI Chat Module

Implements Groq AI integration for:
- Code generation with Llama3-70b
- Streaming responses
- Context-aware code assistance
"""

import os
from typing import Optional, List, AsyncGenerator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


router = APIRouter()


# ============================================================================
# Data Models
# ============================================================================

class ChatMessage(BaseModel):
    """A single chat message."""
    role: str  # "user", "assistant", "system"
    content: str


class ChatRequest(BaseModel):
    """Request for AI chat."""
    messages: List[ChatMessage]
    context: Optional[str] = None  # Current file content for context
    language: Optional[str] = None  # Programming language
    max_tokens: int = 2048
    temperature: float = 0.7
    stream: bool = False


class ChatResponse(BaseModel):
    """Response from AI chat."""
    content: str
    model: str
    usage: Optional[dict] = None


# ============================================================================
# System Prompts
# ============================================================================

CODE_ASSISTANT_SYSTEM_PROMPT = """You are an expert programming assistant integrated into GitFlow-CMS, a code management system.

Your role is to:
1. Help users write, debug, and improve code
2. Explain code concepts clearly
3. Generate high-quality, production-ready code
4. Follow best practices for the given programming language

Guidelines:
- Always provide complete, working code snippets
- Use proper indentation and formatting
- Include brief comments for complex logic
- When generating functions/classes, include type hints (Python) or TypeScript types (JS/TS)
- If the user provides existing code context, ensure your suggestions integrate seamlessly
- Be concise but thorough in explanations

When generating code that should replace an existing function/class, output ONLY the function/class definition so it can be directly used with the Smart Paste feature."""


# ============================================================================
# Groq Client
# ============================================================================

def get_groq_client():
    """Get the Groq client or raise an error if not configured."""
    api_key = os.getenv("GROQ_API_KEY")
    
    if not api_key:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AI Chat Not Configured",
                "code": "GROQ_NOT_CONFIGURED",
                "message": "GROQ_API_KEY environment variable is not set. "
                          "Please configure it in backend/.env to enable AI features."
            }
        )
    
    try:
        from groq import Groq
        return Groq(api_key=api_key)
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Groq SDK Not Installed",
                "code": "GROQ_NOT_INSTALLED",
                "message": "Please install the Groq SDK: pip install groq"
            }
        )


def build_messages(request: ChatRequest) -> List[dict]:
    """Build the message list for the API call."""
    messages = [
        {"role": "system", "content": CODE_ASSISTANT_SYSTEM_PROMPT}
    ]
    
    # Add context if provided
    if request.context:
        context_msg = f"Current file content for context:\n```{request.language or ''}\n{request.context}\n```"
        messages.append({"role": "system", "content": context_msg})
    
    # Add conversation history
    for msg in request.messages:
        messages.append({
            "role": msg.role,
            "content": msg.content
        })
    
    return messages


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/status")
async def ai_status():
    """Check if AI chat is configured and available."""
    api_key = os.getenv("GROQ_API_KEY")
    
    return {
        "configured": bool(api_key),
        "provider": "groq",
        "model": "llama3-70b-8192",
        "message": "AI Chat is ready" if api_key else "GROQ_API_KEY not configured"
    }


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a chat message to the AI and get a response.
    
    Non-streaming version that returns the complete response.
    """
    client = get_groq_client()
    messages = build_messages(request)
    
    try:
        response = client.chat.completions.create(
            model="llama3-70b-8192",
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            stream=False
        )
        
        return ChatResponse(
            content=response.choices[0].message.content,
            model=response.model,
            usage={
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "AI Request Failed",
                "message": str(e)
            }
        )


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Send a chat message and stream the response.
    
    Returns a Server-Sent Events stream.
    """
    client = get_groq_client()
    messages = build_messages(request)
    
    async def generate() -> AsyncGenerator[str, None]:
        try:
            stream = client.chat.completions.create(
                model="llama3-70b-8192",
                messages=messages,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                stream=True
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield f"data: {content}\n\n"
            
            yield "data: [DONE]\n\n"
            
        except Exception as e:
            yield f"data: [ERROR] {str(e)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.post("/generate-code")
async def generate_code(
    prompt: str,
    language: str = "python",
    context: Optional[str] = None
):
    """
    Generate code based on a prompt.
    
    Optimized endpoint for code generation with language-specific prompts.
    """
    client = get_groq_client()
    
    system_prompt = f"""You are a code generator. Generate ONLY code, no explanations.
Output clean, production-ready {language} code.
Do not include markdown code fences in your response - just the raw code.
Include appropriate type hints and brief inline comments for complex logic."""
    
    messages = [
        {"role": "system", "content": system_prompt}
    ]
    
    if context:
        messages.append({
            "role": "system",
            "content": f"Context from current file:\n{context[:2000]}"  # Limit context
        })
    
    messages.append({
        "role": "user",
        "content": prompt
    })
    
    try:
        response = client.chat.completions.create(
            model="llama3-70b-8192",
            messages=messages,
            max_tokens=2048,
            temperature=0.3  # Lower temperature for more deterministic code
        )
        
        code = response.choices[0].message.content
        
        # Clean up any accidental markdown fences
        if code.startswith("```"):
            lines = code.split("\n")
            # Remove first and last lines if they're fences
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            code = "\n".join(lines)
        
        return {
            "code": code,
            "language": language,
            "model": response.model
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Code generation failed", "message": str(e)}
        )


@router.post("/explain-code")
async def explain_code(code: str, language: Optional[str] = None):
    """
    Explain what a piece of code does.
    """
    client = get_groq_client()
    
    messages = [
        {
            "role": "system",
            "content": "You are a code explainer. Provide clear, concise explanations of code. "
                      "Break down the logic step by step. Keep explanations practical and developer-focused."
        },
        {
            "role": "user",
            "content": f"Explain this code:\n```{language or ''}\n{code}\n```"
        }
    ]
    
    try:
        response = client.chat.completions.create(
            model="llama3-70b-8192",
            messages=messages,
            max_tokens=1024,
            temperature=0.5
        )
        
        return {
            "explanation": response.choices[0].message.content,
            "model": response.model
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"error": "Code explanation failed", "message": str(e)}
        )
