package com.machineiq.assistant;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class ManualChunkerTest {

    @Test
    void splitsBySectionAndKeepsTitle() {
        String md = """
                # Inserter Manual

                Intro text.

                ## E-042 Product jam
                Open the guard and remove the jammed envelope.

                ## E-117 Over temperature
                Let the motor cool.
                """;
        List<ManualChunker.Chunk> chunks = new ManualChunker(2000).chunk("inserter.md", md);
        assertThat(chunks).extracting(ManualChunker.Chunk::heading)
                .containsExactly("Overview", "E-042 Product jam", "E-117 Over temperature");
        assertThat(chunks).allSatisfy(c -> assertThat(c.source()).isEqualTo("Inserter Manual"));
        assertThat(chunks.get(1).content()).contains("remove the jammed envelope");
    }

    @Test
    void longSectionsAreSplitOnParagraphs() {
        String para = "word ".repeat(60).trim();
        String md = "## Big\n" + para + "\n\n" + para + "\n\n" + para;
        List<ManualChunker.Chunk> chunks = new ManualChunker(400).chunk("x.md", md);
        assertThat(chunks).hasSize(3);
        assertThat(chunks.get(0).heading()).isEqualTo("Big (part 1)");
    }

    @Test
    void searchTextNormalizesFaultCodes() {
        assertThat(SearchText.forIndex("Fault E-042 means jam")).contains("E-042 e042");
        String q = SearchText.toOrQuery("Inserter threw E-042, what should I check?");
        assertThat(q).contains("e042").contains("inserter").doesNotContain("what");
        assertThat(SearchText.toOrQuery("what is it?")).isEmpty();
    }
}
