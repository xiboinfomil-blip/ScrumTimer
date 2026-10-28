import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const adapterUrl = new URL('../src/lib/remote/remote-redis.ts', import.meta.url).href;
const storeUrl = new URL('../src/lib/remote/timer-remote-store.ts', import.meta.url).href;
const domainUrl = new URL('../src/lib/remote/timer-remote.ts', import.meta.url).href;

// Each child owns its environment, global singleton and event loop. The TCP
// server MUST live in the child too: spawnSync blocks the parent's event loop.
const fixture = String.raw`
  import assert from 'node:assert/strict';
  import { createServer } from 'node:net';
  import { once } from 'node:events';
  for (const name of ['VERCEL', 'REDIS_URL', 'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN', 'TIMER_REMOTE_SECRET', 'PARTICIPANT_PORTAL_SECRET']) {
    delete process.env[name];
  }
  process.env.TIMER_REMOTE_SECRET = 'remote-redis-test-only-secret-at-least-32-bytes';
  const logs = [];
  console.error = (...args) => logs.push(args.join(' '));
  console.warn = (...args) => logs.push(args.join(' '));

  // Incremental RESP array/bulk-string parser, not a packet-per-command mock.
  // Lengths are byte lengths, so UTF-8 snapshots and fragmented/pipelined frames work.
  function parseRESP(buffer) {
    let offset = 0;
    function line() {
      const end = buffer.indexOf('\r\n', offset);
      if (end < 0) return undefined;
      const text = buffer.toString('utf8', offset, end);
      offset = end + 2;
      return text;
    }
    const header = line();
    if (header === undefined) return null;
    assert.match(header, /^\*\d+$/);
    const command = [];
    for (let i = 0; i < Number(header.slice(1)); i++) {
      const bulk = line();
      if (bulk === undefined) return null;
      assert.match(bulk, /^\$\d+$/);
      const size = Number(bulk.slice(1));
      if (buffer.length < offset + size + 2) return null;
      command.push(buffer.toString('utf8', offset, offset + size));
      assert.equal(buffer.toString('ascii', offset + size, offset + size + 2), '\r\n');
      offset += size + 2;
    }
    return { command, bytes: offset };
  }
  function bulk(value) {
    return '$' + Buffer.byteLength(value) + '\r\n' + value + '\r\n';
  }
  async function protocolMock() {
    const sockets = new Set();
    const commands = [];
    let connections = 0;
    let respond = () => bulk(JSON.stringify({ ok: true }));
    const server = createServer(socket => {
      connections++;
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      let buffer = Buffer.alloc(0);
      socket.on('data', chunk => {
        buffer = Buffer.concat([buffer, chunk]);
        let parsed;
        while ((parsed = parseRESP(buffer))) {
          buffer = buffer.subarray(parsed.bytes);
          const command = parsed.command;
          commands.push(command);
          let reply;
          switch (command[0].toUpperCase()) {
            case 'AUTH': case 'SELECT': case 'CLIENT': reply = '+OK\r\n'; break;
            case 'EVAL': reply = respond(command, socket); break;
            default: assert.fail('Unexpected Redis command: ' + command[0]);
          }
          if (reply !== undefined && !socket.destroyed) socket.write(reply);
        }
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const url = 'redis://fixture-user:fixture-password@127.0.0.1:' + server.address().port + '/2';
    return {
      url, commands,
      get connections() { return connections; },
      set respond(value) { respond = value; },
      async close() {
        for (const socket of sockets) socket.destroy();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      },
    };
  }
  function cleanupClient() {
    const connection = globalThis.__standupRemoteRedis;
    if (connection?.client.isOpen) connection.client.destroy();
    delete globalThis.__standupRemoteRedis;
  }
`;

