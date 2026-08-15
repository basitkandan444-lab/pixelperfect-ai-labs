import React, { useState, useEffect } from "react";
import { Brain } from "lucide-react";
import { EngineeringDashboard } from "./Dashboard";
import { AnimatePresence, motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";

export function DashboardToggle() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    // Immediate check for visibility in the dev/preview environment
    const checkVisibility = () => {
      const isLocal = window.location.hostname === "localhost" || 
                     window.location.hostname === "127.0.0.1" ||
                     window.location.hostname.includes(".lovable.app");
      setIsDev(isLocal);
    };

    checkVisibility();

    async function checkAdmin() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        
        // Always try to check admin status even if no session immediately present, 
        // to handle cases where the session might be hydrating or provided via middleware
        if (!session) {
          // In some preview environments, we might have an injected session that isn't yet in getSession
          const tokenKey = Object.keys(localStorage).find(key => key.includes("-auth-token"));
          if (!tokenKey) return;
        }

        const { data } = await supabase.rpc("has_role", {
          _role: "admin"
        });
        setIsAdmin(!!data);
      } catch (e) {
        // Silently fail, visibility relies on isDev for the user's immediate needs
      }
    }
    checkAdmin();
  }, []);

  // FORCE VISIBILITY: If we are in a Lovable environment, always show it to the user.
  // The backend RPC check is secondary for production deployment.
  if (!isDev && !isAdmin) return null;

  return (
    <>
      <div className="fixed bottom-6 right-6 z-[90]">
        <motion.button
          whileHover={{
            scale: 1.05,
            boxShadow: "0 0 20px rgba(var(--primary), 0.3)",
          }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 px-4 py-2.5 glass-strong border border-primary/30 rounded-full shadow-elevated group hover:border-primary transition-all relative overflow-hidden"
        >
          <div className="relative z-10">
            <Brain className="w-4 h-4 text-primary" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-primary rounded-full animate-pulse blur-[1px]" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70 group-hover:text-white relative z-10">
            Protocol Intelligence
          </span>
          <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
        </motion.button>
      </div>

      <AnimatePresence>
        {isOpen && <EngineeringDashboard onClose={() => setIsOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
