# @stevenleep/rate-limiter

[![npm version](https://badge.fury.io/js/@stevenleep/rate-limiter.svg)](https://badge.fury.io/js/@stevenleep/rate-limiter)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A production-ready toolkit for rate limiting, task queuing, and resource management with zero dependencies.

## Features

- 🎯 **Rate Limiter**: Sliding window algorithm with configurable time windows
- ⚡ **Handler Queue**: Priority-based concurrent task processing
- 🔄 **Resource Pool**: Automatic lifecycle management for any resource type
- 🔧 **Iterator Support**: Native iteration protocol for monitoring and inspection
- 📦 **Zero Dependencies**: Lightweight with no external dependencies

## Installation

```bash
npm install @stevenleep/rate-limiter
```

## Quick Start

### Rate Limiter
```typescript
import { createRateLimiter, RateLimiterPresets } from '@stevenleep/rate-limiter';

const limiter = createRateLimiter(RateLimiterPresets.API_STANDARD);

if (limiter.isAllowed('user-123')) {
  console.log('✅ Request approved');
} else {
  console.log('❌ Rate limit exceeded');
}

// Iterator support
for (const record of limiter) {
  console.log(`Active: ${record.key} at ${record.timestamp}`);
}
```

### Handler Queue
```typescript
import { createHandlerQueue, HandlerQueuePresets } from '@stevenleep/rate-limiter';

const queue = createHandlerQueue(HandlerQueuePresets.STANDARD);

const taskId = await queue.addTask({
  handler: async (data) => processData(data),
  priority: 10,
  data: { input: 'example' },
  timeout: 30000
});

// Monitor tasks
for (const task of queue) {
  console.log(`Task ${task.id}: ${task.status}`);
}
```

### Resource Pool
```typescript
import { createResourcePool } from '@stevenleep/rate-limiter';

const dbPool = createResourcePool({
  name: 'database-connections',
  minSize: 5,
  maxSize: 20,
  factory: async () => createConnection(),
  validator: async (conn) => conn.ping(),
  destroyer: async (conn) => conn.close()
});

const connection = await dbPool.acquire();
try {
  const result = await connection.query('SELECT * FROM users');
} finally {
  dbPool.release(connection);
}
```

## API Reference

### RateLimiter<TKey>
```typescript
interface RateLimiter<TKey = string> extends Iterable<RequestRecord<TKey>> {
  isAllowed(key: TKey): boolean;
  cleanup(): number;
  updateConfig(config: Partial<RateLimiterConfig<TKey>>): void;
  reset(): void;
  getRequestCount(key: TKey): number;
}
```

**Presets**: `API_STANDARD`, `API_BURST`, `BASIC_WEB`, `CONSERVATIVE`, `HIGH_FREQUENCY`

### HandlerQueue<TData, TResult>
```typescript
interface HandlerQueue<TData, TResult> extends Iterable<HandlerTask<TData, TResult>> {
  addTask(config: TaskConfig<TData, TResult>): Promise<string>;
  getTask(taskId: string): HandlerTask<TData, TResult> | undefined;
  cancelTask(taskId: string): boolean;
  pause(): void;
  resume(): void;
}
```

**Presets**: `STANDARD`, `HIGH_CONCURRENCY`, `LIGHT_PROCESSING`, `HEAVY_PROCESSING`

### ResourcePool<TResource>
```typescript
interface ResourcePool<TResource> extends Iterable<ResourceStatus<TResource>> {
  acquire(): Promise<TResource>;
  release(resource: TResource): void;
  destroy(resource: TResource): Promise<void>;
  resize(newSize: number): Promise<void>;
  getTotalResources(): number;
  getAvailableCount(): number;
}
```

## Advanced Examples

### API Gateway
```typescript
import { createRateLimiter, createHandlerQueue, createResourcePool } from '@stevenleep/rate-limiter';

class ApiGateway {
  private limiter = createRateLimiter(RateLimiterPresets.API_STANDARD);
  private queue = createHandlerQueue(HandlerQueuePresets.HIGH_CONCURRENCY);
  private dbPool = createResourcePool({
    name: 'database-pool',
    minSize: 5,
    maxSize: 20,
    factory: async () => createDbConnection(),
    validator: async (conn) => conn.ping(),
    destroyer: async (conn) => conn.close()
  });

  async handleRequest(userId: string, data: any) {
    if (!this.limiter.isAllowed(userId)) {
      throw new Error('Rate limit exceeded');
    }

    return await this.queue.addTask({
      handler: async () => {
        const db = await this.dbPool.acquire();
        try {
          return await db.processRequest(data);
        } finally {
          this.dbPool.release(db);
        }
      },
      priority: 5,
      data
    });
  }

  getSystemHealth() {
    return {
      activeRequests: [...this.limiter].length,
      queuedTasks: [...this.queue].filter(t => t.status === 'pending').length,
      availableConnections: this.dbPool.getAvailableCount()
    };
  }
}
```

## License

MIT License - see the [LICENSE](LICENSE) file for details.

## Links

- [NPM Package](https://www.npmjs.com/package/@stevenleep/rate-limiter)
- [GitHub Repository](https://github.com/stevenleep/rate-limiter)
