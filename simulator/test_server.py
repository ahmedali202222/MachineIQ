import random

from asyncua import ua

from machine_model import DEFAULT_MACHINES, Machine
from server import TAGS, data_value, tag_values


def test_every_tag_has_a_value_of_the_declared_type():
    m = Machine(DEFAULT_MACHINES[0], rng=random.Random(3))
    m.step(1.0)
    values = tag_values(m)
    assert set(values) == set(TAGS)
    for tag, vtype in TAGS.items():
        dv = data_value(tag, values[tag], vtype, sensor_ok=True)
        assert dv.StatusCode.is_good()
        assert dv.Value.VariantType == vtype


def test_failed_sensor_reports_bad_quality_only_for_temperature():
    bad = data_value("MotorTempC", 50.0, ua.VariantType.Double, sensor_ok=False)
    assert not bad.StatusCode.is_good()
    other = data_value("SpeedPPM", 120.0, ua.VariantType.Double, sensor_ok=False)
    assert other.StatusCode.is_good()
