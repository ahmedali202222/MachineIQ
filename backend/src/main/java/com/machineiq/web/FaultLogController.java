package com.machineiq.web;

import com.machineiq.store.LoggedFaultRepository;
import com.machineiq.store.LoggedFaultRepository.LoggedFault;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PastOrPresent;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Manual fault log: lets technicians record faults on machines that aren't connected. */
@RestController
@RequestMapping("/api/fault-log")
public class FaultLogController {

    private final LoggedFaultRepository repo;

    public FaultLogController(LoggedFaultRepository repo) {
        this.repo = repo;
    }

    public record LogFaultRequest(
            @NotBlank @Size(max = 100) String machineName,
            @NotBlank @Size(max = 100) String fault,
            @Size(max = 2000) String description,
            @NotNull @PastOrPresent Instant occurredAt,
            @Min(0) @Max(24 * 60) int minutesDown,
            @Size(max = 2000) String fix
    ) {
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public LoggedFault create(@Valid @RequestBody LogFaultRequest req) {
        return repo.create(req.machineName().trim(), req.fault().trim(), blankToNull(req.description()),
                req.occurredAt(), req.minutesDown(), blankToNull(req.fix()));
    }

    @GetMapping
    public List<LoggedFault> list(@RequestParam(defaultValue = "30") int days,
                                  @RequestParam(defaultValue = "100") int limit) {
        return repo.recent(clampDays(days), Math.max(1, Math.min(limit, 500)));
    }

    @GetMapping("/summary")
    public LoggedFaultRepository.Summary summary(@RequestParam(defaultValue = "30") int days) {
        return repo.summary(clampDays(days));
    }

    @GetMapping("/suggestions")
    public Map<String, List<String>> suggestions() {
        return Map.of("machines", repo.distinctNames("machine"), "faults", repo.distinctNames("fault"));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) {
        if (!repo.delete(id)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No logged fault " + id);
        }
    }

    private static int clampDays(int days) {
        return Math.max(1, Math.min(days, 365));
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
