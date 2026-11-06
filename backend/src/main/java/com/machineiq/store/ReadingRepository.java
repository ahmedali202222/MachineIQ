package com.machineiq.store;

import com.machineiq.domain.Reading;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

@Repository
public class ReadingRepository {

    private final JdbcTemplate jdbc;

    public ReadingRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void saveAll(List<Reading> readings) {
        jdbc.batchUpdate("""
                INSERT INTO reading (machine_id, ts, state, motor_temp_c, temp_quality_good, speed_ppm,
                                     piece_count, jam_sensor, vibration_mm_s, fault_code)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, readings, readings.size(), (ps, r) -> {
            ps.setString(1, r.machineId());
            ps.setTimestamp(2, Timestamp.from(r.ts()));
            ps.setString(3, r.state());
            ps.setObject(4, r.motorTempC());
            ps.setBoolean(5, r.tempQualityGood());
            ps.setObject(6, r.speedPpm());
            ps.setObject(7, r.pieceCount());
            ps.setObject(8, r.jamSensor());
            ps.setObject(9, r.vibrationMmS());
            ps.setString(10, r.faultCode());
        });
    }

    public Optional<Reading> latest(String machineId) {
        return jdbc.query("SELECT * FROM reading WHERE machine_id = ? ORDER BY ts DESC LIMIT 1",
                MAPPER, machineId).stream().findFirst();
    }

    /**
     * Readings for a chart. Short windows return raw points; longer windows are
     * averaged into about {@code maxPoints} buckets so the browser isn't sent thousands of rows.
     */
    public List<Reading> history(String machineId, int minutes, int maxPoints) {
        Instant since = Instant.now().minusSeconds(minutes * 60L);
        long bucketSeconds = Math.max(1, (minutes * 60L) / maxPoints);
        if (bucketSeconds <= 1) {
            return jdbc.query("SELECT * FROM reading WHERE machine_id = ? AND ts >= ? ORDER BY ts",
                    MAPPER, machineId, Timestamp.from(since));
        }
        return jdbc.query("""
                SELECT ? AS machine_id,
                       date_bin(make_interval(secs => ?), ts, TIMESTAMPTZ '2000-01-01') AS ts,
                       CASE WHEN bool_or(state = 'FAULTED') THEN 'FAULTED' ELSE max(state) END AS state,
                       avg(motor_temp_c) AS motor_temp_c,
                       bool_and(temp_quality_good) AS temp_quality_good,
                       avg(speed_ppm) AS speed_ppm,
                       max(piece_count) AS piece_count,
                       bool_or(jam_sensor) AS jam_sensor,
                       avg(vibration_mm_s) AS vibration_mm_s,
                       max(fault_code) AS fault_code
                FROM reading
                WHERE machine_id = ? AND ts >= ?
                GROUP BY 2
                ORDER BY 2
                """, MAPPER, machineId, bucketSeconds, machineId, Timestamp.from(since));
    }

    /** Per-machine counts used for availability and downtime. */
    public List<MachineWindowStats> windowStats(int hours) {
        return jdbc.query("""
                SELECT machine_id,
                       count(*) AS samples,
                       count(*) FILTER (WHERE state = 'RUNNING') AS running,
                       count(*) FILTER (WHERE state = 'FAULTED') AS faulted,
                       coalesce(max(piece_count) - min(piece_count), 0) AS pieces
                FROM reading
                WHERE ts >= ?
                GROUP BY machine_id
                """, (rs, i) -> new MachineWindowStats(
                rs.getString("machine_id"), rs.getLong("samples"), rs.getLong("running"),
                rs.getLong("faulted"), rs.getLong("pieces")),
                Timestamp.from(Instant.now().minusSeconds(hours * 3600L)));
    }

    public int deleteOlderThan(Instant cutoff) {
        return jdbc.update("DELETE FROM reading WHERE ts < ?", Timestamp.from(cutoff));
    }

    public record MachineWindowStats(String machineId, long samples, long running, long faulted, long pieces) {
    }

    private static final RowMapper<Reading> MAPPER = ReadingRepository::map;

    private static Reading map(ResultSet rs, int i) throws SQLException {
        return new Reading(
                rs.getString("machine_id"),
                rs.getTimestamp("ts").toInstant(),
                rs.getString("state"),
                (Double) rs.getObject("motor_temp_c"),
                rs.getBoolean("temp_quality_good"),
                (Double) rs.getObject("speed_ppm"),
                rs.getObject("piece_count") == null ? null : ((Number) rs.getObject("piece_count")).longValue(),
                (Boolean) rs.getObject("jam_sensor"),
                (Double) rs.getObject("vibration_mm_s"),
                rs.getString("fault_code"));
    }
}
