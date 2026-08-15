import React, { useState, useEffect } from "react";
import { Brain } from "lucide-react";
import { EngineeringDashboard } from "./Dashboard";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

export function DashboardToggle() {
  const [isOpen, setIsOpen] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    async function checkVisibility() {
      // 1. Check if we're in a developer environment
      const isDevEnv = 
        window.location.hostname === "localhost" || 
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname.includes("lovable.app") ||
        window.location.hostname.includes("id-preview");

      if (isDevEnv) {
        setIsVisible(true);
        return;
      }

      // 2. Check if the user is a logged-in admin
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: isAdmin } = await supabase.rpc("has_role", {
            _user_id: session.user.id,
            _role: "admin"
          });
          if (isAdmin) {
            setIsVisible(true);
            return;
          }
        }
      } catch (e) {
        // Silently fail auth checks
      }

      // 3. Fallback to hidden
      setIsVisible(false);
    }

    checkVisibility();
    
    // Periodically re-check (e.g. after login)
    const interval = setInterval(checkVisibility, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!isVisible) return null;

  return (
    <>
      <div className="fixed top-6 right-6 z-[9999]">
        <motion.button
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 30px rgba(var(--primary), 0.5)",
          }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 px-5 py-3 glass-strong border-2 border-primary/50 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.8)] group hover:border-primary transition-all relative overflow-hidden"
        >
          <div className="relative z-10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-primary animate-pulse" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-primary rounded-full animate-ping blur-[1px]" />
          </div>
          <span className="text-[11px] font-black uppercase tracking-[0.3em] text-white group-hover:text-primary transition-colors relative z-10">
            Protocol Intelligence
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/20 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && <EngineeringDashboard onClose={() => setIsOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

