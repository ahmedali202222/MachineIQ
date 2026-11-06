package com.machineiq.service;

import com.machineiq.config.MachineIqProperties;
import com.machineiq.config.MachineIqProperties.MachineDef;
import com.machineiq.domain.Reading;
import com.machineiq.rules.FaultCodes;
import com.machineiq.store.AlertRepository;
import com.machineiq.store.AlertRepository.Alert;
import com.machineiq.store.ReadingRepository;
import com.machineiq.store.ReadingRepository.MachineWindowStats;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class MachineService {

    public record MachineStatus(
            String id,
            String name,
            String kind,
            String status,          // RUNNING, IDLE, FAULTED, OFFLINE
            Reading latest,
            String faultDescription,
            int openAlerts
    ) {
    }

    public record MachineStats(
            String machineId,
            String name,
            double availabilityPct,
            double downtimeMinutes,
            long pieces
    ) {
    }

    public record PlantStats(int hours, List<MachineStats> machines, Map<String, Long> faultsByCode) {
    }

    private final MachineIqProperties props;
    private final ReadingRepository readings;
    private final AlertRepository alerts;

    public MachineService(MachineIqProperties props, ReadingRepository readings, AlertRepository alerts) {
        this.props = props;
        this.readings = readings;
        this.alerts = alerts;
    }

    public List<MachineStatus> statuses() {
        Map<String, Long> openCounts = alerts.openAlerts().stream()
                .collect(Collectors.groupingBy(Alert::machineId, Collectors.counting()));
        return props.machines().stream().map(m -> status(m, openCounts.getOrDefault(m.id(), 0L).intValue())).toList();
    }

    public Optional<MachineStatus> status(String id) {
        return find(id).map(m -> status(m, (int) alerts.openAlerts().stream()
                .filter(a -> a.machineId().equals(id)).count()));
    }

    public Optional<MachineDef> find(String id) {
        return props.machines().stream().filter(m -> m.id().equals(id)).findFirst();
    }

    private MachineStatus status(MachineDef m, int openAlerts) {
        Reading latest = readings.latest(m.id()).orElse(null);
        String status;
        if (latest == null || Duration.between(latest.ts(), Instant.now()).getSeconds() > props.rules().staleAfterSeconds()) {
            status = "OFFLINE";
        } else {
            status = latest.state() == null ? "UNKNOWN" : latest.state();
        }
        String desc = latest != null && latest.isFaulted() ? FaultCodes.describe(latest.faultCode()) : null;
        return new MachineStatus(m.id(), m.name(), m.kind(), status, latest, desc, openAlerts);
    }

    public PlantStats stats(int hours) {
        double sampleSeconds = props.opcua().pollIntervalMs() / 1000.0;
        Map<String, MachineWindowStats> byId = readings.windowStats(hours).stream()
                .collect(Collectors.toMap(MachineWindowStats::machineId, Function.identity()));
        List<MachineStats> list = props.machines().stream().map(m -> {
            MachineWindowStats s = byId.get(m.id());
            if (s == null || s.samples() == 0) {
                return new MachineStats(m.id(), m.name(), 0, 0, 0);
            }
            double availability = 100.0 * s.running() / s.samples();
            double downtime = s.faulted() * sampleSeconds / 60.0;
            return new MachineStats(m.id(), m.name(), round1(availability), round1(downtime), s.pieces());
        }).toList();
        return new PlantStats(hours, list, alerts.faultCounts(hours));
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }
}
