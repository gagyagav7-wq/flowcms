import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines class names with Tailwind merge for deduplication
 */
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
    return path.split(".").pop()?.toLowerCase() || "";
}

/**
 * Get language for Monaco editor based on file extension
 */
export function getMonacoLanguage(path: string): string {
    const ext = getFileExtension(path);
    const languageMap: Record<string, string> = {
        py: "python",
        js: "javascript",
        jsx: "javascript",
        ts: "typescript",
        tsx: "typescript",
        json: "json",
        md: "markdown",
        css: "css",
        scss: "scss",
        html: "html",
        xml: "xml",
        yaml: "yaml",
        yml: "yaml",
        sh: "shell",
        bash: "shell",
        sql: "sql",
        graphql: "graphql",
        go: "go",
        rs: "rust",
        rb: "ruby",
        php: "php",
        java: "java",
        c: "c",
        cpp: "cpp",
        h: "c",
        hpp: "cpp",
    };

    return languageMap[ext] || "plaintext";
}

/**
 * Check if file is binary based on extension
 */
export function isBinaryFile(path: string): boolean {
    const binaryExtensions = new Set([
        "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg",
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
        "zip", "tar", "gz", "rar", "7z",
        "exe", "dll", "so", "dylib",
        "mp3", "mp4", "wav", "avi", "mov", "mkv",
        "woff", "woff2", "ttf", "eot", "otf",
        "pyc", "pyo", "class", "o",
    ]);

    return binaryExtensions.has(getFileExtension(path));
}

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
        if (timeout) clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

/**
 * Local storage helpers with error handling
 */
export const storage = {
    get: <T>(key: string, defaultValue: T): T => {
        if (typeof window === "undefined") return defaultValue;
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch {
            return defaultValue;
        }
    },

    set: <T>(key: string, value: T): void => {
        if (typeof window === "undefined") return;
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
            console.error("Failed to save to localStorage:", error);
        }
    },

    remove: (key: string): void => {
        if (typeof window === "undefined") return;
        try {
            localStorage.removeItem(key);
        } catch (error) {
            console.error("Failed to remove from localStorage:", error);
        }
    },
};

/**
 * Generate a unique backup key for a file
 */
export function getBackupKey(repo: string, path: string): string {
    return `gitflow_backup_${repo}_${path.replace(/\//g, "_")}`;
}
