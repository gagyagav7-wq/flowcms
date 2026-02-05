"""
GitFlow-CMS Smart Logic Module

Implements AST-based code analysis and surgical replacement for:
- Python functions and classes (using ast module)
- JavaScript/TypeScript functions (using subprocess + Node.js)

The "killer feature" - Smart Paste / AST Injection
"""

import ast
import subprocess
import tempfile
import os
from typing import Optional, Tuple
from dataclasses import dataclass

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel


router = APIRouter()


# ============================================================================
# Data Models
# ============================================================================

@dataclass
class CodeNode:
    """Represents a function or class in the AST."""
    name: str
    node_type: str  # "function" or "class"
    start_line: int
    end_line: int
    source: str


class SmartReplaceRequest(BaseModel):
    """Request model for smart replace operation."""
    file_path: str
    full_file_content: str
    new_snippet: str
    language: Optional[str] = None  # "python", "javascript", "typescript"


class SmartReplaceResponse(BaseModel):
    """Response model for smart replace operation."""
    success: bool
    updated_content: str
    operation: str  # "replaced", "appended", "error"
    target_name: Optional[str] = None
    message: str
    diff_info: Optional[dict] = None


class SyntaxValidateRequest(BaseModel):
    """Request model for syntax validation."""
    content: str
    language: str
    filename: Optional[str] = None


class SyntaxValidateResponse(BaseModel):
    """Response model for syntax validation."""
    is_valid: bool
    error_message: Optional[str] = None
    error_line: Optional[int] = None
    error_column: Optional[int] = None


# ============================================================================
# Python AST Helpers
# ============================================================================

def extract_python_nodes(source: str) -> list[CodeNode]:
    """
    Extract all function and class definitions from Python source.
    
    Args:
        source: Python source code
        
    Returns:
        List of CodeNode objects
    """
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return []
    
    nodes = []
    lines = source.split('\n')
    
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            node_type = "class" if isinstance(node, ast.ClassDef) else "function"
            start_line = node.lineno
            end_line = node.end_lineno or start_line
            
            # Extract source lines
            source_lines = lines[start_line - 1:end_line]
            source_text = '\n'.join(source_lines)
            
            nodes.append(CodeNode(
                name=node.name,
                node_type=node_type,
                start_line=start_line,
                end_line=end_line,
                source=source_text
            ))
    
    return nodes


def extract_top_level_def_name(snippet: str) -> Optional[Tuple[str, str]]:
    """
    Extract the name and type of the top-level function/class from a snippet.
    
    Args:
        snippet: Code snippet to analyze
        
    Returns:
        Tuple of (name, type) or None if not found
    """
    try:
        tree = ast.parse(snippet)
    except SyntaxError:
        return None
    
    for node in ast.iter_child_nodes(tree):
        if isinstance(node, ast.ClassDef):
            return (node.name, "class")
        elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return (node.name, "function")
    
    return None


def find_node_by_name(nodes: list[CodeNode], name: str, node_type: str) -> Optional[CodeNode]:
    """Find a node by name and type."""
    for node in nodes:
        if node.name == name and node.node_type == node_type:
            return node
    return None


