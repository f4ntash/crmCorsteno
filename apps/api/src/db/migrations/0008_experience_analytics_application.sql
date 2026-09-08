ALTER TABLE experiences ADD COLUMN project_id TEXT REFERENCES projects(id);
ALTER TABLE experiences ADD COLUMN application_id TEXT REFERENCES applications(id);

CREATE INDEX experiences_project_idx ON experiences(project_id);
CREATE INDEX experiences_application_idx ON experiences(application_id);
