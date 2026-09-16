import type { RoomSurfaceId } from '../utils/surfaces';

export type SurfaceAssignments = Partial<Record<RoomSurfaceId, string>>;

export function assignProductToSurface(assignments: SurfaceAssignments, surfaceId: RoomSurfaceId, productId: string): SurfaceAssignments {
  return { ...assignments, [surfaceId]: productId };
}

export function resetSurfaceAssignments(): SurfaceAssignments {
  return {};
}
