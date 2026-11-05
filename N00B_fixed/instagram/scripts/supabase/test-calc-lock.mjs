// The calculator lock: Admin > Pages "Calculator answers" switched OFF makes "=" show "idk ask chatgpt".
// Usage: node --liftoff-only scripts/supabase/test-calc-lock.mjs
import fs from 'node:fs';
let passed = 0, failed = 0;
const check = (c, l) => { if (c) { passed++; console.log(`  ok   ${l}`); } else { failed++; console.log(`  FAIL ${l}`); } };
const read = (p) => fs.readFileSync(p, 'utf8').split('\r').join('');
const feat = read('src/utils/features.ts'), calc = read('src/components/Profile/CalculatorPage.tsx'), app = read('src/App.tsx');
check(/key: 'calc'/.test(feat) && /'idk ask chatgpt'/.test(feat), 'the switch "calc" is on the Pages list and the answer text is "idk ask chatgpt"');
check(/setCalcLocked\(!!platformSettings\?\.disabledFeatures\?\.includes\('calc'\)\)/.test(app), 'the app tells the calculator whether the switch is off (also for the administrator)');
check(/if \(isCalcLocked\(\)\) \{[\s\S]{0,200}display: CALC_LOCK_TEXT/.test(calc), 'with the switch off, "=" shows the text instead of a result');
check(/e\.key === 'Enter' \|\| e\.key === '='[\s\S]{0,80}handleEquals\(\)/.test(calc), 'the keyboard = / Enter goes the same way');
check(/prev\.display === CALC_LOCK_TEXT \? 0/.test(calc), 'typing on after the text starts a fresh number (no NaN)');
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
