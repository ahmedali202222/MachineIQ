package com.machineiq.store;

import com.machineiq.rules.AlertDecision;
import com.machineiq.rules.AlertType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Repository
public class AlertRepository {

    public record Alert(
            long id,
            String machineId,
            String type,
            String severity,
            String message,
            String faultCode,
            Instant openedAt,
            Instant closedAt,
            Instant acknowledgedAt
    ) {
        public boolean isOpen() {
            return closedAt == null;
        }
    }

    private static final RowMapper<Alert> MAPPER = (rs, i) -> new Alert(
            rs.getLong("id"),
            rs.getString("machine_id"),
            rs.getString("type"),
            rs.getString("severity"),
            rs.getString("message"),
            rs.getString("fault_code"),
            rs.getTimestamp("opened_at").toInstant(),
            rs.getTimestamp("closed_at") == null ? null : rs.getTimestamp("closed_at").toInstant(),
            rs.getTimestamp("acknowledged_at") == null ? null : rs.getTimestamp("acknowledged_at").toInstant());

    private final JdbcTemplate jdbc;

    public AlertRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void apply(AlertDecision d, Instant at) {
        if (d.action() == AlertDecision.Action.OPEN) {
            jdbc.update("""
                    INSERT INTO alert (machine_id, type, severity, message, fault_code, opened_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, d.machineId(), d.type().name(), d.severity().name(), d.message(), d.faultCode(),
                    Timestamp.from(at));
        } else {
            jdbc.update("UPDATE alert SET closed_at = ? WHERE machine_id = ? AND type = ? AND closed_at IS NULL",
                    Timestamp.from(at), d.machineId(), d.type().name());
        }
    }

    public List<Alert> openAlerts() {
        return jdbc.query("SELECT * FROM alert WHERE closed_at IS NULL ORDER BY opened_at DESC", MAPPER);
    }

    public List<Alert> recent(int limit, String machineId) {
        if (machineId == null) {
            return jdbc.query("SELECT * FROM alert ORDER BY opened_at DESC LIMIT ?", MAPPER, limit);
        }
        return jdbc.query("SELECT * FROM alert WHERE machine_id = ? ORDER BY opened_at DESC LIMIT ?",
                MAPPER, machineId, limit);
    }

    public boolean acknowledge(long id) {
        return jdbc.update("UPDATE alert SET acknowledged_at = now() WHERE id = ? AND acknowledged_at IS NULL", id) > 0;
    }

    /** Number of controller faults per fault code in the window. */
    public Map<String, Long> faultCounts(int hours) {
        return jdbc.query("""
                SELECT fault_code, count(*) AS n FROM alert
                WHERE type = ? AND opened_at >= ? AND fault_code IS NOT NULL
                GROUP BY fault_code ORDER BY n DESC
                """, rs -> {
            Map<String, Long> m = new java.util.LinkedHashMap<>();
            while (rs.next()) {
                m.put(rs.getString("fault_code"), rs.getLong("n"));
            }
            return m;
        }, AlertType.FAULT.name(), Timestamp.from(Instant.now().minusSeconds(hours * 3600L)));
    }
}
