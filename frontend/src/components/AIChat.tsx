"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, Copy, Check, Code, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api, ChatMessage } from "@/lib/api";

interface AIChatProps {
    accessToken: string;
    currentFileContent?: string;
    currentLanguage?: string;
    onInsertCode?: (code: string) => void;
}

interface Message extends ChatMessage {
    id: string;
    timestamp: Date;
}

export function AIChat({
    accessToken,
    currentFileContent,
    currentLanguage,
    onInsertCode,
}: AIChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Check AI status on mount
    useEffect(() => {
        const checkStatus = async () => {
            api.setToken(accessToken);
            try {
                const status = await api.getAiStatus();
                setIsConfigured(status.configured);
            } catch {
                setIsConfigured(false);
            }
        };
        checkStatus();
    }, [accessToken]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Send message
    const sendMessage = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage: Message = {
            id: crypto.randomUUID(),
            role: "user",
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages((prev) => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            api.setToken(accessToken);

            // Build message history for API
            const chatHistory = messages.map((m) => ({
                role: m.role,
                content: m.content,
            }));
            chatHistory.push({ role: "user", content: userMessage.content });

            const response = await api.chat(
                chatHistory as ChatMessage[],
                currentFileContent,
                currentLanguage
            );

            const assistantMessage: Message = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: response.content,
                timestamp: new Date(),
            };

            setMessages((prev) => [...prev, assistantMessage]);
        } catch (err) {
            toast.error("Failed to send message", {
                description: err instanceof Error ? err.message : "Unknown error",
            });
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    };

    // Handle textarea submit on Enter
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    // Copy code to clipboard
    const copyCode = async (code: string, messageId: string) => {
        await navigator.clipboard.writeText(code);
        setCopiedId(messageId);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success("Copied to clipboard!");
    };

    // Extract code blocks from message
    const extractCodeBlocks = (content: string): string[] => {
        const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/g;
        const matches = [];
        let match;
        while ((match = codeBlockRegex.exec(content)) !== null) {
            matches.push(match[1].trim());
        }
        return matches;
    };

    // Render message content with code formatting
    const renderContent = (content: string) => {
        // Simple markdown-like rendering
        const parts = content.split(/(```[\w]*\n?[\s\S]*?```)/g);

        return parts.map((part, i) => {
            if (part.startsWith("```")) {
                const lines = part.split("\n");
                const language = lines[0].replace("```", "").trim();
                const code = lines.slice(1, -1).join("\n");

                return (
                    <div key={i} className="my-3 rounded-lg overflow-hidden bg-slate-950 border border-slate-700">
                        <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-700">
                            <span className="text-xs text-slate-400">{language || "code"}</span>
                        </div>
                        <pre className="p-3 overflow-x-auto text-sm">
                            <code className="text-slate-300">{code}</code>
                        </pre>
                    </div>
                );
            }

            return (
                <span key={i} className="whitespace-pre-wrap">
                    {part}
                </span>
            );
        });
    };

    // Not configured state
    if (isConfigured === false) {
        return (
            <div className="h-full flex items-center justify-center p-6 text-center">
                <div className="space-y-4">
                    <Bot className="h-12 w-12 text-slate-600 mx-auto" />
                    <h3 className="text-lg font-medium text-slate-300">AI Chat Not Configured</h3>
                    <p className="text-sm text-slate-500 max-w-sm">
                        Set the <code className="bg-slate-800 px-1.5 py-0.5 rounded">GROQ_API_KEY</code>
                        environment variable in the backend to enable AI features.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col bg-slate-900">
            {/* Header */}
            <div className="flex items-center gap-2 p-3 border-b border-slate-700">
                <Bot className="h-5 w-5 text-violet-400" />
                <span className="font-medium text-slate-200">AI Assistant</span>
                <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-0.5 rounded-full ml-auto">
                    Llama3-70b
                </span>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center space-y-3 max-w-xs">
                            <Sparkles className="h-8 w-8 text-violet-400 mx-auto" />
                            <p className="text-sm text-slate-400">
                                Ask me to help with code, explain concepts, or generate new functions.
                            </p>
                            <div className="flex flex-wrap gap-2 justify-center">
                                {["Explain this code", "Add error handling", "Write unit tests"].map((prompt) => (
                                    <button
                                        key={prompt}
                                        onClick={() => setInput(prompt)}
                                        className="text-xs px-3 py-1.5 rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300 transition-colors"
                                    >
                                        {prompt}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {messages.map((message) => {
                            const codeBlocks = extractCodeBlocks(message.content);

                            return (
                                <div
                                    key={message.id}
                                    className={cn(
                                        "flex gap-3",
                                        message.role === "user" ? "justify-end" : "justify-start"
                                    )}
                                >
                                    {message.role === "assistant" && (
                                        <div className="shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                                            <Bot className="h-4 w-4 text-white" />
                                        </div>
                                    )}

                                    <div
                                        className={cn(
                                            "max-w-[85%] rounded-xl px-4 py-3",
                                            message.role === "user"
                                                ? "bg-violet-600 text-white"
                                                : "bg-slate-800 text-slate-200"
                                        )}
                                    >
                                        <div className="text-sm leading-relaxed">
                                            {renderContent(message.content)}
                                        </div>

                                        {/* Action buttons for assistant messages with code */}
                                        {message.role === "assistant" && codeBlocks.length > 0 && (
                                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-700">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => copyCode(codeBlocks[0], message.id)}
                                                    className="h-8 text-xs"
                                                >
                                                    {copiedId === message.id ? (
                                                        <Check className="h-3 w-3 mr-1" />
                                                    ) : (
                                                        <Copy className="h-3 w-3 mr-1" />
                                                    )}
                                                    Copy
                                                </Button>

                                                {onInsertCode && (
                                                    <Button
                                                        size="sm"
                                                        variant="secondary"
                                                        onClick={() => onInsertCode(codeBlocks[0])}
                                                        className="h-8 text-xs"
                                                    >
                                                        <Code className="h-3 w-3 mr-1" />
                                                        Insert
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {message.role === "user" && (
                                        <div className="shrink-0 w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                            <User className="h-4 w-4 text-slate-400" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {isLoading && (
                            <div className="flex gap-3">
                                <div className="shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center">
                                    <Bot className="h-4 w-4 text-white" />
                                </div>
                                <div className="bg-slate-800 rounded-xl px-4 py-3">
                                    <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </ScrollArea>

            {/* Input */}
            <div className="p-3 border-t border-slate-700">
                <div className="flex gap-2">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask AI anything..."
                        rows={1}
                        className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent min-h-[44px]"
                    />
                    <Button
                        onClick={sendMessage}
                        disabled={!input.trim() || isLoading}
                        size="icon"
                        className="shrink-0"
                    >
                        {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Send className="h-4 w-4" />
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
