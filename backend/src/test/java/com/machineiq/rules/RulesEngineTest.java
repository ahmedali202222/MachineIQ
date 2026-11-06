package com.machineiq.rules;

import com.machineiq.domain.Reading;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static com.machineiq.rules.AlertDecision.Action.CLOSE;
import static com.machineiq.rules.AlertDecision.Action.OPEN;
import static org.assertj.core.api.Assertions.assertThat;

class RulesEngineTest {

    private static final Instant T0 = Instant.parse("2026-01-01T08:00:00Z");
    private RulesEngine engine;

    @BeforeEach
    void setUp() {
        engine = new RulesEngine(RuleThresholds.defaults());
    }

    private static Reading reading(int second, String state, double temp, boolean tempOk, double vib, String fault) {
        return new Reading("INS-01", T0.plusSeconds(second), state, temp, tempOk, 180.0, 100L, false, vib, fault);
    }

    private static Reading normal(int second) {
        return reading(second, "RUNNING", 55, true, 2.0, "E-000");
    }

    @Test
    void normalOperationRaisesNothing() {
        for (int i = 0; i < 60; i++) {
            assertThat(engine.evaluate(normal(i))).isEmpty();
        }
    }

    @Test
    void faultOpensOnceAndClosesWhenCleared() {
        List<AlertDecision> first = engine.evaluate(reading(0, "FAULTED", 55, true, 2, "E-042"));
        assertThat(first).singleElement().satisfies(d -> {
            assertThat(d.type()).isEqualTo(AlertType.FAULT);
            assertThat(d.action()).isEqualTo(OPEN);
            assertThat(d.faultCode()).isEqualTo("E-042");
            assertThat(d.message()).contains("product jam");
        });
        // Still faulted: no duplicate alert
        assertThat(engine.evaluate(reading(1, "FAULTED", 55, true, 2, "E-042"))).isEmpty();
        // Cleared
        assertThat(engine.evaluate(normal(2)))
                .singleElement().extracting(AlertDecision::action).isEqualTo(CLOSE);
    }

    @Test
    void changedFaultCodeReplacesTheAlert() {
        engine.evaluate(reading(0, "FAULTED", 55, true, 2, "E-042"));
        List<AlertDecision> d = engine.evaluate(reading(1, "FAULTED", 90, true, 2, "E-117"));
        assertThat(d).extracting(AlertDecision::type, AlertDecision::action)
                .contains(org.assertj.core.groups.Tuple.tuple(AlertType.FAULT, CLOSE),
                        org.assertj.core.groups.Tuple.tuple(AlertType.FAULT, OPEN));
    }

    @Test
    void highTemperatureUsesHysteresis() {
        assertThat(engine.evaluate(reading(0, "RUNNING", 76, true, 2, "E-000")))
                .singleElement().extracting(AlertDecision::type).isEqualTo(AlertType.HIGH_TEMPERATURE);
        // Dips just under the limit: stays open (no flapping)
        assertThat(engine.evaluate(reading(1, "RUNNING", 74, true, 2, "E-000"))).isEmpty();
        // Well below the limit: closes
        assertThat(engine.evaluate(reading(2, "RUNNING", 70, true, 2, "E-000")))
                .singleElement().extracting(AlertDecision::action).isEqualTo(CLOSE);
    }

    @Test
    void badSensorRaisesSensorFailureAndIgnoresTemperature() {
        List<AlertDecision> d = engine.evaluate(reading(0, "RUNNING", 99, false, 2, "E-000"));
        assertThat(d).singleElement().extracting(AlertDecision::type).isEqualTo(AlertType.SENSOR_FAILURE);
        assertThat(engine.isOpen("INS-01", AlertType.HIGH_TEMPERATURE)).isFalse();
    }

    @Test
    void highVibrationOpensWarning() {
        assertThat(engine.evaluate(reading(0, "RUNNING", 55, true, 8.2, "E-000")))
                .singleElement().extracting(AlertDecision::type).isEqualTo(AlertType.HIGH_VIBRATION);
    }

    @Test
    void silentMachineRaisesCommunicationLossAndRecovers() {
        engine.evaluate(normal(0));
        assertThat(engine.checkStale(T0.plusSeconds(5))).isEmpty();
        assertThat(engine.checkStale(T0.plusSeconds(12)))
                .singleElement().extracting(AlertDecision::type).isEqualTo(AlertType.COMMUNICATION_LOSS);
        assertThat(engine.checkStale(T0.plusSeconds(20))).isEmpty(); // already open
        assertThat(engine.evaluate(normal(21)))
                .singleElement().extracting(AlertDecision::action).isEqualTo(CLOSE);
    }

    @Test
    void seededOpenAlertIsClosedAfterRestart() {
        engine.markOpen("INS-01", AlertType.FAULT, "E-042");
        assertThat(engine.evaluate(normal(0)))
                .singleElement().extracting(AlertDecision::action).isEqualTo(CLOSE);
    }
}
