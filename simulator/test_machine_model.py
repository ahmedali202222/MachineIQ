import random

import pytest

from machine_model import (
    FAULT_JAM,
    FAULT_NONE,
    FAULT_OVERTEMP,
    FAULT_VIBRATION,
    Machine,
    MachineConfig,
    State,
)


def quiet_machine(**overrides) -> Machine:
    """A machine with random problems switched off, so tests are deterministic."""
    cfg = MachineConfig(
        "T-01", "Test", "Test machine", rated_speed_ppm=120,
        jam_rate_per_hour=0, overheat_rate_per_hour=0,
        vibration_rate_per_hour=0, dropout_rate_per_hour=0, **overrides,
    )
    return Machine(cfg, rng=random.Random(1))


def run(m: Machine, seconds: int) -> None:
    for _ in range(seconds):
        m.step(1.0)


def test_ramps_up_to_rated_speed_and_counts_pieces():
    m = quiet_machine()
    run(m, 60)
    assert m.s.state == State.RUNNING
    assert 110 <= m.s.speed_ppm <= 135
    assert m.s.piece_count > 60  # most of a minute at ~120 ppm


def test_temperature_stays_in_normal_band_without_problems():
    m = quiet_machine()
    run(m, 900)
    assert 40 < m.s.motor_temp_c < 65
    assert m.s.fault_code == FAULT_NONE


def test_overheating_eventually_trips_overtemp_fault():
    m = quiet_machine()
    m.inject("overheat")
    for _ in range(3000):
        m.step(1.0)
        if m.s.state == State.FAULTED:
            break
    assert m.s.fault_code == FAULT_OVERTEMP
    assert m.s.motor_temp_c >= m.config.max_temp_c - 1


def test_jam_faults_immediately_and_stops_the_machine():
    m = quiet_machine()
    run(m, 30)
    m.inject("jam")
    assert m.s.state == State.FAULTED and m.s.fault_code == FAULT_JAM and m.s.jam_sensor
    count = m.s.piece_count
    run(m, 10)
    assert m.s.piece_count == count  # no pieces while faulted
    assert m.s.speed_ppm == 0


def test_fault_clears_after_technician_time():
    m = quiet_machine(fault_clear_seconds=30)
    run(m, 30)
    m.inject("jam")
    run(m, 31)
    assert m.s.state == State.RUNNING
    assert m.s.fault_code == FAULT_NONE
    assert not m.s.jam_sensor


def test_bearing_wear_raises_vibration_fault():
    m = quiet_machine()
    run(m, 30)
    m.inject("vibration")
    for _ in range(600):
        m.step(1.0)
        if m.s.state == State.FAULTED:
            break
    assert m.s.fault_code == FAULT_VIBRATION


def test_sensor_dropout_recovers():
    m = quiet_machine()
    m.inject("dropout")
    assert not m.s.sensor_ok
    run(m, 25)
    assert m.s.sensor_ok


def test_unknown_problem_rejected():
    with pytest.raises(ValueError):
        quiet_machine().inject("explode")
