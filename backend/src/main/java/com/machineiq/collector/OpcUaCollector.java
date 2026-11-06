package com.machineiq.collector;

import com.machineiq.config.MachineIqProperties;
import com.machineiq.config.MachineIqProperties.MachineDef;
import com.machineiq.domain.Reading;
import com.machineiq.service.IngestService;
import jakarta.annotation.PreDestroy;
import org.eclipse.milo.opcua.sdk.client.OpcUaClient;
import org.eclipse.milo.opcua.stack.core.Identifiers;
import org.eclipse.milo.opcua.stack.core.security.SecurityPolicy;
import org.eclipse.milo.opcua.stack.core.types.builtin.DataValue;
import org.eclipse.milo.opcua.stack.core.types.builtin.LocalizedText;
import org.eclipse.milo.opcua.stack.core.types.builtin.NodeId;
import org.eclipse.milo.opcua.stack.core.types.builtin.unsigned.UShort;
import org.eclipse.milo.opcua.stack.core.types.enumerated.TimestampsToReturn;
import org.eclipse.milo.opcua.stack.core.util.EndpointUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import static org.eclipse.milo.opcua.stack.core.types.builtin.unsigned.Unsigned.uint;

/**
 * Reads every configured machine tag from the OPC UA server on a fixed interval.
 *
 * <p>This is read-only: MachineIQ never writes to the controller. If the
 * connection drops it reconnects with a back-off, and the rules engine raises
 * a communication-loss alert while no data arrives.
 */
@Component
public class OpcUaCollector {

    private static final Logger log = LoggerFactory.getLogger(OpcUaCollector.class);

    /** Field order used when building the node list for each machine. */
    static final List<String> FIELDS = List.of(
            "state", "motorTempC", "speedPpm", "pieceCount", "jamSensor", "vibrationMmS", "faultCode");

    private final MachineIqProperties props;
    private final IngestService ingest;

    private OpcUaClient client;
    private List<NodeId> nodeIds = List.of();
    private long nextConnectAttempt = 0;
    private long backoffMs = 1000;

    public OpcUaCollector(MachineIqProperties props, IngestService ingest) {
        this.props = props;
        this.ingest = ingest;
    }

    @Scheduled(fixedDelayString = "${machineiq.opcua.poll-interval-ms:1000}", initialDelay = 2000)
    public void poll() {
        try {
            if (client == null && !connect()) {
                return;
            }
            List<DataValue> values = client
                    .readValues(0.0, TimestampsToReturn.Both, nodeIds)
                    .get(5, TimeUnit.SECONDS);
            ingest.ingest(toReadings(values, Instant.now()));
        } catch (Exception e) {
            log.warn("OPC UA read failed ({}); will reconnect", e.toString());
            disconnect();
        }
    }

    private boolean connect() {
        long now = System.currentTimeMillis();
        if (now < nextConnectAttempt) {
            return false;
        }
        String endpoint = props.opcua().endpoint();
        String host = URI.create(endpoint).getHost();
        try {
            OpcUaClient c = OpcUaClient.create(
                    endpoint,
                    endpoints -> endpoints.stream()
                            .filter(e -> SecurityPolicy.None.getUri().equals(e.getSecurityPolicyUri()))
                            .findFirst()
                            // Servers often advertise an address like 0.0.0.0 or their own hostname;
                            // always connect to the host we were configured with.
                            .map(e -> EndpointUtil.updateUrl(e, host)),
                    cfg -> cfg
                            .setApplicationName(LocalizedText.english("MachineIQ Collector"))
                            .setApplicationUri("urn:machineiq:collector")
                            .setRequestTimeout(uint(5000))
                            .build());
            c.connect().get(10, TimeUnit.SECONDS);

            int ns = namespaceIndex(c, props.opcua().namespaceUri());
            this.nodeIds = buildNodeIds(ns);
            this.client = c;
            this.backoffMs = 1000;
            log.info("Connected to {} (namespace index {}), reading {} tags", endpoint, ns, nodeIds.size());
            return true;
        } catch (Exception e) {
            log.warn("Could not connect to {}: {} (retrying in {} ms)", endpoint, e.toString(), backoffMs);
            nextConnectAttempt = now + backoffMs;
            backoffMs = Math.min(backoffMs * 2, 30_000);
            return false;
        }
    }

    /** Looks up the namespace index by URI, so config doesn't depend on the server's numbering. */
    private static int namespaceIndex(OpcUaClient c, String uri) throws Exception {
        DataValue dv = c.readValue(0.0, TimestampsToReturn.Neither, Identifiers.Server_NamespaceArray)
                .get(5, TimeUnit.SECONDS);
        String[] namespaces = (String[]) dv.getValue().getValue();
        int idx = Arrays.asList(namespaces).indexOf(uri);
        if (idx < 0) {
            throw new IllegalStateException("Namespace " + uri + " not found on server");
        }
        return idx;
    }

    private List<NodeId> buildNodeIds(int ns) {
        Map<String, String> tags = props.opcua().tags();
        List<NodeId> ids = new ArrayList<>();
        for (MachineDef m : props.machines()) {
            for (String field : FIELDS) {
                ids.add(new NodeId(UShort.valueOf(ns), m.nodePrefix() + "." + tags.get(field)));
            }
        }
        return ids;
    }

    List<Reading> toReadings(List<DataValue> values, Instant now) {
        List<Reading> out = new ArrayList<>();
        int i = 0;
        for (MachineDef m : props.machines()) {
            DataValue state = values.get(i++);
            DataValue temp = values.get(i++);
            DataValue speed = values.get(i++);
            DataValue pieces = values.get(i++);
            DataValue jam = values.get(i++);
            DataValue vib = values.get(i++);
            DataValue fault = values.get(i++);
            out.add(new Reading(
                    m.id(),
                    now,
                    asString(state),
                    temp.getStatusCode() != null && temp.getStatusCode().isGood() ? asDouble(temp) : null,
                    temp.getStatusCode() != null && temp.getStatusCode().isGood(),
                    asDouble(speed),
                    asLong(pieces),
                    asBoolean(jam),
                    asDouble(vib),
                    asString(fault)));
        }
        return out;
    }

    private static Object raw(DataValue dv) {
        if (dv == null || dv.getValue() == null) {
            return null;
        }
        return dv.getValue().getValue();
    }

    private static String asString(DataValue dv) {
        Object v = raw(dv);
        return v == null ? null : v.toString();
    }

    private static Double asDouble(DataValue dv) {
        return raw(dv) instanceof Number n ? n.doubleValue() : null;
    }

    private static Long asLong(DataValue dv) {
        return raw(dv) instanceof Number n ? n.longValue() : null;
    }

    private static Boolean asBoolean(DataValue dv) {
        return raw(dv) instanceof Boolean b ? b : null;
    }

    @PreDestroy
    public void disconnect() {
        if (client != null) {
            try {
                client.disconnect().get(2, TimeUnit.SECONDS);
            } catch (Exception ignored) {
                // shutting down anyway
            }
            client = null;
        }
    }
}
