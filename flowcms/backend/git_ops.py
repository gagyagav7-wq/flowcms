"""
GitFlow-CMS Git Operations Module

Implements GitHub API interactions with:
- Repository listing and file browsing
- File content retrieval with SHA tracking
- Optimistic locking for concurrent edits
- Commit and push with conflict detection
"""

import base64
import mimetypes
from typing import Optional, List
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from github import Github, GithubException, Repository, ContentFile


router = APIRouter()


# ============================================================================
# Data Models
# ============================================================================

class RepoInfo(BaseModel):
    """Repository information."""
    name: str
    full_name: str
    description: Optional[str]
    default_branch: str
    private: bool
    html_url: str
    clone_url: str


class FileInfo(BaseModel):
    """File information in a repository."""
    name: str
    path: str
    type: str  # "file" or "dir"
    size: Optional[int] = None
    sha: Optional[str] = None
    download_url: Optional[str] = None


class FileContentResponse(BaseModel):
    """Response for file content request."""
    path: str
    content: Optional[str] = None
    sha: str
    size: int
    encoding: str
    is_binary: bool
    mime_type: Optional[str] = None
    download_url: Optional[str] = None


class CommitRequest(BaseModel):
    """Request for committing a file."""
    repo_full_name: str
    file_path: str
    content: str
    commit_message: str
    branch: Optional[str] = None
    expected_sha: Optional[str] = None  # For optimistic locking


class CommitResponse(BaseModel):
    """Response for commit operation."""
    success: bool
    commit_sha: Optional[str] = None
    file_sha: Optional[str] = None
    message: str


# ============================================================================
# GitHub Client Helpers
# ============================================================================

def get_github_client(token: str) -> Github:
    """Create GitHub client from token."""
    return Github(token)


