package com.machineiq.rules;

/** What the rules engine wants done: open a new alert or close an existing one. */
public record AlertDecision(
        String machineId,
        AlertType type,
        Action action,
        Severity severity,
        String message,
        String faultCode
) {
    public enum Action { OPEN, CLOSE }

    public enum Severity { CRITICAL, WARNING, INFO }

    static AlertDecision open(String machineId, AlertType type, Severity severity, String message, String faultCode) {
        return new AlertDecision(machineId, type, Action.OPEN, severity, message, faultCode);
    }

    static AlertDecision close(String machineId, AlertType type) {
        return new AlertDecision(machineId, type, Action.CLOSE, null, null, null);
    }
}
