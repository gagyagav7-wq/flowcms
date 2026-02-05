"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
    Folder,
    FolderOpen,
    FileCode,
    FileJson,
    FileText,
    Image,
    ChevronRight,
    ChevronDown,
    RefreshCw,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn, isBinaryFile, getFileExtension } from "@/lib/utils";
import { api, FileInfo } from "@/lib/api";

interface FileExplorerProps {
    owner: string;
    repo: string;
    branch?: string;
    selectedPath?: string;
    onFileSelect: (path: string, isDir: boolean) => void;
    accessToken: string;
}

interface TreeNode extends FileInfo {
    children?: TreeNode[];
    isLoading?: boolean;
    isExpanded?: boolean;
}

// File icon based on extension
function getFileIcon(path: string) {
    const ext = getFileExtension(path);
    const iconClass = "h-4 w-4 shrink-0";

    if (isBinaryFile(path)) {
        return <Image className={cn(iconClass, "text-emerald-400")} />;
    }

    switch (ext) {
        case "json":
            return <FileJson className={cn(iconClass, "text-yellow-400")} />;
        case "py":
            return <FileCode className={cn(iconClass, "text-blue-400")} />;
        case "js":
        case "jsx":
            return <FileCode className={cn(iconClass, "text-yellow-300")} />;
        case "ts":
        case "tsx":
            return <FileCode className={cn(iconClass, "text-blue-500")} />;
        case "md":
            return <FileText className={cn(iconClass, "text-slate-400")} />;
        case "css":
        case "scss":
            return <FileCode className={cn(iconClass, "text-pink-400")} />;
        default:
            return <FileCode className={cn(iconClass, "text-slate-400")} />;
    }
}

export function FileExplorer({
    owner,
    repo,
    branch,
    selectedPath,
    onFileSelect,
    accessToken,
}: FileExplorerProps) {
    const [tree, setTree] = useState<TreeNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Load root directory
    const loadRoot = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        api.setToken(accessToken);

        try {
            const contents = await api.listContents(owner, repo, "", branch);
            setTree(
                contents.map((item) => ({
                    ...item,
                    isExpanded: false,
                    children: item.type === "dir" ? undefined : undefined,
                }))
            );
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load files");
        } finally {
            setIsLoading(false);
        }
    }, [owner, repo, branch, accessToken]);

    useEffect(() => {
        loadRoot();
    }, [loadRoot]);

    // Load directory children
    const loadDirectory = async (path: string): Promise<TreeNode[]> => {
        api.setToken(accessToken);
        const contents = await api.listContents(owner, repo, path, branch);
        return contents.map((item) => ({
            ...item,
            isExpanded: false,
        }));
    };

    // Toggle directory expansion
    const toggleDirectory = async (path: string) => {
        const updateTree = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
            return Promise.all(
                nodes.map(async (node) => {
                    if (node.path === path && node.type === "dir") {
                        if (node.isExpanded) {
                            // Collapse
                            return { ...node, isExpanded: false };
                        } else {
                            // Expand - load if needed
                            if (!node.children) {
                                const children = await loadDirectory(path);
                                return { ...node, isExpanded: true, children };
                            }
                            return { ...node, isExpanded: true };
                        }
                    }
                    if (node.children) {
                        return { ...node, children: await updateTree(node.children) };
                    }
                    return node;
                })
            );
        };

        setTree(await updateTree(tree));
    };

    // Handle item click
    const handleClick = (node: TreeNode) => {
        if (node.type === "dir") {
            toggleDirectory(node.path);
        }
        onFileSelect(node.path, node.type === "dir");
    };

    // Render tree node
    const renderNode = (node: TreeNode, depth = 0) => {
        const isSelected = selectedPath === node.path;
        const paddingLeft = depth * 16 + 8;

        return (
            <div key={node.path}>
                <button
                    onClick={() => handleClick(node)}
                    className={cn(
                        "flex items-center gap-2 w-full text-left py-2 px-2 text-sm transition-colors rounded-md min-h-[40px]",
                        "hover:bg-slate-800/80",
                        isSelected && "bg-violet-600/20 text-violet-300 border-l-2 border-violet-500"
                    )}
                    style={{ paddingLeft }}
                >
                    {node.type === "dir" ? (
                        <>
                            {node.isExpanded ? (
                                <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                            ) : (
                                <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                            )}
                            {node.isExpanded ? (
                                <FolderOpen className="h-4 w-4 shrink-0 text-amber-400" />
                            ) : (
                                <Folder className="h-4 w-4 shrink-0 text-amber-400" />
                            )}
                        </>
                    ) : (
                        <>
                            <span className="w-4" />
                            {getFileIcon(node.name)}
                        </>
                    )}
                    <span className="truncate">{node.name}</span>
                </button>

                {node.isExpanded && node.children && (
                    <div>
                        {node.children.map((child) => renderNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    if (error) {
        return (
            <div className="p-4 text-center">
                <p className="text-red-400 text-sm mb-3">{error}</p>
                <Button variant="outline" size="sm" onClick={loadRoot}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Retry
                </Button>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-3 border-b border-slate-700">
                <div className="flex items-center gap-2">
                    <Folder className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-medium text-slate-200 truncate max-w-[150px]">
                        {repo}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    onClick={loadRoot}
                    disabled={isLoading}
                    className="h-8 w-8"
                >
                    <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
                </Button>
            </div>

            <ScrollArea className="flex-1">
                <div className="p-2">
                    {isLoading ? (
                        <div className="space-y-2 p-2">
                            {[...Array(5)].map((_, i) => (
                                <div
                                    key={i}
                                    className="h-8 bg-slate-800 rounded animate-pulse"
                                />
                            ))}
                        </div>
                    ) : (
                        tree.map((node) => renderNode(node))
                    )}
                </div>
            </ScrollArea>
        </div>
    );
}
