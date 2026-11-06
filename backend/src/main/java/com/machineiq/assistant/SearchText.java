package com.machineiq.assistant;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Text helpers for PostgreSQL full-text search.
 *
 * <p>Fault codes like "E-042" are split apart by Postgres' parser, so both the
 * indexed text and the query rewrite them to a single token ("e042") first.
 */
public final class SearchText {

    private static final Pattern FAULT_CODE = Pattern.compile("\\b([A-Za-z])-(\\d{3})\\b");
    private static final Pattern WORD = Pattern.compile("[a-z0-9]{2,}");
    private static final Set<String> STOP = Set.of(
            "the", "and", "for", "what", "why", "how", "should", "check", "is", "it", "my", "on", "of",
            "to", "in", "a", "an", "do", "does", "can", "with", "this", "that", "keeps", "machine", "threw");

    private SearchText() {
    }

    /** Text stored in the search index. */
    public static String forIndex(String text) {
        return normalizeCodes(text);
    }

    /**
     * Builds an OR query for {@code to_tsquery('english', ...)}, so a chunk
     * matching any meaningful word is a candidate and ranking sorts them.
     * Returns an empty string when nothing searchable is left.
     */
    public static String toOrQuery(String question) {
        String q = normalizeCodes(question).toLowerCase(Locale.ROOT);
        Set<String> terms = new LinkedHashSet<>();
        Matcher m = WORD.matcher(q);
        while (m.find()) {
            String w = m.group();
            if (!STOP.contains(w)) {
                terms.add(w);
            }
        }
        return String.join(" | ", terms);
    }

    static String normalizeCodes(String text) {
        Matcher m = FAULT_CODE.matcher(text);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String token = (m.group(1) + m.group(2)).toLowerCase(Locale.ROOT);
            m.appendReplacement(sb, Matcher.quoteReplacement(m.group() + " " + token));
        }
        m.appendTail(sb);
        return sb.toString();
    }
}
