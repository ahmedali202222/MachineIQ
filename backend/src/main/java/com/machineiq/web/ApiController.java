package com.machineiq.web;

import com.machineiq.assistant.AssistantService;
import com.machineiq.config.MachineIqProperties;
import com.machineiq.domain.Reading;
import com.machineiq.service.MachineService;
import com.machineiq.store.AlertRepository;
import com.machineiq.store.ReadingRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api")
public class ApiController {

    private static final Set<String> PROBLEMS = Set.of("jam", "overheat", "vibration", "dropout");

    private final MachineService machines;
    private final ReadingRepository readings;
    private final AlertRepository alerts;
    private final AssistantService assistant;
    private final MachineIqProperties props;
    private final RestClient restClient;

    public ApiController(MachineService machines, ReadingRepository readings, AlertRepository alerts,
                         AssistantService assistant, MachineIqProperties props, RestClient.Builder builder) {
        this.machines = machines;
        this.readings = readings;
        this.alerts = alerts;
        this.assistant = assistant;
        this.props = props;
        this.restClient = builder.build();
    }

    @GetMapping("/machines")
    public List<MachineService.MachineStatus> machines() {
        return machines.statuses();
    }

    @GetMapping("/machines/{id}")
    public MachineService.MachineStatus machine(@PathVariable String id) {
        return machines.status(id).orElseThrow(() -> notFound(id));
    }

    @GetMapping("/machines/{id}/readings")
    public List<Reading> history(@PathVariable String id,
                                 @RequestParam(defaultValue = "15") int minutes) {
        machines.find(id).orElseThrow(() -> notFound(id));
        int m = Math.max(1, Math.min(minutes, 24 * 60));
        return readings.history(id, m, 300);
    }

    @GetMapping("/alerts")
    public List<AlertRepository.Alert> alerts(@RequestParam(defaultValue = "false") boolean open,
                                              @RequestParam(required = false) String machineId,
                                              @RequestParam(defaultValue = "50") int limit) {
        if (open) {
            return alerts.openAlerts();
        }
        return alerts.recent(Math.max(1, Math.min(limit, 500)), machineId);
    }

    @PostMapping("/alerts/{id}/ack")
    public Map<String, Object> acknowledge(@PathVariable long id) {
        return Map.of("id", id, "acknowledged", alerts.acknowledge(id));
    }

    @GetMapping("/stats")
    public MachineService.PlantStats stats(@RequestParam(defaultValue = "24") int hours) {
        return machines.stats(Math.max(1, Math.min(hours, 24 * 7)));
    }

    public record AskRequest(@NotBlank @Size(max = 1000) String question, String machineId) {
    }

    @PostMapping("/assistant/ask")
    public AssistantService.Answer ask(@Valid @RequestBody AskRequest req) {
        return assistant.ask(req.question(), req.machineId());
    }

    /** Demo only: asks the simulator to cause a problem so viewers can watch MachineIQ react. */
    @PostMapping("/demo/inject/{machineId}/{problem}")
    public ResponseEntity<Map<String, String>> inject(@PathVariable String machineId, @PathVariable String problem) {
        if (!props.demo().enabled()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Demo controls are disabled");
        }
        machines.find(machineId).orElseThrow(() -> notFound(machineId));
        if (!PROBLEMS.contains(problem)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown problem " + problem);
        }
        restClient.post()
                .uri(props.demo().simulatorControlUrl() + "/inject/{m}/{p}", machineId, problem)
                .retrieve()
                .toBodilessEntity();
        return ResponseEntity.ok(Map.of("machineId", machineId, "injected", problem));
    }

    @GetMapping("/config")
    public Map<String, Object> config() {
        return Map.of("demoEnabled", props.demo().enabled(), "aiEnabled", props.assistant().aiEnabled());
    }

    private static ResponseStatusException notFound(String id) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown machine " + id);
    }
}
