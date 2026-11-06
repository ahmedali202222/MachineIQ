package com.machineiq.assistant;

import com.fasterxml.jackson.databind.JsonNode;
import com.machineiq.config.MachineIqProperties;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/** Minimal client for the Anthropic Messages API. */
@Component
public class LlmClient {

    private final MachineIqProperties.Assistant cfg;
    private final RestClient http;

    public LlmClient(MachineIqProperties props, RestClient.Builder builder) {
        this.cfg = props.assistant();
        SimpleClientHttpRequestFactory rf = new SimpleClientHttpRequestFactory();
        rf.setConnectTimeout(10_000);
        rf.setReadTimeout(60_000);
        this.http = builder.baseUrl(cfg.baseUrl()).requestFactory(rf).build();
    }

    public boolean enabled() {
        return cfg.aiEnabled();
    }

    public String complete(String system, String user) {
        Map<String, Object> body = Map.of(
                "model", cfg.model(),
                "max_tokens", 800,
                "system", system,
                "messages", List.of(Map.of("role", "user", "content", user)));
        JsonNode res = http.post()
                .uri("/v1/messages")
                .header("x-api-key", cfg.apiKey())
                .header("anthropic-version", "2023-06-01")
                .contentType(MediaType.APPLICATION_JSON)
                .body(body)
                .retrieve()
                .body(JsonNode.class);
        StringBuilder text = new StringBuilder();
        if (res != null) {
            for (JsonNode block : res.path("content")) {
                if ("text".equals(block.path("type").asText())) {
                    text.append(block.path("text").asText());
                }
            }
        }
        return text.toString().trim();
    }
}
