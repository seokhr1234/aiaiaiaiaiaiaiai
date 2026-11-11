BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE SCHEMA IF NOT EXISTS donghaeng;
CREATE TABLE IF NOT EXISTS donghaeng.source_snapshot (
  id text PRIMARY KEY,
  source_url text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  collected_at timestamptz,
  source_as_of text,
  source_crs text,
  vertical_datum text,
  license text NOT NULL,
  metadata jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS donghaeng.review_feature (
  source_id text NOT NULL REFERENCES donghaeng.source_snapshot(id),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  external_id text,
  kind text NOT NULL,
  original_geometry jsonb NOT NULL,
  geometry geometry(Geometry,4326) NOT NULL,
  properties jsonb NOT NULL,
  field_verified boolean NOT NULL DEFAULT false,
  verification_evidence jsonb,
  PRIMARY KEY (source_id,ordinal),
  CHECK (ST_IsValid(geometry)),
  CHECK (NOT ST_IsEmpty(geometry)),
  CHECK (NOT field_verified OR verification_evidence IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS review_feature_spatial ON donghaeng.review_feature USING gist(geometry);
CREATE INDEX IF NOT EXISTS review_feature_kind ON donghaeng.review_feature(kind);
COMMIT;
