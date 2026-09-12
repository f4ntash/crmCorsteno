import type { PublicProduct3D } from '@corsteno/client';

export function preferredMedia(model3d: PublicProduct3D) {
  return model3d.available ? '3d' as const : 'image' as const;
}
