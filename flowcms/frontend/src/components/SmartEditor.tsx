"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Editor, { DiffEditor } from "@monaco-editor/react";
import { toast } from "sonner";
import {
    Save,
    Upload,
    Wand2,
    AlertTriangle,
    CheckCircle,
    RotateCcw,
    FileCode,
    Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { cn, getMonacoLanguage, storage, getBackupKey, debounce } from "@/lib/utils";
import { api, SmartReplaceResponse } from "@/lib/api";

interface SmartEditorProps {
    owner: string;
    repo: string;
    filePath: string;
    branch?: string;
    accessToken: string;
    onSaveSuccess?: () => void;
}

export function SmartEditor({
    owner,
    repo,
    filePath,
    branch,
    accessToken,
    onSaveSuccess,
}: SmartEditorProps) {
    const [content, setContent] = useState<string>("");
    const [originalContent, setOriginalContent] = useState<string>("");
    const [sha, setSha] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [isBinary, setIsBinary] = useState(false);
    const [binaryUrl, setBinaryUrl] = useState<string>("");

    // Magic Paste state
    const [showMagicPaste, setShowMagicPaste] = useState(false);
    const [magicPasteCode, setMagicPasteCode] = useState("");
    const [magicPasteResult, setMagicPasteResult] = useState<SmartReplaceResponse | null>(null);
    const [isProcessingMagic, setIsProcessingMagic] = useState(false);

    // Local backup state
    const [hasLocalBackup, setHasLocalBackup] = useState(false);

    const editorRef = useRef<unknown>(null);
    const language = getMonacoLanguage(filePath);
    const backupKey = getBackupKey(`${owner}/${repo}`, filePath);

    // Load file content
    const loadFile = useCallback(async () => {
        setIsLoading(true);
        api.setToken(accessToken);

        try {
            const file = await api.getFileContent(owner, repo, filePath, branch);

            if (file.is_binary) {
                setIsBinary(true);
                setBinaryUrl(file.download_url || "");
                return;
            }

            setContent(file.content || "");
            setOriginalContent(file.content || "");
            setSha(file.sha);
            setIsBinary(false);
            setHasUnsavedChanges(false);

            // Check for local backup
            const backup = storage.get<string | null>(backupKey, null);
            if (backup && backup !== file.content) {
                setHasLocalBackup(true);
            }
        } catch (err) {
            toast.error("Failed to load file", {
                description: err instanceof Error ? err.message : "Unknown error",
            });
        } finally {
            setIsLoading(false);
        }
    }, [owner, repo, filePath, branch, accessToken, backupKey]);

    useEffect(() => {
        loadFile();
    }, [loadFile]);

    // Auto-save to localStorage every 30 seconds
    const saveToLocalStorage = useCallback(
        debounce((value: string) => {
            storage.set(backupKey, value);
        }, 30000),
        [backupKey]
    );

    // Handle content change
    const handleEditorChange = (value: string | undefined) => {
        if (value !== undefined) {
            setContent(value);
            setHasUnsavedChanges(value !== originalContent);
            saveToLocalStorage(value);
        }
    };

    // Restore local backup
    const restoreBackup = () => {
        const backup = storage.get<string | null>(backupKey, null);
        if (backup) {
            setContent(backup);
            setHasUnsavedChanges(backup !== originalContent);
            setHasLocalBackup(false);
            toast.success("Backup restored!");
        }
    };

    // Safe Push - includes secret scan and syntax check
    const handleSafePush = async () => {
        setIsSaving(true);

        try {
            api.setToken(accessToken);

            // Step 1: Scan for secrets
            toast.loading("Scanning for secrets...", { id: "push" });
            const scanResult = await api.scanSecrets(content, filePath);

            if (!scanResult.is_safe) {
                toast.error("🚨 Security Alert: Secrets Detected!", {
                    id: "push",
                    description: `Found ${scanResult.secrets_found} potential secret(s). Push blocked.`,
                    duration: 10000,
                });
                return;
            }

            // Step 2: Validate syntax
            toast.loading("Validating syntax...", { id: "push" });
            const syntaxResult = await api.validateSyntax(content, language, filePath);

            if (!syntaxResult.is_valid) {
                toast.error("❌ Syntax Error Detected", {
                    id: "push",
                    description: `Line ${syntaxResult.error_line}: ${syntaxResult.error_message}`,
                    duration: 10000,
                });
                return;
            }

            // Step 3: Commit with optimistic locking
            toast.loading("Pushing to GitHub...", { id: "push" });
            const commitResult = await api.commitFile({
                repo_full_name: `${owner}/${repo}`,
                file_path: filePath,
                content: content,
                commit_message: `Update ${filePath} via GitFlow-CMS`,
                branch: branch,
                expected_sha: sha,
            });

            if (commitResult.success) {
                toast.success("✅ Push Successful!", {
                    id: "push",
                    description: `Commit: ${commitResult.commit_sha?.slice(0, 7)}`,
                });
                setSha(commitResult.file_sha || sha);
                setOriginalContent(content);
                setHasUnsavedChanges(false);
                storage.remove(backupKey);
                onSaveSuccess?.();
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";

            if (message.includes("Conflict") || message.includes("409")) {
                toast.error("⚠️ Merge Conflict!", {
                    id: "push",
                    description: "File was modified on server. Please refresh and try again.",
                });
            } else {
                toast.error("Push failed", {
                    id: "push",
                    description: message,
                });
            }
        } finally {
            setIsSaving(false);
        }
    };

    // Magic Paste - Smart Replace
    const handleMagicPaste = async () => {
        if (!magicPasteCode.trim()) {
            toast.error("Please paste some code first");
            return;
        }

        setIsProcessingMagic(true);

        try {
            api.setToken(accessToken);
            const result = await api.smartReplace({
                file_path: filePath,
                full_file_content: content,
                new_snippet: magicPasteCode,
                language: language,
            });

            setMagicPasteResult(result);
        } catch (err) {
            toast.error("Smart Replace failed", {
                description: err instanceof Error ? err.message : "Unknown error",
            });
        } finally {
            setIsProcessingMagic(false);
        }
    };

    // Accept magic paste result
    const acceptMagicPaste = () => {
        if (magicPasteResult) {
            setContent(magicPasteResult.updated_content);
            setHasUnsavedChanges(true);
            toast.success(magicPasteResult.message);
            setShowMagicPaste(false);
            setMagicPasteCode("");
            setMagicPasteResult(null);
        }
    };

    // Reject magic paste
    const rejectMagicPaste = () => {
        setMagicPasteResult(null);
    };

    // Editor mount handler
    const handleEditorDidMount = (editor: unknown) => {
        editorRef.current = editor;
    };

    // Binary file preview
    if (isBinary) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-900 p-4">
                <div className="text-center space-y-4">
                    <div className="text-6xl mb-4">🖼️</div>
                    <p className="text-slate-400">Binary file - Preview only</p>
                    {binaryUrl && (
                        <img
                            src={binaryUrl}
                            alt={filePath}
                            className="max-w-full max-h-[400px] rounded-lg border border-slate-700 mx-auto"
                        />
                    )}
                </div>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="h-full flex items-center justify-center bg-slate-900">
                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-900">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-2 sm:p-3 border-b border-slate-700 gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                    <FileCode className="h-4 w-4 text-violet-400 shrink-0" />
                    <span className="text-sm text-slate-300 truncate max-w-[200px]">
                        {filePath}
                    </span>
                    {hasUnsavedChanges && (
                        <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">
                            Modified
                        </span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {hasLocalBackup && (
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={restoreBackup}
                            className="text-amber-400 border-amber-500/50"
                        >
                            <RotateCcw className="h-4 w-4 mr-1" />
                            <span className="hidden sm:inline">Restore Backup</span>
                        </Button>
                    )}

                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowMagicPaste(true)}
                    >
                        <Wand2 className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Magic Paste</span>
                    </Button>

                    <Button
                        variant="success"
                        size="sm"
                        onClick={handleSafePush}
                        disabled={!hasUnsavedChanges || isSaving}
                        loading={isSaving}
                    >
                        <Upload className="h-4 w-4 mr-1" />
                        <span className="hidden sm:inline">Safe Push</span>
                    </Button>
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
                <Editor
                    height="100%"
                    language={language}
                    value={content}
                    onChange={handleEditorChange}
                    onMount={handleEditorDidMount}
                    theme="vs-dark"
                    options={{
                        fontSize: 14,
                        fontFamily: "'Fira Code', Consolas, monospace",
                        minimap: { enabled: false },
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        automaticLayout: true,
                        padding: { top: 16, bottom: 16 },
                        // Mobile optimizations
                        scrollbar: {
                            vertical: "visible",
                            horizontal: "visible",
                            verticalScrollbarSize: 12,
                            horizontalScrollbarSize: 12,
                        },
                        // Disable features that interfere with mobile
                        quickSuggestions: { other: false, comments: false, strings: false },
                        parameterHints: { enabled: false },
                        suggestOnTriggerCharacters: false,
                        acceptSuggestionOnCommitCharacter: false,
                        tabCompletion: "off",
                        wordBasedSuggestions: "off",
                    }}
                />
            </div>

            {/* Magic Paste Modal */}
            <Dialog open={showMagicPaste} onOpenChange={setShowMagicPaste}>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Wand2 className="h-5 w-5 text-violet-400" />
                            Magic Paste - Smart Code Injection
                        </DialogTitle>
                        <DialogDescription>
                            Paste AI-generated code below. It will intelligently replace matching
                            functions/classes or append to the file.
                        </DialogDescription>
                    </DialogHeader>

                    {!magicPasteResult ? (
                        // Input view
                        <div className="space-y-4">
                            <div className="h-[300px] border border-slate-700 rounded-lg overflow-hidden">
                                <Editor
                                    height="100%"
                                    language={language}
                                    value={magicPasteCode}
                                    onChange={(v) => setMagicPasteCode(v || "")}
                                    theme="vs-dark"
                                    options={{
                                        fontSize: 13,
                                        minimap: { enabled: false },
                                        lineNumbers: "on",
                                        wordWrap: "on",
                                    }}
                                />
                            </div>

                            <DialogFooter>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowMagicPaste(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    onClick={handleMagicPaste}
                                    disabled={!magicPasteCode.trim() || isProcessingMagic}
                                    loading={isProcessingMagic}
                                >
                                    <Wand2 className="h-4 w-4 mr-2" />
                                    Apply Magic
                                </Button>
                            </DialogFooter>
                        </div>
                    ) : (
                        // Diff view
                        <div className="space-y-4">
                            <div
                                className={cn(
                                    "flex items-center gap-2 p-3 rounded-lg",
                                    magicPasteResult.operation === "replaced"
                                        ? "bg-blue-500/10 text-blue-400"
                                        : "bg-emerald-500/10 text-emerald-400"
                                )}
                            >
                                <CheckCircle className="h-4 w-4" />
                                <span className="text-sm">{magicPasteResult.message}</span>
                            </div>

                            <div className="h-[350px] border border-slate-700 rounded-lg overflow-hidden">
                                <DiffEditor
                                    height="100%"
                                    language={language}
                                    original={content}
                                    modified={magicPasteResult.updated_content}
                                    theme="vs-dark"
                                    options={{
                                        readOnly: true,
                                        renderSideBySide: true,
                                        minimap: { enabled: false },
                                    }}
                                />
                            </div>

                            <DialogFooter>
                                <Button variant="destructive" onClick={rejectMagicPaste}>
                                    <AlertTriangle className="h-4 w-4 mr-2" />
                                    Reject
                                </Button>
                                <Button variant="success" onClick={acceptMagicPaste}>
                                    <CheckCircle className="h-4 w-4 mr-2" />
                                    Accept Changes
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
