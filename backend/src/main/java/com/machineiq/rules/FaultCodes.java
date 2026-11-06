package com.machineiq.rules;

import java.util.Map;

/** Human-readable names for controller fault codes (see the equipment manuals). */
public final class FaultCodes {
    private static final Map<String, String> NAMES = Map.of(
            "E-000", "no fault",
            "E-042", "product jam",
            "E-117", "drive motor over temperature",
            "E-208", "excessive drive-train vibration"
    );

    private FaultCodes() {
    }

    public static String describe(String code) {
        return code == null ? "unknown" : NAMES.getOrDefault(code, "unknown fault");
    }
}
