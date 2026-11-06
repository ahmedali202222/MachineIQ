package com.machineiq.assistant;

import java.util.ArrayList;
import java.util.List;

/**
 * Splits a Markdown manual into searchable chunks, one per section.
 *
 * <p>Each chunk keeps the document title and its section heading, so a
 * search hit can be shown with context ("Inserter manual > E-042 Product jam").
 * Very long sections are split on paragraph boundaries.
 */
public final class ManualChunker {

    public record Chunk(String source, String heading, String content) {
    }

    private final int maxChars;

    public ManualChunker(int maxChars) {
        this.maxChars = maxChars;
    }

    public List<Chunk> chunk(String source, String markdown) {
        List<Chunk> chunks = new ArrayList<>();
        String title = source;
        String heading = null;
        StringBuilder body = new StringBuilder();

        for (String line : markdown.split("\\R")) {
            if (line.startsWith("# ")) {
                title = line.substring(2).trim();
            } else if (line.startsWith("## ") || line.startsWith("### ")) {
                flush(chunks, title, heading, body);
                heading = line.replaceFirst("^#+\\s*", "").trim();
            } else {
                body.append(line).append('\n');
            }
        }
        flush(chunks, title, heading, body);
        return chunks;
    }

    private void flush(List<Chunk> out, String title, String heading, StringBuilder body) {
        String text = body.toString().trim();
        body.setLength(0);
        if (text.isEmpty()) {
            return;
        }
        String h = heading == null ? "Overview" : heading;
        if (text.length() <= maxChars) {
            out.add(new Chunk(title, h, text));
            return;
        }
        StringBuilder part = new StringBuilder();
        int n = 1;
        for (String para : text.split("\\n\\s*\\n")) {
            if (part.length() > 0 && part.length() + para.length() > maxChars) {
                out.add(new Chunk(title, h + " (part " + n++ + ")", part.toString().trim()));
                part.setLength(0);
            }
            part.append(para).append("\n\n");
        }
        if (part.length() > 0) {
            out.add(new Chunk(title, n == 1 ? h : h + " (part " + n + ")", part.toString().trim()));
        }
    }
}
