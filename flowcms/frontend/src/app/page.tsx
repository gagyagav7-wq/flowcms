"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Github, GitBranch, Sparkles, Shield, Wand2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

export default function HomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect to dashboard if already logged in
  useEffect(() => {
    if (session?.accessToken) {
      router.push("/dashboard");
    }
  }, [session, router]);

  const features = [
    {
      icon: Wand2,
      title: "Magic Paste",
      description: "AI-powered smart code injection that surgically replaces functions",
      color: "text-violet-400",
    },
    {
      icon: Shield,
      title: "Security Guard",
      description: "Blocks commits with secrets - API keys, tokens, or private keys",
      color: "text-emerald-400",
    },
    {
      icon: Sparkles,
      title: "AI Assistant",
      description: "Built-in Llama3-70b chat to generate and explain code",
      color: "text-amber-400",
    },
    {
      icon: Smartphone,
      title: "Mobile-First",
      description: "Optimized for coding on your phone via Cloudflare Tunnel",
      color: "text-blue-400",
    },
  ];

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Hero Section */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="max-w-4xl mx-auto text-center">
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="mb-8"
          >
            <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center mb-6 shadow-2xl shadow-violet-500/20">
              <GitBranch className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-violet-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent mb-4">
              GitFlow-CMS
            </h1>
            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              A production-grade Web CMS for managing GitHub repositories with
              AI-powered <span className="text-violet-400">Smart Editing</span> capabilities.
            </p>
          </motion.div>

          {/* Login Button */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-16"
          >
            <Button
              size="lg"
              onClick={() => signIn("github", { callbackUrl: "/dashboard" })}
              className="text-base px-8 py-6 h-auto"
            >
              <Github className="h-5 w-5 mr-2" />
              Login with GitHub
            </Button>
            <p className="text-sm text-slate-500 mt-4">
              Requires repo access for read/write operations
            </p>
          </motion.div>

          {/* Features Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 + index * 0.1 }}
                className="p-6 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-colors text-left"
              >
                <feature.icon className={`h-6 w-6 ${feature.color} mb-3`} />
                <h3 className="font-semibold text-slate-200 mb-1">{feature.title}</h3>
                <p className="text-sm text-slate-400">{feature.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-slate-600 text-sm border-t border-slate-800">
        <p>Built for mobile coding with ❤️</p>
      </footer>
    </div>
  );
}
