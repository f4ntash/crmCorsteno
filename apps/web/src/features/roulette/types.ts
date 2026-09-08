export type RoulettePrize = { id: string; name: string; iconUrl?: string | null; enabled?: boolean; weight?: number; stockMode?: 'limited' | 'unlimited'; initialStock?: number };
export type RouletteSegment = { id: string; color: string; prizeId: string | null };
export type RouletteParticipation = { maxSpinsPerDevice: number | null; maxSpinsPerSession: number | null; cooldownSeconds: number };
export type RouletteConfig = { schemaVersion: 1; backgroundColor: string; prizes: RoulettePrize[]; segments: RouletteSegment[]; effects?: { sound?: boolean; vibration?: boolean; celebration?: boolean }; resultCta?: { enabled?: boolean; label?: string; url?: string }; participation?: RouletteParticipation };
