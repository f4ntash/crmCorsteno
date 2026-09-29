const TREASURE_HUNT_PUBLIC_ORIGIN = 'https://corsteno.com';

export function getTreasureHuntPublicUrl(slug: string) {
  return TREASURE_HUNT_PUBLIC_ORIGIN + '/h/' + encodeURIComponent(slug);
}
