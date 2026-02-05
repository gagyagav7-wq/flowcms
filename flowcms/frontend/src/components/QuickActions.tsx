"use client";

import React, { useState } from "react";
import {
    Terminal,
    Package,
    RefreshCcw,
    ChevronDown,
    Loader2,
    CheckCircle,
    XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { api, CommandResponse } from "@/lib/api";

interface QuickActionsProps {
    projectPath?: string;
    accessToken: string;
}

export function QuickActions({ projectPath, accessToken }: QuickActionsProps) {
    const [isRunning, setIsRunning] = useState(false);
    const [showOutput, setShowOutput] = useState(false);
    const [commandOutput, setCommandOutput] = useState<CommandResponse | null>(null);
    const [currentAction, setCurrentAction] = useState<string>("");

    const runAction = async (action: string, command: string) => {
        if (!projectPath) {
            toast.error("No project selected");
            return;
        }

        setIsRunning(true);
        setCurrentAction(action);
        setShowOutput(true);
        setCommandOutput(null);

        try {
            api.setToken(accessToken);

            let result: CommandResponse;

            if (action === "install") {
                result = await api.installDependencies(projectPath);
            } else {
                result = await api.runCommand(command, projectPath);
            }

            setCommandOutput(result);

            if (result.success) {
                toast.success(`${action} completed successfully`);
            } else {
                toast.error(`${action} failed`, {
                    description: `Exit code: ${result.exit_code}`,
                });
            }
        } catch (err) {
            toast.error(`${action} failed`, {
                description: err instanceof Error ? err.message : "Unknown error",
            });
            setCommandOutput({
                success: false,
                exit_code: -1,
                stdout: "",
                stderr: err instanceof Error ? err.message : "Unknown error",
                command: command,
                duration_seconds: 0,
            });
        } finally {
            setIsRunning(false);
        }
    };

    const actions = [
        {
            label: "Install Dependencies",
            icon: Package,
            action: "install",
            command: "npm install",
            description: "Auto-detects npm, yarn, pip, etc.",
        },
        {
            label: "Run Dev Server",
            icon: Terminal,
            action: "dev",
            command: "npm run dev",
            description: "Start development server",
        },
        {
            label: "Run Build",
            icon: Terminal,
            action: "build",
            command: "npm run build",
            description: "Build for production",
        },
        {
            label: "Restart Service",
            icon: RefreshCcw,
            action: "restart",
            command: "systemctl restart app",
            description: "Restart the application service",
        },
    ];

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" disabled={isRunning}>
                        {isRunning ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                            <Terminal className="h-4 w-4 mr-2" />
                        )}
                        <span className="hidden sm:inline">Quick Actions</span>
                        <ChevronDown className="h-4 w-4 ml-1" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>System Tasks</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {actions.map((item) => (
                        <DropdownMenuItem
                            key={item.action}
                            onClick={() => runAction(item.action, item.command)}
                            disabled={isRunning}
                        >
                            <item.icon className="h-4 w-4 mr-2" />
                            <div className="flex flex-col">
                                <span>{item.label}</span>
                                <span className="text-xs text-slate-500">{item.description}</span>
                            </div>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            {/* Output Modal */}
            <Dialog open={showOutput} onOpenChange={setShowOutput}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Terminal className="h-5 w-5" />
                            {currentAction} Output
                        </DialogTitle>
                        {commandOutput && (
                            <DialogDescription className="flex items-center gap-2">
                                {commandOutput.success ? (
                                    <>
                                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                                        <span className="text-emerald-400">
                                            Completed in {commandOutput.duration_seconds.toFixed(2)}s
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <XCircle className="h-4 w-4 text-red-500" />
                                        <span className="text-red-400">
                                            Failed with exit code {commandOutput.exit_code}
                                        </span>
                                    </>
                                )}
                            </DialogDescription>
                        )}
                    </DialogHeader>

                    <div className="space-y-4">
                        {isRunning ? (
                            <div className="flex items-center justify-center py-12">
                                <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                            </div>
                        ) : commandOutput ? (
                            <ScrollArea className="h-[400px] rounded-lg border border-slate-700 bg-slate-950">
                                <pre className="p-4 text-xs font-mono whitespace-pre-wrap">
                                    {commandOutput.stdout && (
                                        <div className="text-slate-300 mb-4">
                                            <div className="text-slate-500 mb-2">STDOUT:</div>
                                            {commandOutput.stdout}
                                        </div>
                                    )}
                                    {commandOutput.stderr && (
                                        <div className="text-red-400">
                                            <div className="text-slate-500 mb-2">STDERR:</div>
                                            {commandOutput.stderr}
                                        </div>
                                    )}
                                    {!commandOutput.stdout && !commandOutput.stderr && (
                                        <span className="text-slate-500">No output</span>
                                    )}
                                </pre>
                            </ScrollArea>
                        ) : null}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
