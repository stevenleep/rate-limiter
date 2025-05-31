/**
 * @fileoverview Generic Handler Queue with Concurrency Control
 * 
 * This module provides a generic task queue manager with priority support,
 * concurrency control, and native iterator patterns. Design principles:
 * 
 * 1. **Generic by Design**: Works with any task type and return type
 * 2. **Iterator-First**: Full ES6+ iteration protocol support
 * 3. **Concurrency Control**: Precise control over parallel execution
 * 4. **Priority Queue**: Built-in priority-based task scheduling
 * 5. **Type Safety**: Complete TypeScript generics and inference
 */

/**
 * Configuration for the handler queue
 */
export interface HandlerQueueConfig {
  /** Maximum number of concurrent handlers */
  readonly maxConcurrent: number;
  /** Maximum queue size, rejects new tasks when exceeded */
  readonly maxQueueSize?: number;
  /** Task timeout in milliseconds */
  readonly timeout?: number;
}

/**
 * Represents a task in the handler queue
 * 
 * @template T - Type of data passed to the handler
 * @template R - Type of result returned by the handler
 */
export interface HandlerTask<T = any, R = any> {
  /** Unique task identifier */
  readonly id: string;
  /** The handler function to execute */
  readonly handler: () => Promise<R> | R;
  /** Optional data associated with the task */
  readonly data?: T;
  /** Task priority (higher numbers = higher priority) */
  readonly priority?: number;
  /** Timestamp when task was created */
  readonly createdAt: number;
}

/**
 * Possible task execution states
 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'timeout';

/**
 * Result of task execution with metadata
 * 
 * @template R - Type of result returned by the handler
 */
export interface TaskResult<R = any> {
  /** Task identifier */
  readonly id: string;
  /** Final status of the task */
  readonly status: TaskStatus;
  /** Result value (if successful) */
  readonly result?: R;
  /** Error information (if failed) */
  readonly error?: Error;
  /** When task execution started */
  readonly startTime?: number;
  /** When task execution ended */
  readonly endTime?: number;
  /** Total execution duration in milliseconds */
  readonly duration?: number;
}

/**
 * Queue status information
 */
export interface QueueStatus {
  /** Number of pending tasks */
  readonly pending: number;
  /** Number of currently running tasks */
  readonly running: number;
  /** Number of completed tasks */
  readonly completed: number;
  /** Maximum concurrent tasks allowed */
  readonly maxConcurrent: number;
  /** Maximum queue size */
  readonly maxQueueSize: number;
}

/**
 * Generic Handler Queue implementing iterator patterns for task management.
 * 
 * Key Features:
 * - Generic task and result types for complete type safety
 * - Priority-based task scheduling (higher priority = executed first)
 * - Configurable concurrency limits
 * - Timeout handling with automatic cleanup
 * - Full iterator support for functional programming patterns
 * 
 * @template T - Type of data passed to handlers
 * @template R - Type of results returned by handlers
 * 
 * @example
 * ```typescript
 * const queue = new HandlerQueue<RequestData, ResponseData>({
 *   maxConcurrent: 5,
 *   maxQueueSize: 100,
 *   timeout: 30000
 * });
 * 
 * // Add a task
 * const taskId = await queue.addTask({
 *   handler: async () => await processData(),
 *   priority: 1,
 *   data: { userId: '123' }
 * });
 * 
 * // Use iterator patterns
 * for (const task of queue) {
 *   console.log(`Task ${task.id} - Priority: ${task.priority}`);
 * }
 * 
 * // Functional style
 * const highPriorityTasks = [...queue].filter(t => t.priority > 5);
 * ```
 */
export class HandlerQueue<T = any, R = any> implements Iterable<HandlerTask<T, R>> {
  private readonly config: Required<HandlerQueueConfig>;
  private pendingTasks: HandlerTask<T, R>[] = [];
  private runningTasks: Map<string, HandlerTask<T, R>> = new Map();
  private completedTasks: Map<string, TaskResult<R>> = new Map();
  private taskCounter = 0;