def extract_token(authorization: str = Header(...)) -> str:
    """Extract token from Authorization header."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization format")
    return authorization.replace("Bearer ", "")


# ============================================================================
# Binary Detection
# ============================================================================

BINARY_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dll', '.so', '.dylib',
    '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv',
    '.woff', '.woff2', '.ttf', '.eot', '.otf',
    '.pyc', '.pyo', '.class', '.o',
}


def is_binary_file(filename: str) -> bool:
    """Check if a file is binary based on extension."""
    ext = '.' + filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    return ext in BINARY_EXTENSIONS


def get_mime_type(filename: str) -> Optional[str]:
    """Get MIME type for a file."""
    mime_type, _ = mimetypes.guess_type(filename)
    return mime_type


# ============================================================================
# API Endpoints
# ============================================================================

@router.get("/repos", response_model=List[RepoInfo])
async def list_repositories(authorization: str = Header(...)):
    """List all repositories accessible to the authenticated user."""
    token = extract_token(authorization)
    g = get_github_client(token)
    
    try:
        user = g.get_user()
        repos = []
        
        for repo in user.get_repos(sort='updated'):
            repos.append(RepoInfo(
                name=repo.name,
                full_name=repo.full_name,
                description=repo.description,
                default_branch=repo.default_branch,
                private=repo.private,
                html_url=repo.html_url,
                clone_url=repo.clone_url
            ))
        
        return repos
    except GithubException as e:
        raise HTTPException(status_code=e.status, detail=str(e.data))


@router.get("/repos/{owner}/{repo}/contents")
async def list_contents(
    owner: str,
    repo: str,
    path: str = "",
    branch: Optional[str] = None,
    authorization: str = Header(...)
):
    """List contents of a directory in a repository."""
    token = extract_token(authorization)
    g = get_github_client(token)
    
    try:
        repository = g.get_repo(f"{owner}/{repo}")
        ref = branch or repository.default_branch
        
        contents = repository.get_contents(path, ref=ref)
        
        if not isinstance(contents, list):
            contents = [contents]
        
        result = []
        for item in contents:
            result.append(FileInfo(
                name=item.name,
                path=item.path,
                type="dir" if item.type == "dir" else "file",
                size=item.size if item.type == "file" else None,
                sha=item.sha,
                download_url=item.download_url
            ))
        
        # Sort: directories first, then files
        result.sort(key=lambda x: (0 if x.type == "dir" else 1, x.name.lower()))
        
        return result
    except GithubException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="Path not found")
        raise HTTPException(status_code=e.status, detail=str(e.data))


@router.get("/repos/{owner}/{repo}/file", response_model=FileContentResponse)
async def get_file_content(
    owner: str,
    repo: str,
    path: str,
    branch: Optional[str] = None,
    authorization: str = Header(...)
):
    """Get content of a file with SHA for optimistic locking."""
    token = extract_token(authorization)
    g = get_github_client(token)
    
    try:
        repository = g.get_repo(f"{owner}/{repo}")
        ref = branch or repository.default_branch
        
        file_content = repository.get_contents(path, ref=ref)
        
        if isinstance(file_content, list):
            raise HTTPException(status_code=400, detail="Path is a directory, not a file")
        
        # Check if binary
        is_binary = is_binary_file(path)
        mime_type = get_mime_type(path)
        
        if is_binary:
            # Don't decode binary files
            return FileContentResponse(
                path=path,
                content=None,
                sha=file_content.sha,
                size=file_content.size,
                encoding="base64",
                is_binary=True,
                mime_type=mime_type,
                download_url=file_content.download_url
            )
        
        # Decode text content
        try:
            content = base64.b64decode(file_content.content).decode('utf-8')
        except (UnicodeDecodeError, ValueError):
            # If decode fails, treat as binary
            return FileContentResponse(
                path=path,
                content=None,
                sha=file_content.sha,
                size=file_content.size,
                encoding="base64",
                is_binary=True,
                mime_type=mime_type,
                download_url=file_content.download_url
            )
        
        return FileContentResponse(
            path=path,
            content=content,
            sha=file_content.sha,
            size=file_content.size,
            encoding="utf-8",
            is_binary=False,
            mime_type=mime_type
        )
    except GithubException as e:
        if e.status == 404:
            raise HTTPException(status_code=404, detail="File not found")
        raise HTTPException(status_code=e.status, detail=str(e.data))


@router.post("/commit", response_model=CommitResponse)
async def commit_file(
    request: CommitRequest,
    authorization: str = Header(...)
):
    """
    Commit a file with optimistic locking.
    
    If expected_sha is provided, verifies it matches the current file SHA.
    If they don't match, rejects with conflict error.
    """
    token = extract_token(authorization)
    g = get_github_client(token)
    
    try:
        repository = g.get_repo(request.repo_full_name)
        branch = request.branch or repository.default_branch
        
        # Check if file exists and verify SHA (optimistic locking)
        current_sha = None
        try:
            existing = repository.get_contents(request.file_path, ref=branch)
            if isinstance(existing, list):
                raise HTTPException(status_code=400, detail="Path is a directory")
            current_sha = existing.sha
            
            # Optimistic locking check
            if request.expected_sha and request.expected_sha != current_sha:
                raise HTTPException(
                    status_code=409,
                    detail={
                        "error": "Merge Conflict - Please Refresh",
                        "code": "CONFLICT",
                        "message": "File was modified on server since you loaded it. Please refresh and try again.",
                        "current_sha": current_sha,
                        "expected_sha": request.expected_sha
                    }
                )
        except GithubException as e:
            if e.status != 404:
                raise
            # File doesn't exist, will create new
        
        # Perform commit
        content_bytes = request.content.encode('utf-8')
        
        if current_sha:
            # Update existing file
            result = repository.update_file(
                path=request.file_path,
                message=request.commit_message,
                content=content_bytes,
                sha=current_sha,
                branch=branch
            )
        else:
            # Create new file
            result = repository.create_file(
                path=request.file_path,
                message=request.commit_message,
                content=content_bytes,
                branch=branch
            )
        
        return CommitResponse(
            success=True,
            commit_sha=result['commit'].sha,
            file_sha=result['content'].sha,
            message=f"Successfully committed to {branch}"
        )
        
    except GithubException as e:
        if e.status == 409:
            raise HTTPException(
                status_code=409,
                detail={
                    "error": "Merge Conflict",
                    "code": "CONFLICT",
                    "message": "Conflict detected. Please refresh and try again."
                }
            )
        raise HTTPException(status_code=e.status, detail=str(e.data))


@router.get("/repos/{owner}/{repo}/branches")
async def list_branches(
    owner: str,
    repo: str,
    authorization: str = Header(...)
):
    """List all branches in a repository."""
    token = extract_token(authorization)
    g = get_github_client(token)
    
    try:
        repository = g.get_repo(f"{owner}/{repo}")
        branches = []
        
        for branch in repository.get_branches():
            branches.append({
                "name": branch.name,
                "protected": branch.protected,
                "is_default": branch.name == repository.default_branch
            })
        
        return branches
    except GithubException as e:
        raise HTTPException(status_code=e.status, detail=str(e.data))


@router.delete("/repos/{owner}/{repo}/file")
async def delete_file(
    owner: str,
    repo: str,
    path: str,
    commit_message: str,
    branch: Optional[str] = None,
    expected_sha: Optional[str] = None,
    authorization: str = Header(...)
):
    """Delete a file from the repository."""
    token = extract_token(authorization)
    g = get_github_client(token)
    
    try:
        repository = g.get_repo(f"{owner}/{repo}")
        ref = branch or repository.default_branch
        
        # Get current file
        file_content = repository.get_contents(path, ref=ref)
        
        if isinstance(file_content, list):
            raise HTTPException(status_code=400, detail="Cannot delete directory")
        
        # Optimistic locking
        if expected_sha and expected_sha != file_content.sha:
            raise HTTPException(
                status_code=409,
                detail="File was modified. Please refresh and try again."
            )
        
        # Delete
        repository.delete_file(
            path=path,
            message=commit_message,
            sha=file_content.sha,
            branch=ref
        )
        
        return {"success": True, "message": f"Deleted {path}"}
        
    except GithubException as e:
        raise HTTPException(status_code=e.status, detail=str(e.data))
