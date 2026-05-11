/**
 * ABOUTME: Integration tests for `ralph-tui run --remote-only` paths that
 * require mocking the remotes config (listRemotes) and the TUI renderer.
 * Lives in a separate file so the module-level mocks only apply here.
 */

import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';

import * as realRemoteIndex from '../../src/remote/index.js';
import * as realOpentuiCore from '@opentui/core';
import * as realOpentuiReact from '@opentui/react';
import * as realInterruption from '../../src/interruption/index.js';
import type { RemoteServerConfig } from '../../src/remote/index.js';

let mockedRemotes: Array<[string, RemoteServerConfig]> = [];
let mockedRendererBehavior: 'throw' | 'normal' = 'normal';

mock.module('../../src/remote/index.js', () => ({
  ...realRemoteIndex,
  listRemotes: () => Promise.resolve(mockedRemotes),
}));

mock.module('@opentui/core', () => ({
  ...realOpentuiCore,
  createCliRenderer: () => {
    if (mockedRendererBehavior === 'throw') {
      throw new Error('test-mock: createCliRenderer disabled');
    }
    return { destroy: () => {} };
  },
}));

mock.module('@opentui/react', () => ({
  ...realOpentuiReact,
  createRoot: () => ({ render: () => {} }),
}));

mock.module('../../src/interruption/index.js', () => ({
  ...realInterruption,
  createInterruptHandler: () => ({
    handleSigint: () => {},
    handleResponse: async () => {},
    getState: () => 'idle' as const,
    reset: () => {},
    dispose: () => {},
  }),
}));

describe('executeRunCommand --remote-only with no remotes', () => {
  let consoleErrorOutput: string[];
  let consoleLogOutput: string[];
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockedRemotes = [];
    mockedRendererBehavior = 'normal';
    consoleErrorOutput = [];
    consoleLogOutput = [];
    consoleErrorSpy = spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrorOutput.push(args.join(' '));
    });
    consoleLogSpy = spyOn(console, 'log').mockImplementation((...args) => {
      consoleLogOutput.push(args.join(' '));
    });
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('exits with a clear error when no remotes configured', async () => {
    try {
      await import('../../src/commands/run.jsx').then((m) =>
        m.executeRunCommand(['--remote-only'])
      );
    } catch {
      // Expected: process.exit throws
    }

    const output = consoleErrorOutput.join('\n');
    expect(output).toContain('--remote-only requires at least one configured remote');
    expect(output).toContain('remotes.toml');
    expect(output).toContain('ralph-tui remote add');
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  test('error guidance points at the correct config path', async () => {
    try {
      await import('../../src/commands/run.jsx').then((m) =>
        m.executeRunCommand(['--remote-only'])
      );
    } catch {
      // Expected: process.exit throws
    }

    const output = consoleErrorOutput.join('\n');
    expect(output).toContain('~/.config/ralph-tui/remotes.toml');
  });
});

describe('executeRunCommand --remote-only with configured remotes', () => {
  let consoleErrorOutput: string[];
  let consoleLogOutput: string[];
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockedRemotes = [
      ['testrem', { host: 'localhost', port: 7890, token: 'tk', addedAt: new Date().toISOString() }],
    ];
    mockedRendererBehavior = 'throw';
    consoleErrorOutput = [];
    consoleLogOutput = [];
    consoleErrorSpy = spyOn(console, 'error').mockImplementation((...args) => {
      consoleErrorOutput.push(args.join(' '));
    });
    consoleLogSpy = spyOn(console, 'log').mockImplementation((...args) => {
      consoleLogOutput.push(args.join(' '));
    });
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('proceeds past empty-remotes check and enters runRemoteOnlyTui', async () => {
    // With a remote configured and the renderer mocked to throw, executeRunCommand
    // should run through the theme/plugin/storedConfig setup, log the init message,
    // and reject inside runRemoteOnlyTui when createCliRenderer throws.
    let caught: Error | null = null;
    try {
      await import('../../src/commands/run.jsx').then((m) =>
        m.executeRunCommand(['--remote-only'])
      );
    } catch (err) {
      caught = err as Error;
    }

    const logOutput = consoleLogOutput.join('\n');
    expect(logOutput).toContain('Initializing remote-only TUI with 1 remote(s)');
    // The renderer error propagates out (no process.exit was called for it).
    expect(caught?.message ?? '').toContain('test-mock: createCliRenderer disabled');
  });

  test('reports remote count accurately for multiple remotes', async () => {
    mockedRemotes = [
      ['rem1', { host: 'h1', port: 7890, token: 'tk1', addedAt: 'x' }],
      ['rem2', { host: 'h2', port: 7891, token: 'tk2', addedAt: 'x' }],
      ['rem3', { host: 'h3', port: 7892, token: 'tk3', addedAt: 'x' }],
    ];
    try {
      await import('../../src/commands/run.jsx').then((m) =>
        m.executeRunCommand(['--remote-only'])
      );
    } catch {
      // Expected: createCliRenderer mock throws
    }

    const logOutput = consoleLogOutput.join('\n');
    expect(logOutput).toContain('Initializing remote-only TUI with 3 remote(s)');
  });
});

describe('runRemoteOnlyTui end-to-end with mocked renderer', () => {
  let consoleErrorSpy: ReturnType<typeof spyOn>;
  let consoleLogSpy: ReturnType<typeof spyOn>;
  let processExitSpy: ReturnType<typeof spyOn>;

  beforeEach(() => {
    mockedRemotes = [
      ['testrem', { host: 'localhost', port: 7890, token: 'tk', addedAt: new Date().toISOString() }],
    ];
    mockedRendererBehavior = 'normal';
    consoleErrorSpy = spyOn(console, 'error').mockImplementation(() => {});
    consoleLogSpy = spyOn(console, 'log').mockImplementation(() => {});
    processExitSpy = spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  test('runs through runRemoteOnlyTui and resolves on SIGTERM', async () => {
    const runPromise = import('../../src/commands/run.jsx').then((m) =>
      m.executeRunCommand(['--remote-only'])
    );

    // Give the TUI a tick to install the SIGTERM handler.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Trigger graceful shutdown by emitting SIGTERM.
    process.emit('SIGTERM', 'SIGTERM');

    // The shutdown handler calls renderer.destroy() and resolves the quit promise.
    await runPromise;

    // No exit(1) — clean shutdown after SIGTERM means we just return.
    expect(processExitSpy).not.toHaveBeenCalled();
  });
});
