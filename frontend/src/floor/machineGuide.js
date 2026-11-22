/**
 * Jam guide for a mail floor running FlowMaster inserters (two of them fed by an inkjet that
 * prints the envelopes, with a Keyence camera reading the barcode).
 *
 * The quick fixes and the "keeps coming back" causes come from the operators on the floor.
 * This is a reminder tool, not a manual: always follow your site's procedures and lockout rules.
 *
 *   quick:  what to do right now to get running again, in order
 *   repeat: when the same jam keeps coming back, the real causes to check (most common first)
 *   why:    one line on where the jam happens
 */

/** The machines on the floor. Rename the ids to match the numbers on your machines. */
export const MACHINES = [
  ...Array.from({ length: 9 }, (_, i) => ({ id: `FM-0${i + 1}`, type: 'FlowMaster' })),
  { id: 'INK-01', type: 'Inkjet', note: 'Line 1 inkjet' },
  { id: 'INS-01', type: 'Inserter', note: 'Line 1 FlowMaster' },
  { id: 'INK-02', type: 'Inkjet', note: 'Line 2 inkjet' },
  { id: 'INS-02', type: 'Inserter', note: 'Line 2 FlowMaster' },
]

/** The problems an operator can pick for each kind of machine. */
export const PROBLEMS = {
  FlowMaster: ['Front table jam', 'Accumulator jam', 'Doubles', 'Envelope jam', 'Failed to feed'],
  Inserter: ['Front table jam', 'Camera read fail', 'Accumulator jam', 'Doubles', 'Envelope jam', 'Failed to feed'],
  Inkjet: ['Camera read fail', 'Bad print / smear', 'Nozzle clog', 'Low ink'],
}

export const JAM_GUIDE = {
  'Front table jam': {
    where: 'Front table: where the collation is pushed into the envelope.',
    usual: 'Usually under 5 min',
    quick: [
      'Pull the jammed piece',
      'Check the envelope: flap, size, opening all the way',
      'Adjust the front table for this job',
      'Re-run the piece',
    ],
    repeat: [
      { cause: 'Front table not set right for this job', fix: 'Reset the front table and guides from scratch for this envelope and page size' },
      { cause: 'Bad envelopes', fix: 'Check flaps and size; try a fresh box of envelopes' },
      { cause: 'Collation too thick', fix: 'Count the pages and inserts; check they fit this envelope' },
      { cause: 'Worn fingers, belts or suction', fix: 'Call maintenance; note which machine and how often' },
    ],
  },
  'Accumulator jam': {
    where: 'Accumulator: where sheets stack up before folding.',
    quick: [
      'Pull the stuck sheets',
      'Square the pages',
      'Fan and jog the paper before reloading',
      'Adjust the guides',
    ],
    repeat: [
      { cause: 'Curled or static paper', fix: 'Fan the paper, flip the stack, or try another ream' },
      { cause: 'Too many pages for the setup', fix: 'Check the page count for this job' },
      { cause: 'Guides set wrong', fix: 'Reset the guides so sheets come in straight' },
      { cause: 'Worn or dirty rollers, belts or sensors', fix: 'Clean them; if it keeps jamming, call maintenance' },
    ],
  },
  Doubles: {
    where: 'Feeder: two pieces fed instead of one.',
    quick: [
      'Pull the double',
      'Fan and jog the stock',
      'Adjust the feeder gap for this stock',
      'Clean the feeder rubbers',
    ],
    repeat: [
      { cause: 'Feeder gap set wrong for this stock', fix: 'Re-set the gap using one piece of this stock' },
      { cause: 'Stock sticking together', fix: 'Glossy, static or fresh print: fan it well, load smaller stacks' },
      { cause: 'Worn feeder rubbers', fix: 'Replace glazed or worn tires / separators' },
      { cause: 'Hopper overloaded', fix: 'Load a smaller stack' },
    ],
  },
  'Envelope jam': {
    where: 'Envelope feeder and flap area.',
    quick: [
      'Clear the jammed envelope',
      'Flex and fan the envelopes; check the flaps',
      'Load a smaller, even stack',
      'Restart',
    ],
    repeat: [
      { cause: 'Flaps curled or sticking (most common)', fix: 'Flex and fan every stack; open a fresh box; keep boxes closed and away from humidity' },
      { cause: 'Hopper loaded badly', fix: 'Smaller, even stack' },
      { cause: 'Wrong envelope for the setup', fix: 'Check size and flap against the job' },
      { cause: 'Weak suction / vacuum', fix: 'Clean the cups; listen for air leaks; call maintenance' },
    ],
  },
  'Failed to feed': {
    where: 'Feeder: nothing came when the machine called for a piece.',
    quick: [
      'Check the feeder has stock',
      'Fan the stock so pieces move freely',
      'Clean the feeder rubbers / suction cups',
      'Restart',
    ],
    repeat: [
      { cause: 'Stock stuck together (most common)', fix: 'Fan and jog well before loading; break up blocks of stock' },
      { cause: 'Dirty or worn rubbers', fix: 'Clean; replace if worn' },
      { cause: 'Stack too high or too low', fix: 'Keep the stack at the right height' },
      { cause: 'Feeder running empty', fix: 'Load before it runs out' },
    ],
  },
  'Camera read fail': {
    where: 'Keyence camera: the barcode was not read, so the machine stopped.',
    quick: [
      'Look at the failed piece: is the code printed clean and in the right spot?',
      'Fix the print if it is light, smeared or off',
      'Wipe the camera lens',
      'Move / aim the camera at the code',
      'Re-tune in the Keyence software (AutoID Network Navigator)',
    ],
    repeat: [
      { cause: 'New job, old camera settings', fix: 'Re-tune the camera for this job in the Keyence software' },
      { cause: 'Inkjet print quality', fix: 'Check the inkjet: heads, ink, head height' },
      { cause: 'Glare from glossy envelopes', fix: 'Angle the camera slightly instead of straight on' },
      { cause: 'Code moved after a setup change', fix: 'Re-aim the camera at where the code prints now' },
    ],
  },
  'Bad print / smear': {
    where: 'Inkjet print area.',
    quick: ['Check head height for this envelope', 'Wipe / purge the heads', 'Check the envelopes are dry and clean'],
    repeat: [
      { cause: 'Glossy / coated envelopes not drying', fix: 'Slow down or add drying space' },
      { cause: 'Head height wrong for this envelope', fix: 'Reset head height at changeover' },
    ],
  },
  'Nozzle clog': {
    where: 'Inkjet print heads.',
    quick: ['Run a purge / head clean', 'Print a test and look for missing lines'],
    repeat: [{ cause: 'Ink drying while stopped', fix: 'Cap or purge the heads when the line is down' }],
  },
  'Low ink': {
    where: 'Inkjet ink supply.',
    quick: ['Replace the cartridge / refill', 'Restart'],
    repeat: [{ cause: 'Running out mid-job', fix: 'Check ink at the start of each job' }],
  },
}

export const BREAKDOWN_GUIDE = {
  Mechanical: 'Gears, belts, pulleys, wheels, bearings or shafts. Stop, follow lockout, call maintenance. Note the noise or symptom.',
  Electrical: 'Sensor, motor, wiring, power supply or control board. Call maintenance; don\'t keep resetting.',
  'Air / pneumatic': 'Air leak, low pressure, valve, cylinder or vacuum pump. Check the air gauge, listen for leaks, call maintenance.',
}

/** How many times the same jam on the same machine in a day counts as "keeps coming back". */
export const REPEAT_AT = 3
