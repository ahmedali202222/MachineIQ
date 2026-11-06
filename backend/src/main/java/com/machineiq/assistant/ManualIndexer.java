package com.machineiq.assistant;

import com.machineiq.config.MachineIqProperties;
import com.machineiq.store.DocChunkRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

/**
 * Loads the equipment manuals (Markdown) into the search index on startup.
 * Built-in manuals ship in {@code resources/manuals}; more can be added by
 * pointing {@code MANUALS_DIR} at a folder of .md or .txt files.
 */
@Component
public class ManualIndexer {

    private static final Logger log = LoggerFactory.getLogger(ManualIndexer.class);

    private final DocChunkRepository repo;
    private final MachineIqProperties props;
    private final ManualChunker chunker = new ManualChunker(1500);

    public ManualIndexer(DocChunkRepository repo, MachineIqProperties props) {
        this.repo = repo;
        this.props = props;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void index() throws IOException {
        List<ManualChunker.Chunk> chunks = new ArrayList<>();
        Resource[] builtIn = new PathMatchingResourcePatternResolver().getResources("classpath:manuals/*.md");
        for (Resource r : builtIn) {
            String text = new String(r.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            chunks.addAll(chunker.chunk(r.getFilename(), text));
        }
        String extra = props.assistant().extraManualsDir();
        if (extra != null && !extra.isBlank() && Files.isDirectory(Path.of(extra))) {
            try (Stream<Path> files = Files.list(Path.of(extra))) {
                for (Path p : files.filter(f -> f.toString().endsWith(".md") || f.toString().endsWith(".txt")).toList()) {
                    chunks.addAll(chunker.chunk(p.getFileName().toString(), Files.readString(p)));
                }
            }
        }
        repo.replaceAll(chunks);
        log.info("Indexed {} manual sections", chunks.size());
    }
}
