import React, { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEngineeringTelemetry } from "@/lib/engineering.functions";
import { Terminal, Activity, Cpu, Shield, Zap, X, ChevronRight, Layers, Eye, Code, Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function EngineeringDashboard({ onClose }: { onClose: () => void }) {
  const fetchTelemetry = useServerFn(getEngineeringTelemetry);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const { data: telemetry } = useQuery({
    queryKey: ["engineering-telemetry"],
    queryFn: () => fetchTelemetry({}),
    refetchInterval: 2000,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [telemetry?.thought_stream]);

  return (
    <motion.div 
      initial={{ opacity: 0, backdropFilter: "blur(0px)" }}
      animate={{ opacity: 1, backdropFilter: "blur(32px)" }}
      exit={{ opacity: 0, backdropFilter: "blur(0px)" }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 overflow-hidden"
    >
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      
      {/* Gravity Drift Background Elements */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            animate={{ 
              x: [0, Math.random() * 40 - 20, 0],
              y: [0, Math.random() * 40 - 20, 0],
              rotate: [0, 5, 0]
            }}
            transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "easeInOut" }}
            className="absolute w-64 h-64 bg-primary/5 rounded-full blur-[120px]"
            style={{ 
              top: `${Math.random() * 100}%`, 
              left: `${Math.random() * 100}%` 
            }}
          />
        ))}
      </div>

      <motion.div 
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 20, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        className="relative w-full max-w-6xl h-[85vh] glass-strong rounded-2xl border border-primary/30 shadow-[0_0_80px_rgba(var(--primary),0.15)] overflow-hidden flex flex-col"
      >
        {/* Header - Jarvis Minimalist */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center relative">
              <Brain className="w-5 h-5 text-primary" />
              <motion.div 
                animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute inset-0 rounded-xl bg-primary/20 blur-sm"
              />
            </div>
            <div>
              <h2 className="text-xs font-bold tracking-[0.3em] uppercase text-white/90">
                Engineer Protocol Dashboard
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                <span className="text-[10px] text-white/40 uppercase tracking-widest font-medium">Internal Reasoning Stream Active</span>
              </div>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-full transition-all group"
          >
            <X className="w-5 h-5 text-white/40 group-hover:text-white group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        {/* Main Interface Grid */}
        <div className="flex-1 grid grid-cols-12 overflow-hidden">
          
          {/* 1. Agent Logic Rail */}
          <div className="col-span-12 md:col-span-3 border-r border-white/5 bg-black/20 p-6 flex flex-col gap-6 overflow-y-auto">
            <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2 flex items-center gap-2">
              <Cpu className="w-3 h-3" /> Active Units
            </div>
            
            <div className="space-y-4">
              {telemetry?.orchestrator?.subagents?.map((agent: any) => (
                <motion.div 
                  key={agent.name}
                  whileHover={{ x: 4 }}
                  className="p-4 rounded-xl bg-white/[0.03] border border-white/5 group transition-all hover:bg-white/[0.05] hover:border-primary/20"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white/80 tracking-tight">{agent.name}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-tighter ${
                      agent.state === 'active' ? 'bg-primary/20 text-primary' : 'bg-white/10 text-white/40'
                    }`}>
                      {agent.state}
                    </span>
                  </div>
                  <div className="text-[10px] text-white/40 italic leading-relaxed mb-3">
                    {agent.role}
                  </div>
                  <div className="text-[10px] font-mono text-primary/70 bg-primary/5 p-2 rounded border border-primary/10">
                    {agent.activity}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* 2. Thought Stream Terminal */}
          <div className="col-span-12 md:col-span-6 border-r border-white/5 flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-2">
                <Terminal className="w-3 h-3" /> Reasoning Stream
              </div>
              <div className="text-[9px] font-mono text-white/20">UTF-8 // SECURE_CHANNEL</div>
            </div>
            
            <div 
              ref={scrollRef}
              className="flex-1 p-6 font-mono text-[11px] overflow-y-auto space-y-4 custom-scrollbar"
            >
              <AnimatePresence mode="popLayout">
                {telemetry?.thought_stream?.map((thought: any, i: number) => (
                  <motion.div 
                    key={`${thought.timestamp}-${i}`}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-4 group"
                  >
                    <span className="text-white/20 shrink-0">[{thought.timestamp}]</span>
                    <span className="text-primary/80 shrink-0">{thought.agent} &gt;</span>
                    <span className="text-white/70 leading-relaxed group-hover:text-white transition-colors">
                      {thought.content}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="flex items-center gap-2 text-primary/40 pt-2">
                <span className="w-1.5 h-3 bg-primary/40 animate-pulse" />
                <span className="text-[10px]">Awaiting next recursive thought...</span>
              </div>
            </div>
          </div>

          {/* 3. Construction State & Protocol */}
          <div className="col-span-12 md:col-span-3 bg-black/40 flex flex-col overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-6 flex items-center gap-2">
                <Layers className="w-3 h-3" /> Recursive Progress
              </div>
              
              <div className="space-y-6">
                {telemetry?.construction_log?.map((log: any, i: number) => (
                  <div key={i} className="relative pl-6 border-l border-white/10 py-1">
                    <div className="absolute left-[-4.5px] top-2 w-2 h-2 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                    <div className="text-[10px] font-bold text-white/80 uppercase">{log.event}</div>
                    <div className="text-[9px] text-primary mt-1 font-mono">{log.result}</div>
                    <div className="text-[10px] text-white/40 mt-2 leading-relaxed">{log.details}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-1 p-6">
               <div className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-4 flex items-center gap-2">
                <Shield className="w-3 h-3" /> Protocol Constraints
              </div>
              <div className="space-y-3">
                {[
                  "Absolute Visual Quality",
                  "Performance First Architecture",
                  "Recursive Loop Verification",
                  "Obsidian Precision Styling"
                ].map((rule, idx) => (
                  <div key={idx} className="flex items-center gap-3 text-[10px] text-white/50 bg-white/[0.02] p-2 rounded-lg border border-white/5">
                    <div className="w-1 h-1 bg-primary rounded-full" />
                    {rule}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="px-8 py-3 border-t border-white/5 bg-white/[0.02] flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-tighter text-white/30">
              <Code className="w-3 h-3" /> Workspace: <span className="text-primary/50">Pixel-Perfect-Pro</span>
            </div>
            <div className="flex items-center gap-2 text-[9px] uppercase tracking-tighter text-white/30">
              <Eye className="w-3 h-3" /> Visibility: <span className="text-primary/50">Restricted</span>
            </div>
          </div>
          <div className="text-[9px] font-mono text-white/20 uppercase">
            Protocol Version: 3.1.2-REDOXY
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
