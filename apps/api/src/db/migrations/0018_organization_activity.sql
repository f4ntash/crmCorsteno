CREATE TABLE organization_activity (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX organization_activity_org_created
  ON organization_activity (organization_id, created_at DESC, id DESC);

CREATE INDEX organization_activity_action
  ON organization_activity (organization_id, action);

CREATE INDEX organization_activity_actor
  ON organization_activity (organization_id, actor_user_id);
