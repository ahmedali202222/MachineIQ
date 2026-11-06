package com.machineiq.store;

import com.machineiq.config.MachineIqProperties.MachineDef;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class MachineRepository {

    private final JdbcTemplate jdbc;

    public MachineRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Inserts or updates the machines listed in configuration. */
    public void upsert(List<MachineDef> machines) {
        for (MachineDef m : machines) {
            jdbc.update("""
                    INSERT INTO machine (id, name, kind) VALUES (?, ?, ?)
                    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, kind = EXCLUDED.kind
                    """, m.id(), m.name(), m.kind());
        }
    }
}
