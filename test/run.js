'use strict';

const { runAllSuites } = require('./harness.js');

require('./server.test.js');
require('./client.test.js');

runAllSuites();
