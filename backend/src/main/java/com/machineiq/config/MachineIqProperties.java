package com.machineiq.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.util.List;
import java.util.Map;

/**
 * Everything configurable about MachineIQ, bound from {@code machineiq.*} in application.yml.
 */
@ConfigurationProperties(prefix = "machineiq")
public record MachineIqProperties(
        Opcua opcua,
        List<MachineDef> machines,
        Rules rules,
        Assistant assistant,
        Demo demo,
        @DefaultValue("3") int retentionDays
) {

    /**
     * @param endpoint       OPC UA server address, e.g. opc.tcp://simulator:4840/machineiq/
     * @param namespaceUri   namespace the machine tags live in; its index is looked up at connect time
     * @param pollIntervalMs how often to read all tags
     * @param tags           maps MachineIQ fields to tag names on the controller (the "tag mapping")
     */
    public record Opcua(
            String endpoint,
            String namespaceUri,
            @DefaultValue("1000") long pollIntervalMs,
            Map<String, String> tags
    ) {
    }

    /** @param nodePrefix prefix of this machine's tags, so the node id is {@code nodePrefix + "." + tag} */
    public record MachineDef(String id, String name, String kind, String nodePrefix) {
    }

    public record Rules(
            @DefaultValue("75") double warnTempC,
            @DefaultValue("3") double tempHysteresisC,
            @DefaultValue("7.1") double warnVibrationMmS,
            @DefaultValue("0.5") double vibrationHysteresisMmS,
            @DefaultValue("10") long staleAfterSeconds
    ) {
    }

    public record Assistant(
            String apiKey,
            @DefaultValue("claude-haiku-5-5") String model,
            @DefaultValue("https://api.anthropic.com") String baseUrl,
            @DefaultValue("4") int topK,
            String extraManualsDir
    ) {
        public boolean aiEnabled() {
            return apiKey != null && !apiKey.isBlank();
        }
    }

    /** @param simulatorControlUrl base URL of the simulator's control API (demo only) */
    public record Demo(@DefaultValue("true") boolean enabled, String simulatorControlUrl) {
    }
}
