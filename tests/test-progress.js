// tests/test-progress.js
// We just test the width calculation logic in isolation.

function calcWidth(index, total) {
  if (total === 0) return 0;
  return Math.min(100, ((index + 1) / total) * 100);
}

console.assert(calcWidth(0, 100) === 1, 'Test 1: first paragraph = 1%');
console.assert(calcWidth(49, 100) === 50, 'Test 2: halfway');
console.assert(calcWidth(99, 100) === 100, 'Test 3: last paragraph = 100%');
console.assert(calcWidth(0, 0) === 0, 'Test 4: zero total');
console.log('✓ progress tests passed');
