export type RoomSurfaceId = 'floor' | 'wall-back' | 'wall-left' | 'wall-right';
export type RoomSurfaceDefinition = {
  id: RoomSurfaceId;
  label: string;
  kind: 'floor' | 'wall';
  widthM: number;
  heightM?: number;
  depthM?: number;
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
};

export const ROOM_DIMENSIONS = { widthM: 5, heightM: 2.9, depthM: 5 } as const;

export const ROOM_SURFACES: readonly RoomSurfaceDefinition[] = [
  { id: 'floor', label: 'Piso', kind: 'floor', widthM: ROOM_DIMENSIONS.widthM, depthM: ROOM_DIMENSIONS.depthM, position: [0, 0, 0], rotation: [-Math.PI / 2, 0, 0] },
  { id: 'wall-back', label: 'Pared trasera', kind: 'wall', widthM: ROOM_DIMENSIONS.widthM, heightM: ROOM_DIMENSIONS.heightM, position: [0, ROOM_DIMENSIONS.heightM / 2, -ROOM_DIMENSIONS.depthM / 2], rotation: [0, 0, 0] },
  { id: 'wall-left', label: 'Pared izquierda', kind: 'wall', widthM: ROOM_DIMENSIONS.depthM, heightM: ROOM_DIMENSIONS.heightM, position: [-ROOM_DIMENSIONS.widthM / 2, ROOM_DIMENSIONS.heightM / 2, 0], rotation: [0, Math.PI / 2, 0] },
  { id: 'wall-right', label: 'Pared derecha', kind: 'wall', widthM: ROOM_DIMENSIONS.depthM, heightM: ROOM_DIMENSIONS.heightM, position: [ROOM_DIMENSIONS.widthM / 2, ROOM_DIMENSIONS.heightM / 2, 0], rotation: [0, -Math.PI / 2, 0] },
];

export function surfaceAreaM2(surface: RoomSurfaceDefinition): number {
  return surface.kind === 'floor' ? surface.widthM * (surface.depthM ?? 0) : surface.widthM * (surface.heightM ?? 0);
}
