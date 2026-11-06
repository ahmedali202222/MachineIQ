package com.machineiq;

import com.machineiq.domain.Reading;
import com.machineiq.service.IngestService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.List;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Full Spring context against a real PostgreSQL database (provided by CI or docker compose).
 * Skipped when DB_URL is not set.
 */
@SpringBootTest(properties = {
        "machineiq.opcua.endpoint=opc.tcp://localhost:1/none",  // no simulator in this test
        "machineiq.assistant.api-key="                          // search mode, no network calls
})
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "DB_URL", matches = ".+")
class ApiIntegrationTest {

    @Autowired
    MockMvc mvc;

    @Autowired
    IngestService ingest;

    @Test
    void listsConfiguredMachines() throws Exception {
        mvc.perform(get("/api/machines"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[*].id", hasItem("INS-01")))
                .andExpect(jsonPath("$[*].id", hasItem("SRT-02")));
    }

    @Test
    void faultReadingOpensAlertAndCountsDowntime() throws Exception {
        Instant now = Instant.now();
        ingest.ingest(List.of(new Reading("LBL-03", now, "FAULTED", 60.0, true, 0.0, 500L, true, 2.0, "E-042")));

        mvc.perform(get("/api/alerts").param("open", "true"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[?(@.machineId == 'LBL-03')].faultCode", hasItem("E-042")));

        mvc.perform(get("/api/machines/LBL-03"))
                .andExpect(jsonPath("$.status").value("FAULTED"))
                .andExpect(jsonPath("$.faultDescription").value("product jam"));

        mvc.perform(get("/api/stats").param("hours", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.faultsByCode['E-042']").exists());

        // Clears when the machine runs again
        ingest.ingest(List.of(new Reading("LBL-03", now.plusSeconds(1), "RUNNING", 60.0, true, 200.0, 501L, false, 2.0, "E-000")));
        mvc.perform(get("/api/machines/LBL-03")).andExpect(jsonPath("$.status").value("RUNNING"));
    }

    @Test
    void assistantFindsTheRightManualSectionInSearchMode() throws Exception {
        mvc.perform(post("/api/assistant/ask")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"question\":\"Inserter threw E-042, what should I check?\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mode").value("search"))
                .andExpect(jsonPath("$.sources[0].heading").value("E-042 Product jam"))
                .andExpect(jsonPath("$.answer", containsString("jam")));
    }

    @Test
    void rejectsEmptyQuestionAndUnknownMachine() throws Exception {
        mvc.perform(post("/api/assistant/ask").contentType(MediaType.APPLICATION_JSON).content("{\"question\":\"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/machines/NOPE")).andExpect(status().isNotFound());
    }
}
