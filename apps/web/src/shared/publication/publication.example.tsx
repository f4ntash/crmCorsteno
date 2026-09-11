import { PublicationControls } from './PublicationControls';

// Test/demo usage only: another experience type can provide its own callbacks and status.
export function UnrelatedPublicationExample() {
  return <PublicationControls
    status="scheduled"
    hasUnpublishedChanges
    canPublish
    startsAt="2026-10-01T12:00:00.000Z"
    endsAt="2026-10-31T12:00:00.000Z"
    publicUrl="https://example.test/experiences/sample"
    onPublish={() => undefined}
    onTest={() => undefined}
  />;
}
