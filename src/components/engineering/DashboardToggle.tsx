import React, { useState } from "react";
import { Terminal } from "lucide-react";
import { EngineeringDashboard } from "./Dashboard";
import { AnimatePresence, motion } from "framer-motion";

export function DashboardToggle() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[90]">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 px-4 py-2.5 glass-strong border border-primary/30 rounded-full shadow-elevated group hover:border-primary transition-all"
        >
          <div className="relative">
            <Terminal className="w-4 h-4 text-primary" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/70 group-hover:text-white">
            Operations Center
          </span>
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && <EngineeringDashboard onClose={() => setIsOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
