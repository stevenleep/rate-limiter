/**
 * @fileoverview Comprehensive examples for @stevenleep/rate-limiter
 * 
 * This file demonstrates the practical usage of all three core components:
 * - RateLimiter: Sliding window rate limiting
 * - HandlerQueue: Concurrent task management 
 * - ResourcePool: Resource lifecycle management
 * 
 * All examples showcase the iterator-first design philosophy and
 * demonstrate real-world usage patterns for production systems.
 */

import { 
  RateLimiter, 
  createRateLimiter, 
  RateLimiterPresets,
  HandlerQueue,
  createHandlerQueue,
  HandlerQueuePresets,
  ResourcePool,
  createResourcePool
} from './index';

/**
 * Comprehensive Example: Rate Limiter + Handler Queue + Resource Pool
 * 
 * This example demonstrates how all three components work together
 * to build a robust, production-ready system.
 */

// 1. Handler Queue Basic Example
async function handlerQueueBasicExample() {
  console.log('=== Handler Queue Basic Example ===');
  
  const queue = createHandlerQueue(HandlerQueuePresets.standard);
  
  console.log('Configuration: Max 5 concurrent, Queue capacity 100 tasks');
  
  // Add several tasks with different priorities
  const tasks = [];
  for (let i = 1; i <= 8; i++) {
    const taskId = await queue.addTask({
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate work
        return `Task ${i} completed`;
      },
      priority: i % 3, // Different priorities
      data: { taskNumber: i }
    });
    tasks.push(taskId);
    console.log(`Added task ${i}, ID: ${taskId}`);
  }
  
  console.log('\nQueue Status:', queue.getStatus());
  
  // Use iterator to inspect all tasks
  console.log('\nAll Tasks:');
  for (const task of queue) {
    console.log(`Task ${task.id}: priority=${task.priority}, created=${new Date(task.createdAt).toLocaleTimeString()}`);
  }
  
  // Wait for all tasks to complete
  await queue.waitForAll();
  console.log('\nAll tasks completed!');
  console.log('Final Status:', queue.getStatus());
}

// 2. Resource Pool Advanced Example
async function resourcePoolAdvancedExample() {
  console.log('\n=== Resource Pool Advanced Example ===');
  
  // Simulate database connection pool
  let connectionCounter = 0;
  
  const dbPool = createResourcePool({
    name: 'database-connections',
    minSize: 2,
    maxSize: 5,
    factory: async () => {
      connectionCounter++;
      const conn = {
        id: connectionCounter,
        query: async (sql: string) => `Result for: ${sql}`,
        ping: async () => true,
        close: async () => console.log(`Connection ${connectionCounter} closed`)
      };
      console.log(`Created new database connection #${connectionCounter}`);
      return conn;
    },
    validator: async (conn) => await conn.ping(),
    destroyer: async (conn) => await conn.close()
  });
  
  console.log('Pool initialized');
  console.log('Pool Status:', dbPool.getStatus());
  
  // Simulate concurrent database operations
  const operations = [];
  for (let i = 1; i <= 3; i++) {
    operations.push(
      (async () => {
        console.log(`\nOperation ${i}: Acquiring connection...`);
        const connection = await dbPool.acquire();
        console.log(`Operation ${i}: Got connection #${connection.id}`);
        
        // Use iterator to inspect pool state
        const poolRecords = [...dbPool];
        console.log(`Total pool records: ${poolRecords.length}`);
        
        // Simulate database work
        const result = await connection.query(`SELECT * FROM table_${i}`);
        console.log(`Operation ${i}: ${result}`);
        
        // Simulate random work time
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
        
        console.log(`Operation ${i}: Releasing connection #${connection.id}`);
        dbPool.release(connection);
      })()
    );
  }
  
  await Promise.all(operations);
  
  console.log('\nAll operations completed');
  console.log('Final Pool Status:', dbPool.getStatus());
  
  // Clean up
  await dbPool.close();
  console.log('Pool closed');
}

