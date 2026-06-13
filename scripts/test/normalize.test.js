import assert from 'assert';
import { normalizeOutage, normalizeOutages } from '../normalize-outage.js';
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

// Sto. Domingo inline except test
const stoDomingo = normalizeOutage({
  outage_date: '2026-06-16',
  start_time: '08:30',
  end_time: '17:00',
  district: null,
  areas: ['SIVED to CALAY-AB, Sto. Domingo'],
  areas_raw: ['SIVED to CALAY-AB (except Puerto), Sto. Domingo'],
  exclusions: ['Puerto'],
  purpose: 'Clearing and maintenance of lines',
  confidence: 'high',
});

assert.strictEqual(stoDomingo.exclusions.length, 1);
assert.strictEqual(stoDomingo.exclusions[0], 'Puerto, Sto. Domingo');
assert.ok(stoDomingo.areas[0].includes('SIVED to CALAY-AB'));
assert.ok(!stoDomingo.areas[0].toLowerCase().includes('except'));

assert.ok(!stoDomingo.exclusions.some((e) => e.includes(')')), 'no stray parentheses');

// Simulate Gemini returning both bad exclusion from regex + good one
const geminiDupes = normalizeOutage({
  outage_date: '2026-06-16',
  start_time: '08:30',
  end_time: '17:00',
  district: null,
  areas: ['SIVED to CALAY-AB, Sto. Domingo'],
  areas_raw: ['SIVED to CALAY-AB (except Puerto), Sto. Domingo'],
  exclusions: ['Puerto', 'Puerto), Sto. Domingo'],
  purpose: 'Clearing',
  confidence: 'high',
});
assert.strictEqual(geminiDupes.exclusions.length, 1);
assert.strictEqual(geminiDupes.exclusions[0], 'Puerto, Sto. Domingo');

// Vigan barangay header test
const viganOutages = normalizeOutages({
  outages: [
    {
      outage_date: '2026-06-17',
      start_time: '08:30',
      end_time: '12:00',
      district: null,
      areas: ['Barangays of VIGAN CITY', 'Baluarte'],
      areas_raw: ['Barangays of VIGAN CITY', 'Baluarte'],
      exclusions: [],
      purpose: 'Clearing and maintenance of lines',
      confidence: 'high',
    },
    {
      outage_date: '2026-06-17',
      start_time: '08:30',
      end_time: '17:00',
      district: null,
      areas: ['Salindeg', 'Pong-ol', 'Barraca', 'Eastern part of San Pedro'],
      areas_raw: ['Salindeg', 'Pong-ol', 'Barraca', 'Eastern part of San Pedro'],
      exclusions: [],
      purpose: 'Clearing and maintenance of lines',
      confidence: 'high',
    },
  ],
});

assert.ok(
  !viganOutages.outages[0].areas.some((a) => /barangays?\s+of/i.test(a)),
  'header must not be in areas'
);
assert.strictEqual(viganOutages.outages[0].areas[0], 'Baluarte, Vigan City');
assert.strictEqual(viganOutages.outages[1].areas[0], 'Salindeg, Vigan City');
assert.ok(
  viganOutages.outages[1].areas.every((a) => a.includes('Vigan City')),
  'shared municipality applied to second slot'
);

// Whole municipality test
const wholeVigan = normalizeOutage({
  outage_date: '2026-06-18',
  start_time: '08:00',
  end_time: '17:00',
  district: null,
  areas: ['Whole Area of Vigan'],
  areas_raw: ['Whole Area of Vigan'],
  exclusions: [],
  purpose: 'Line maintenance',
  confidence: 'high',
});

assert.strictEqual(wholeVigan.district, null);
assert.deepStrictEqual(wholeVigan.areas, ['Vigan City']);
assert.ok(
  getAffectedLocations(wholeVigan).includes('Vigan City'),
  'whole municipality expands to Vigan City'
);

const wholeViganExcept = normalizeOutage({
  outage_date: '2026-06-18',
  start_time: '08:00',
  end_time: '17:00',
  district: null,
  areas: ['Whole Area of Vigan EXCEPT Baluarte'],
  areas_raw: ['Whole Area of Vigan EXCEPT Baluarte'],
  exclusions: ['Baluarte'],
  purpose: 'Line maintenance',
  confidence: 'high',
});

assert.deepStrictEqual(wholeViganExcept.areas, ['Vigan City']);
assert.strictEqual(wholeViganExcept.exclusions[0], 'Baluarte, Vigan City');

const stoDomingoWhole = normalizeOutage({
  outage_date: '2026-06-19',
  start_time: '08:00',
  end_time: '17:00',
  district: null,
  areas: ['Whole Area of STO. DOMINGO'],
  areas_raw: ['Whole Area of STO. DOMINGO'],
  exclusions: [],
  purpose: 'Line maintenance',
  confidence: 'high',
});

assert.deepStrictEqual(stoDomingoWhole.areas, ['Santo Domingo']);

// Candon poster: full list + some parts
const candonPoster = normalizeOutage({
  outage_date: '2026-06-18',
  start_time: '08:00',
  end_time: '17:00',
  district: null,
  areas: [],
  partial_areas: [],
  areas_raw: [
    'Patpata 1st & 2nd, Ayudante, Parioc 1st & 2nd, Calaoaan, Oaig-daya, Paras, San Nicolas, Paypayad, San Pedro, Calongbuyan, San Isidro, Darapidap, Talogtog, Caterman, Tamurong 1st & 2nd',
    'Some parts of: San Jose, San Juan, San Antonio, San Agustin (way to Darapidap), Candon City.',
  ],
  exclusions: [],
  purpose: 'Relocation of Pole',
  confidence: 'high',
});

assert.ok(
  candonPoster.areas.some((a) => a.startsWith('Darapidap,')),
  'Darapidap in full areas'
);
assert.ok(
  candonPoster.areas.some((a) => a.startsWith('Patpata 1st,')),
  'Patpata 1st expanded'
);
assert.ok(
  candonPoster.areas.some((a) => a.startsWith('Patpata 2nd,')),
  'Patpata 2nd expanded'
);
assert.strictEqual(
  candonPoster.partial_areas.length,
  4,
  'four partial barangays'
);
assert.ok(
  candonPoster.partial_areas.some((a) => a.includes('San Jose')),
  'San Jose partial'
);
assert.ok(
  candonPoster.partial_areas.some((a) =>
    a.toLowerCase().includes('san agustin') && a.includes('way to Darapidap')
  ),
  'route qualifier preserved'
);
assert.ok(
  candonPoster.areas.every((a) => a.includes('Candon City')),
  'full areas qualified with Candon City'
);
assert.ok(
  candonPoster.partial_areas.every((a) => a.includes('Candon City')),
  'partial areas qualified with Candon City'
);

console.log('normalize tests passed');
