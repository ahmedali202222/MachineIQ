CREATE TABLE machine (
    id          VARCHAR(32) PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    kind        VARCHAR(100) NOT NULL
);

-- One row per poll per machine.
CREATE TABLE reading (
    id                BIGSERIAL PRIMARY KEY,
    machine_id        VARCHAR(32) NOT NULL REFERENCES machine (id),
    ts                TIMESTAMPTZ NOT NULL,
    state             VARCHAR(16),
    motor_temp_c      DOUBLE PRECISION,
    temp_quality_good BOOLEAN NOT NULL DEFAULT TRUE,
    speed_ppm         DOUBLE PRECISION,
    piece_count       BIGINT,
    jam_sensor        BOOLEAN,
    vibration_mm_s    DOUBLE PRECISION,
    fault_code        VARCHAR(16)
);
CREATE INDEX idx_reading_machine_ts ON reading (machine_id, ts DESC);
CREATE INDEX idx_reading_ts ON reading (ts);

CREATE TABLE alert (
    id              BIGSERIAL PRIMARY KEY,
    machine_id      VARCHAR(32) NOT NULL REFERENCES machine (id),
    type            VARCHAR(32) NOT NULL,
    severity        VARCHAR(16) NOT NULL,
    message         TEXT NOT NULL,
    fault_code      VARCHAR(16),
    opened_at       TIMESTAMPTZ NOT NULL,
    closed_at       TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ
);
CREATE INDEX idx_alert_open ON alert (machine_id, type) WHERE closed_at IS NULL;
CREATE INDEX idx_alert_opened ON alert (opened_at DESC);

-- Manual sections for the troubleshooting assistant (PostgreSQL full-text search).
CREATE TABLE doc_chunk (
    id       BIGSERIAL PRIMARY KEY,
    source   VARCHAR(200) NOT NULL,
    heading  VARCHAR(300) NOT NULL,
    content  TEXT NOT NULL,
    search   TSVECTOR NOT NULL
);
CREATE INDEX idx_doc_chunk_search ON doc_chunk USING GIN (search);