  constructor(config: HandlerQueueConfig) {
    this.config = {
      maxQueueSize: 100,
      timeout: 30000,
      ...config
    };
  }

  /**
   * Iterator implementation for native iteration support.
   * Iterates over all tasks (pending + running) in priority order.
   * 
   * @returns Iterator over handler tasks
   */
  [Symbol.iterator](): Iterator<HandlerTask<T, R>> {
    // Combine pending and running tasks, sort by priority
    const allTasks = [
      ...this.pendingTasks,
      ...Array.from(this.runningTasks.values())
    ].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    let index = 0;
    return {
      next(): IteratorResult<HandlerTask<T, R>> {
        if (index < allTasks.length) {
          return { value: allTasks[index++], done: false };
        }
        return { done: true, value: undefined };
      }
    };
  }

  /**
   * Adds a new task to the queue with automatic priority sorting.
   * 
   * @param taskInput - Task configuration without id and createdAt
   * @returns Promise resolving to the task ID
   * @throws Error if queue is full
   * 
   * @example
   * ```typescript
   * const taskId = await queue.addTask({
   *   handler: async () => {
   *     const result = await someAsyncOperation();
   *     return result;
   *   },
   *   priority: 5,
   *   data: { context: 'important task' }
   * });
   * ```
   */
  public async addTask(
    taskInput: Omit<HandlerTask<T, R>, 'id' | 'createdAt'>
  ): Promise<string> {
    if (this.pendingTasks.length >= this.config.maxQueueSize) {
      throw new Error(`Queue is full (max: ${this.config.maxQueueSize})`);
    }

    const task: HandlerTask<T, R> = {
      id: this.generateTaskId(),
      createdAt: Date.now(),
      priority: 0,
      ...taskInput
    };

    // Insert task in priority order (higher priority first)
    const insertIndex = this.pendingTasks.findIndex(
      t => (t.priority || 0) < (task.priority || 0)
    );

    if (insertIndex === -1) {
      this.pendingTasks.push(task);
    } else {
      this.pendingTasks.splice(insertIndex, 0, task);
    }

    // Try to start execution immediately if capacity available
    this.processNextTask();

    return task.id;
  }

  /**
   * Gets the current status of a specific task.
   * 
   * @param taskId - The task identifier
   * @returns Current task status or undefined if not found
   */
  public getTaskStatus(taskId: string): TaskStatus | undefined {
    if (this.runningTasks.has(taskId)) return 'running';
    if (this.completedTasks.has(taskId)) return this.completedTasks.get(taskId)!.status;
    if (this.pendingTasks.some(t => t.id === taskId)) return 'pending';
    return undefined;
  }

  /**
   * Gets the result of a completed task.
   * 
   * @param taskId - The task identifier
   * @returns Task result or undefined if not completed
   */
  public getTaskResult(taskId: string): TaskResult<R> | undefined {
    return this.completedTasks.get(taskId);
  }

