"""
GitFlow-CMS System Operations Module

Implements system-level operations:
- Binary file detection and serving
- Subprocess execution for package management
- Service restart capabilities
- Command output streaming
"""

import os
import subprocess
import asyncio
import mimetypes
from typing import Optional, List
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


router = APIRouter()


# ============================================================================
# Data Models
# ============================================================================

class CommandRequest(BaseModel):
    """Request for running a system command."""
    command: str
    working_directory: Optional[str] = None
    timeout: int = 300  # 5 minutes default


class CommandResponse(BaseModel):
    """Response from a system command."""
    success: bool
    exit_code: int
    stdout: str
    stderr: str
    command: str
    duration_seconds: float


class DependencyInstallRequest(BaseModel):
    """Request for installing dependencies."""
    project_path: str
    package_manager: Optional[str] = None  # auto-detect if not provided


class BinaryFileInfo(BaseModel):
    """Information about a binary file."""
    is_binary: bool
    mime_type: Optional[str]
    size: int
    can_preview: bool
    preview_url: Optional[str] = None


# ============================================================================
# Binary File Handling
# ============================================================================

# Extensions that can be previewed in browser
PREVIEWABLE_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp',
    '.pdf',
    '.mp4', '.webm', '.ogg',
    '.mp3', '.wav', '.ogg',
}

# All known binary extensions
BINARY_EXTENSIONS = PREVIEWABLE_EXTENSIONS | {
    '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z', '.bz2',
    '.exe', '.dll', '.so', '.dylib', '.bin',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.pyc', '.pyo', '.class', '.o', '.obj',
    '.db', '.sqlite', '.sqlite3',
}


def detect_binary(filepath: str) -> BinaryFileInfo:
    """
    Detect if a file is binary and gather information about it.
    
    Args:
        filepath: Path to the file
        
    Returns:
        BinaryFileInfo with detection results
    """
    ext = Path(filepath).suffix.lower()
    mime_type, _ = mimetypes.guess_type(filepath)
    
    is_binary = ext in BINARY_EXTENSIONS
    
    # If extension not recognized, try to read a sample
    if not is_binary and os.path.exists(filepath):
        try:
            with open(filepath, 'rb') as f:
                chunk = f.read(8192)
                # Check for null bytes (common in binary files)
                if b'\x00' in chunk:
                    is_binary = True
        except Exception:
            pass
    
    # Get file size
    size = 0
    if os.path.exists(filepath):
        size = os.path.getsize(filepath)
    
    can_preview = ext in PREVIEWABLE_EXTENSIONS
    
    return BinaryFileInfo(
        is_binary=is_binary,
        mime_type=mime_type,
        size=size,
        can_preview=can_preview
    )


# ============================================================================
# Package Manager Detection & Installation
# ============================================================================

def detect_package_manager(project_path: str) -> Optional[str]:
    """
    Detect the package manager for a project.
    
    Returns: "npm", "yarn", "pnpm", "pip", "poetry", or None
    """
    project = Path(project_path)
    
    # Node.js package managers
    if (project / "package-lock.json").exists():
        return "npm"
    if (project / "yarn.lock").exists():
        return "yarn"
    if (project / "pnpm-lock.yaml").exists():
        return "pnpm"
    if (project / "package.json").exists():
        return "npm"  # Default for Node.js
    
    # Python package managers
    if (project / "poetry.lock").exists():
        return "poetry"
    if (project / "Pipfile.lock").exists():
        return "pipenv"
    if (project / "requirements.txt").exists():
        return "pip"
    if (project / "pyproject.toml").exists():
        return "pip"  # Modern Python projects
    
    return None


def get_install_command(package_manager: str) -> List[str]:
    """Get the install command for a package manager."""
    commands = {
        "npm": ["npm", "install"],
        "yarn": ["yarn", "install"],
        "pnpm": ["pnpm", "install"],
        "pip": ["pip", "install", "-r", "requirements.txt"],
        "poetry": ["poetry", "install"],
        "pipenv": ["pipenv", "install"],
    }
    return commands.get(package_manager, [])


# ============================================================================
# Command Execution
# ============================================================================

