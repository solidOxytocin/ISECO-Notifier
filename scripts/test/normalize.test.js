import assert from 'assert';
import { normalizeOutage } from '../normalize-outage.js';
import { getAffectedLocations } from '../normalize-outage.js';

const geminiOutput = {
  outage_date: '2026-06-15',
  start_time: '05:30',
  end_time: '13:30',
  district: '1st',
  areas: ['Puro, Caoayan', 'Nagpanaoan, Santa'],
  areas_raw: [
    'Whole 1st District of Ilocos Sur EXCEPT Puro, Caoayan',
    'Nagpanaoan, Santa',
  ],
  exclusions: ['Puro, Caoayan'],
  purpose: 'NGCP Scheduled Power Interruption',
  confidence: 'high',
};

const fixed = normalizeOutage(geminiOutput);

assert.strictEqual(fixed.district, '1st');
assert.ok(
  !fixed.areas.some((a) => a.toLowerCase().includes('puro')),
  'Puro, Caoayan must not be in areas'
);
assert.ok(
  fixed.exclusions.some((e) => e.toLowerCase().includes('puro')),
  'Puro, Caoayan must stay in exclusions'
);
assert.ok(
  fixed.areas.some((a) => a.includes('Nagpanaoan')),
  'Nagpanaoan, Santa must stay in areas'
);

const affected = getAffectedLocations(fixed);
assert.ok(affected.includes('Vigan City'), '1st district includes Vigan');
assert.ok(!affected.includes('Caoayan'), 'Caoayan excluded from 1st district');
assert.ok(affected.some((a) => a.includes('Nagpanaoan')), 'Nagpanaoan included');

console.log('normalize tests passed');
