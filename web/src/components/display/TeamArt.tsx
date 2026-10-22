import type { TeamId } from '@/lib/types';

/**
 * The team identity from the show's cards: Team X is purple, Team O orange.
 * Team A (left side) is always X, team B (right side) always O.
 */

export function markOf(id: TeamId): 'X' | 'O' {
  return id === 'A' ? 'X' : 'O';
}

/**
 * The team's letter, unless the name already says it ("Team X" needs no extra X).
 */
export function needsMark(id: TeamId, name: string): boolean {
  // The last word of the name: 'Team X' -> 'x', 'Team O' / 'Team 0' -> 'o'.
  const last = name.trim().split(/\s+/).pop()?.toLowerCase().replace('0', 'o') ?? '';
  return last !== markOf(id).toLowerCase();
}

/** The team's letter, in the card's bold white. */
export function TeamMark({ id, className = '' }: { id: TeamId; className?: string }) {
  return <span className={`font-display font-black leading-none text-white ${className}`}>{markOf(id)}</span>;
}
