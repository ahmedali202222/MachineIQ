package com.machineiq.service;

import com.machineiq.config.MachineIqProperties;
import com.machineiq.domain.Reading;
import com.machineiq.rules.AlertDecision;
import com.machineiq.rules.AlertType;
import com.machineiq.rules.RulesEngine;
import com.machineiq.store.AlertRepository;
import com.machineiq.store.MachineRepository;
import com.machineiq.store.ReadingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/** Stores readings, runs them through the rules engine and records alert changes. */
@Service
public class IngestService {

    private static final Logger log = LoggerFactory.getLogger(IngestService.class);

    private final ReadingRepository readings;
    private final AlertRepository alerts;
    private final MachineRepository machines;
    private final RulesEngine rules;
    private final MachineIqProperties props;

    public IngestService(ReadingRepository readings, AlertRepository alerts, MachineRepository machines,
                         RulesEngine rules, MachineIqProperties props) {
        this.readings = readings;
        this.alerts = alerts;
        this.machines = machines;
        this.rules = rules;
        this.props = props;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void init() {
        machines.upsert(props.machines());
        // Restore which alerts are open so a restart doesn't create duplicates.
        for (AlertRepository.Alert a : alerts.openAlerts()) {
            rules.markOpen(a.machineId(), AlertType.valueOf(a.type()), a.faultCode());
        }
    }

    @Transactional
    public void ingest(List<Reading> batch) {
        readings.saveAll(batch);
        for (Reading r : batch) {
            for (AlertDecision d : rules.evaluate(r)) {
                alerts.apply(d, r.ts());
                if (d.action() == AlertDecision.Action.OPEN) {
                    log.info("ALERT {} {} on {}: {}", d.severity(), d.type(), d.machineId(), d.message());
                }
            }
        }
    }

    @Scheduled(fixedDelay = 5000, initialDelay = 15000)
    public void checkCommunication() {
        Instant now = Instant.now();
        for (AlertDecision d : rules.checkStale(now)) {
            alerts.apply(d, now);
            log.warn("ALERT {} {} on {}: {}", d.severity(), d.type(), d.machineId(), d.message());
        }
    }

    @Scheduled(cron = "0 15 * * * *")
    public void purgeOldReadings() {
        int n = readings.deleteOlderThan(Instant.now().minus(props.retentionDays(), ChronoUnit.DAYS));
        if (n > 0) {
            log.info("Removed {} readings older than {} days", n, props.retentionDays());
        }
    }
}
