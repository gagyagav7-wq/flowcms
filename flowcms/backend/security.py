"""
GitFlow-CMS Security Module

Implements comprehensive secret scanning with regex patterns for:
- Generic API keys and tokens
- AWS credentials
- Google Cloud credentials
- Solana private keys
- SSH/RSA private keys
- Database connection strings
"""

import re
from typing import Optional
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter()


# ============================================================================
# Data Models
# ============================================================================

@dataclass
class SecretMatch:
    """Represents a detected secret in code."""
    pattern_name: str
    matched_text: str
    line_number: int
    start_pos: int
    end_pos: int
    severity: str  # "critical", "high", "medium"


class ScanRequest(BaseModel):
    """Request model for secret scanning."""
    content: str
    filename: Optional[str] = None


class ScanResponse(BaseModel):
    """Response model for secret scanning."""
    is_safe: bool
    secrets_found: int
    alerts: list[dict]


# ============================================================================
# Secret Patterns (Regex)
# ============================================================================

SECRET_PATTERNS = {
    # Generic API Keys and Tokens
    "generic_api_key": {
        "pattern": r"(?i)(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|secret[_-]?key|private[_-]?key)[\s]*[=:]+[\s]*['\"]?([a-zA-Z0-9_\-]{20,})['\"]?",
        "severity": "high",
        "description": "Generic API key or access token detected"
    },
    
    # AWS Credentials
    "aws_access_key": {
        "pattern": r"(?i)(AKIA[0-9A-Z]{16})",
        "severity": "critical",
        "description": "AWS Access Key ID detected"
    },
    "aws_secret_key": {
        "pattern": r"(?i)aws(.{0,20})?(?:secret|key|credential)(.{0,20})?['\"]?\s*[=:]\s*['\"]?([0-9a-zA-Z/+]{40})['\"]?",
        "severity": "critical",
        "description": "AWS Secret Access Key detected"
    },
    
    # Google Cloud
    "google_api_key": {
        "pattern": r"AIza[0-9A-Za-z\-_]{35}",
        "severity": "high",
        "description": "Google API Key detected"
    },
    "google_oauth": {
        "pattern": r"[0-9]+-[0-9A-Za-z_]{32}\.apps\.googleusercontent\.com",
        "severity": "high",
        "description": "Google OAuth Client ID detected"
    },
    
    # Solana Private Keys (Base58)
    "solana_private_key": {
        "pattern": r"[1-9A-HJ-NP-Za-km-z]{87,88}",
        "severity": "critical",
        "description": "Potential Solana private key (Base58) detected"
    },
    
    # Private Keys (PEM format)
    "private_key_pem": {
        "pattern": r"-----BEGIN\s+(RSA\s+|EC\s+|DSA\s+|OPENSSH\s+)?PRIVATE\s+KEY-----",
        "severity": "critical",
        "description": "Private key (PEM format) detected"
    },
    
    # Database Connection Strings
    "database_url": {
        "pattern": r"(?i)(postgres|mysql|mongodb|redis|sqlite)://[^\s'\"]+:[^\s'\"]+@[^\s'\"]+",
        "severity": "high",
        "description": "Database connection string with credentials detected"
    },
    
    # GitHub Tokens
    "github_token": {
        "pattern": r"(ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}|gho_[a-zA-Z0-9]{36}|ghu_[a-zA-Z0-9]{36}|ghs_[a-zA-Z0-9]{36}|ghr_[a-zA-Z0-9]{36})",
        "severity": "critical",
        "description": "GitHub personal access token detected"
    },
    
    # Slack Tokens
    "slack_token": {
        "pattern": r"xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*",
        "severity": "high",
        "description": "Slack token detected"
    },
    
    # Stripe Keys
    "stripe_key": {
        "pattern": r"(?i)(sk_live_|pk_live_|sk_test_|pk_test_)[0-9a-zA-Z]{24,}",
        "severity": "critical",
        "description": "Stripe API key detected"
    },
    
    # JWT Tokens (basic detection)
    "jwt_token": {
        "pattern": r"eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*",
        "severity": "medium",
        "description": "JWT token detected (may be intentional)"
    },
    
    # Discord Bot Tokens
    "discord_token": {
        "pattern": r"[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}",
        "severity": "high",
        "description": "Discord bot token detected"
    },
    
    # Twilio
    "twilio_key": {
        "pattern": r"SK[a-fA-F0-9]{32}",
        "severity": "high",
        "description": "Twilio API key detected"
    },
    
    # SendGrid
    "sendgrid_key": {
        "pattern": r"SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}",
        "severity": "high",
        "description": "SendGrid API key detected"
    },
}


