"use client";

import React, { useState, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Menu,
    X,
    GitBranch,
    LogOut,
    Settings,
    ChevronDown,
    Moon,
    Sun,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileExplorer } from "@/components/FileExplorer";
import { SmartEditor } from "@/components/SmartEditor";
import { AIChat } from "@/components/AIChat";
import { QuickActions } from "@/components/QuickActions";
import { cn } from "@/lib/utils";
import { api, RepoInfo } from "@/lib/api";

export default function DashboardPage() {
    const { data: session } = useSession();
    const { setTheme, theme } = useTheme();

    // State
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [repos, setRepos] = useState<RepoInfo[]>([]);
    const [selectedRepo, setSelectedRepo] = useState<RepoInfo | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [isLoadingRepos, setIsLoadingRepos] = useState(true);
    const [currentTab, setCurrentTab] = useState<"editor" | "ai">("editor");

    const editorContentRef = useRef<string>("");

    // Load repositories on mount
    React.useEffect(() => {
        const loadRepos = async () => {
            if (!session?.accessToken) return;

            api.setToken(session.accessToken);

            try {
                const repoList = await api.listRepos();
                setRepos(repoList);
                if (repoList.length > 0 && !selectedRepo) {
                    setSelectedRepo(repoList[0]);
                }
            } catch (err) {
                toast.error("Failed to load repositories", {
                    description: err instanceof Error ? err.message : "Unknown error",
                });
            } finally {
                setIsLoadingRepos(false);
            }
        };

        loadRepos();
    }, [session?.accessToken]);

    // Handle file selection from explorer
    const handleFileSelect = useCallback((path: string, isDir: boolean) => {
        if (!isDir) {
            setSelectedFile(path);
            setSidebarOpen(false); // Close sidebar on mobile after selection
        }
    }, []);

    // Handle code insertion from AI chat
    const handleInsertCode = useCallback((code: string) => {
        // This would be connected to the editor - for now just copy to clipboard
        navigator.clipboard.writeText(code);
        toast.success("Code copied! Use Magic Paste in the editor.");
        setCurrentTab("editor");
    }, []);

    // Parse owner/repo from selected repo
    const [owner, repoName] = selectedRepo?.full_name?.split("/") || [];

    if (!session?.accessToken) {
        return null;
    }

    return (
        <div
            className="h-screen flex flex-col bg-slate-950 text-slate-100"
            style={{ overscrollBehavior: "contain" }}
        >
            {/* Header */}
            <header className="flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900/95 backdrop-blur-sm shrink-0 z-50">
                <div className="flex items-center gap-3">
                    {/* Mobile menu button */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="lg:hidden"
                        onClick={() => setSidebarOpen(!sidebarOpen)}
                    >
                        {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </Button>

                    {/* Logo */}
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center">
                            <GitBranch className="h-4 w-4 text-white" />
                        </div>
                        <span className="font-bold text-lg hidden sm:block bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">
                            GitFlow-CMS
                        </span>
                    </div>
                </div>

                {/* Center: Repo selector */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="max-w-[200px]">
                            <span className="truncate">
                                {selectedRepo?.name || "Select Repository"}
                            </span>
                            <ChevronDown className="h-4 w-4 ml-2 shrink-0" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-64 max-h-[50vh] overflow-auto">
                        <DropdownMenuLabel>Your Repositories</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {isLoadingRepos ? (
                            <div className="py-4 text-center text-slate-500 text-sm">
                                Loading...
                            </div>
                        ) : repos.length === 0 ? (
                            <div className="py-4 text-center text-slate-500 text-sm">
                                No repositories found
                            </div>
                        ) : (
                            repos.map((repo) => (
                                <DropdownMenuItem
                                    key={repo.full_name}
                                    onClick={() => {
                                        setSelectedRepo(repo);
                                        setSelectedFile(null);
                                    }}
                                    className={cn(
                                        selectedRepo?.full_name === repo.full_name && "bg-violet-600/20"
                                    )}
                                >
                                    <div className="flex flex-col min-w-0">
                                        <span className="font-medium truncate">{repo.name}</span>
                                        {repo.description && (
                                            <span className="text-xs text-slate-500 truncate">
                                                {repo.description}
                                            </span>
                                        )}
                                    </div>
                                </DropdownMenuItem>
                            ))
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <QuickActions
                        projectPath={selectedRepo?.full_name}
                        accessToken={session.accessToken}
                    />

                    {/* Theme Toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                    >
                        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    </Button>

                    {/* User Menu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="rounded-full">
                                <img
                                    src={session.user?.image || "/avatar.png"}
                                    alt="Avatar"
                                    className="w-8 h-8 rounded-full"
                                />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuLabel>
                                {session.user?.name || session.user?.email}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                                <Settings className="h-4 w-4 mr-2" />
                                Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem
                                onClick={() => (window.location.href = "/api/auth/signout")}
                            >
                                <LogOut className="h-4 w-4 mr-2" />
                                Sign Out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden relative">
                {/* Mobile Sidebar Overlay */}
                <AnimatePresence>
                    {sidebarOpen && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
                            onClick={() => setSidebarOpen(false)}
                        />
                    )}
                </AnimatePresence>

                {/* Sidebar - File Explorer */}
                <aside
                    className={cn(
                        "w-72 border-r border-slate-800 bg-slate-900 shrink-0 z-50",
                        "fixed lg:relative inset-y-0 left-0 lg:translate-x-0 transition-transform duration-300",
                        "top-14 lg:top-0",
                        sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
                    )}
                >
                    {selectedRepo && owner && (
                        <FileExplorer
                            owner={owner}
                            repo={repoName}
                            selectedPath={selectedFile || undefined}
                            onFileSelect={handleFileSelect}
                            accessToken={session.accessToken}
                        />
                    )}
                </aside>

                {/* Main Editor Area */}
                <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                    {/* Mobile Tab Switcher */}
                    <div className="lg:hidden border-b border-slate-800 bg-slate-900/95 px-4 py-2">
                        <TabsList className="w-full">
                            <TabsTrigger
                                value="editor"
                                onClick={() => setCurrentTab("editor")}
                                className={cn(
                                    "flex-1",
                                    currentTab === "editor" && "data-[state=active]:bg-violet-600"
                                )}
                                data-state={currentTab === "editor" ? "active" : "inactive"}
                            >
                                Editor
                            </TabsTrigger>
                            <TabsTrigger
                                value="ai"
                                onClick={() => setCurrentTab("ai")}
                                className={cn(
                                    "flex-1",
                                    currentTab === "ai" && "data-[state=active]:bg-violet-600"
                                )}
                                data-state={currentTab === "ai" ? "active" : "inactive"}
                            >
                                AI Chat
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        {/* Editor Panel - visible on mobile when tab active, always on desktop */}
                        <div
                            className={cn(
                                "flex-1 min-w-0",
                                currentTab !== "editor" && "hidden lg:block"
                            )}
                        >
                            {selectedFile && selectedRepo ? (
                                <SmartEditor
                                    owner={owner}
                                    repo={repoName}
                                    filePath={selectedFile}
                                    accessToken={session.accessToken}
                                />
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-500">
                                    <div className="text-center max-w-sm p-6">
                                        <GitBranch className="h-12 w-12 mx-auto mb-4 text-slate-600" />
                                        <h2 className="text-lg font-medium text-slate-400 mb-2">
                                            Select a file to edit
                                        </h2>
                                        <p className="text-sm">
                                            Use the file explorer to navigate your repository and select
                                            a file to start editing.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* AI Chat Panel - desktop split pane, mobile tab */}
                        <div
                            className={cn(
                                "w-full lg:w-96 border-l border-slate-800 bg-slate-900",
                                currentTab !== "ai" && "hidden lg:block"
                            )}
                        >
                            <AIChat
                                accessToken={session.accessToken}
                                currentFileContent={editorContentRef.current}
                                currentLanguage={selectedFile?.split(".").pop()}
                                onInsertCode={handleInsertCode}
                            />
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
