'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Wind, Activity } from 'lucide-react';
import { HvacLogo } from '@/components/ui/hvac-logo';

interface AuthSplitHeroProps {
  heading: string;
  subtitle: string;
}

export function AuthSplitHero({ heading, subtitle }: AuthSplitHeroProps) {
  return (
    <div className="relative hidden min-h-screen overflow-hidden border-r border-border/80 bg-[radial-gradient(circle_at_18%_20%,rgba(59,130,246,0.26),transparent_40%),radial-gradient(circle_at_80%_76%,rgba(34,197,94,0.18),transparent_42%),linear-gradient(120deg,#0B1220_0%,#101A2E_55%,#0B1220_100%)] p-8 lg:flex lg:flex-col">
      <div className="system-grid-bg absolute inset-0 opacity-50" />

      <div className="relative z-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-card/70">
          <HvacLogo variant="color" size={28} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">HVAC Studio</p>
          <p className="text-sm font-medium text-foreground">Engineering Command Center</p>
        </div>
      </div>

      <div className="relative z-10 mt-auto mb-auto max-w-lg">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="text-xs font-semibold uppercase tracking-[0.2em] text-primary"
        >
          Precision Cooling. Intelligent Design.
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="mt-3 text-4xl font-semibold tracking-tight text-white"
        >
          {heading}
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 text-sm leading-7 text-slate-200"
        >
          {subtitle}
        </motion.p>
      </div>

      <div className="relative z-10 mt-auto grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-card/35 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Wind size={16} />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">Airflow Sync</span>
          </div>
          <p className="text-xs text-slate-200">Live load and duct computations are ready for high-precision iteration.</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/35 p-4 backdrop-blur-md">
          <div className="mb-2 flex items-center gap-2 text-accent">
            <Activity size={16} />
            <span className="text-xs font-semibold uppercase tracking-[0.14em]">System Health</span>
          </div>
          <p className="text-xs text-slate-200">Project metrics, equipment fit, and reports are unified in one workflow.</p>
        </div>
      </div>
    </div>
  );
}
