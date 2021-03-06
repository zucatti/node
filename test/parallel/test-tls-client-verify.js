'use strict';
const common = require('../common');
const assert = require('assert');

if (!common.hasCrypto) {
  common.skip('missing crypto');
  return;
}
const tls = require('tls');

const fs = require('fs');

const hosterr = /Hostname\/IP doesn't match certificate's altnames/g;
const testCases =
  [{ ca: ['ca1-cert'],
     key: 'agent2-key',
     cert: 'agent2-cert',
     servers: [
         { ok: true, key: 'agent1-key', cert: 'agent1-cert' },
         { ok: false, key: 'agent2-key', cert: 'agent2-cert' },
         { ok: false, key: 'agent3-key', cert: 'agent3-cert' }
     ]
  },

  { ca: [],
    key: 'agent2-key',
    cert: 'agent2-cert',
    servers: [
         { ok: false, key: 'agent1-key', cert: 'agent1-cert' },
         { ok: false, key: 'agent2-key', cert: 'agent2-cert' },
         { ok: false, key: 'agent3-key', cert: 'agent3-cert' }
    ]
  },

  { ca: ['ca1-cert', 'ca2-cert'],
    key: 'agent2-key',
    cert: 'agent2-cert',
    servers: [
         { ok: true, key: 'agent1-key', cert: 'agent1-cert' },
         { ok: false, key: 'agent2-key', cert: 'agent2-cert' },
         { ok: true, key: 'agent3-key', cert: 'agent3-cert' }
    ]
  }
  ];

function filenamePEM(n) {
  return require('path').join(common.fixturesDir, 'keys', n + '.pem');
}


function loadPEM(n) {
  return fs.readFileSync(filenamePEM(n));
}

let successfulTests = 0;

function testServers(index, servers, clientOptions, cb) {
  const serverOptions = servers[index];
  if (!serverOptions) {
    cb();
    return;
  }

  const ok = serverOptions.ok;

  if (serverOptions.key) {
    serverOptions.key = loadPEM(serverOptions.key);
  }

  if (serverOptions.cert) {
    serverOptions.cert = loadPEM(serverOptions.cert);
  }

  const server = tls.createServer(serverOptions, common.mustCall(function(s) {
    s.end('hello world\n');
  }));

  server.listen(0, common.mustCall(function() {
    let b = '';

    console.error('connecting...');
    clientOptions.port = this.address().port;
    const client = tls.connect(clientOptions, common.mustCall(function() {
      const authorized = client.authorized ||
                         hosterr.test(client.authorizationError);

      console.error('expected: ' + ok + ' authed: ' + authorized);

      assert.strictEqual(ok, authorized);
      server.close();
    }));

    client.on('data', function(d) {
      b += d.toString();
    });

    client.on('end', common.mustCall(function() {
      assert.strictEqual('hello world\n', b);
    }));

    client.on('close', common.mustCall(function() {
      testServers(index + 1, servers, clientOptions, cb);
    }));
  }));
}


function runTest(testIndex) {
  const tcase = testCases[testIndex];
  if (!tcase) return;

  const clientOptions = {
    port: undefined,
    ca: tcase.ca.map(loadPEM),
    key: loadPEM(tcase.key),
    cert: loadPEM(tcase.cert),
    rejectUnauthorized: false
  };


  testServers(0, tcase.servers, clientOptions, common.mustCall(function() {
    successfulTests++;
    runTest(testIndex + 1);
  }));
}


runTest(0);


process.on('exit', function() {
  console.log('successful tests: %d', successfulTests);
  assert.strictEqual(successfulTests, testCases.length);
});