  /**
   * Waits for all currently queued and running tasks to complete.
   * Uses functional programming patterns for elegant async handling.
   * 
   * @returns Promise that resolves when all tasks are done
   * 
   * @example
   * ```typescript
   * // Add multiple tasks
   * await Promise.all([
   *   queue.addTask({ handler: task1 }),
   *   queue.addTask({ handler: task2 }),
   *   queue.addTask({ handler: task3 })
   * ]);
   * 
   * // Wait for all to complete
   * await queue.waitForAll();
   * console.log('All tasks completed!');
   * ```
   */
  public async waitForAll(): Promise<void> {
    while (this.pendingTasks.length > 0 || this.runningTasks.size > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }

  /**
   * Gets comprehensive queue status information.
   * 
   * @returns Current queue status
   */
  public getStatus(): QueueStatus {
    return {
      pending: this.pendingTasks.length,
      running: this.runningTasks.size,
      completed: this.completedTasks.size,
      maxConcurrent: this.config.maxConcurrent,
      maxQueueSize: this.config.maxQueueSize
    };
  }

  /**
   * Clears all tasks and resets the queue state.
   * Running tasks will continue but won't be tracked.
   */
  public clear(): void {
    this.pendingTasks = [];
    this.runningTasks.clear();
    this.completedTasks.clear();
  }

  /**
   * Processes the next pending task if concurrency limit allows.
   * Uses recursive pattern for continuous processing.
   * 
   * @private
   */
  private processNextTask(): void {
    if (this.runningTasks.size >= this.config.maxConcurrent) {
      return; // Concurrency limit reached
    }

    const task = this.pendingTasks.shift();
    if (!task) {
      return; // No pending tasks
    }

    this.runningTasks.set(task.id, task);
    this.executeTask(task);
  }

  /**
   * Executes a single task with timeout and error handling.
   * Demonstrates robust async pattern handling.
   * 
   * @private
   * @param task - Task to execute
   */
  private async executeTask(task: HandlerTask<T, R>): Promise<void> {
    const startTime = Date.now();
    let timeoutId: NodeJS.Timeout | undefined;

    try {
      // Set up timeout if configured
      const timeoutPromise = this.config.timeout
        ? new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error(`Task ${task.id} timed out after ${this.config.timeout}ms`));
            }, this.config.timeout);
          })
        : new Promise<never>(() => {}); // Never resolves

      // Race between task execution and timeout
      const result = await Promise.race([
        Promise.resolve(task.handler()),
        timeoutPromise
      ]);

      // Task completed successfully
      const endTime = Date.now();
      this.completedTasks.set(task.id, {
        id: task.id,
        status: 'completed',
        result,
        startTime,
        endTime,
        duration: endTime - startTime
      });

    } catch (error) {
      // Task failed or timed out
      const endTime = Date.now();
      const isTimeout = error instanceof Error && error.message.includes('timed out');
      
      this.completedTasks.set(task.id, {
        id: task.id,
        status: isTimeout ? 'timeout' : 'failed',
        error: error instanceof Error ? error : new Error(String(error)),
        startTime,
        endTime,
        duration: endTime - startTime
      });

    } finally {
      // Cleanup
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      this.runningTasks.delete(task.id);
      
      // Process next task if any pending
      this.processNextTask();
    }
  }

  /**
   * Generates unique task identifiers.
   * 
   * @private
   * @returns Unique task ID
   */
  private generateTaskId(): string {
    const timestamp = Date.now();
    const counter = (++this.taskCounter).toString().padStart(4, '0');
    const random = Math.random().toString(36).substr(2, 9);
    return `task_${timestamp}_${random}`;
  }
}

/**
 * Factory function for creating handler queue instances.
 * Promotes functional programming and immutability patterns.
 * 
 * @template T - Task data type
 * @template R - Task result type
 * @param config - Queue configuration
 * @returns New HandlerQueue instance
 */
export function createHandlerQueue<T = any, R = any>(
  config: HandlerQueueConfig
): HandlerQueue<T, R> {
  return new HandlerQueue<T, R>(config);
}

/**
 * Pre-configured handler queue presets for common scenarios.
 */
export const HandlerQueuePresets = {
  /** Low concurrency for CPU-intensive tasks */
  lowConcurrency: { maxConcurrent: 2, maxQueueSize: 50, timeout: 60000 },
  
  /** Standard configuration for general use */
  standard: { maxConcurrent: 5, maxQueueSize: 100, timeout: 30000 },
  
  /** High concurrency for I/O-bound tasks */
  highConcurrency: { maxConcurrent: 20, maxQueueSize: 200, timeout: 15000 },
  
  /** Batch processing configuration */
  batch: { maxConcurrent: 10, maxQueueSize: 1000, timeout: 120000 },
  
  /** Real-time processing with strict limits */
  realtime: { maxConcurrent: 3, maxQueueSize: 20, timeout: 5000 }
} as const;

/**
 * Type for handler queue preset keys
 */
export type HandlerQueuePresetKey = keyof typeof HandlerQueuePresets;
