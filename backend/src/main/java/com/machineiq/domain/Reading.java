package com.machineiq.domain;

import java.time.Instant;

/**
 * One snapshot of a machine's tags, as read from the controller.
 * Values are nullable because a tag can be missing or have bad quality.
 */
public record Reading(
        String machineId,
        Instant ts,
        String state,
        Double motorTempC,
        boolean tempQualityGood,
        Double speedPpm,
        Long pieceCount,
        Boolean jamSensor,
        Double vibrationMmS,
        String faultCode
) {
    public static final String NO_FAULT = "E-000";

    public boolean isFaulted() {
        return "FAULTED".equals(state) || (faultCode != null && !NO_FAULT.equals(faultCode));
    }
}
