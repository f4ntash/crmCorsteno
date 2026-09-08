export type Roulette3DPrize = { id: string; name: string; iconUrl?: string | null; redemption?: { enabled?: boolean } };
export type Roulette3DSegment = { id: string; color: string; prizeId: string | null };
export type Roulette3DConfig = {
  schemaVersion: 1;
  backgroundColor: string;
  prizes: Roulette3DPrize[];
  segments: Roulette3DSegment[];
  effects?: { sound?: boolean; vibration?: boolean; celebration?: boolean };
  resultCta?: { enabled?: boolean; label?: string; url?: string };
};
