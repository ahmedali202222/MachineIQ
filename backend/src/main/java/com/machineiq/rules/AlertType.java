package com.machineiq.rules;

public enum AlertType {
    /** The controller reports a fault code and has stopped. */
    FAULT,
    /** Motor temperature is climbing toward the trip point. */
    HIGH_TEMPERATURE,
    /** Vibration is above the "unsatisfactory" band - usually bearing or belt wear. */
    HIGH_VIBRATION,
    /** The temperature sensor is reporting bad quality. */
    SENSOR_FAILURE,
    /** No data from the machine for too long. */
    COMMUNICATION_LOSS
}