async def run_command_async(
    command: List[str],
    cwd: Optional[str] = None,
    timeout: int = 300
) -> CommandResponse:
    """
    Run a command asynchronously with timeout.
    
    Args:
        command: Command and arguments as a list
        cwd: Working directory
        timeout: Timeout in seconds
        
    Returns:
        CommandResponse with output
    """
    import time
    start_time = time.time()
    
    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd
        )
        
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            return CommandResponse(
                success=False,
                exit_code=-1,
                stdout="",
                stderr=f"Command timed out after {timeout} seconds",
                command=" ".join(command),
                duration_seconds=time.time() - start_time
            )
        
        duration = time.time() - start_time
        
        return CommandResponse(
            success=process.returncode == 0,
            exit_code=process.returncode or 0,
            stdout=stdout.decode('utf-8', errors='replace'),
            stderr=stderr.decode('utf-8', errors='replace'),
            command=" ".join(command),
            duration_seconds=duration
        )
        
    except FileNotFoundError:
        return CommandResponse(
            success=False,
            exit_code=-1,
            stdout="",
            stderr=f"Command not found: {command[0]}",
            command=" ".join(command),
            duration_seconds=time.time() - start_time
        )
    except Exception as e:
        return CommandResponse(
            success=False,
            exit_code=-1,
            stdout="",
            stderr=str(e),
            command=" ".join(command),
            duration_seconds=time.time() - start_time
        )


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/detect-binary", response_model=BinaryFileInfo)
async def detect_binary_endpoint(filepath: str):
    """Detect if a file is binary and return information about it."""
    return detect_binary(filepath)


@router.post("/install-dependencies", response_model=CommandResponse)
async def install_dependencies(request: DependencyInstallRequest):
    """
    Install project dependencies using the appropriate package manager.
    
    Auto-detects npm/yarn/pnpm for Node.js or pip/poetry for Python.
    """
    project_path = request.project_path
    
    if not os.path.isdir(project_path):
        raise HTTPException(
            status_code=400,
            detail=f"Project path does not exist: {project_path}"
        )
    
    # Detect or use provided package manager
    package_manager = request.package_manager or detect_package_manager(project_path)
    
    if not package_manager:
        raise HTTPException(
            status_code=400,
            detail="Could not detect package manager. No package.json or requirements.txt found."
        )
    
    install_command = get_install_command(package_manager)
    
    if not install_command:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown package manager: {package_manager}"
        )
    
    # Run the install command
    result = await run_command_async(
        install_command,
        cwd=project_path,
        timeout=600  # 10 minutes for large projects
    )
    
    return result


@router.post("/run-command", response_model=CommandResponse)
async def run_system_command(request: CommandRequest):
    """
    Run a system command with output capture.
    
    WARNING: This endpoint should be protected and only allow specific commands.
    """
    # Whitelist of allowed commands (security measure)
    allowed_commands = [
        "npm", "yarn", "pnpm", "node",
        "pip", "python", "poetry", "pipenv",
        "git", "systemctl", "docker", "docker-compose",
    ]
    
    # Parse command
    parts = request.command.split()
    if not parts:
        raise HTTPException(status_code=400, detail="Empty command")
    
    base_command = parts[0]
    
    # Security check
    if base_command not in allowed_commands:
        raise HTTPException(
            status_code=403,
            detail=f"Command '{base_command}' is not in the allowed list. "
                   f"Allowed: {', '.join(allowed_commands)}"
        )
    
    # Run command
    result = await run_command_async(
        parts,
        cwd=request.working_directory,
        timeout=request.timeout
    )
    
    return result


@router.post("/restart-service")
async def restart_service(service_name: str, use_docker: bool = False):
    """
    Restart a service (systemd or docker).
    
    Args:
        service_name: Name of the service to restart
        use_docker: If True, use docker-compose restart instead of systemctl
    """
    if use_docker:
        command = ["docker-compose", "restart", service_name]
    else:
        command = ["systemctl", "restart", service_name]
    
    result = await run_command_async(command, timeout=60)
    
    if not result.success:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to restart service",
                "stderr": result.stderr
            }
        )
    
    return {
        "success": True,
        "message": f"Service '{service_name}' restarted successfully"
    }


@router.get("/detect-project-type")
async def detect_project_type(project_path: str):
    """
    Detect the type of project and available package managers.
    """
    if not os.path.isdir(project_path):
        raise HTTPException(
            status_code=400,
            detail=f"Path does not exist: {project_path}"
        )
    
    project = Path(project_path)
    
    result = {
        "path": project_path,
        "has_package_json": (project / "package.json").exists(),
        "has_requirements_txt": (project / "requirements.txt").exists(),
        "has_pyproject_toml": (project / "pyproject.toml").exists(),
        "has_dockerfile": (project / "Dockerfile").exists(),
        "has_docker_compose": (project / "docker-compose.yml").exists() or (project / "docker-compose.yaml").exists(),
        "detected_package_manager": detect_package_manager(project_path),
    }
    
    # Determine project type
    if result["has_package_json"]:
        result["project_type"] = "nodejs"
    elif result["has_requirements_txt"] or result["has_pyproject_toml"]:
        result["project_type"] = "python"
    else:
        result["project_type"] = "unknown"
    
    return result
