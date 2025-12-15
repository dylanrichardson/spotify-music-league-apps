import type { RoundConfig } from './types';

export const ROUNDS: RoundConfig[] = [
  {
    number: 1,
    title: 'Shorties',
    subtitle: 'Songs that are less than 2 minutes long',
    path: '/round-1',
    enabled: true,
    description: 'Find tracks under 2 minutes from your library or playlists',
  },
  {
    number: 2,
    title: 'Hidden gems',
    subtitle: 'Best song from an artist with under 100k monthly listeners',
    path: '/round-2',
    enabled: true,
    description: 'Discover tracks from artists with under 100k monthly listeners',
  },
  {
    number: 3,
    title: 'Songs that have horns (of any kind)',
    subtitle: null,
    path: '/round-3',
    enabled: false,
    description: 'Find songs featuring horn instruments',
  },
  {
    number: 4,
    title: 'Songs that make you drive faster',
    subtitle: null,
    path: '/round-4',
    enabled: false,
    description: 'High-energy tracks that get your adrenaline pumping',
  },
  {
    number: 5,
    title: 'Songs released in your parents birth year',
    subtitle: null,
    path: '/round-5',
    enabled: true,
  },
];

export function getRoundByNumber(number: number): RoundConfig | undefined {
  return ROUNDS.find((r) => r.number === number);
}

export function getRoundByPath(path: string): RoundConfig | undefined {
  return ROUNDS.find((r) => r.path === path);
}
