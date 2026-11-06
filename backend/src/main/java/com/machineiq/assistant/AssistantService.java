package com.machineiq.assistant;

import com.machineiq.config.MachineIqProperties;
import com.machineiq.domain.Reading;
import com.machineiq.service.MachineService;
import com.machineiq.store.AlertRepository;
import com.machineiq.store.DocChunkRepository;
import com.machineiq.store.DocChunkRepository.Hit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Retrieval-augmented troubleshooting assistant.
 *
 * <ol>
 *   <li>Adds live context for the selected machine (status, fault code, open alerts).</li>
 *   <li>Searches the manuals with PostgreSQL full-text search.</li>
 *   <li>If an API key is configured, asks the LLM to answer using only that material;
 *       otherwise returns the best manual sections directly ("search mode").</li>
 * </ol>
 */
@Service
public class AssistantService {

    private static final Logger log = LoggerFactory.getLogger(AssistantService.class);

    public record Source(String source, String heading) {
    }

    public record Answer(String answer, String mode, List<Source> sources) {
    }

    static final String SYSTEM_PROMPT = """
            You are MachineIQ, a troubleshooting assistant for maintenance technicians on a production floor.
            Answer using ONLY the manual excerpts and live machine data provided. If they don't cover the
            question, say so and suggest who to contact. Give short, numbered steps a technician can follow,
            put safety steps (lockout/tagout, guards) first when physical work is involved, and cite the
            manual section you used in brackets like [Inserter manual > E-042 Product jam].
            Never invent part numbers, settings or procedures.""";

    private final DocChunkRepository docs;
    private final MachineService machines;
    private final AlertRepository alerts;
    private final LlmClient llm;
    private final int topK;

    public AssistantService(DocChunkRepository docs, MachineService machines, AlertRepository alerts,
                            LlmClient llm, MachineIqProperties props) {
        this.docs = docs;
        this.machines = machines;
        this.alerts = alerts;
        this.llm = llm;
        this.topK = props.assistant().topK();
    }

    public Answer ask(String question, String machineId) {
        String context = "";
        String searchText = question;
        if (machineId != null && !machineId.isBlank()) {
            var status = machines.status(machineId).orElse(null);
            if (status != null) {
                context = describe(status);
                searchText = question + " " + status.kind() + " " + status.name();
                Reading r = status.latest();
                if (r != null && r.isFaulted() && r.faultCode() != null) {
                    searchText += " " + r.faultCode();
                }
            }
        }

        List<Hit> hits = docs.search(searchText, topK);
        List<Source> sources = hits.stream().map(h -> new Source(h.source(), h.heading())).toList();

        if (!llm.enabled()) {
            return new Answer(searchOnlyAnswer(hits), "search", sources);
        }
        try {
            String prompt = buildPrompt(question, context, hits);
            return new Answer(llm.complete(SYSTEM_PROMPT, prompt), "ai", sources);
        } catch (Exception e) {
            log.warn("LLM call failed, falling back to search results: {}", e.toString());
            return new Answer("The AI service is unavailable right now, so here are the most relevant manual sections.\n\n"
                    + searchOnlyAnswer(hits), "search", sources);
        }
    }

    private String describe(MachineService.MachineStatus s) {
        StringBuilder sb = new StringBuilder();
        sb.append("Machine: ").append(s.name()).append(" (").append(s.id()).append(", ").append(s.kind()).append(")\n");
        sb.append("Status: ").append(s.status()).append('\n');
        Reading r = s.latest();
        if (r != null) {
            sb.append(String.format("Fault code: %s%s%n", r.faultCode(),
                    s.faultDescription() != null ? " (" + s.faultDescription() + ")" : ""));
            sb.append(String.format("Motor temperature: %s%n",
                    r.tempQualityGood() && r.motorTempC() != null ? String.format("%.1f °C", r.motorTempC()) : "sensor fault"));
            if (r.vibrationMmS() != null) {
                sb.append(String.format("Vibration: %.1f mm/s%n", r.vibrationMmS()));
            }
            if (r.speedPpm() != null) {
                sb.append(String.format("Speed: %.0f pieces/min%n", r.speedPpm()));
            }
        }
        List<String> open = new ArrayList<>();
        alerts.recent(10, s.id()).stream().filter(AlertRepository.Alert::isOpen)
                .forEach(a -> open.add("- " + a.type() + ": " + a.message()));
        if (!open.isEmpty()) {
            sb.append("Open alerts:\n").append(String.join("\n", open)).append('\n');
        }
        return sb.toString();
    }

    static String buildPrompt(String question, String context, List<Hit> hits) {
        StringBuilder sb = new StringBuilder();
        if (!context.isBlank()) {
            sb.append("<live_machine_data>\n").append(context).append("</live_machine_data>\n\n");
        }
        sb.append("<manual_excerpts>\n");
        if (hits.isEmpty()) {
            sb.append("(no matching manual sections)\n");
        }
        for (Hit h : hits) {
            sb.append("[").append(h.source()).append(" > ").append(h.heading()).append("]\n")
                    .append(h.content()).append("\n\n");
        }
        sb.append("</manual_excerpts>\n\nTechnician's question: ").append(question);
        return sb.toString();
    }

    static String searchOnlyAnswer(List<Hit> hits) {
        if (hits.isEmpty()) {
            return "I couldn't find anything in the manuals about that. Try naming the fault code (e.g. E-042) "
                    + "or the symptom (jam, overheating, vibration).";
        }
        StringBuilder sb = new StringBuilder("Most relevant manual sections:\n\n");
        for (Hit h : hits) {
            sb.append("**").append(h.source()).append(" > ").append(h.heading()).append("**\n")
                    .append(h.content()).append("\n\n");
        }
        return sb.toString().trim();
    }
}