// 3. Rate Limiter with Iterator Protocol Demo
async function rateLimiterIteratorExample() {
  console.log('\n=== Rate Limiter Iterator Protocol Demo ===');
  
  const limiter = createRateLimiter(RateLimiterPresets.perSecond10);
  
  console.log('Testing rate limiter with 15 requests...');
  
  // Generate multiple requests
  for (let i = 1; i <= 15; i++) {
    const allowed = limiter.isAllowed(`user-${Math.floor(i / 3)}`);
    console.log(`Request ${i} (user-${Math.floor(i / 3)}): ${allowed ? '✅ Allowed' : '❌ Blocked'}`);
    
    // Every 5 requests, show current state using iterator
    if (i % 5 === 0) {
      console.log(`\n--- Current State (${i} requests processed) ---`);
      const activeRequests = [...limiter];
      console.log(`Active requests: ${activeRequests.length}`);
      
      // Group by user using iterator patterns
      const requestsByUser = activeRequests.reduce((acc, req) => {
        acc[req.id] = (acc[req.id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log('Requests by user ID:', requestsByUser);
      console.log('');
    }
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Show final state
  console.log('\nFinal state:', [...limiter].length, 'active requests');
}

// 4. Comprehensive System Integration Example
async function comprehensiveSystemExample() {
  console.log('\n=== Comprehensive System Integration Example ===');
  
  // API Gateway simulation with all three components
  class ApiGateway {
    private rateLimiter = createRateLimiter(RateLimiterPresets.perMinute100);
    private taskQueue = createHandlerQueue(HandlerQueuePresets.highConcurrency);
    private dbPool = createResourcePool({
      name: 'api-database-pool',
      minSize: 2,
      maxSize: 4,
      factory: async () => ({
        id: Math.random().toString(36).substr(2, 9),
        query: async (endpoint: string) => `Data for ${endpoint}`,
        isHealthy: () => true,
        close: async () => {}
      }),
      validator: async (conn) => conn.isHealthy(),
      destroyer: async (conn) => conn.close()
    });

    async handleApiRequest(userId: string, endpoint: string) {
      // 1. Rate limiting check
      if (!this.rateLimiter.isAllowed(userId)) {
        throw new Error(`Rate limit exceeded for user ${userId}`);
      }

      // 2. Queue the request for processing
      const taskId = await this.taskQueue.addTask({
        handler: async () => {
          // 3. Acquire database connection
          const dbConnection = await this.dbPool.acquire();
          
          try {
            // 4. Process the request
            const result = await dbConnection.query(endpoint);
            return { endpoint, result, timestamp: Date.now() };
          } finally {
            // 5. Always release the connection
            this.dbPool.release(dbConnection);
          }
        },
        priority: endpoint.includes('urgent') ? 10 : 5,
        data: { userId, endpoint }
      });

      return taskId;
    }

    // Health monitoring using iterator protocols
    getSystemHealth() {
      return {
        activeRateLimits: [...this.rateLimiter].length,
        totalTasks: [...this.taskQueue].length,
        poolRecords: [...this.dbPool].length
      };
    }

    async shutdown() {
      console.log('Shutting down API Gateway...');
      await this.taskQueue.waitForAll();
      await this.dbPool.close();
      console.log('API Gateway shutdown complete');
    }
  }

  const gateway = new ApiGateway();
  
  console.log('Starting API Gateway...');
  
  // Simulate API requests
  const requests = [
    { userId: 'user1', endpoint: '/api/data' },
    { userId: 'user1', endpoint: '/api/urgent/report' },
    { userId: 'user2', endpoint: '/api/stats' },
    { userId: 'user1', endpoint: '/api/profile' },
    { userId: 'user3', endpoint: '/api/data' },
    { userId: 'user2', endpoint: '/api/urgent/alert' },
  ];

  // Process requests concurrently
  const results = await Promise.allSettled(
    requests.map(async (req, index) => {
      try {
        console.log(`Processing request ${index + 1}: ${req.userId} -> ${req.endpoint}`);
        const taskId = await gateway.handleApiRequest(req.userId, req.endpoint);
        console.log(`Request ${index + 1} queued with task ID: ${taskId}`);
        return taskId;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(`Request ${index + 1} failed: ${errorMessage}`);
        return null;
      }
    })
  );

  // Monitor system health
  console.log('\n--- System Health Monitoring ---');
  const health = gateway.getSystemHealth();
  console.log('System Health:', health);

  // Wait a bit for processing
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Final health check
  console.log('\n--- Final System Health ---');
  const finalHealth = gateway.getSystemHealth();
  console.log('Final Health:', finalHealth);

  // Clean shutdown
  await gateway.shutdown();
}

// 5. Performance Benchmarking Example
async function performanceBenchmarkExample() {
  console.log('\n=== Performance Benchmark Example ===');
  
  const limiter = createRateLimiter({
    maxRequests: 1000,
    windowSize: 1000 // 1000 requests per second
  });

  console.log('Benchmarking rate limiter performance...');
  
  const iterations = 10000;
  const startTime = Date.now();
  
  let allowedCount = 0;
  let blockedCount = 0;
  
  for (let i = 0; i < iterations; i++) {
    const userId = `user-${i % 100}`; // 100 different users
    if (limiter.isAllowed(userId)) {
      allowedCount++;
    } else {
      blockedCount++;
    }
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  
  console.log(`\nBenchmark Results:`);
  console.log(`- Total iterations: ${iterations}`);
  console.log(`- Duration: ${duration}ms`);
  console.log(`- Rate: ${Math.round(iterations / duration * 1000)} requests/second`);
  console.log(`- Allowed: ${allowedCount} (${Math.round(allowedCount / iterations * 100)}%)`);
  console.log(`- Blocked: ${blockedCount} (${Math.round(blockedCount / iterations * 100)}%)`);
  console.log(`- Active requests: ${[...limiter].length}`);
}

// Main execution function
async function runExamples() {
  console.log('🚀 @stevenleep/rate-limiter - Comprehensive Examples\n');
  console.log('Demonstrating iterator-first design philosophy with practical examples...\n');

  try {
    await handlerQueueBasicExample();
    await resourcePoolAdvancedExample();
    await rateLimiterIteratorExample();
    await comprehensiveSystemExample();
    await performanceBenchmarkExample();
    
    console.log('\n✅ All examples completed successfully!');
    console.log('\n💡 Key Takeaways:');
    console.log('- Iterator protocol enables powerful functional programming patterns');
    console.log('- All components work seamlessly together for complex systems');
    console.log('- Type safety ensures reliable production deployments');
    console.log('- Zero dependencies keep your bundle lightweight');
    
  } catch (error) {
    console.error('\n❌ Example execution failed:', error);
  }
}

// Export for external usage
export {
  handlerQueueBasicExample,
  resourcePoolAdvancedExample,
  rateLimiterIteratorExample,
  comprehensiveSystemExample,
  performanceBenchmarkExample,
  runExamples
};

// Auto-run examples if this file is executed directly
if (require.main === module) {
  runExamples();
}
