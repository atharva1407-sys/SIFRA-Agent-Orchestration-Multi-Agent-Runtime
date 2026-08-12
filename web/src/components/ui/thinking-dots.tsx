import React from 'react';

/**
 * SIFRA "thinking" indicator — three color-cycling dots.
 * Drop this in wherever the agent is processing (e.g. between
 * sending an objective and the first event arriving).
 *
 * Usage:
 *   {isThinking && <ThinkingDots />}
 */
export function ThinkingDots({ size = 13, gap = 9 }: { size?: number; gap?: number }) {
  return (
    <div
      className="sifra-thinking-dots"
      style={{ '--dot-size': `${size}px`, '--dot-gap': `${gap}px` } as React.CSSProperties}
      role="status"
      aria-label="Agent is thinking"
    >
      <span className="sifra-dot sifra-dot-1" />
      <span className="sifra-dot sifra-dot-2" />
      <span className="sifra-dot sifra-dot-3" />
      <style>{`
        .sifra-thinking-dots {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--dot-gap);
        }
        .sifra-dot {
          width: var(--dot-size);
          height: var(--dot-size);
          border-radius: 50%;
          animation: sifra-dot-pulse 1.2s ease-in-out infinite;
        }
        .sifra-dot-1 { background: #7F77DD; animation-delay: 0s; }
        .sifra-dot-2 { background: #1D9E75; animation-delay: 0.15s; }
        .sifra-dot-3 { background: #D85A30; animation-delay: 0.3s; }

        @keyframes sifra-dot-pulse {
          0%, 80%, 100% {
            transform: scale(0.55);
            opacity: 0.35;
          }
          40% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sifra-dot {
            animation: none;
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
}
