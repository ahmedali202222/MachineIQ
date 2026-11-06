package com.machineiq.assistant;

import com.machineiq.store.DocChunkRepository.Hit;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class AssistantPromptTest {

    private final Hit jam = new Hit("Inserter Manual", "E-042 Product jam", "Open the guard and remove the envelope.", 0.4);

    @Test
    void promptContainsLiveDataExcerptsAndQuestion() {
        String p = AssistantService.buildPrompt("What do I check?", "Machine: Inserter 1\nStatus: FAULTED\n", List.of(jam));
        assertThat(p)
                .contains("<live_machine_data>", "Status: FAULTED")
                .contains("[Inserter Manual > E-042 Product jam]", "remove the envelope")
                .endsWith("Technician's question: What do I check?");
    }

    @Test
    void promptSaysWhenNothingMatched() {
        assertThat(AssistantService.buildPrompt("hi", "", List.of()))
                .doesNotContain("<live_machine_data>")
                .contains("(no matching manual sections)");
    }

    @Test
    void searchModeListsSectionsOrGivesHint() {
        assertThat(AssistantService.searchOnlyAnswer(List.of(jam))).contains("**Inserter Manual > E-042 Product jam**");
        assertThat(AssistantService.searchOnlyAnswer(List.of())).contains("fault code");
    }

    @Test
    void systemPromptKeepsTheModelGrounded() {
        assertThat(AssistantService.SYSTEM_PROMPT).contains("ONLY", "lockout/tagout", "Never invent");
    }
}
