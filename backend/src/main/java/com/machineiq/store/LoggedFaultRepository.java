package com.machineiq.store;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Repository;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Objects;

/** Faults technicians log by hand, for machines MachineIQ isn't connected to. */
@Repository
public class LoggedFaultRepository {

    public record LoggedFault(
            long id,
            String machineName,
            String fault,
            String description,
            Instant occurredAt,
            int minutesDown,
            String fix
    ) {
    }

    public record Total(String name, long count, long minutesDown) {
    }

    public record Summary(int days, long count, long minutesDown, List<Total> byMachine, List<Total> byFault) {
    }

    private static final RowMapper<LoggedFault> MAPPER = (rs, i) -> new LoggedFault(
            rs.getLong("id"),
            rs.getString("machine_name"),
            rs.getString("fault"),
            rs.getString("description"),
            rs.getTimestamp("occurred_at").toInstant(),
            rs.getInt("minutes_down"),
            rs.getString("fix"));

    private static final RowMapper<Total> TOTAL = (rs, i) ->
            new Total(rs.getString("name"), rs.getLong("n"), rs.getLong("minutes"));

    private final JdbcTemplate jdbc;

    public LoggedFaultRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public LoggedFault create(String machineName, String fault, String description, Instant occurredAt,
                              int minutesDown, String fix) {
        GeneratedKeyHolder keys = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO logged_fault (machine_name, fault, description, occurred_at, minutes_down, fix)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, machineName);
            ps.setString(2, fault);
            ps.setString(3, description);
            ps.setTimestamp(4, Timestamp.from(occurredAt));
            ps.setInt(5, minutesDown);
            ps.setString(6, fix);
            return ps;
        }, keys);
        long id = ((Number) Objects.requireNonNull(keys.getKeys()).get("id")).longValue();
        return new LoggedFault(id, machineName, fault, description, occurredAt, minutesDown, fix);
    }

    public List<LoggedFault> recent(int days, int limit) {
        return jdbc.query("SELECT * FROM logged_fault WHERE occurred_at >= ? ORDER BY occurred_at DESC LIMIT ?",
                MAPPER, since(days), limit);
    }

    public boolean delete(long id) {
        return jdbc.update("DELETE FROM logged_fault WHERE id = ?", id) > 0;
    }

    public Summary summary(int days) {
        Timestamp since = since(days);
        List<Total> byMachine = jdbc.query("""
                SELECT machine_name AS name, count(*) AS n, sum(minutes_down) AS minutes
                FROM logged_fault WHERE occurred_at >= ?
                GROUP BY machine_name ORDER BY minutes DESC, n DESC
                """, TOTAL, since);
        List<Total> byFault = jdbc.query("""
                SELECT fault AS name, count(*) AS n, sum(minutes_down) AS minutes
                FROM logged_fault WHERE occurred_at >= ?
                GROUP BY fault ORDER BY n DESC, minutes DESC LIMIT 8
                """, TOTAL, since);
        long count = byMachine.stream().mapToLong(Total::count).sum();
        long minutes = byMachine.stream().mapToLong(Total::minutesDown).sum();
        return new Summary(days, count, minutes, byMachine, byFault);
    }

    /** Names already used, so the form can suggest them (keeps "Inserter 2" from becoming "inserter2"). */
    public List<String> distinctNames(String column) {
        String col = switch (column) {
            case "machine" -> "machine_name";
            case "fault" -> "fault";
            default -> throw new IllegalArgumentException(column);
        };
        return jdbc.queryForList("SELECT " + col + " FROM logged_fault GROUP BY " + col
                + " ORDER BY max(occurred_at) DESC LIMIT 50", String.class);
    }

    private static Timestamp since(int days) {
        return Timestamp.from(Instant.now().minusSeconds(days * 86_400L));
    }
}