def smart_replace_python(full_content: str, new_snippet: str) -> SmartReplaceResponse:
    """
    Perform smart replacement of Python code.
    
    1. Parse new_snippet to identify function/class name
    2. Parse full_content to find matching node
    3. Replace or append as appropriate
    4. Format with black
    
    Args:
        full_content: The complete file content
        new_snippet: The new code snippet to inject
        
    Returns:
        SmartReplaceResponse with updated content
    """
    # Step 1: Extract the name from the new snippet
    snippet_info = extract_top_level_def_name(new_snippet)
    
    if not snippet_info:
        # Can't parse snippet, try to append it
        updated = full_content.rstrip() + "\n\n\n" + new_snippet.strip() + "\n"
        formatted = format_python_code(updated)
        return SmartReplaceResponse(
            success=True,
            updated_content=formatted,
            operation="appended",
            target_name=None,
            message="Could not identify function/class in snippet, appended to end of file"
        )
    
    target_name, target_type = snippet_info
    
    # Step 2: Find the target in full content
    existing_nodes = extract_python_nodes(full_content)
    existing_node = find_node_by_name(existing_nodes, target_name, target_type)
    
    if existing_node:
        # Step 3a: Replace existing node
        lines = full_content.split('\n')
        
        # Calculate indentation of original
        original_first_line = lines[existing_node.start_line - 1]
        indent = len(original_first_line) - len(original_first_line.lstrip())
        
        # Apply same indentation to new snippet
        snippet_lines = new_snippet.strip().split('\n')
        indented_snippet = []
        for i, line in enumerate(snippet_lines):
            if i == 0:
                indented_snippet.append(' ' * indent + line.lstrip())
            elif line.strip():
                # Re-indent relative lines
                original_indent = len(line) - len(line.lstrip())
                indented_snippet.append(' ' * indent + line.lstrip() if original_indent == 0 else line)
            else:
                indented_snippet.append('')
        
        # Rebuild file
        before = lines[:existing_node.start_line - 1]
        after = lines[existing_node.end_line:]
        
        updated_lines = before + [new_snippet.strip()] + after
        updated = '\n'.join(updated_lines)
        
        # Format
        formatted = format_python_code(updated)
        
        return SmartReplaceResponse(
            success=True,
            updated_content=formatted,
            operation="replaced",
            target_name=target_name,
            message=f"Successfully replaced {target_type} '{target_name}' (lines {existing_node.start_line}-{existing_node.end_line})",
            diff_info={
                "original_start": existing_node.start_line,
                "original_end": existing_node.end_line,
                "original_source": existing_node.source
            }
        )
    else:
        # Step 3b: Append to end
        updated = full_content.rstrip() + "\n\n\n" + new_snippet.strip() + "\n"
        formatted = format_python_code(updated)
        
        return SmartReplaceResponse(
            success=True,
            updated_content=formatted,
            operation="appended",
            target_name=target_name,
            message=f"No existing {target_type} '{target_name}' found, appended to end of file"
        )


def format_python_code(code: str) -> str:
    """Format Python code using black."""
    try:
        import black
        mode = black.Mode(
            line_length=88,
            string_normalization=True,
            is_pyi=False,
        )
        return black.format_str(code, mode=mode)
    except Exception as e:
        # If black fails, return original code
        print(f"Black formatting failed: {e}")
        return code


def validate_python_syntax(code: str) -> SyntaxValidateResponse:
    """Validate Python syntax using ast.parse()."""
    try:
        ast.parse(code)
        return SyntaxValidateResponse(is_valid=True)
    except SyntaxError as e:
        return SyntaxValidateResponse(
            is_valid=False,
            error_message=str(e.msg),
            error_line=e.lineno,
            error_column=e.offset
        )


# ============================================================================
# JavaScript/TypeScript Helpers
# ============================================================================

