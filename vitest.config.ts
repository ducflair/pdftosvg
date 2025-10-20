import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 60000, // Increase timeout for WASM initialization
    hookTimeout: 60000,
    // Use single thread to avoid WASM context issues
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    // Set up environment variables for WASM
    env: {
      NODE_OPTIONS: '--max-old-space-size=4096'
    },
    // Ensure proper cleanup
    teardownTimeout: 10000
  }
});