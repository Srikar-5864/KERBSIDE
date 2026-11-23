export interface LevelInfo {
  level: number;
  name: string;
  weight: number;
  next: string | null;
  toNext: number;
  points: number;
  nextGoal: number;
  progressPercent: number;
}

export function levelFor(points: number): LevelInfo {
  const p = Math.max(0, points || 0);
  if (p < 30) {
    return {
      level: 1,
      name: 'Newcomer',
      weight: 1,
      next: 'Neighbour',
      toNext: 30 - p,
      points: p,
      nextGoal: 30,
      progressPercent: Math.min(100, Math.round((p / 30) * 100)),
    };
  }
  if (p < 100) {
    return {
      level: 2,
      name: 'Neighbour',
      weight: 2,
      next: 'Green Guardian',
      toNext: 100 - p,
      points: p,
      nextGoal: 100,
      progressPercent: Math.min(100, Math.round(((p - 30) / (100 - 30)) * 100)),
    };
  }
  if (p < 250) {
    return {
      level: 3,
      name: 'Green Guardian',
      weight: 3,
      next: 'Kerbside Champion',
      toNext: 250 - p,
      points: p,
      nextGoal: 250,
      progressPercent: Math.min(100, Math.round(((p - 100) / (250 - 100)) * 100)),
    };
  }
  return {
    level: 4,
    name: 'Kerbside Champion',
    weight: 4,
    next: null,
    toNext: 0,
    points: p,
    nextGoal: 250,
    progressPercent: 100,
  };
}