def validate_js_syntax(code: str, is_typescript: bool = False) -> SyntaxValidateResponse:
    """
    Validate JavaScript/TypeScript syntax using Node.js.
    
    Uses acorn for JS or TypeScript compiler for TS.
    """
    ext = ".ts" if is_typescript else ".js"
    
    with tempfile.NamedTemporaryFile(mode='w', suffix=ext, delete=False) as f:
        f.write(code)
        temp_path = f.name
    
    try:
        if is_typescript:
            # Use tsc --noEmit for syntax check
            result = subprocess.run(
                ["npx", "tsc", "--noEmit", "--allowJs", temp_path],
                capture_output=True,
                text=True,
                timeout=30
            )
        else:
            # Use Node.js syntax check
            result = subprocess.run(
                ["node", "--check", temp_path],
                capture_output=True,
                text=True,
                timeout=30
            )
        
        if result.returncode == 0:
            return SyntaxValidateResponse(is_valid=True)
        else:
            error_output = result.stderr or result.stdout
            # Parse error line from output
            error_line = None
            if ":" in error_output:
                parts = error_output.split(":")
                for part in parts:
                    if part.strip().isdigit():
                        error_line = int(part.strip())
                        break
            
            return SyntaxValidateResponse(
                is_valid=False,
                error_message=error_output.strip()[:500],
                error_line=error_line
            )
    except subprocess.TimeoutExpired:
        return SyntaxValidateResponse(
            is_valid=False,
            error_message="Syntax check timed out"
        )
    except FileNotFoundError:
        return SyntaxValidateResponse(
            is_valid=False,
            error_message="Node.js not found. Please install Node.js for JS/TS syntax validation."
        )
    finally:
        os.unlink(temp_path)


def format_js_code(code: str) -> str:
    """Format JavaScript code using prettier (if available)."""
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js', delete=False) as f:
        f.write(code)
        temp_path = f.name
    
    try:
        result = subprocess.run(
            ["npx", "prettier", "--write", temp_path],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            with open(temp_path, 'r') as f:
                return f.read()
        else:
            return code
    except Exception:
        return code
    finally:
        os.unlink(temp_path)


# ============================================================================
# API Endpoints
# ============================================================================

@router.post("/replace", response_model=SmartReplaceResponse)
async def smart_replace(request: SmartReplaceRequest):
    """
    Smart Replace / AST Injection endpoint.
    
    Surgically replaces a function or class in the file content,
    preserving surrounding code and comments.
    """
    # Detect language from file extension if not provided
    language = request.language
    if not language and request.file_path:
        ext = os.path.splitext(request.file_path)[1].lower()
        language_map = {
            '.py': 'python',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.ts': 'typescript',
            '.tsx': 'typescript',
        }
        language = language_map.get(ext, 'python')
    
    if language == 'python':
        return smart_replace_python(request.full_file_content, request.new_snippet)
    elif language in ('javascript', 'typescript'):
        # For JS/TS, we use a simpler approach (regex-based)
        # Full AST replacement would require a separate Node.js service
        updated = request.full_file_content.rstrip() + "\n\n" + request.new_snippet.strip() + "\n"
        formatted = format_js_code(updated)
        return SmartReplaceResponse(
            success=True,
            updated_content=formatted,
            operation="appended",
            message="JS/TS smart replacement appended code (AST replacement requires Node.js service)"
        )
    else:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported language: {language}"
        )


@router.post("/validate-syntax", response_model=SyntaxValidateResponse)
async def validate_syntax(request: SyntaxValidateRequest):
    """
    Validate code syntax before committing.
    
    Blocks push if syntax is invalid, returning exact error location.
    """
    language = request.language.lower()
    
    if language == 'python':
        return validate_python_syntax(request.content)
    elif language in ('javascript', 'js'):
        return validate_js_syntax(request.content, is_typescript=False)
    elif language in ('typescript', 'ts'):
        return validate_js_syntax(request.content, is_typescript=True)
    else:
        # For unsupported languages, assume valid
        return SyntaxValidateResponse(
            is_valid=True,
            error_message=f"Syntax validation not supported for {language}, assuming valid"
        )


@router.post("/format")
async def format_code(request: SyntaxValidateRequest):
    """Format code using appropriate formatter (black for Python, prettier for JS)."""
    language = request.language.lower()
    
    if language == 'python':
        formatted = format_python_code(request.content)
        return {"formatted": formatted, "formatter": "black"}
    elif language in ('javascript', 'js', 'typescript', 'ts'):
        formatted = format_js_code(request.content)
        return {"formatted": formatted, "formatter": "prettier"}
    else:
        return {"formatted": request.content, "formatter": "none"}
