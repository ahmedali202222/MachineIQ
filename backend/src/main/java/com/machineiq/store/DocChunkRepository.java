package com.machineiq.store;

import com.machineiq.assistant.ManualChunker.Chunk;
import com.machineiq.assistant.SearchText;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Repository
public class DocChunkRepository {

    public record Hit(String source, String heading, String content, double rank) {
    }

    private final JdbcTemplate jdbc;

    public DocChunkRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Replaces the whole index (manuals are small, so a full rebuild on startup is simplest). */
    @Transactional
    public void replaceAll(List<Chunk> chunks) {
        jdbc.update("DELETE FROM doc_chunk");
        jdbc.batchUpdate("""
                INSERT INTO doc_chunk (source, heading, content, search)
                VALUES (?, ?, ?, setweight(to_tsvector('english', ?), 'A') || setweight(to_tsvector('english', ?), 'B'))
                """, chunks, 100, (ps, c) -> {
            ps.setString(1, c.source());
            ps.setString(2, c.heading());
            ps.setString(3, c.content());
            ps.setString(4, SearchText.forIndex(c.source() + " " + c.heading()));
            ps.setString(5, SearchText.forIndex(c.content()));
        });
    }

    public List<Hit> search(String question, int limit) {
        String q = SearchText.toOrQuery(question);
        if (q.isEmpty()) {
            return List.of();
        }
        return jdbc.query("""
                SELECT source, heading, content, ts_rank(search, query) AS rank
                FROM doc_chunk, to_tsquery('english', ?) AS query
                WHERE search @@ query
                ORDER BY rank DESC
                LIMIT ?
                """, (rs, i) -> new Hit(rs.getString("source"), rs.getString("heading"),
                rs.getString("content"), rs.getDouble("rank")), q, limit);
    }
}
