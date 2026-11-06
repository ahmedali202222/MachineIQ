"""Physics-ish model of a production machine.

Pure Python with no OPC UA dependency, so it can be unit tested on its own.
Each call to ``step`` advances the machine by ``dt`` seconds and may trigger
realistic problems: slow overheating, product jams and sensor dropouts.
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum


class State(str, Enum):
    RUNNING = "RUNNING"
    IDLE = "IDLE"
    FAULTED = "FAULTED"


# Fault codes the simulated controller can raise. They match docs/manuals.
FAULT_NONE = "E-000"
FAULT_JAM = "E-042"          # product jam at infeed / transport
FAULT_OVERTEMP = "E-117"     # main drive motor over temperature
FAULT_VIBRATION = "E-208"    # excessive vibration on drive train


@dataclass
class MachineConfig:
    machine_id: str
    name: str
    kind: str
    rated_speed_ppm: float          # pieces per minute at full speed
    ambient_temp_c: float = 24.0
    max_temp_c: float = 85.0        # controller trips above this
    jam_rate_per_hour: float = 2.0
    overheat_rate_per_hour: float = 0.6
    vibration_rate_per_hour: float = 0.4
    dropout_rate_per_hour: float = 0.5
    fault_clear_seconds: float = 45.0  # simulated "technician clears the fault"


@dataclass
class MachineState:
    state: State = State.RUNNING
    motor_temp_c: float = 40.0
    speed_ppm: float = 0.0
    piece_count: int = 0
    jam_sensor: bool = False
    vibration_mm_s: float = 1.5
    fault_code: str = FAULT_NONE
    sensor_ok: bool = True
    # internal
    _piece_fraction: float = 0.0
    _fault_timer: float = 0.0
    _overheating: bool = False
    _bearing_wear: bool = False
    _dropout_timer: float = 0.0


@dataclass
class Machine:
    config: MachineConfig
    rng: random.Random = field(default_factory=random.Random)
    s: MachineState = field(default_factory=MachineState)

    def _chance(self, rate_per_hour: float, dt: float) -> bool:
        return self.rng.random() < rate_per_hour * dt / 3600.0

    def step(self, dt: float = 1.0) -> MachineState:
        c, s = self.config, self.s

        if s.state == State.FAULTED:
            s._fault_timer += dt
            s.speed_ppm = max(0.0, s.speed_ppm - c.rated_speed_ppm * 0.5 * dt)
            s.motor_temp_c += (c.ambient_temp_c + 10 - s.motor_temp_c) * 0.02 * dt
            s.vibration_mm_s = max(0.3, s.vibration_mm_s * (1 - 0.2 * dt))
            if s._fault_timer >= c.fault_clear_seconds and s.motor_temp_c < c.max_temp_c - 15:
                self._clear_fault()
        else:
            # ramp toward rated speed with a little jitter
            target = c.rated_speed_ppm * (0.95 + 0.1 * self.rng.random())
            s.speed_ppm += (target - s.speed_ppm) * min(1.0, 0.3 * dt)

            # thermal model: settles around 55C under load, drifts up if overheating
            load = s.speed_ppm / c.rated_speed_ppm
            settle = c.ambient_temp_c + 30 * load
            if s._overheating:
                settle = c.max_temp_c + 15
            s.motor_temp_c += (settle - s.motor_temp_c) * 0.01 * dt + self.rng.gauss(0, 0.15)

            base_vib = 1.5 + 1.0 * load
            if s._bearing_wear:
                base_vib = 12.5  # worn bearing: vibration climbs past the trip point
            s.vibration_mm_s += (base_vib - s.vibration_mm_s) * 0.05 * dt + self.rng.gauss(0, 0.05)
            s.vibration_mm_s = max(0.1, s.vibration_mm_s)

            s._piece_fraction += s.speed_ppm * dt / 60.0
            whole = int(s._piece_fraction)
            s.piece_count += whole
            s._piece_fraction -= whole

            # random problem injection
            if not s._overheating and self._chance(c.overheat_rate_per_hour, dt):
                s._overheating = True
            if not s._bearing_wear and self._chance(c.vibration_rate_per_hour, dt):
                s._bearing_wear = True

            if self._chance(c.jam_rate_per_hour, dt):
                self._fault(FAULT_JAM)
                s.jam_sensor = True
            elif s.motor_temp_c >= c.max_temp_c:
                self._fault(FAULT_OVERTEMP)
            elif s.vibration_mm_s >= 11.0:
                self._fault(FAULT_VIBRATION)

        # sensor dropouts: the temperature sensor stops reporting for a while
        if s.sensor_ok and self._chance(c.dropout_rate_per_hour, dt):
            s.sensor_ok = False
            s._dropout_timer = 0.0
        if not s.sensor_ok:
            s._dropout_timer += dt
            if s._dropout_timer > 20:
                s.sensor_ok = True

        return s

    def _fault(self, code: str) -> None:
        self.s.state = State.FAULTED
        self.s.fault_code = code
        self.s._fault_timer = 0.0

    def _clear_fault(self) -> None:
        s = self.s
        # the technician fixes the root cause
        if s.fault_code == FAULT_OVERTEMP:
            s._overheating = False
        if s.fault_code == FAULT_VIBRATION:
            s._bearing_wear = False
        s.state = State.RUNNING
        s.fault_code = FAULT_NONE
        s.jam_sensor = False

    def inject(self, problem: str) -> None:
        """Force a problem immediately (used by the demo control endpoint and tests)."""
        if problem == "jam":
            self._fault(FAULT_JAM)
            self.s.jam_sensor = True
        elif problem == "overheat":
            self.s._overheating = True
        elif problem == "vibration":
            self.s._bearing_wear = True
        elif problem == "dropout":
            self.s.sensor_ok = False
            self.s._dropout_timer = 0.0
        else:
            raise ValueError(f"unknown problem: {problem}")


DEFAULT_MACHINES = [
    MachineConfig("INS-01", "Inserter 1", "Envelope inserter", rated_speed_ppm=180),
    MachineConfig("SRT-02", "Sorter 2", "Mail sorter", rated_speed_ppm=600, jam_rate_per_hour=3.0),
    MachineConfig("LBL-03", "Labeler 3", "Label applicator", rated_speed_ppm=240, overheat_rate_per_hour=1.0),
]
