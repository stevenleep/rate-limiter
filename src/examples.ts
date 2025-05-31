/**
 * @fileoverview Examples for @stevenleep/rate-limiter
 * 
 * Demonstrates practical usage of RateLimiter, HandlerQueue, and ResourcePool
 * with iterator protocol support.
 */

import { 
  createRateLimiter, 
  RateLimiterPresets,
  createHandlerQueue,
  HandlerQueuePresets,
  createResourcePool
} from './index';

// 1. Handler Queue Example
async function handlerQueueExample() {
  console.log('=== Handler Queue Example ===');
  
  const queue = createHandlerQueue(HandlerQueuePresets.standard);
  
  // Add tasks with different priorities
  const tasks = [];
  for (let i = 1; i <= 5; i++) {
    const taskId = await queue.addTask({
      handler: async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return `Task ${i} completed`;
      },
      priority: i % 3,
      data: { taskNumber: i }
    });
    tasks.push(taskId);
  }
  
  // Monitor tasks using iterator
  for (const task of queue) {
    console.log(`Task ${task.id}: priority=${task.priority}`);
  }
  
  await queue.waitForAll();
  console.log('All tasks completed!');
}

// 2. Resource Pool Example
async function resourcePoolExample() {
  console.log('\n=== Resource Pool Example ===');
  
  // Simulate database connection pool
  let connectionCounter = 0;
  
  const dbPool = createResourcePool({
    name: 'database-connections',
    minSize: 2,
    maxSize: 4,
    factory: async () => {
      connectionCounter++;
      return {
        id: connectionCounter,
        query: async (sql: string) => `Result for: ${sql}`,
        ping: async () => true,
        close: async () => console.log(`Connection ${connectionCounter} closed`)
      };
    },
    validator: async (conn) => await conn.ping(),
    destroyer: async (conn) => await conn.close()
  });
  
  // Simulate concurrent operations
  const operations = [];
  for (let i = 1; i <= 3; i++) {
    operations.push(
      (async () => {
        const connection = await dbPool.acquire();
        const result = await connection.query(`SELECT * FROM table_${i}`);
        console.log(`Operation ${i}: ${result}`);
        await new Promise(resolve => setTimeout(resolve, 500));
        dbPool.release(connection);
      })()
    );
  }
  
  await Promise.all(operations);
  await dbPool.close();
  console.log('Pool operations completed');
}

// 3. Rate Limiter Example
async function rateLimiterExample() {
  console.log('\n=== Rate Limiter Example ===');
  
  const limiter = createRateLimiter(RateLimiterPresets.perSecond10);
  
  // Generate multiple requests
  for (let i = 1; i <= 12; i++) {
    const allowed = limiter.isAllowed(`user-${Math.floor(i / 3)}`);
    console.log(`Request ${i}: ${allowed ? '✅ Allowed' : '❌ Blocked'}`);
    
    // Show current state using iterator
    if (i % 4 === 0) {
      const activeRequests = [...limiter];
      console.log(`Active requests: ${activeRequests.length}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// 4. System Integration Example
async function systemIntegrationExample() {
  console.log('\n=== System Integration Example ===');
  
  // API Gateway with all three components
  class ApiGateway {
    private rateLimiter = createRateLimiter(RateLimiterPresets.perMinute100);
    private taskQueue = createHandlerQueue(HandlerQueuePresets.standard);
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
      if (!this.rateLimiter.isAllowed(userId)) {
        throw new Error(`Rate limit exceeded for user ${userId}`);
      }

      return await this.taskQueue.addTask({
        handler: async () => {
          const dbConnection = await this.dbPool.acquire();
          try {
            const result = await dbConnection.query(endpoint);
            return { endpoint, result, timestamp: Date.now() };
          } finally {
            this.dbPool.release(dbConnection);
          }
        },
        priority: endpoint.includes('urgent') ? 10 : 5,
        data: { userId, endpoint }
      });
    }

    getSystemHealth() {
      return {
        activeRateLimits: [...this.rateLimiter].length,
        totalTasks: [...this.taskQueue].length,
        poolRecords: [...this.dbPool].length
      };
    }

    async shutdown() {
      await this.taskQueue.waitForAll();
      await this.dbPool.close();
    }
  }

  const gateway = new ApiGateway();
  
  // Simulate API requests
  const requests = [
    { userId: 'user1', endpoint: '/api/data' },
    { userId: 'user1', endpoint: '/api/urgent/report' },
    { userId: 'user2', endpoint: '/api/stats' },
    { userId: 'user3', endpoint: '/api/data' },
  ];

  await Promise.allSettled(
    requests.map(async (req, index) => {
      try {
        const taskId = await gateway.handleApiRequest(req.userId, req.endpoint);
        console.log(`Request ${index + 1} queued: ${taskId}`);
        return taskId;
      } catch (error) {
        console.log(`Request ${index + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        return null;
      }
    })
  );

  console.log('System Health:', gateway.getSystemHealth());
  await new Promise(resolve => setTimeout(resolve, 1000));
  await gateway.shutdown();
}

// Main execution function
async function runExamples() {
  console.log('🚀 @stevenleep/rate-limiter - Examples\n');

  try {
    await handlerQueueExample();
    await resourcePoolExample();
    await rateLimiterExample();
    await systemIntegrationExample();
    
    console.log('\n✅ All examples completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Example execution failed:', error);
  }
}

// Export for external usage
export {
  handlerQueueExample,
  resourcePoolExample,
  rateLimiterExample,
  systemIntegrationExample,
  runExamples
};

// Auto-run examples if this file is executed directly
if (require.main === module) {
  runExamples();
}
