package com.machineiq.rules;

import com.machineiq.domain.Reading;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import static com.machineiq.rules.AlertDecision.Severity.CRITICAL;
import static com.machineiq.rules.AlertDecision.Severity.WARNING;

/**
 * Turns a stream of readings into alert open/close decisions.
 *
 * <p>It remembers which alerts are open for each machine, so it only emits a
 * decision when something changes (no duplicate alerts every second). It has
 * no framework dependencies, which keeps it easy to unit test.
 */
public class RulesEngine {

    private final RuleThresholds t;
    private final Map<String, Set<AlertType>> open = new ConcurrentHashMap<>();
    private final Map<String, String> openFaultCode = new ConcurrentHashMap<>();
    private final Map<String, Instant> lastSeen = new ConcurrentHashMap<>();

    public RulesEngine(RuleThresholds thresholds) {
        this.t = thresholds;
    }

    /** Seed state from alerts that were already open in the database (e.g. after a restart). */
    public void markOpen(String machineId, AlertType type, String faultCode) {
        openSet(machineId).add(type);
        if (type == AlertType.FAULT && faultCode != null) {
            openFaultCode.put(machineId, faultCode);
        }
    }

    public synchronized List<AlertDecision> evaluate(Reading r) {
        List<AlertDecision> out = new ArrayList<>();
        String id = r.machineId();
        lastSeen.put(id, r.ts());

        // Data is flowing again.
        closeIfOpen(id, AlertType.COMMUNICATION_LOSS, out);

        // 1. Controller fault
        if (r.isFaulted()) {
            String code = r.faultCode();
            String previous = openFaultCode.get(id);
            if (!isOpen(id, AlertType.FAULT) || (code != null && !code.equals(previous))) {
                if (isOpen(id, AlertType.FAULT)) {
                    out.add(AlertDecision.close(id, AlertType.FAULT)); // fault code changed
                }
                openSet(id).add(AlertType.FAULT);
                openFaultCode.put(id, code);
                out.add(AlertDecision.open(id, AlertType.FAULT, CRITICAL,
                        "Machine stopped with fault " + code + " (" + FaultCodes.describe(code) + ")", code));
            }
        } else if (isOpen(id, AlertType.FAULT)) {
            openSet(id).remove(AlertType.FAULT);
            openFaultCode.remove(id);
            out.add(AlertDecision.close(id, AlertType.FAULT));
        }

        // 2. Temperature sensor quality
        if (!r.tempQualityGood()) {
            openIfClosed(id, AlertType.SENSOR_FAILURE, WARNING,
                    "Motor temperature sensor is reporting bad quality - check wiring and connector", out);
        } else {
            closeIfOpen(id, AlertType.SENSOR_FAILURE, out);
        }

        // 3. High temperature (only judged when the sensor is trustworthy)
        Double temp = r.motorTempC();
        if (r.tempQualityGood() && temp != null) {
            if (temp >= t.warnTempC()) {
                openIfClosed(id, AlertType.HIGH_TEMPERATURE, WARNING,
                        String.format("Motor temperature %.1f°C is above the %.0f°C warning limit", temp, t.warnTempC()), out);
            } else if (temp < t.warnTempC() - t.tempHysteresisC()) {
                closeIfOpen(id, AlertType.HIGH_TEMPERATURE, out);
            }
        }

        // 4. Vibration
        Double vib = r.vibrationMmS();
        if (vib != null) {
            if (vib >= t.warnVibrationMmS()) {
                openIfClosed(id, AlertType.HIGH_VIBRATION, WARNING,
                        String.format("Vibration %.1f mm/s is in the unsatisfactory band (>= %.1f mm/s)", vib, t.warnVibrationMmS()), out);
            } else if (vib < t.warnVibrationMmS() - t.vibrationHysteresisMmS()) {
                closeIfOpen(id, AlertType.HIGH_VIBRATION, out);
            }
        }
        return out;
    }

    /** Called on a timer: raises communication loss for machines that went quiet. */
    public synchronized List<AlertDecision> checkStale(Instant now) {
        List<AlertDecision> out = new ArrayList<>();
        lastSeen.forEach((id, seen) -> {
            if (Duration.between(seen, now).getSeconds() >= t.staleAfterSeconds()) {
                openIfClosed(id, AlertType.COMMUNICATION_LOSS, CRITICAL,
                        "No data from machine for " + Duration.between(seen, now).getSeconds() + "s", out);
            }
        });
        return out;
    }

    public boolean isOpen(String machineId, AlertType type) {
        return openSet(machineId).contains(type);
    }

    private Set<AlertType> openSet(String id) {
        return open.computeIfAbsent(id, k -> EnumSet.noneOf(AlertType.class));
    }

    private void openIfClosed(String id, AlertType type, AlertDecision.Severity sev, String msg, List<AlertDecision> out) {
        if (openSet(id).add(type)) {
            out.add(AlertDecision.open(id, type, sev, msg, null));
        }
    }

    private void closeIfOpen(String id, AlertType type, List<AlertDecision> out) {
        if (openSet(id).remove(type)) {
            out.add(AlertDecision.close(id, type));
        }
    }
}
