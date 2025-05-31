/**
 * @fileoverview Generic Resource Pool with Lifecycle Management
 * 
 * This module provides a generic resource pool manager with iterator support,
 * lifecycle management, and automatic cleanup. Core design principles:
 * 
 * 1. **Generic Resource Management**: Works with any resource type
 * 2. **Iterator-First Design**: Native ES6+ iteration support
 * 3. **Lifecycle Control**: Complete resource creation, validation, and cleanup
 * 4. **Auto-scaling**: Dynamic pool sizing based on demand
 * 5. **Type Safety**: Full TypeScript generics and type inference
 */

/**
 * Configuration for the resource pool
 * 
 * @template T - Type of resource being managed
 */
export interface ResourcePoolConfig<T> {
  /** Human-readable name for the pool */
  readonly name: string;
  /** Minimum number of resources to maintain */
  readonly minSize: number;
  /** Maximum number of resources allowed */
  readonly maxSize: number;
  /** Factory function to create new resources */
  readonly factory: () => Promise<T> | T;
  /** Optional validator to check resource health */
  readonly validator?: (resource: T) => Promise<boolean> | boolean;
  /** Optional destructor for resource cleanup */
  readonly destroyer?: (resource: T) => Promise<void> | void;
  /** Idle timeout in milliseconds before resource cleanup */
  readonly idleTimeout?: number;
  /** Timeout for acquiring resources in milliseconds */
  readonly acquireTimeout?: number;
}

/**
 * Possible resource states in the pool
 */
export type ResourceStatus = 'idle' | 'active' | 'creating' | 'destroying' | 'invalid';

/**
 * Internal resource record with metadata
 * 
 * @template T - Type of the managed resource
 */
export interface ResourceRecord<T> {
  /** Unique identifier for the resource */
  readonly id: string;
  /** The actual resource instance */
  readonly resource: T;
  /** Current status of the resource */
  readonly status: ResourceStatus;
  /** When the resource was created */
  readonly createdAt: number;
  /** When the resource was last used */
  readonly lastUsedAt: number;
  /** Total number of times this resource has been used */
  readonly usageCount: number;
}

/**
 * Pool status information
 */
export interface PoolStatus {
  /** Total number of resources */
  readonly total: number;
  /** Number of idle resources */
  readonly idle: number;
  /** Number of active resources */
  readonly active: number;
  /** Number of resources being created */
  readonly creating: number;
  /** Number of resources being destroyed */
  readonly destroying: number;
  /** Number of invalid resources */
  readonly invalid: number;
  /** Number of clients waiting for resources */
  readonly waiting: number;
  /** Minimum pool size */
  readonly minSize: number;
  /** Maximum pool size */
  readonly maxSize: number;
}

/**
 * Generic Resource Pool implementing iterator patterns for resource management.
 * 
 * Key Features:
 * - Generic resource type support with complete type safety
 * - Automatic resource lifecycle management (create, validate, destroy)
 * - Configurable pool sizing with auto-scaling capabilities
 * - Idle timeout and automatic cleanup of unused resources
 * - Queue management for resource acquisition during high demand
 * - Full iterator support for monitoring and debugging
 * 
 * @template T - Type of resource being managed (e.g., DatabaseConnection, FileHandle)
 * 
 * @example
 * ```typescript
 * // Database connection pool
 * const dbPool = new ResourcePool<DatabaseConnection>({
 *   name: 'database-pool',
 *   minSize: 2,
 *   maxSize: 10,
 *   factory: async () => new DatabaseConnection(),
 *   validator: async (conn) => await conn.ping(),
 *   destroyer: async (conn) => await conn.close(),
 *   idleTimeout: 300000 // 5 minutes
 * });
 * 
 * // Acquire and use resource
 * const connection = await dbPool.acquire();
 * try {
 *   const result = await connection.query('SELECT * FROM users');
 *   return result;
 * } finally {
 *   dbPool.release(connection);
 * }
 * 
 * // Monitor pool status
 * for (const record of dbPool) {
 *   console.log(`Resource ${record.id}: ${record.status}, used ${record.usageCount} times`);
 * }
 * ```
 */
