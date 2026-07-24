// TutorialHints: Interactive onboarding and UI highlights
import { useEffect, useState } from 'react';

const hints = [
  { selector: '#sidebar', text: 'Navigate between modules here.' },
  { selector: '#floorplan-canvas', text: 'Draw rooms, walls, and place equipment.' },
  { selector: '#simulation-tab', text: 'Run CFD and compliance simulations.' },
  { selector: '#quotation-tab', text: 'Generate BOQ and quotations.' },
];

export default function TutorialHints() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step < hints.length) {
      const el = document.querySelector(hints[step].selector);
      if (el) {
        el.classList.add('highlight');
      }
      return () => {
        if (el) el.classList.remove('highlight');
      };
    }
  }, [step]);
  if (step >= hints.length) return null;
  return (
    <div className="fixed bottom-6 left-6 z-50 glass-card max-w-xs rounded-2xl border border-border/70 p-4 shadow-(--panel-shadow)">
      <p className="text-sm text-foreground">{hints[step].text}</p>
      <button
        className="mt-3 inline-flex items-center rounded-xl border border-transparent bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        onClick={() => setStep(step + 1)}
      >
        Next
      </button>
    </div>
  );
}
