const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

/**
 * API client for GitFlow-CMS backend
 */
class ApiClient {
    private baseUrl: string;
    private token: string | null = null;

    constructor(baseUrl: string) {
        this.baseUrl = baseUrl;
    }

    setToken(token: string) {
        this.token = token;
    }

    private async request<T>(
        endpoint: string,
        options: RequestInit = {}
    ): Promise<T> {
        const headers: HeadersInit = {
            "Content-Type": "application/json",
            ...(this.token && { Authorization: `Bearer ${this.token}` }),
            ...options.headers,
        };

        const response = await fetch(`${this.baseUrl}${endpoint}`, {
            ...options,
            headers,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: "Unknown error" }));
            throw new ApiError(response.status, error.detail || error.error || "Request failed");
        }

        return response.json();
    }

    // =========================================================================
    // Git Operations
    // =========================================================================

    async listRepos() {
        return this.request<RepoInfo[]>("/api/git/repos");
    }

    async listContents(owner: string, repo: string, path = "", branch?: string) {
        const params = new URLSearchParams();
        if (path) params.set("path", path);
        if (branch) params.set("branch", branch);
        return this.request<FileInfo[]>(
            `/api/git/repos/${owner}/${repo}/contents?${params}`
        );
    }

    async getFileContent(owner: string, repo: string, path: string, branch?: string) {
        const params = new URLSearchParams({ path });
        if (branch) params.set("branch", branch);
        return this.request<FileContentResponse>(
            `/api/git/repos/${owner}/${repo}/file?${params}`
        );
    }

    async commitFile(data: CommitRequest) {
        return this.request<CommitResponse>("/api/git/commit", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    async listBranches(owner: string, repo: string) {
        return this.request<BranchInfo[]>(`/api/git/repos/${owner}/${repo}/branches`);
    }

    // =========================================================================
    // Security Operations
    // =========================================================================

    async scanSecrets(content: string, filename?: string) {
        return this.request<ScanResponse>("/api/security/scan", {
            method: "POST",
            body: JSON.stringify({ content, filename }),
        });
    }

    async validatePush(content: string, filename?: string) {
        return this.request<{ status: string; message: string }>("/api/security/validate-push", {
            method: "POST",
            body: JSON.stringify({ content, filename }),
        });
    }

    // =========================================================================
    // Smart Logic Operations
    // =========================================================================

    async smartReplace(data: SmartReplaceRequest) {
        return this.request<SmartReplaceResponse>("/api/smart/replace", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    async validateSyntax(content: string, language: string, filename?: string) {
        return this.request<SyntaxValidateResponse>("/api/smart/validate-syntax", {
            method: "POST",
            body: JSON.stringify({ content, language, filename }),
        });
    }

    async formatCode(content: string, language: string) {
        return this.request<{ formatted: string; formatter: string }>("/api/smart/format", {
            method: "POST",
            body: JSON.stringify({ content, language }),
        });
    }

    // =========================================================================
    // AI Chat Operations
    // =========================================================================

    async getAiStatus() {
        return this.request<AiStatusResponse>("/api/ai/status");
    }

    async chat(messages: ChatMessage[], context?: string, language?: string) {
        return this.request<ChatResponse>("/api/ai/chat", {
            method: "POST",
            body: JSON.stringify({ messages, context, language, stream: false }),
        });
    }

    async generateCode(prompt: string, language: string, context?: string) {
        return this.request<{ code: string; language: string; model: string }>(
            "/api/ai/generate-code",
            {
                method: "POST",
                body: JSON.stringify({ prompt, language, context }),
            }
        );
    }

    // =========================================================================
    // System Operations
    // =========================================================================

    async detectProjectType(projectPath: string) {
        return this.request<ProjectTypeResponse>(
            `/api/system/detect-project-type?project_path=${encodeURIComponent(projectPath)}`
        );
    }

    async installDependencies(projectPath: string, packageManager?: string) {
        return this.request<CommandResponse>("/api/system/install-dependencies", {
            method: "POST",
            body: JSON.stringify({ project_path: projectPath, package_manager: packageManager }),
        });
    }

    async runCommand(command: string, workingDirectory?: string, timeout = 300) {
        return this.request<CommandResponse>("/api/system/run-command", {
            method: "POST",
            body: JSON.stringify({
                command,
                working_directory: workingDirectory,
                timeout,
            }),
        });
    }
}

// Error class
export class ApiError extends Error {
    constructor(public status: number, message: string) {
        super(message);
        this.name = "ApiError";
    }
}

// Types
export interface RepoInfo {
    name: string;
    full_name: string;
    description: string | null;
    default_branch: string;
    private: boolean;
    html_url: string;
    clone_url: string;
}

export interface FileInfo {
    name: string;
    path: string;
    type: "file" | "dir";
    size?: number;
    sha?: string;
    download_url?: string;
}

export interface FileContentResponse {
    path: string;
    content: string | null;
    sha: string;
    size: number;
    encoding: string;
    is_binary: boolean;
    mime_type?: string;
    download_url?: string;
}

export interface CommitRequest {
    repo_full_name: string;
    file_path: string;
    content: string;
    commit_message: string;
    branch?: string;
    expected_sha?: string;
}

export interface CommitResponse {
    success: boolean;
    commit_sha?: string;
    file_sha?: string;
    message: string;
}

export interface BranchInfo {
    name: string;
    protected: boolean;
    is_default: boolean;
}

export interface ScanResponse {
    is_safe: boolean;
    secrets_found: number;
    alerts: SecretAlert[];
}

export interface SecretAlert {
    type: string;
    severity: string;
    line: number;
    message: string;
    preview: string;
}

export interface SmartReplaceRequest {
    file_path: string;
    full_file_content: string;
    new_snippet: string;
    language?: string;
}

export interface SmartReplaceResponse {
    success: boolean;
    updated_content: string;
    operation: string;
    target_name?: string;
    message: string;
    diff_info?: {
        original_start: number;
        original_end: number;
        original_source: string;
    };
}

export interface SyntaxValidateResponse {
    is_valid: boolean;
    error_message?: string;
    error_line?: number;
    error_column?: number;
}

export interface ChatMessage {
    role: "user" | "assistant" | "system";
    content: string;
}

export interface ChatResponse {
    content: string;
    model: string;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface AiStatusResponse {
    configured: boolean;
    provider: string;
    model: string;
    message: string;
}

export interface ProjectTypeResponse {
    path: string;
    has_package_json: boolean;
    has_requirements_txt: boolean;
    has_pyproject_toml: boolean;
    has_dockerfile: boolean;
    has_docker_compose: boolean;
    detected_package_manager?: string;
    project_type: string;
}

export interface CommandResponse {
    success: boolean;
    exit_code: number;
    stdout: string;
    stderr: string;
    command: string;
    duration_seconds: number;
}

// Export singleton instance
export const api = new ApiClient(BACKEND_URL);