# ============================================================================
# Allowlist Patterns (False Positive Prevention)
# ============================================================================

ALLOWLIST_PATTERNS = [
    # Example/placeholder values
    r"(?i)(example|placeholder|your[_-]?api[_-]?key|xxx+|sample|test|demo|fake)",
    # Environment variable references
    r"(?i)(process\.env\.|os\.environ|getenv|ENV\[)",
    # Config file references
    r"(?i)(\$\{[^}]+\}|<[^>]+>)",
]


# ============================================================================
# Core Scanning Functions
# ============================================================================

def is_allowlisted(text: str) -> bool:
    """Check if the matched text is a known false positive."""
    for pattern in ALLOWLIST_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True
    return False


def scan_for_secrets(content: str) -> list[SecretMatch]:
    """
    Scan code content for potential secrets.
    
    Args:
        content: The code content to scan
        
    Returns:
        List of SecretMatch objects for each detected secret
    """
    matches: list[SecretMatch] = []
    lines = content.split('\n')
    
    for pattern_name, config in SECRET_PATTERNS.items():
        regex = re.compile(config["pattern"], re.MULTILINE)
        
        for match in regex.finditer(content):
            matched_text = match.group(0)
            
            # Skip if allowlisted
            if is_allowlisted(matched_text):
                continue
            
            # Calculate line number
            line_number = content[:match.start()].count('\n') + 1
            
            # Create match object
            secret_match = SecretMatch(
                pattern_name=pattern_name,
                matched_text=matched_text[:50] + "..." if len(matched_text) > 50 else matched_text,
                line_number=line_number,
                start_pos=match.start(),
                end_pos=match.end(),
                severity=config["severity"]
            )
            matches.append(secret_match)
    
    return matches


def format_alert(match: SecretMatch) -> dict:
    """Format a SecretMatch into an alert dictionary."""
    return {
        "type": match.pattern_name,
        "severity": match.severity,
        "line": match.line_number,
        "message": SECRET_PATTERNS[match.pattern_name]["description"],
        "preview": match.matched_text
    }


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/scan", response_model=ScanResponse)
async def scan_content(request: ScanRequest):
    """
    Scan code content for secrets before committing.
    
    Returns:
        - is_safe: True if no secrets detected
        - secrets_found: Number of secrets detected
        - alerts: List of alert details
    """
    if not request.content:
        return ScanResponse(is_safe=True, secrets_found=0, alerts=[])
    
    matches = scan_for_secrets(request.content)
    
    # Filter by severity for critical/high only
    critical_matches = [m for m in matches if m.severity in ("critical", "high")]
    
    alerts = [format_alert(m) for m in critical_matches]
    
    return ScanResponse(
        is_safe=len(critical_matches) == 0,
        secrets_found=len(critical_matches),
        alerts=alerts
    )


@router.post("/validate-push")
async def validate_push(request: ScanRequest):
    """
    Validate code is safe to push (blocks on secrets detected).
    
    Raises HTTPException 400 if secrets are detected.
    """
    matches = scan_for_secrets(request.content)
    critical_matches = [m for m in matches if m.severity in ("critical", "high")]
    
    if critical_matches:
        alerts = [format_alert(m) for m in critical_matches]
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Security Alert: Secrets Detected",
                "code": "SECRETS_DETECTED",
                "secrets_count": len(critical_matches),
                "alerts": alerts
            }
        )
    
    return {"status": "safe", "message": "No secrets detected, safe to push"}
