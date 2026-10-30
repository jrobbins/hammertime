'use strict';

const suites = [];
let currentSuite = null;

function describe(name, fn) {
  const suite = {
    name,
    beforeEachFns: [],
    tests: [],
  };
  const prevSuite = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = prevSuite;
  suites.push(suite);
}

function beforeEach(fn) {
  if (currentSuite) {
    currentSuite.beforeEachFns.push(fn);
  }
}

function it(name, fn) {
  if (currentSuite) {
    currentSuite.tests.push({ name, fn });
  } else {
    suites.push({
      name: 'Root',
      beforeEachFns: [],
      tests: [{ name, fn }],
    });
  }
}

async function runAllSuites() {
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const suite of suites) {
    console.log(`\n● ${suite.name}`);
    for (const test of suite.tests) {
      try {
        for (const hook of suite.beforeEachFns) {
          await hook();
        }
        await test.fn();
        passed++;
        console.log(`  ✓ ${test.name}`);
      } catch (err) {
        failed++;
        console.error(`  ✗ ${test.name}`);
        console.error(`    ${err && err.stack ? err.stack.split('\n').join('\n    ') : err}`);
        failures.push({ suite: suite.name, test: test.name, err });
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`========================================`);

  if (failed > 0) {
    process.exitCode = 1;
  }
  return { passed, failed, failures };
}

module.exports = {
  describe,
  it,
  beforeEach,
  runAllSuites,
};
