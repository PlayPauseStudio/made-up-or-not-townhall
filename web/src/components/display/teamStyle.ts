import type { CSSProperties } from 'react';
import type { TeamId } from '@/lib/types';

/** CSS variables for a team's colour, so one component can render either side. */
export function teamVars(id: TeamId): CSSProperties {
  const color = id === 'A' ? 'var(--team-a)' : 'var(--team-b)';
  const ink = id === 'A' ? 'var(--team-a-ink)' : 'var(--team-b-ink)';
  const glow = id === 'A' ? 'rgba(140, 66, 145, 0.7)' : 'rgba(231, 97, 26, 0.7)';
  return { '--team': color, '--team-ink': ink, '--glow': glow } as CSSProperties;
}

/** Big-screen type size that keeps long prompts on screen. */
export function fitPrompt(text: string): string {
  const n = text.length;
  if (n < 50) return '4.6vw';
  if (n < 90) return '3.8vw';
  if (n < 140) return '3.1vw';
  if (n < 220) return '2.6vw';
  return '2.1vw';
}

export function fitOption(text: string): string {
  const n = text.length;
  if (n < 20) return '2.6vw';
  if (n < 40) return '2.1vw';
  if (n < 70) return '1.7vw';
  return '1.4vw';
}
