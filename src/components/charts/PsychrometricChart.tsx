// PsychrometricChart: Interactive HVAC chart
import React, { useRef, useEffect } from 'react';

export default function PsychrometricChart({ points = [] }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // Draw axes
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 260);
    ctx.lineTo(340, 260);
    ctx.lineTo(340, 40);
    ctx.stroke();
    // Draw saturation curve (placeholder)
    ctx.strokeStyle = '#2563EB';
    ctx.beginPath();
    for (let t = 0; t <= 100; t += 2) {
      const x = 40 + t * 3;
      const y = 260 - Math.sqrt(t) * 2.5;
      if (t === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // Plot points
    points.forEach((pt) => {
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(40 + pt.temp * 3, 260 - pt.rh * 2.5, 5, 0, 2 * Math.PI);
      ctx.fill();
    });
  }, [points]);
  return (
    <div className="bg-white rounded shadow p-4">
      <canvas ref={canvasRef} width={380} height={280} />
      <div className="mt-2 text-xs text-gray-600">Dry Bulb Temp (°C) → | Relative Humidity (%) ↑</div>
    </div>
  );
}