export class ResourcePool<T> implements Iterable<ResourceRecord<T>> {
  private readonly config: Required<ResourcePoolConfig<T>>;
  private resources: Map<string, ResourceRecord<T>> = new Map();
  private waitingQueue: Array<{
    resolve: (resource: T) => void;
    reject: (error: Error) => void;
    timeoutId: NodeJS.Timeout;
  }> = [];
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: ResourcePoolConfig<T>) {
    this.config = {
      validator: () => true,
      destroyer: () => {},
      idleTimeout: 300000, // 5 minutes default
      acquireTimeout: 10000, // 10 seconds default
      ...config
    };

    // Start background cleanup task
    this.startCleanupTask();
    
    // Pre-create minimum resources
    this.ensureMinimumResources();
  }

  /**
   * Iterator implementation for monitoring and debugging.
   * Provides access to all resource records with their metadata.
   * 
   * @returns Iterator over resource records
   * 
   * @example
   * ```typescript
   * // Monitor resource usage
   * for (const record of pool) {
   *   if (record.usageCount > 1000) {
   *     console.log(`High-usage resource: ${record.id}`);
   *   }
   * }
   * 
   * // Functional programming style
   * const idleResources = [...pool].filter(r => r.status === 'idle');
   * const avgUsage = [...pool].reduce((sum, r) => sum + r.usageCount, 0) / pool.getStatus().total;
   * ```
   */
  [Symbol.iterator](): Iterator<ResourceRecord<T>> {
    let index = 0;
    const resources = Array.from(this.resources.values());

    return {
      next(): IteratorResult<ResourceRecord<T>> {
        if (index < resources.length) {
          return { value: resources[index++], done: false };
        }
        return { done: true, value: undefined };
      }
    };
  }

  /**
   * Acquires a resource from the pool.
   * Implements sophisticated queuing and timeout logic.
   * 
   * @returns Promise resolving to an available resource
   * @throws Error if timeout exceeded or pool closed
   * 
   * @example
   * ```typescript
   * const resource = await pool.acquire();
   * try {
   *   // Use the resource
   *   await resource.performOperation();
   * } finally {
   *   // Always release resources
   *   pool.release(resource);
   * }
   * ```
   */
  public async acquire(): Promise<T> {
    // Try to get an idle resource first
    const idleResource = this.getIdleResource();
    if (idleResource) {
      return this.activateResource(idleResource);
    }

    // If we can create a new resource, do so
    if (this.resources.size < this.config.maxSize) {
      try {
        return await this.createNewResource();
      } catch (error) {
        // Creation failed, fall through to queueing
        console.warn(`Resource creation failed: ${error}`);
      }
    }

    // No resources available, queue the request
    return this.queueResourceRequest();
  }

  /**
   * Releases a resource back to the pool.
   * Updates usage statistics and triggers cleanup if needed.
   * 
   * @param resource - The resource to release
   * 
   * @example
   * ```typescript
   * try {
   *   const resource = await pool.acquire();
   *   await resource.doWork();
   * } finally {
   *   pool.release(resource); // Always release in finally block
   * }
   * ```
   */
  public release(resource: T): void {
    const record = this.findResourceRecord(resource);
    if (!record) {
      console.warn('Attempted to release unknown resource');
      return;
    }

    // Update resource metadata
    this.updateResourceRecord(record.id, {
      status: 'idle',
      lastUsedAt: Date.now(),
      usageCount: record.usageCount + 1
    });

    // Try to fulfill any waiting requests
    this.processWaitingQueue();
  }

  /**
   * Gets comprehensive pool status information.
   * 
   * @returns Current pool status with detailed metrics
   */
  public getStatus(): PoolStatus {
    const statusCounts = Array.from(this.resources.values()).reduce(
      (acc, record) => {
        acc[record.status] = (acc[record.status] || 0) + 1;
        return acc;
      },
      {} as Record<ResourceStatus, number>
    );

    return {
      total: this.resources.size,
      idle: statusCounts.idle || 0,
      active: statusCounts.active || 0,
      creating: statusCounts.creating || 0,
      destroying: statusCounts.destroying || 0,
      invalid: statusCounts.invalid || 0,
      waiting: this.waitingQueue.length,
      minSize: this.config.minSize,
      maxSize: this.config.maxSize
    };
  }

  /**
   * Closes the pool and cleans up all resources.
   * Waits for all resources to be properly destroyed.
   * 
   * @returns Promise that resolves when cleanup is complete
   */
  public async close(): Promise<void> {
    // Stop cleanup task
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Reject all waiting requests
    this.waitingQueue.forEach(({ reject, timeoutId }) => {
      clearTimeout(timeoutId);
      reject(new Error('Resource pool is closing'));
    });
    this.waitingQueue = [];

    // Destroy all resources
    const destroyPromises = Array.from(this.resources.values()).map(
      record => this.destroyResource(record.id)
    );
    
    await Promise.all(destroyPromises);
    this.resources.clear();
  }

  /**
   * Finds an idle resource and marks it as creating a new one if none available.
   * 
   * @private
   * @returns Idle resource record or null
   */
  private getIdleResource(): ResourceRecord<T> | null {
    for (const record of this.resources.values()) {
      if (record.status === 'idle') {
        return record;
      }
    }
    return null;
  }

  /**
   * Activates an idle resource by marking it as active.
   * 
   * @private
   * @param record - Resource record to activate
   * @returns The activated resource
   */
  private activateResource(record: ResourceRecord<T>): T {
    this.updateResourceRecord(record.id, {
      status: 'active',
      lastUsedAt: Date.now()
    });
    return record.resource;
  }

  /**
   * Creates a new resource and adds it to the pool.
   * 
   * @private
   * @returns Promise resolving to the new resource
   */
  private async createNewResource(): Promise<T> {
    const id = this.generateResourceId();
    
    // Create placeholder record
    const placeholderRecord: ResourceRecord<T> = {
      id,
      resource: null as any, // Will be set when creation completes
      status: 'creating',
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      usageCount: 0
    };
    
    this.resources.set(id, placeholderRecord);

    try {
      const resource = await this.config.factory();
      
      // Validate the new resource
      const isValid = await this.config.validator(resource);
      if (!isValid) {
        throw new Error('Resource validation failed');
      }

      // Update record with actual resource
      const finalRecord: ResourceRecord<T> = {
        ...placeholderRecord,
        resource,
        status: 'active'
      };
      
      this.resources.set(id, finalRecord);
      return resource;

    } catch (error) {
      // Remove failed resource
      this.resources.delete(id);
      throw error;
    }
  }

  /**
   * Queues a resource request when none are immediately available.
   * 
   * @private
   * @returns Promise resolving to a resource when available
   */
  private queueResourceRequest(): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Remove from queue and reject
        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
        if (index !== -1) {
          this.waitingQueue.splice(index, 1);
        }
        reject(new Error(`Resource acquisition timeout after ${this.config.acquireTimeout}ms`));
      }, this.config.acquireTimeout);

      this.waitingQueue.push({ resolve, reject, timeoutId });
    });
  }

  /**
   * Processes the waiting queue when resources become available.
   * 
   * @private
   */
  private processWaitingQueue(): void {
    if (this.waitingQueue.length === 0) return;

    const idleResource = this.getIdleResource();
    if (!idleResource) return;

    const waiting = this.waitingQueue.shift();
    if (waiting) {
      clearTimeout(waiting.timeoutId);
      const resource = this.activateResource(idleResource);
      waiting.resolve(resource);
    }
  }

  /**
   * Finds the resource record for a given resource instance.
   * 
   * @private
   * @param resource - Resource instance to find
   * @returns Resource record or null if not found
   */
  private findResourceRecord(resource: T): ResourceRecord<T> | null {
    for (const record of this.resources.values()) {
      if (record.resource === resource) {
        return record;
      }
    }
    return null;
  }

  /**
   * Updates a resource record with new metadata.
   * 
   * @private
   * @param id - Resource ID
   * @param updates - Partial updates to apply
   */
  private updateResourceRecord(
    id: string, 
    updates: Partial<Omit<ResourceRecord<T>, 'id' | 'resource'>>
  ): void {
    const current = this.resources.get(id);
    if (current) {
      this.resources.set(id, { ...current, ...updates });
    }
  }

  /**
   * Ensures minimum number of resources are available.
   * 
   * @private
   */
  private async ensureMinimumResources(): Promise<void> {
    const needed = this.config.minSize - this.resources.size;
    if (needed <= 0) return;

    const creationPromises = Array.from({ length: needed }, () => 
      this.createNewResource().then(resource => this.release(resource)).catch(() => {})
    );

    await Promise.all(creationPromises);
  }

  /**
   * Starts the background cleanup task for idle resources.
   * 
   * @private
   */
  private startCleanupTask(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleResources();
    }, Math.min(this.config.idleTimeout / 4, 30000)); // Check every 30s or 1/4 idle timeout
  }

  /**
   * Cleans up idle resources that have exceeded the timeout.
   * 
   * @private
   */
  private cleanupIdleResources(): void {
    const now = Date.now();
    const cutoff = now - this.config.idleTimeout;

    for (const record of this.resources.values()) {
      if (
        record.status === 'idle' &&
        record.lastUsedAt < cutoff &&
        this.resources.size > this.config.minSize
      ) {
        this.destroyResource(record.id);
      }
    }
  }

  /**
   * Destroys a resource and removes it from the pool.
   * 
   * @private
   * @param id - Resource ID to destroy
   */
  private async destroyResource(id: string): Promise<void> {
    const record = this.resources.get(id);
    if (!record) return;

    this.updateResourceRecord(id, { status: 'destroying' });

    try {
      await this.config.destroyer(record.resource);
    } catch (error) {
      console.warn(`Error destroying resource ${id}:`, error);
    } finally {
      this.resources.delete(id);
    }
  }

  /**
   * Generates unique resource identifiers.
   * 
   * @private
   * @returns Unique resource ID
   */
  private generateResourceId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}