function childAssertions(script: string) {
  const result = spawnSync(process.execPath, [
    '--conditions=react-server', '--experimental-strip-types', '--input-type=module', '-e',
    fixture + `\nconst adapter = await import(${JSON.stringify(adapterUrl)});\n`
      + `const store = await import(${JSON.stringify(storeUrl)});\n`
      + `const { RemoteError } = await import(${JSON.stringify(domainUrl)});\n`
      + script + '\nassert.deepEqual(logs, []); console.log("remote-redis assertions passed");',
  ], { encoding: 'utf8', timeout: 25_000, maxBuffer: 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.match(result.stdout, /remote-redis assertions passed/);
  assert.doesNotMatch(result.stdout + result.stderr, /fixture-password|fixture-user|redis:\/\/|rediss:\/\//);
}

test('Redis adapter validation: native schemes, strict configuration and explicit REST precedence', () => {
  childAssertions(String.raw`
    const reset = () => {
      delete process.env.REDIS_URL;
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    };
    const invalid = () => assert.throws(() => adapter.remoteRedisAdapter(), error =>
      error instanceof RemoteError && error.status === 503 && error.code === 'REMOTE_REDIS_CONFIG_INVALID'
      && !/fixture|redis:|rediss:/.test(error.message));
    assert.equal(adapter.remoteRedisAdapter(), null);
    assert.equal(store.timerRemoteTransport(), 'instance');
    for (const url of ['redis://localhost', 'redis://localhost/', 'redis://localhost/0',
      'redis://fixture-user:fixture-password@localhost:6379/12', 'rediss://localhost:6380/2',
      'redis://[::1]:6379/0']) {
      process.env.REDIS_URL = url;
      assert.equal(adapter.remoteRedisAdapter(), 'redis');
      assert.equal(store.timerRemoteTransport(), 'shared');
    }
    for (const url of ['not a url', 'https://localhost', 'http://localhost', 'redis://',
      'redis://localhost/-1', 'redis://localhost/1/2', 'redis://localhost/db',
      'redis://localhost/1?password=fixture-password', 'rediss://localhost/#fixture-password',
      'redis://localhost:99999']) {
      process.env.REDIS_URL = url;
      invalid();
    }
    process.env.REDIS_URL = 'redis://localhost/0';
    process.env.VERCEL = '1';
    assert.equal(store.timerRemoteTransport(), 'shared');
    // Neither partial REST configuration may fall back to a valid native URL.
    for (const name of ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']) {
      reset();
      process.env.REDIS_URL = 'redis://localhost/0';
      process.env[name] = name.endsWith('URL') ? 'https://rest.invalid' : 'fixture-token';
      invalid();
    }
    process.env.UPSTASH_REDIS_REST_URL = 'https://rest.invalid';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'fixture-token';
    process.env.REDIS_URL = 'invalid native URL intentionally ignored';
    assert.equal(adapter.remoteRedisAdapter(), 'rest');
    assert.equal(store.timerRemoteTransport(), 'shared');
    for (const url of ['http://rest.invalid', 'https://fixture-user:fixture-password@rest.invalid',
      'https://rest.invalid/?token=fixture-password', 'https://rest.invalid/#fixture-password', 'invalid']) {
      process.env.UPSTASH_REDIS_REST_URL = url;
      invalid();
    }
    reset();
    assert.throws(() => store.timerRemoteTransport(), error => error.code === 'REMOTE_REDIS_REQUIRED');
  `);
});

test('protocolmock: official client handshake, single-key store EVAL envelopes and socket reuse/coalescing (not Lua execution)', () => {
  childAssertions(String.raw`
    const mock = await protocolMock();
    try {
      process.env.REDIS_URL = mock.url;
      globalThis.fetch = () => assert.fail('Native Redis must not use REST');
      const encoded = Buffer.from('*2\r\n$4\r\nEVAL\r\n$2\r\né\r\n');
      for (let i = 0; i < encoded.length; i++) assert.equal(parseRESP(encoded.subarray(0, i)), null);
      assert.deepEqual(parseRESP(Buffer.concat([encoded, encoded])), { command: ['EVAL', 'é'], bytes: encoded.length });

      mock.respond = command => bulk(JSON.stringify({ key: command[3], arg: command[4] }));
      const cold = await Promise.all(Array.from({ length: 8 }, (_, i) =>
        adapter.evalRemoteRedis('return ARGV[1]', 'cold:' + i, ['Équipe ' + i])));
      assert.deepEqual(cold.map(value => JSON.parse(value)),
        Array.from({ length: 8 }, (_, i) => ({ key: 'cold:' + i, arg: 'Équipe ' + i })));
      assert.equal(mock.connections, 1);
      assert.equal(mock.commands.filter(c => c[0] === 'AUTH').length, 1);
      assert.deepEqual(mock.commands.find(c => c[0] === 'AUTH'), ['AUTH', 'fixture-user', 'fixture-password']);
      assert.deepEqual(mock.commands.find(c => c[0] === 'SELECT'), ['SELECT', '2']);
      assert.ok(mock.commands.some(c => c[0] === 'CLIENT' && c[1] === 'SETINFO'));
      assert.ok(mock.commands.findIndex(c => c[0] === 'AUTH') < mock.commands.findIndex(c => c[0] === 'EVAL'));
      for (const wire of mock.commands.filter(c => c[0] === 'EVAL')) {
        assert.equal(wire[2], '1');
        assert.equal(wire.length, 5);
      }

      const clock = 123456;
      let reply = { expiresAt: clock + 10000, serverNow: clock };
      mock.respond = () => bulk(JSON.stringify(reply));
      const teamId = 'a'.repeat(64);
      const created = await store.createTimerRemote(teamId);
      assert.equal(created.transport, 'shared');
      assert.equal(created.reusable, true);
      assert.equal(created.expiresAt, reply.expiresAt);
      const create = mock.commands.at(-1);
      assert.equal(create[0], 'EVAL');
      assert.equal(create[2], '1');
      assert.equal(create[3], 'standup:timer-remote:' + created.id);
      assert.equal(create.length, 5);
      const entry = JSON.parse(create[4]);
      assert.equal(entry.teamId, teamId);
      assert.equal(entry.ownerHash, store.hashRemoteToken(created.owner));
      assert.equal(entry.controlHash, store.hashRemoteToken(created.control));
      assert.equal(entry.snapshot, null);
      assert.equal(entry.pending, null);

      const snapshot = { speaker: '<Alice>', nextSpeaker: 'Bob', teamName: 'Équipe', activeId: 'alice',
        running: false, remaining: 30, deadline: 0, completed: 0, total: 2, version: 'v1', blocked: false };
      const requestId = '12345678-1234-4234-8234-123456789abc';
      function envelope(op, token, input) {
        const wire = mock.commands.at(-1);
        assert.equal(wire[0], 'EVAL');
        assert.equal(wire[2], '1');
        assert.equal(wire[3], create[3]);
        assert.equal(wire[4], op);
        assert.equal(wire[5], store.hashRemoteToken(token));
        assert.deepEqual(JSON.parse(wire[6]), input);
        assert.equal(wire.length, 7);
        assert.notEqual(wire[1], create[1]);
        assert.equal(JSON.stringify(wire).includes(created.owner), false);
        assert.equal(JSON.stringify(wire).includes(created.control), false);
        return wire[1];
      }
      reply = { snapshot: null, status: 'waiting', serverNow: clock };
      assert.deepEqual(await store.readTimerRemote(created.id, created.control), { ...reply, transport: 'shared' });
      const operationScript = envelope('read', created.control, {});
      reply = { snapshot, status: 'online', serverNow: clock, command: null, consumedVersion: null };
      assert.deepEqual(await store.syncTimerRemote(created.id, created.owner, snapshot, requestId), { ...reply, transport: 'shared' });
      assert.equal(envelope('sync', created.owner, { snapshot, ack: requestId }), operationScript);
      for (const action of ['start', 'pause', 'next', 'restart', 'penalty', 'black-screen']) {
        const command = { requestId, action, version: 'v1' };
        reply = { accepted: true, serverNow: clock };
        assert.deepEqual(await store.commandTimerRemote(created.id, created.control, command), { ...reply, transport: 'shared' });
        assert.equal(envelope('command', created.control, command), operationScript);
      }
      reply = { revoked: true };
      assert.deepEqual(await store.revokeTimerRemote(created.id, created.owner), { ...reply, transport: 'shared' });
      assert.equal(envelope('revoke', created.owner, {}), operationScript);
      assert.equal(JSON.stringify(create).includes(created.owner), false);
      assert.equal(JSON.stringify(create).includes(created.control), false);
      assert.equal(mock.connections, 1);

      // A separate module URL still shares the global connection.
      const independent = await import(${JSON.stringify(adapterUrl)} + '?protocolmock-independent');
      await independent.evalRemoteRedis('return 1', 'independent', []);
      assert.equal(mock.connections, 1);
      assert.equal(globalThis.__standupTimerRemote.size, 0);
    } finally { cleanupClient(); await mock.close(); }
  `.replace('${ADAPTER_URL}', JSON.stringify(adapterUrl)));
});

test('protocolmock: safe failures, no replay/fallback, recovery and native URL replacement (not Lua execution)', () => {
  childAssertions(String.raw`
    const mock = await protocolMock();
    const replacement = await protocolMock();
    const safeUnavailable = error => {
      assert.ok(error instanceof RemoteError);
      assert.equal(error.status, 503);
      assert.equal(error.code, 'REMOTE_REDIS_UNAVAILABLE');
      const serialized = error.message + JSON.stringify(error) + String(error.cause);
      assert.doesNotMatch(serialized, /fixture-password|fixture-user|127\.0\.0\.1|redis:\/\/|private-upstream/);
      return true;
    };
    try {
      process.env.REDIS_URL = mock.url;
      globalThis.fetch = () => assert.fail('Failures must not fall back to REST');
      const teamId = 'a'.repeat(64);
      mock.respond = () => bulk(JSON.stringify({ expiresAt: 123456, serverNow: 1 }));
      const created = await store.createTimerRemote(teamId);
      const read = () => store.readTimerRemote(created.id, created.control);
      const evals = () => mock.commands.filter(c => c[0] === 'EVAL').length;
      // A JSON error reply is a domain failure, not a broken TCP connection.
      for (const status of [401, 404, 409]) {
        mock.respond = () => bulk(JSON.stringify({ error: status }));
        await assert.rejects(read(), error => error instanceof RemoteError && error.status === status);
      }
      assert.equal(mock.connections, 1);
      for (const response of [bulk('not JSON'), ':42\r\n', '$-1\r\n',
        bulk(JSON.stringify({ error: 'private-upstream fixture-password' }))]) {
        mock.respond = () => response;
        const before = evals();
        await assert.rejects(read(), safeUnavailable);
        assert.equal(evals(), before + 1);
      }
      mock.respond = () => '-ERR private-upstream ' + mock.url + '\r\n';
      let before = evals();
      await assert.rejects(read(), safeUnavailable);
      assert.equal(evals(), before + 1);
      assert.equal(globalThis.__standupRemoteRedis, undefined);
      const connections = mock.connections;
      mock.respond = () => bulk(JSON.stringify({ snapshot: null, status: 'waiting', serverNow: 1 }));
      assert.equal((await read()).transport, 'shared');
      assert.equal(mock.connections, connections + 1);

      // Disconnect after receiving EVAL: outcome is unknown, so never replay it.
      mock.respond = (_command, socket) => { socket.destroy(); };
      before = evals();
      await assert.rejects(read(), safeUnavailable);
      assert.equal(evals(), before + 1);
      assert.equal(globalThis.__standupRemoteRedis, undefined);
      // A nonresponding server exercises the adapter's actual five-second bound.
      mock.respond = () => undefined;
      before = evals();
      await assert.rejects(read(), safeUnavailable);
      assert.equal(evals(), before + 1);
      assert.equal(globalThis.__standupRemoteRedis, undefined);

      mock.respond = () => bulk('old endpoint');
      assert.equal(await adapter.evalRemoteRedis('return 1', 'old', []), 'old endpoint');
      const oldClient = globalThis.__standupRemoteRedis.client;
      const oldEvals = evals();
      process.env.REDIS_URL = replacement.url;
      replacement.respond = () => bulk('new endpoint');
      assert.equal(await adapter.evalRemoteRedis('return 1', 'new', []), 'new endpoint');
      assert.equal(oldClient.isOpen, false);
      assert.equal(evals(), oldEvals);
      assert.equal(replacement.connections, 1);
      assert.equal(globalThis.__standupTimerRemote.size, 0);

      // Use a just-closed local listener, never a real configured endpoint.
      cleanupClient();
      const closed = await protocolMock();
      process.env.REDIS_URL = closed.url;
      await closed.close();
      await assert.rejects(adapter.evalRemoteRedis('return 1', 'refused', []), safeUnavailable);
      assert.equal(globalThis.__standupRemoteRedis, undefined);
    } finally { cleanupClient(); await mock.close(); await replacement.close(); }
  `);
});