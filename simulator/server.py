"""MachineIQ simulator: serves simulated machines over OPC UA.

Address space (namespace "urn:machineiq:simulator"):

    Objects/
      Machines/
        INS-01/  Name, Kind, State, MotorTempC, SpeedPPM, PieceCount,
                 JamSensor, VibrationMmS, FaultCode
        SRT-02/  ...
        LBL-03/  ...

Every variable uses a stable string NodeId, e.g. ``ns=2;s=INS-01.MotorTempC``,
which is how a real PLC tag would be addressed.

A small HTTP control port (default 8090) lets the demo trigger problems on
purpose:  POST /inject/{machine_id}/{jam|overheat|vibration|dropout}
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import random
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from asyncua import Server, ua

from machine_model import DEFAULT_MACHINES, Machine

log = logging.getLogger("machineiq.simulator")

NAMESPACE_URI = "urn:machineiq:simulator"
ENDPOINT = os.environ.get("OPCUA_ENDPOINT", "opc.tcp://0.0.0.0:4840/machineiq/")
CONTROL_PORT = int(os.environ.get("CONTROL_PORT", "8090"))
TICK_SECONDS = float(os.environ.get("TICK_SECONDS", "1.0"))
SEED = os.environ.get("SEED")

TAGS = {
    "State": ua.VariantType.String,
    "MotorTempC": ua.VariantType.Double,
    "SpeedPPM": ua.VariantType.Double,
    "PieceCount": ua.VariantType.Int64,
    "JamSensor": ua.VariantType.Boolean,
    "VibrationMmS": ua.VariantType.Double,
    "FaultCode": ua.VariantType.String,
}


def tag_values(m: Machine) -> dict:
    s = m.s
    return {
        "State": s.state.value,
        "MotorTempC": round(s.motor_temp_c, 2),
        "SpeedPPM": round(s.speed_ppm, 1),
        "PieceCount": s.piece_count,
        "JamSensor": s.jam_sensor,
        "VibrationMmS": round(s.vibration_mm_s, 2),
        "FaultCode": s.fault_code,
    }


def data_value(tag: str, value, vtype: ua.VariantType, sensor_ok: bool) -> ua.DataValue:
    """Wraps a tag value; a failed temperature sensor reports Bad quality, like a real PLC would."""
    if tag == "MotorTempC" and not sensor_ok:
        return ua.DataValue(ua.Variant(value, vtype), StatusCode=ua.StatusCode(ua.StatusCodes.BadSensorFailure))
    return ua.DataValue(ua.Variant(value, vtype))


def make_control_handler(machines: dict[str, Machine], lock: threading.Lock):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code: int, body: dict):
            data = json.dumps(body).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):  # noqa: N802
            if self.path == "/health":
                self._send(200, {"status": "ok", "machines": list(machines)})
            else:
                self._send(404, {"error": "not found"})

        def do_POST(self):  # noqa: N802
            parts = self.path.strip("/").split("/")
            if len(parts) != 3 or parts[0] != "inject":
                return self._send(404, {"error": "use POST /inject/{machine_id}/{problem}"})
            _, machine_id, problem = parts
            machine = machines.get(machine_id)
            if machine is None:
                return self._send(404, {"error": f"unknown machine {machine_id}"})
            try:
                with lock:
                    machine.inject(problem)
            except ValueError as e:
                return self._send(400, {"error": str(e)})
            log.info("Injected %s on %s", problem, machine_id)
            self._send(200, {"machine": machine_id, "injected": problem})

        def log_message(self, *args):  # keep logs quiet
            pass

    return Handler


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    logging.getLogger("asyncua").setLevel(logging.WARNING)

    rng = random.Random(int(SEED)) if SEED else random.Random()
    machines = {c.machine_id: Machine(c, rng=random.Random(rng.random())) for c in DEFAULT_MACHINES}
    lock = threading.Lock()

    server = Server()
    await server.init()
    server.set_endpoint(ENDPOINT)
    server.set_server_name("MachineIQ Simulator")
    idx = await server.register_namespace(NAMESPACE_URI)

    root = await server.nodes.objects.add_folder(ua.NodeId("Machines", idx), ua.QualifiedName("Machines", idx))
    nodes: dict[str, dict[str, object]] = {}
    for mid, m in machines.items():
        obj = await root.add_object(ua.NodeId(mid, idx), ua.QualifiedName(mid, idx))
        await obj.add_property(ua.NodeId(f"{mid}.Name", idx), ua.QualifiedName("Name", idx), m.config.name)
        await obj.add_property(ua.NodeId(f"{mid}.Kind", idx), ua.QualifiedName("Kind", idx), m.config.kind)
        nodes[mid] = {}
        initial = tag_values(m)
        for tag, vtype in TAGS.items():
            var = await obj.add_variable(
                ua.NodeId(f"{mid}.{tag}", idx), ua.QualifiedName(tag, idx), ua.Variant(initial[tag], vtype)
            )
            nodes[mid][tag] = var

    httpd = ThreadingHTTPServer(("0.0.0.0", CONTROL_PORT), make_control_handler(machines, lock))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()

    log.info("OPC UA endpoint %s (namespace index %s)", ENDPOINT, idx)
    log.info("Control API on http://0.0.0.0:%s", CONTROL_PORT)

    async with server:
        while True:
            for mid, m in machines.items():
                with lock:
                    m.step(TICK_SECONDS)
                    values = tag_values(m)
                    sensor_ok = m.s.sensor_ok
                for tag, vtype in TAGS.items():
                    await nodes[mid][tag].write_value(data_value(tag, values[tag], vtype, sensor_ok))
            await asyncio.sleep(TICK_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
