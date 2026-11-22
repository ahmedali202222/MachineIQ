/**
 * Machine guide: what each machine on the mail floor is, and how to handle each jam.
 *
 * Machine specs come from the manufacturers' public pages (see SOURCES). The jam guide is a
 * general, plain-language troubleshooting reference written for this project from operator
 * experience on the floor. It is not copied from any manual: always follow your site's
 * procedures, lockout rules and the machine's own operator guide.
 */

export const SOURCES = [
  { label: 'BlueCrest: FlowMaster RS Flex / RS Smart specs', url: 'https://www.bluecrestinc.com/products/inserters/flowmaster-rs-flex/' },
  { label: 'BlueCrest: FlowMaster RS cut sheet', url: 'https://landing.bluecrestinc.com/hubfs/PDFs/Flowmaster_cut-sheet_us_web.pdf' },
  { label: 'KEYENCE: troubleshooting problems reading codes', url: 'https://www.keyence.com/ss/products/auto_id/codereader/code_verification/faq-read-error.jsp' },
]

export const MACHINE_INFO = {
  FlowMaster: {
    name: 'FlowMaster RS inserting system',
    maker: 'BlueCrest (formerly Pitney Bowes)',
    what: 'High-speed direct mail inserter. Feeders drop inserts onto the track, the collation travels to the front table, and it is pushed into the envelope, sealed and sent out.',
    specs: [
      ['Rated speed', 'Up to 14,000/hr on #10, 12,000/hr on 6×9, 9,000/hr on flats (cycle rates)'],
      ['Envelopes', '6.75"–13" wide, 3.75"–10" deep'],
      ['Feeder stations', '3, 6, 9, 12 or 15 (rotary and friction feeders)'],
      ['Materials', 'Cut sheets, pre-folded stock, buck slips, BREs, booklets'],
      ['Options', 'Cut-sheet input (feed, scan, accumulate, fold), bulk feeder, read & print, Speed Sort output'],
    ],
    sections: ['Feeders', 'Accumulator & folder (cut-sheet input)', 'Collation track', 'Front table (insertion)', 'Envelope feeder', 'Sealer', 'Output'],
    floorNote: 'Rated speed is the machine at full cycle. Real floor output (about 500–1,000 an hour here) is lower because of jams, loading, changeovers and job size.',
  },
  Inserter: {
    name: 'Pitney Bowes inserter',
    maker: 'Pitney Bowes',
    what: 'Takes the envelope printed by its inkjet, inserts the collated pages and seals it. Runs as one line with the inkjet: if either stops, both stop.',
    specs: [
      ['Model', 'Not set yet (add your model to show its specs)'],
      ['Line', 'Fed by an inkjet that prints the envelopes'],
      ['Camera', 'Keyence code reader checks the barcode on each piece'],
    ],
    sections: ['Sheet feeder', 'Accumulator & folder', 'Insert stations', 'Front table (insertion)', 'Envelope feeder', 'Camera / reader', 'Sealer', 'Output'],
  },
  Inkjet: {
    name: 'Inkjet envelope printer',
    maker: 'Inline with the inserter',
    what: 'Prints the address and barcode on each envelope before it goes into the inserter. A Keyence camera reads the barcode to make sure the right pages go in the right envelope.',
    specs: [
      ['Feeds', 'Its inserter (same line)'],
      ['Camera', 'Keyence code reader: auto-focus and auto-tuning, set up in AutoID Network Navigator'],
      ['Watch for', 'Ink level, clogged nozzles, smears on glossy or coated envelopes'],
    ],
    sections: ['Envelope feed', 'Print heads', 'Ink supply', 'Dryer / transport', 'Camera / reader'],
  },
}

/** The problems an operator can pick for each machine, in the order they show up. */
export const PROBLEMS = {
  FlowMaster: ['Front table jam', 'Accumulator jam', 'Doubles', 'Envelope jam', 'Failed to feed'],
  Inserter: ['Front table jam', 'Accumulator jam', 'Doubles', 'Envelope jam', 'Failed to feed', 'Camera read fail'],
  Inkjet: ['Camera read fail', 'Bad print / smear', 'Nozzle clog', 'Low ink'],
}

/**
 * For each jam: where on the machine it happens, why it usually happens, and what to check.
 * `why` and `check` are in the order an operator would usually work through them.
 */
