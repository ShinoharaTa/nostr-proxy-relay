-- マルチバックエンド戦略のための relay_config 拡張
ALTER TABLE relay_config ADD COLUMN role TEXT NOT NULL DEFAULT 'primary'
  CHECK (role IN ('primary','secondary','observer'));
ALTER TABLE relay_config ADD COLUMN weight INTEGER NOT NULL DEFAULT 1;
ALTER TABLE relay_config ADD COLUMN read_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE relay_config ADD COLUMN write_enabled INTEGER NOT NULL DEFAULT 1;
