# General Reference

Plant-wide reference for MachineIQ alerts and fault codes.

## Fault code table

| Code  | Name                          | Machine stops? |
|-------|-------------------------------|----------------|
| E-000 | No fault                      | No             |
| E-042 | Product jam                   | Yes            |
| E-117 | Drive motor over temperature  | Yes            |
| E-208 | Excessive drive-train vibration | Yes          |

See the machine's own manual for the detailed procedure for each code.

## MachineIQ alert types

FAULT (critical): the controller reported a fault code and stopped. Clears automatically when
the controller is reset and running again.

HIGH_TEMPERATURE (warning): motor temperature at or above 75 °C. Act before the controller trips
at 85 °C with E-117. Clears when the temperature drops below 72 °C.

HIGH_VIBRATION (warning): vibration at or above 7.1 mm/s, the start of the unsatisfactory band.
Plan a bearing and belt inspection before the machine trips with E-208.

SENSOR_FAILURE (warning): the temperature sensor reports bad quality. Overheating cannot be
detected until the sensor is repaired.

COMMUNICATION_LOSS (critical): MachineIQ has not received data for 10 seconds. Check that the
machine controller is powered, the network cable is connected, and the OPC UA server or gateway
is running. Data gaps during this time are not counted as downtime.

## Communication loss troubleshooting

1. Check the machine HMI: if it is dark, the controller may be powered off.
2. Check the network switch port LED for the machine.
3. Ping the controller or gateway address from the MachineIQ server.
4. Restart the OPC UA gateway service if the controller is reachable but no data arrives.
5. Contact controls engineering if the controller itself is in fault.

## Lockout/tagout summary

1. Notify affected operators.
2. Stop the machine using normal controls.
3. Isolate all energy sources: electrical disconnect, air, hydraulics, stored spring energy.
4. Apply your personal lock and tag.
5. Verify zero energy by trying to start the machine.
6. When finished, remove tools, reinstall guards, notify operators, then remove your lock.

## Reading availability and downtime in MachineIQ

Availability is the share of time a machine was running in the selected window. Downtime counts
only the time the controller reported a fault. Use the faults-by-code chart to find repeat
problems: the same code many times on one machine usually points to a root cause worth fixing
rather than clearing repeatedly.
