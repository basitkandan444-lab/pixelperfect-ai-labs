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
    setIsDev(
      typeof window !== "undefined" &&
        (window.location.hostname === "localhost" ||
          window.location.hostname.includes("lovable.app"))
    );

    async function checkAdmin() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;

      const { data } = await supabase.rpc("has_role", {
        _user_id: session.user.id,
        _role: "admin",
      });
      setIsAdmin(!!data);
    }
    checkAdmin();
  }, []);

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
