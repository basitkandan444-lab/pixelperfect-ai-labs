import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEngineeringTelemetry } from "@/lib/engineering.functions";
import { Terminal, Activity, Cpu, Shield, Zap, X, ChevronRight, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function EngineeringDashboard({ onClose }: { onClose: () => void }) {
  const fetchTelemetry = useServerFn(getEngineeringTelemetry);
  
  const { data: telemetry, refetch } = useQuery({
    queryKey: ["engineering-telemetry"],
    queryFn: () => fetchTelemetry({}),
    refetchInterval: 3000, // Real-time feel
  });

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95, backdropFilter: "blur(0px)" }}
      animate={{ opacity: 1, scale: 1, backdropFilter: "blur(24px)" }}
      exit={{ opacity: 0, scale: 0.95, backdropFilter: "blur(0px)" }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8"
    >
      <div 
        className="absolute inset-0 bg-background/60" 
        onClick={onClose}
      />
      
      <div className="relative w-full max-w-5xl aspect-video glass-strong rounded-xl border border-primary/20 shadow-modal overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Terminal className="w-5 h-5 text-primary" />
              <motion.div 
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full blur-[2px]"
              />
            </div>
            <h2 className="text-sm font-bold tracking-[0.2em] uppercase text-white/90">
              Obsidian Precision™ Command Center
            </h2>
            <div className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary animate-pulse">
              LIVE TELEMETRY
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors group"
          >
            <X className="w-5 h-5 text-white/40 group-hover:text-white" />
          </button>
        </div>

        {/* Content Grid */}
        <div className="flex-1 grid grid-cols-12 gap-px bg-white/5 overflow-hidden">
          
          {/* Left: System Status & Agents */}
          <div className="col-span-12 md:col-span-4 bg-background/40 p-6 flex flex-col gap-6 overflow-y-auto border-r border-white/5">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">System Health</span>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                  <div className="text-[10px] text-white/40 uppercase mb-1">Status</div>
                  <div className="text-sm font-bold text-primary flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                    {telemetry?.status || "OPERATIONAL"}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                  <div className="text-[10px] text-white/40 uppercase mb-1">Uptime</div>
                  <div className="text-sm font-bold text-white/80">99.998%</div>
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-4">
                <Cpu className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Active Engineering Units</span>
              </div>
              
              <div className="space-y-2">
                {telemetry?.active_unit?.subagents?.map((agent: any) => (
                  <div key={agent.name} className="p-3 rounded-lg bg-white/5 border border-white/5 group hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white/80">{agent.name}</span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold uppercase">Active</span>
                    </div>
                    <div className="text-[10px] text-white/40 italic">{agent.role}</div>
                    <div className="mt-2 text-[10px] font-mono text-primary/70 flex items-center gap-2">
                      <ChevronRight className="w-3 h-3" />
                      {agent.status.replace(/_/g, " ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Center/Right: Visual Timeline & Logs */}
          <div className="col-span-12 md:col-span-8 flex flex-col bg-background/20 overflow-hidden">
            
            {/* Timeline Viz */}
            <div className="h-1/2 p-6 border-b border-white/5 relative overflow-hidden">
               <div className="flex items-center gap-2 mb-6">
                <Layers className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Recursive Loop Timeline (3D Depth)</span>
              </div>
              
              <div className="absolute inset-0 grid-noise pointer-events-none opacity-20" />
              
              <div className="relative h-32 flex items-center justify-around">
                {/* 3D Visualizer Mockup */}
                <div className="absolute inset-x-0 h-px bg-primary/20 top-1/2 -translate-y-1/2" />
                
                {telemetry?.timeline?.map((item: any, i: number) => (
                  <div key={i} className="relative z-10 flex flex-col items-center group">
                    <motion.div 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className={`w-3 h-3 rounded-full ${item.status === 'SUCCESS' ? 'bg-primary' : 'bg-primary/50 animate-pulse'} border-4 border-background shadow-[0_0_15px_rgba(var(--primary),0.5)]`}
                    />
                    <div className="absolute top-6 whitespace-nowrap text-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="text-[10px] font-bold text-white uppercase tracking-tighter">{item.event.replace(/_/g, " ")}</div>
                      <div className="text-[9px] text-white/40">{item.status}</div>
                    </div>
                  </div>
                ))}
                
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
              </div>
            </div>

            {/* Console Output */}
            <div className="flex-1 p-6 bg-black/40 font-mono text-[11px] overflow-y-auto">
              <div className="flex items-center gap-2 mb-4">
                <Shield className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Execution Logs</span>
              </div>
              
              <div className="space-y-1 text-white/60">
                <div className="text-primary/80">[{new Date().toISOString()}] INITIALIZING COMMAND_CENTER_HYDRATION...</div>
                <div>[{new Date().toISOString()}] ESTABLISHING SECURE_TUNNEL to PIXEL_PERFECT_PRO_CORE...</div>
                <div>[{new Date().toISOString()}] SYNCING_AGENT_STATE: JOHN, ELLIE, SMITH, ELON, ALEX...</div>
                <div className="text-green-500/70">[{new Date().toISOString()}] HANDSHAKE_SUCCESS: 200 OK</div>
                <div className="pl-4 border-l border-white/10 my-2 py-1 space-y-1">
                  {telemetry?.timeline?.map((log: any, idx: number) => (
                    <div key={idx}>
                      <span className="text-white/30 mr-2">&gt;</span>
                      <span className="text-primary/70">{log.event}:</span> {log.details}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="animate-pulse">_</span>
                  <span className="text-white/20">Awaiting recursive instructions...</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/5 bg-white/5 flex items-center justify-between text-[9px] uppercase tracking-widest text-white/30">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><Zap className="w-3 h-3 text-primary" /> Latency: 12ms</span>
            <span className="flex items-center gap-1.5"><Shield className="w-3 h-3 text-primary" /> Security: Obsidian Shield v4.1</span>
          </div>
          <div>PROTOCOL: UNIVERSAL_RECURSIVE_LOOP_V3</div>
        </div>
      </div>
    </motion.div>
  );
}
