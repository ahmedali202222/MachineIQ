# Labeler Manual (LBL series)

Troubleshooting guide for the MachineIQ simulated label applicator. The labeler peels
pressure-sensitive labels from a liner and applies them to passing pieces at up to
240 pieces per minute. This manual is written for the MachineIQ demo and describes
fictional equipment.

## Safety before any physical work

Stop the line and apply lockout/tagout. The peel plate edge is sharp. The applicator head can
move on loss of air pressure; block it before working beneath it.

## E-042 Product jam

Meaning: a piece stopped under the applicator or a label wrapped around the drive roller.

Steps:
1. Lock out the labeler.
2. Remove the stopped piece and any labels stuck to the rollers or peel plate.
3. Check the liner path against the threading diagram on the side cover; a mis-threaded
   liner is the most common cause after a roll change.
4. Clean adhesive build-up from the peel plate with label adhesive remover.
5. Confirm the product sensor sees each piece (indicator LED blinks as pieces pass).

## E-117 Drive motor over temperature

Meaning: the label drive motor passed its trip temperature. Labelers are prone to this when
adhesive build-up adds drag to the liner path.

Steps:
1. Allow cooling before reset.
2. Lock out and clean adhesive from the drive roller, nip roller and peel plate.
3. Check that the liner rewind is not over-tightened; excessive rewind tension loads the motor.
4. Clean the motor fan cover.
5. Monitor temperature in MachineIQ after restart; it should settle around 50-60 °C.

## E-208 Excessive drive-train vibration

Steps:
1. Check the unwind arm brake; a grabbing brake causes jerky motion.
2. Inspect the drive roller bearing for play.
3. Tighten mounting bolts on the applicator bracket.

## Preventive maintenance

Daily: clean the peel plate and rollers, check label placement accuracy.
Weekly: inspect the liner path and rewind tension.
Monthly: replace the nip roller if its rubber is glazed or cracked.
