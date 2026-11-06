# Inserter Manual (INS series)

Troubleshooting guide for the MachineIQ simulated envelope inserter. The inserter collates
sheets, folds them, and inserts them into envelopes at up to 180 pieces per minute.
This manual is written for the MachineIQ demo and describes fictional equipment.

## Safety before any physical work

Stop the machine from the HMI, then apply lockout/tagout on the main disconnect before
opening any guard or reaching into the transport. Verify zero energy by pressing Start
and confirming nothing moves. Pneumatic sections must be bled down at the dump valve.
Never clear a jam with the machine in jog mode with guards open.

## E-042 Product jam

Meaning: the jam sensor on the envelope transport stayed blocked longer than allowed,
or a piece arrived late at the insert station.

Common causes:
1. Envelopes with curled or stuck flaps (humidity, poor storage).
2. Collation thicker than the envelope allows (too many sheets for the envelope size).
3. Worn or glazed feed rollers that slip instead of pulling.
4. Jam sensor lens dirty or misaligned, giving a false jam.

Steps:
1. Lock out the machine and open the transport guard.
2. Remove the jammed envelope and any partial collation upstream of it.
3. Check the top envelopes in the hopper for curled flaps; fan and re-stack them.
4. Wipe the jam sensor lens with a lint-free cloth and confirm the indicator LED turns off
   when the path is clear.
5. Inspect feed rollers. Glazed rollers can be cleaned with roller cleaner; replace if cracked.
6. Close guards, remove lockout, reset the fault on the HMI and run at reduced speed for
   a few minutes before returning to full speed.

If jams repeat more than three times an hour, check the envelope spec against the job and
inspect transport belt tension.

## E-117 Drive motor over temperature

Meaning: the main drive motor temperature passed the controller trip point (85 °C).
MachineIQ raises a HIGH_TEMPERATURE warning at 75 °C so you can act before the trip.

Common causes:
1. Blocked or dirty motor cooling fan cover, paper dust build-up.
2. Mechanical drag: dry bearings, over-tight drive belt, or debris in the transport.
3. Running continuously above rated speed.
4. High ambient temperature near the machine.

Steps:
1. Let the motor cool; the fault cannot be reset until it drops about 15 °C below the trip point.
2. Lock out and clean the motor fan cover and cooling fins with a vacuum (not compressed air,
   which pushes dust into the windings).
3. Rotate the drive by hand: it should turn smoothly. Roughness points to bearings.
4. Check drive belt tension against the label on the guard.
5. Compare the motor current on the drive display with the nameplate rating once running.

## E-208 Excessive drive-train vibration

Meaning: vibration on the main drive exceeded the trip limit (11 mm/s RMS).
MachineIQ warns at 7.1 mm/s, the start of the "unsatisfactory" band for machines of this size.

Common causes: worn bearings, loose mounting bolts, a damaged or misaligned belt,
or an unbalanced roller.

Steps:
1. Lock out the machine.
2. Check motor and gearbox mounting bolts for tightness.
3. Inspect the drive belt for cracks, missing teeth and alignment between pulleys.
4. Spin rollers by hand and listen for grinding or feel for play in bearings.
5. Replace worn bearings in pairs and record the change in the maintenance log.
6. After repair, watch the vibration trend in MachineIQ for the next shift; it should settle
   below 4.5 mm/s.

## Temperature sensor fault

If MachineIQ shows SENSOR_FAILURE, the motor temperature probe is reporting bad quality.
Check the probe connector at the motor terminal box, look for a damaged cable where it
flexes, and measure probe resistance with the machine locked out. While the sensor is
failed, MachineIQ cannot warn about overheating, so monitor the motor by hand-held
thermometer until it is fixed.

## Preventive maintenance

Daily: clean the jam sensor lens, empty the dust tray, check air pressure is 6 bar.
Weekly: clean feed rollers, inspect belts, vacuum the motor fan cover.
Monthly: check belt tension, lubricate chain drives, review the MachineIQ fault history for
repeat faults.