export const JAM_GUIDE = {
  'Front table jam': {
    where: 'Front table: where the collation is pushed into the open envelope.',
    why: [
      'Front table guides not set for this envelope / page size after a changeover',
      'Envelope throat not opening fully, or flap not held back',
      'Collation too thick or too wide for the envelope',
      'Dirty or worn pusher fingers, belts or guides',
    ],
    check: [
      'Clear the piece and look at where it stopped (envelope edge or collation edge)',
      'Re-check the front table and side guide settings for this envelope size',
      'Run one test piece slowly and watch the envelope open',
      'If it keeps happening, check fingers / belts for wear and call maintenance',
    ],
    tip: 'Just changed jobs? Re-check the front table guides first.',
  },
  'Accumulator jam': {
    where: 'Accumulator: where sheets stack up before folding.',
    why: [
      'Sheets not squared, curled or stuck together with static',
      'Page count higher than the accumulator can hold',
      'Sheets skewing on the way in from the feeder',
    ],
    check: [
      'Clear the stack and square it up',
      'Fan and jog the paper before loading; look for curl',
      'Check the page count for this job against the setup',
      'Check the side guides on the sheet feeder',
    ],
  },
  Doubles: {
    where: 'Feeder: two pieces fed when the machine expected one.',
    why: [
      'Separator gap set wrong for this stock thickness',
      'Sheets or inserts stuck together (static, humidity, fresh coated stock)',
      'Worn or dirty feeder tires / separator',
      'Double-detect not calibrated for this material',
    ],
    check: [
      'Pull the double and check whether the next piece is the right one',
      'Fan and jog the stock; reload a smaller stack',
      'Re-set the separator gap with a single piece of this stock',
      'Clean the feeder tires; replace if glazed or worn',
    ],
  },
  'Envelope jam': {
    where: 'Envelope feeder or flap area.',
    why: [
      'Flaps curled or sticking together (humidity, storage)',
      'Hopper overloaded or envelopes loaded unevenly',
      'Envelope out of spec for the setup (size, flap depth)',
      'Weak suction / vacuum on the envelope feed',
    ],
    check: [
      'Flex and fan the envelopes; look at the flaps',
      'Load a smaller, even stack in the hopper',
      'Check the envelope size matches the job setup',
      'Check suction cups / vacuum for dirt or leaks',
    ],
  },
  'Failed to feed': {
    where: 'Feeder: the machine called for a piece and nothing came.',
    why: [
      'Feeder empty or stack too low / too high',
      'Feeder tires or suction cups worn or dirty',
      'Pieces stuck together or stuck to the hopper',
    ],
    check: [
      'Check the stack height and refill',
      'Clean the feeder tires / suction cups',
      'Fan the stock and check it moves freely',
    ],
  },
  'Camera read fail': {
    where: 'Keyence camera / code reader: the barcode was not read, so the machine stopped to protect mail integrity.',
    why: [
      'Glare: glossy or coated stock, or reader angled straight at the code',
      'Barcode printed light, smeared or partly off the envelope (inkjet)',
      'Code moved in the window after a setup change',
      'Reader settings not tuned for this job (code type, exposure)',
    ],
    check: [
      'Look at the failed piece: is the code printed clean and in the right spot?',
      'Wipe the camera lens / window',
      'In AutoID Network Navigator, check the live view and re-run tuning for this job',
      'If glare: tilt the reader slightly off straight-on',
    ],
    tip: 'If it keeps failing after a job change, re-run tuning for the new job.',
  },
  'Bad print / smear': {
    where: 'Inkjet print area.',
    why: ['Print head too high or too low for this envelope', 'Coated / glossy envelopes not drying', 'Dirty heads'],
    check: ['Check head height for this envelope', 'Check the dryer and spacing', 'Wipe / purge the heads'],
  },
  'Nozzle clog': {
    where: 'Inkjet print heads.',
    why: ['Dried ink after idle time', 'Paper dust on the heads'],
    check: ['Run a purge / head clean', 'Print a test pattern and check for missing lines', 'Keep the heads capped when stopped'],
  },
  'Low ink': {
    where: 'Inkjet ink supply.',
    why: ['Ink ran out mid-job'],
    check: ['Replace the cartridge / refill', 'Check ink level at the start of each job'],
  },
}

export const BREAKDOWN_GUIDE = {
  Mechanical: 'Gears, belts, pulleys, wheels, bearings or shafts. Stop the machine, follow lockout, and call maintenance. Note the noise or symptom before it stopped.',
  Electrical: 'Sensor, motor, wiring, power supply or control board. Call maintenance; do not reset repeatedly.',
  'Air / pneumatic': 'Air leak, low air pressure, valve, cylinder or vacuum pump. Check the air gauge, listen for leaks, call maintenance.',
}
