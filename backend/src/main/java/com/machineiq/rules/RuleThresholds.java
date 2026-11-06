package com.machineiq.rules;

/**
 * Limits used by the rules engine.
 *
 * @param warnTempC        open a high-temperature warning at or above this
 * @param tempHysteresisC  close it only once the motor is this much below the limit (avoids flapping)
 * @param warnVibrationMmS open a vibration warning at or above this (ISO 10816 "unsatisfactory" band starts ~7.1 mm/s)
 * @param vibrationHysteresisMmS hysteresis for the vibration warning
 * @param staleAfterSeconds raise communication loss when no reading arrives for this long
 */
public record RuleThresholds(
        double warnTempC,
        double tempHysteresisC,
        double warnVibrationMmS,
        double vibrationHysteresisMmS,
        long staleAfterSeconds
) {
    public static RuleThresholds defaults() {
        return new RuleThresholds(75.0, 3.0, 7.1, 0.5, 10);
    }
}
