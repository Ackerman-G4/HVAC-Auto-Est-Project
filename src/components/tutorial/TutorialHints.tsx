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
    <div className="fixed bottom-6 left-6 bg-blue-100 p-4 rounded shadow-lg z-50">
      <div>{hints[step].text}</div>
      <button className="mt-2 px-3 py-1 bg-blue-600 text-white rounded" onClick={() => setStep(step + 1)}>
        Next
      </button>
    </div>
  );
}
