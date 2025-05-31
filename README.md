# @stevenleep/rate-limiter

> **Iterator-First Design Philosophy**: A professional-grade TypeScript rate limiting toolkit that leverages the power of iterators, functional programming, and modern JavaScript patterns.

[![npm version](https://badge.fury.io/js/@stevenleep/rate-limiter.svg)](https://badge.fury.io/js/@stevenleep/rate-limiter)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A comprehensive, zero-dependency rate limiting toolkit built with TypeScript's iterator protocol at its core. This package provides three essential utilities: **Rate Limiter**, **Handler Queue**, and **Resource Pool** - all designed with iterator-first principles, type safety, and functional programming patterns.

## 🌟 Design Philosophy

### 1. **Iterator-First Design**
Every component implements JavaScript's iterator protocol (`Symbol.iterator`), making them seamlessly compatible with `for...of` loops, destructuring, and functional programming patterns.

### 2. **Type Safety Without Compromise**
Full TypeScript support with comprehensive generics, ensuring compile-time safety while maintaining runtime flexibility.

### 3. **Generic by Design**
Built to work with any data type - from simple strings to complex objects, databases connections, and beyond.

### 4. **Functional Programming Friendly**
Immutable configurations, pure functions, and composable patterns that work beautifully with modern JavaScript.

### 5. **Zero Dependencies**
No external dependencies. Pure TypeScript/JavaScript implementation using only native APIs.

## 🚀 Key Features

### 🎯 **Rate Limiter** - Sliding Window with Iterator Protocol
- ✅ **Iterator Protocol**: Native `Symbol.iterator` implementation for seamless integration
- ✅ **Sliding Time Windows**: Automatic cleanup of expired requests with configurable windows
- ✅ **Type-Safe Keys**: Generic key types with full TypeScript inference
- ✅ **Preset Configurations**: Production-ready configurations for common use cases
- ✅ **Dynamic Reconfiguration**: Update limits and windows at runtime

### ⚡ **Handler Queue** - Concurrent Task Management
- ✅ **Priority-Based Execution**: Weighted priority system for task scheduling
- ✅ **Concurrency Control**: Configurable limits on parallel task execution
- ✅ **Timeout & Retry Logic**: Built-in timeout handling with exponential backoff
- ✅ **Real-time Status Tracking**: Monitor task states through iterator protocol
- ✅ **Generic Task Types**: Handle any async operation with full type safety

### 🔄 **Resource Pool** - Lifecycle Management
- ✅ **Universal Resource Support**: Database connections, file handles, API clients, etc.
- ✅ **Automatic Lifecycle Management**: Creation, validation, cleanup, and disposal
- ✅ **Wait Queue Management**: Efficient queuing when resources are exhausted
- ✅ **Health Monitoring**: Built-in resource health checks and automatic recovery
- ✅ **Iterator-Based Inspection**: Iterate through pool state and statistics

## 📦 Installation

```bash
npm install @stevenleep/rate-limiter
```

## 🏃‍♂️ Quick Start

### Basic Rate Limiting
```typescript
import { createRateLimiter, RateLimiterPresets } from '@stevenleep/rate-limiter';

// Create a rate limiter with preset configuration
const limiter = createRateLimiter(RateLimiterPresets.API_STANDARD);

// Check if request is allowed
if (limiter.isAllowed('user-123')) {
  console.log('✅ Request approved');
} else {
  console.log('❌ Rate limit exceeded');
}

// Use iterator protocol to inspect active requests
for (const record of limiter) {
  console.log(`Active request: ${record.key} at ${record.timestamp}`);
}
```

### Handler Queue for Concurrent Processing
```typescript
import { createHandlerQueue, HandlerQueuePresets } from '@stevenleep/rate-limiter';

// Create queue with built-in concurrency management
const queue = createHandlerQueue(HandlerQueuePresets.HEAVY_PROCESSING);

// Add tasks with priorities and type safety
const taskId = await queue.addTask({
  handler: async (data: ProcessingData) => {
    const result = await processLargeDataset(data);
    return result;
  },
  priority: 10, // Higher number = higher priority
  data: { dataset: largeData },
  timeout: 30000 // 30 second timeout
});

// Monitor progress using iterator protocol
for (const task of queue) {
  console.log(`Task ${task.id}: ${task.status}`);
}
```

### Resource Pool Management
```typescript
import { createResourcePool } from '@stevenleep/rate-limiter';

// Generic resource pool - works with any resource type
const dbPool = createResourcePool({
  name: 'database-connections',
  minSize: 5,
  maxSize: 20,
  maxIdleTime: 30000,
  
  // Factory function with full type safety
  factory: async (): Promise<DatabaseConnection> => {
    return await createDatabaseConnection();
  },
  
  // Resource validation
  validator: async (conn: DatabaseConnection) => {
    return await conn.ping();
  },
  
  // Custom cleanup logic
  destroyer: async (conn: DatabaseConnection) => {
    await conn.close();
  }
});

// Acquire and use resources safely
const connection = await dbPool.acquire();
try {
  const result = await connection.query('SELECT * FROM users');
  return result;
} finally {
  dbPool.release(connection);
}
```

## 🔧 Advanced Usage

### Custom Rate Limiter Configuration
```typescript
// Create custom configurations for specific needs
const customLimiter = createRateLimiter({
  maxRequests: 100,
  timeWindow: 60000, // 1 minute
  keyGenerator: (identifier: UserRequest) => {
    // Custom key generation logic
    return `${identifier.userId}:${identifier.endpoint}`;
  }
});
```

### Iterator-Based Request Inspection
```typescript
// Leverage iterator protocol for advanced monitoring
const activeRequests = [...limiter]; // Convert to array
const expiredCount = limiter.cleanup(); // Manual cleanup
const currentLoad = activeRequests.length;

console.log(`Current load: ${currentLoad}, Cleaned: ${expiredCount}`);
```

### Queue Task Filtering with Iterators
```typescript
// Filter tasks by status using iterator patterns
const pendingTasks = [...queue].filter(task => task.status === 'pending');
const runningTasks = [...queue].filter(task => task.status === 'running');

console.log(`Pending: ${pendingTasks.length}, Running: ${runningTasks.length}`);
```

### Resource Pool Health Monitoring
```typescript
// Monitor pool health using iterator access
const poolStats = {
  total: pool.getTotalResources(),
  available: pool.getAvailableCount(),
  borrowed: [...pool].filter(r => r.status === 'borrowed').length
};

console.log('Pool Health:', poolStats);
```

## 📚 API Reference

### RateLimiter<TKey>

```typescript
interface RateLimiter<TKey = string> extends Iterable<RequestRecord<TKey>> {
  isAllowed(key: TKey): boolean;
  cleanup(): number;
  updateConfig(config: Partial<RateLimiterConfig<TKey>>): void;
  reset(): void;
  getRequestCount(key: TKey): number;
  [Symbol.iterator](): Iterator<RequestRecord<TKey>>;
}
```

**Preset Configurations:**
- `API_STANDARD`: 60 requests per minute (ideal for REST APIs)
- `API_BURST`: 100 requests per 10 seconds (burst-friendly)
- `BASIC_WEB`: 10 requests per second (web applications)
- `CONSERVATIVE`: 5 requests per minute (conservative limiting)
- `HIGH_FREQUENCY`: 1000 requests per minute (high-throughput systems)

### HandlerQueue<TData, TResult>

```typescript
interface HandlerQueue<TData = any, TResult = any> extends Iterable<HandlerTask<TData, TResult>> {
  addTask(config: TaskConfig<TData, TResult>): Promise<string>;
  getTask(taskId: string): HandlerTask<TData, TResult> | undefined;
  cancelTask(taskId: string): boolean;
  pause(): void;
  resume(): void;
  updateConfig(config: Partial<HandlerQueueConfig>): void;
  [Symbol.iterator](): Iterator<HandlerTask<TData, TResult>>;
}
```

**Preset Configurations:**
- `STANDARD`: 5 concurrent, 50 queue size
- `HIGH_CONCURRENCY`: 20 concurrent, 200 queue size  
- `LIGHT_PROCESSING`: 2 concurrent, 20 queue size
- `HEAVY_PROCESSING`: 3 concurrent, 30 queue size, extended timeouts

### ResourcePool<TResource>

```typescript
interface ResourcePool<TResource> extends Iterable<ResourceStatus<TResource>> {
  acquire(): Promise<TResource>;
  release(resource: TResource): void;
  destroy(resource: TResource): Promise<void>;
  resize(newSize: number): Promise<void>;
  getTotalResources(): number;
  getAvailableCount(): number;
  [Symbol.iterator](): Iterator<ResourceStatus<TResource>>;
}
```

## 🎯 Why Choose @stevenleep/rate-limiter?

### **Functional Programming Excellence**
Built for the modern JavaScript ecosystem with first-class support for functional programming patterns, immutability, and composition.

### **Iterator Protocol Integration**
Every component seamlessly integrates with JavaScript's iterator protocol, making them work naturally with `for...of`, spread operators, and array methods.

### **Production-Ready Presets**
Carefully crafted preset configurations based on real-world usage patterns and industry best practices.

### **Zero-Dependency Philosophy**
No external dependencies means faster installs, smaller bundle sizes, and fewer security vulnerabilities.

### **Comprehensive TypeScript Support**
Full generic support with intelligent type inference, ensuring both compile-time safety and runtime flexibility.

## 🔄 Real-World Examples

### Building an API Gateway
```typescript
import { 
  createRateLimiter, 
  createHandlerQueue, 
  createResourcePool,
  RateLimiterPresets,
  HandlerQueuePresets 
} from '@stevenleep/rate-limiter';

class ApiGateway {
  private rateLimiter = createRateLimiter(RateLimiterPresets.API_STANDARD);
  private taskQueue = createHandlerQueue(HandlerQueuePresets.HIGH_CONCURRENCY);
  private dbPool = createResourcePool({
    name: 'database-pool',
    minSize: 5,
    maxSize: 20,
    factory: async () => createDbConnection(),
    validator: async (conn) => conn.ping(),
    destroyer: async (conn) => conn.close()
  });

  async handleRequest(userId: string, endpoint: string, data: any) {
    // Rate limiting check
    if (!this.rateLimiter.isAllowed(userId)) {
      throw new Error('Rate limit exceeded');
    }

    // Queue the request for processing
    return await this.taskQueue.addTask({
      handler: async () => {
        const dbConnection = await this.dbPool.acquire();
        try {
          const result = await dbConnection.processRequest(endpoint, data);
          return result;
        } finally {
          this.dbPool.release(dbConnection);
        }
      },
      priority: endpoint.includes('critical') ? 10 : 5,
      data: { userId, endpoint, data }
    });
  }

  // Monitor system health using iterators
  getSystemHealth() {
    return {
      activeRequests: [...this.rateLimiter].length,
      queuedTasks: [...this.taskQueue].filter(t => t.status === 'pending').length,
      availableConnections: this.dbPool.getAvailableCount(),
      totalConnections: this.dbPool.getTotalResources()
    };
  }
}
```

### Web Scraper with Proxy Pool
```typescript
class WebScraper {
  private rateLimiter = createRateLimiter({
    maxRequests: 2,
    timeWindow: 5000, // Conservative for web scraping
  });

  private proxyPool = createResourcePool({
    name: 'proxy-pool',
    minSize: 3,
    maxSize: 10,
    factory: async () => createProxyConnection(),
    validator: async (proxy) => proxy.test(),
    destroyer: async (proxy) => proxy.disconnect()
  });

  async scrapeUrl(url: string): Promise<string> {
    if (!this.rateLimiter.isAllowed(url)) {
      throw new Error('Scraping rate limit exceeded');
    }

    const proxy = await this.proxyPool.acquire();
    try {
      const response = await proxy.fetch(url);
      return response.text();
    } finally {
      this.proxyPool.release(proxy);
    }
  }
}
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- [NPM Package](https://www.npmjs.com/package/@stevenleep/rate-limiter)
- [GitHub Repository](https://github.com/stevenleep/rate-limiter)
- [TypeScript Documentation](https://www.typescriptlang.org/)
- [Iterator Protocol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols)

---

**Built with ❤️ for the JavaScript/TypeScript community**
