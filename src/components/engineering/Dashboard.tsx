import React, { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEngineeringTelemetry } from "@/lib/engineering.functions";
import { 
  Terminal, Activity, Cpu, Shield, Zap, X, ChevronRight, 
  Layers, Eye, Code, Brain, Gauge, Network, Database, 
  Flame, Monitor, Command, Workflow, Lock, Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function EngineeringDashboard({ onClose }: { onClose: () => void }) {
  const fetchTelemetry = useServerFn(getEngineeringTelemetry);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<'reasoning' | 'neural' | 'architecture' | 'security'>('reasoning');
  
  const { data: telemetry } = useQuery({
    queryKey: ["engineering-telemetry"],
    queryFn: () => fetchTelemetry({}),
    refetchInterval: 1500,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [telemetry?.thought_stream]);

  const FeatureCard = ({ icon: Icon, title, value, detail, color = "primary" }: any) => (
    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className={`w-3 h-3 text-${color}`} />
        <span className="text-[9px] font-bold uppercase tracking-widest text-white/40">{title}</span>
      </div>
      <div className="text-sm font-mono text-white/90">{value}</div>
      <div className="text-[8px] text-white/20 italic">{detail}</div>
    </div>
  );

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 md:p-6 overflow-hidden"
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />
      
      {/* Revolutionary Background: Dynamic Neural Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(var(--primary),0.1),transparent_70%)]" />
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      </div>

      <motion.div 
        initial={{ y: 100, opacity: 0, scale: 0.9 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 50, opacity: 0, scale: 0.9 }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="relative w-full max-w-7xl h-[92vh] glass-strong rounded-3xl border border-primary/40 shadow-[0_0_120px_rgba(var(--primary),0.2)] overflow-hidden flex flex-col"
      >
        {/* Top Control Bar: The 'Brain' UI */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-white/10 bg-black/40 relative z-10">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center relative group">
                <Brain className="w-6 h-6 text-primary" />
                <motion.div 
                  animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-2xl bg-primary/20 blur-md"
                />
              </div>
              <div>
                <h1 className="text-sm font-black tracking-[0.4em] uppercase text-white leading-none">
                  NEURAL COMMAND CENTER
                </h1>
                <div className="flex items-center gap-2 mt-2">
                  <div className="flex gap-1">
                    {[1, 2, 3].map(i => (
                      <motion.div 
                        key={i}
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, delay: i * 0.2, repeat: Infinity }}
                        className="w-3 h-1 bg-primary rounded-full"
                      />
                    ))}
                  </div>
                  <span className="text-[9px] text-primary uppercase tracking-[0.2em] font-bold">Protocol Active // Recursive Loop v4</span>
                </div>
              </div>
            </div>

            <nav className="hidden lg:flex items-center gap-2 ml-8 px-2 py-1 bg-white/5 rounded-full border border-white/10">
              {[
                { id: 'reasoning', icon: Terminal, label: 'Logic' },
                { id: 'neural', icon: Zap, label: 'Neural' },
                { id: 'architecture', icon: Workflow, label: 'Core' },
                { id: 'security', icon: Lock, label: 'Safe' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === tab.id ? 'bg-primary text-black shadow-[0_0_15px_rgba(var(--primary),0.4)]' : 'text-white/40 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-4 px-4 py-2 bg-white/5 rounded-xl border border-white/10">
              <div className="flex flex-col items-end">
                <span className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Global Latency</span>
                <span className="text-xs font-mono text-primary">42ms</span>
              </div>
              <div className="w-[1px] h-6 bg-white/10" />
              <div className="flex flex-col items-end">
                <span className="text-[8px] text-white/30 uppercase font-bold tracking-widest">Load Factor</span>
                <span className="text-xs font-mono text-white/80">0.14</span>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="w-12 h-12 flex items-center justify-center hover:bg-white/10 rounded-2xl transition-all group border border-white/10"
            >
              <X className="w-6 h-6 text-white/40 group-hover:text-white group-hover:rotate-90 transition-transform" />
            </button>
          </div>
        </div>

        {/* Dynamic Content Grid */}
        <div className="flex-1 grid grid-cols-12 overflow-hidden p-4 gap-4">
          
          {/* Left Column: Subagent Swarm (Revolutionary Feature 1) */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-hidden">
            <div className="flex-1 flex flex-col gap-3 bg-black/40 rounded-2xl border border-white/5 p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
                  <Network className="w-3 h-3" /> Agent Swarm
                </div>
                <span className="text-[9px] font-mono text-primary">LIVE</span>
              </div>
              
              <div className="space-y-3">
                {telemetry?.orchestrator?.subagents?.map((agent: any) => (
                  <motion.div 
                    key={agent.name}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="p-4 rounded-xl bg-white/[0.03] border border-white/5 relative overflow-hidden group"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-primary/20 group-hover:bg-primary transition-colors" />
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-black text-white tracking-wide">{agent.name}</span>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${agent.state === 'active' ? 'bg-primary animate-pulse' : 'bg-white/20'}`} />
                        <span className="text-[8px] font-bold uppercase text-white/40">{agent.state}</span>
                      </div>
                    </div>
                    <div className="text-[9px] text-white/30 leading-tight mb-2 uppercase tracking-wider">{agent.role}</div>
                    
                    {/* Visual Feature: Micro Health Bars */}
                    <div className="flex items-center gap-2 mt-3">
                      <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${agent.health ?? 100}%` }}
                          className="h-full bg-primary/40"
                        />
                      </div>
                      <span className="text-[8px] font-mono text-white/40">{agent.health ?? 100}%</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Revolutionary Feature 2: Real-time GPU Telemetry */}
            <div className="bg-black/60 rounded-2xl border border-primary/20 p-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-4 flex items-center gap-2">
                <Gauge className="w-3 h-3" /> Neural Metrics
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FeatureCard icon={Flame} title="GPU Power" value={`${telemetry?.system_health?.gpu_load ?? 0}%`} detail="TDP Allocation" color="primary" />
                <FeatureCard icon={Monitor} title="VRAM" value={`${telemetry?.system_health?.memory_usage ?? 0}MB`} detail="Model Cache" color="white" />
              </div>
            </div>
          </div>

          {/* Center Column: Reasoning & Logic Terminal */}
          <div className="col-span-12 lg:col-span-6 flex flex-col bg-black/40 rounded-2xl border border-white/5 overflow-hidden">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/80 flex items-center gap-2">
                <Terminal className="w-3 h-3 text-primary" /> Logic Thought Stream
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                  <span className="text-[9px] font-mono text-primary/80 uppercase">Transmitting</span>
                </div>
                <div className="w-[1px] h-4 bg-white/10" />
                <span className="text-[9px] font-mono text-white/20">RECURSIVE_TRANSPARENCY_v4</span>
              </div>
            </div>
            
            <div 
              ref={scrollRef}
              className="flex-1 p-6 font-mono text-[11px] overflow-y-auto custom-scrollbar bg-[linear-gradient(rgba(0,0,0,0.5),transparent)]"
            >
              <AnimatePresence mode="popLayout">
                {telemetry?.thought_stream?.map((thought: any, i: number) => (
                  <motion.div 
                    key={`${thought.timestamp}-${i}`}
                    initial={{ opacity: 0, x: -10, filter: 'blur(5px)' }}
                    animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                    className="flex gap-4 mb-4 group"
                  >
                    <div className="flex flex-col items-center pt-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/10 group-hover:bg-primary transition-colors" />
                      <div className="w-[1px] h-full bg-white/5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[9px] text-white/30">[{thought.timestamp}]</span>
                        <span className="text-[10px] font-bold text-primary uppercase tracking-widest">{thought.agent}</span>
                      </div>
                      <div className="text-white/70 leading-relaxed text-[12px] group-hover:text-white transition-colors bg-white/5 p-3 rounded-lg border border-white/5 shadow-sm">
                        {thought.content}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="flex items-center gap-3 text-primary/40 pt-4 px-8">
                <motion.div 
                  animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="w-2 h-2 rounded-full bg-primary" 
                />
                <span className="text-[10px] italic tracking-widest uppercase">Intercepting next internal reasoning packet...</span>
              </div>
            </div>

            {/* Bottom Command Input (Visual Only) */}
            <div className="p-4 border-t border-white/5 bg-black/60 flex items-center gap-3">
              <Command className="w-4 h-4 text-white/20" />
              <div className="flex-1 h-10 bg-white/5 rounded-xl border border-white/10 flex items-center px-4 text-[11px] text-white/40 italic">
                Awaiting authorized directive...
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-[9px] font-bold text-primary uppercase">
                Secure
              </div>
            </div>
          </div>

          {/* Right Column: System Architecture (Revolutionary Feature 3) */}
          <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 overflow-hidden">
            <div className="bg-black/40 rounded-2xl border border-white/5 p-5 flex flex-col gap-6 overflow-y-auto">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 flex items-center gap-2">
                <Workflow className="w-3 h-3" /> Construction Pipeline
              </div>
              
              <div className="space-y-6 relative">
                <div className="absolute left-[7px] top-2 bottom-2 w-[1px] bg-white/10" />
                {telemetry?.construction_log?.map((log: any, i: number) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    className="relative pl-8"
                  >
                    <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-black border border-primary flex items-center justify-center z-10">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                    </div>
                    <div className="text-[10px] font-black text-white uppercase tracking-wider">{log.event}</div>
                    <div className="inline-block text-[8px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md mt-1 mb-2 uppercase">{log.result}</div>
                    <div className="text-[11px] text-white/40 leading-relaxed font-light">{log.details}</div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Feature 4: Memory & Storage Visualizer */}
            <div className="flex-1 bg-black/40 rounded-2xl border border-white/5 p-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40 mb-4 flex items-center gap-2">
                <Database className="w-3 h-3" /> Neural Storage
              </div>
              <div className="space-y-4">
                {[
                  { label: "Recursive Memory", val: 84, color: "primary" },
                  { label: "Design Tokens", val: 92, color: "white" },
                  { label: "ML Weights", val: 67, color: "primary" }
                ].map(stat => (
                  <div key={stat.label} className="space-y-1.5">
                    <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest">
                      <span className="text-white/40">{stat.label}</span>
                      <span className="text-white/60">{stat.val}%</span>
                    </div>
                    <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${stat.val}%` }}
                        className={`h-full ${stat.color === 'primary' ? 'bg-primary/60' : 'bg-white/20'}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Feature 5: Security Lock Visual */}
            <div className="p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-primary" />
              </div>
              <div>
                <div className="text-[10px] font-black text-white uppercase tracking-[0.2em]">Authorized Only</div>
                <div className="text-[8px] text-primary/60 uppercase font-mono mt-1 tracking-tighter">E2E ENCRYPTION ACTIVE</div>
              </div>
            </div>
          </div>
        </div>

        {/* Global System Status Footer (Feature 6+) */}
        <div className="px-8 py-4 border-t border-white/10 bg-black/60 flex items-center justify-between relative z-10">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary" />
              <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-white/60">System Ready</span>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-[9px] uppercase tracking-[0.2em] text-white/30">
              <span className="flex items-center gap-1.5"><Search className="w-3 h-3" /> Kernel v3.12.0</span>
              <span className="w-[1px] h-3 bg-white/10" />
              <span className="flex items-center gap-1.5"><Activity className="w-3 h-3" /> Uptime: 284:12:05</span>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-[9px] font-mono text-primary/40 uppercase tracking-[0.2em]">
              Protocol: REDOXY_ELITE_v4
            </div>
            <div className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[8px] font-bold text-white/40 uppercase tracking-widest">
              Restricted Access
            </div>
          </div>
        </div>

        {/* Cinematic Scan Line (Visual Polish) */}
        <motion.div 
          animate={{ top: ['0%', '100%'] }}
          transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          className="absolute left-0 right-0 h-[2px] bg-primary/10 blur-sm pointer-events-none z-[100]"
        />
      </motion.div>
    </motion.div>
  );
}
