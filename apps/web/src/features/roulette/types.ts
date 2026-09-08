export type RoulettePrize = { id: string; name: string; iconUrl?: string | null };
export type RouletteSegment = { id: string; color: string; prizeId: string | null };
export type RouletteConfig = { schemaVersion: 1; backgroundColor: string; prizes: RoulettePrize[]; segments: RouletteSegment[] };