/**
 * Factory function for creating resource pool instances.
 * Promotes functional programming and immutability patterns.
 * 
 * @template T - Resource type
 * @param config - Pool configuration
 * @returns New ResourcePool instance
 */
export function createResourcePool<T>(config: ResourcePoolConfig<T>): ResourcePool<T> {
  return new ResourcePool<T>(config);
}

/**
 * Pre-configured resource pool presets for common scenarios.
 */
export const ResourcePoolPresets = {
  /** Small pool for lightweight resources */
  small: { minSize: 1, maxSize: 5, idleTimeout: 60000, acquireTimeout: 5000 },
  
  /** Medium pool for general use */
  medium: { minSize: 2, maxSize: 10, idleTimeout: 300000, acquireTimeout: 10000 },
  
  /** Large pool for high-demand scenarios */
  large: { minSize: 5, maxSize: 25, idleTimeout: 600000, acquireTimeout: 15000 },
  
  /** Database connection pool settings */
  database: { minSize: 2, maxSize: 20, idleTimeout: 1800000, acquireTimeout: 30000 },
  
  /** File handle pool settings */
  fileSystem: { minSize: 1, maxSize: 50, idleTimeout: 120000, acquireTimeout: 5000 }
} as const;

/**
 * Type for resource pool preset keys
 */
export type ResourcePoolPresetKey = keyof typeof ResourcePoolPresets;
