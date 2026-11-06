# Sorter Manual (SRT series)

Troubleshooting guide for the MachineIQ simulated mail sorter. The sorter reads each piece
and diverts it to one of 24 output bins at up to 600 pieces per minute.
This manual is written for the MachineIQ demo and describes fictional equipment.

## Safety before any physical work

Stop the sorter and wait for the transport belts to come to a full stop. Apply lockout/tagout
on the main disconnect. Diverter gates are spring loaded; keep fingers clear of gate pivots
even when locked out.

## E-042 Product jam

Meaning: a piece did not reach the next photo-eye in time, usually in the transport or at a
diverter gate.

Common causes:
1. Pieces too thick, too flimsy or with loose inserts (outside the sorter spec).
2. Two pieces fed overlapped (double feed) at the singulator.
3. A diverter gate sticking half open.
4. Worn transport belts or low belt tension.
5. Dust on photo-eyes causing false jams.

Steps:
1. Check the HMI jam map to see which zone stopped first.
2. Lock out the sorter and open that zone's cover.
3. Remove all pieces in the zone, including pieces caught under belts.
4. Cycle the diverter gate in that zone by hand; it should snap back fully.
5. Clean the photo-eyes in the zone with a lint-free cloth.
6. If jams repeat at the singulator, adjust the separator gap to the mail thickness.
7. Reset the fault and run a test batch of 50 pieces before production.

## E-117 Drive motor over temperature

Meaning: a transport drive motor passed its trip temperature.

Steps:
1. Allow cooling before reset.
2. Clean motor fan covers; sorters create a lot of paper dust.
3. Check for belts rubbing on guards and for seized idler pulleys, which add load.
4. Verify the sorter is not running above its rated speed setting.

## E-208 Excessive drive-train vibration

Meaning: vibration on a transport drive exceeded the trip limit.

Steps:
1. Lock out the sorter.
2. Inspect idler pulleys and bearings for play; replace noisy bearings.
3. Check belt tracking: a belt running against a flange vibrates and wears quickly.
4. Tighten motor and pulley mounting hardware.

## Preventive maintenance

Daily: clean photo-eyes, clear dust from the transport, test the emergency stops.
Weekly: inspect diverter gates and springs, check belt tracking.
Monthly: replace worn transport belts, review jam counts per zone in MachineIQ to find the
zone that needs attention.
