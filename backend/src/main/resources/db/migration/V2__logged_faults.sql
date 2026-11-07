-- Faults entered by hand by technicians (machines that aren't connected yet).
CREATE TABLE logged_fault (
    id            BIGSERIAL PRIMARY KEY,
    machine_name  VARCHAR(100) NOT NULL,
    fault         VARCHAR(100) NOT NULL,
    description   TEXT,
    occurred_at   TIMESTAMPTZ NOT NULL,
    minutes_down  INTEGER NOT NULL CHECK (minutes_down >= 0),
    fix           TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_logged_fault_occurred ON logged_fault (occurred_at DESC);
