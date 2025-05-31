/**
 * @fileoverview Generic Rate Limiter with Native Iterator Support
 * 
 * This module implements a sliding window rate limiter using TypeScript's 
 * native iterator patterns. The design philosophy emphasizes:
 * 
 * 1. **Iterator-First Design**: Full support for ES6+ iteration protocols
 * 2. **Functional Programming**: Composable and chainable operations
 * 3. **Type Safety**: Complete TypeScript generics and type inference
 * 4. **Zero Dependencies**: Pure TypeScript implementation
 * 5. **Performance**: Efficient sliding window with automatic cleanup
 */

/**
 * Configuration interface for the rate limiter
 */
export interface RateLimiterConfig {
  /** Time window size in milliseconds */
  readonly windowSize: number;
  /** Maximum number of requests allowed within the window */
  readonly maxRequests: number;
}

/**
 * Represents a single request record in the sliding window
 */
export interface RequestRecord {
  /** Unique identifier for the request */
  readonly id: string;
  /** Timestamp when the request was made */
  readonly timestamp: number;
}

/**
 * Generic Rate Limiter implementing native TypeScript iterator patterns.
 * 
 * Key Design Features:
 * - Implements `Iterable<RequestRecord>` for native iteration support
 * - Uses sliding window algorithm for precise rate limiting
 * - Automatic cleanup of expired requests using iterator patterns
 * - Supports all ES6+ iteration methods (for...of, destructuring, spread)
 * 
 * @example
 * ```typescript
 * const limiter = new RateLimiter({ windowSize: 1000, maxRequests: 5 });
 * 
 * // Check if request is allowed
 * if (limiter.isAllowed('user-123')) {
 *   console.log('Request approved');
 * }
 * 
 * // Use iterator patterns
 * for (const request of limiter) {
 *   console.log(`Request ${request.id} at ${request.timestamp}`);
 * }
 * 
 * // Functional programming style
 * const recentRequests = [...limiter].filter(r => r.timestamp > Date.now() - 500);
 * ```
 */
export class RateLimiter implements Iterable<RequestRecord> {
  private config: RateLimiterConfig;
  private requests: RequestRecord[] = [];

  constructor(config: RateLimiterConfig) {
    this.config = { ...config };
  }

  /**
   * Default iterator implementation for native iteration support.
   * 
   * This enables:
   * - for...of loops: `for (const request of limiter) { ... }`
   * - Array destructuring: `const [first, second] = limiter`
   * - Spread operator: `const all = [...limiter]`
   * - Array.from(): `Array.from(limiter)`
   * 
   * @returns Iterator over current request records
   */
  [Symbol.iterator](): Iterator<RequestRecord> {
    let index = 0;
    const requests = this.requests;

    return {
      next(): IteratorResult<RequestRecord> {
        if (index < requests.length) {
          return { value: requests[index++], done: false };
        }
        return { done: true, value: undefined };
      }
    };
  }

  /**
   * Removes expired requests from the sliding window using iterator patterns.
   * This method demonstrates the power of functional programming with iterators.
   * 
   * @private
   */
  private cleanupExpiredRequests(): void {
    const now = Date.now();
    const cutoff = now - this.config.windowSize;
    
    // Use iterator pattern for filtering expired requests
    const validRequests: RequestRecord[] = [];
    for (const request of this) {
      if (request.timestamp > cutoff) {
        validRequests.push(request);
      }
    }
    this.requests = validRequests;
  }

  /**
   * Checks if a new request is allowed within the current rate limit.
   * 
   * @param requestId - Optional unique identifier for the request
   * @returns true if request is allowed, false if rate limited
   * 
   * @example
   * ```typescript
   * if (limiter.isAllowed('user-123')) {
   *   // Process the request
   *   await handleRequest();
   * } else {
   *   // Handle rate limiting
   *   throw new Error('Rate limit exceeded');
   * }
   * ```
   */
  public isAllowed(requestId: string = this.generateId()): boolean {
    this.cleanupExpiredRequests();
    
    if (this.requests.length < this.config.maxRequests) {
      this.requests.push({
        timestamp: Date.now(),
        id: requestId
      });
      return true;
    }
    
    return false;
  }

  /**
   * Gets the current number of requests in the sliding window.
   * 
   * @returns Current request count
   */
  public getCurrentRequestCount(): number {
    this.cleanupExpiredRequests();
    return this.requests.length;
  }

  /**
   * Gets the number of remaining requests allowed in the current window.
   * 
   * @returns Number of remaining requests
   */
  public getRemainingRequests(): number {
    return Math.max(0, this.config.maxRequests - this.getCurrentRequestCount());
  }

  /**
   * Calculates time until the next request will be allowed.
   * Uses iterator patterns to find the earliest request efficiently.
   * 
   * @returns Time in milliseconds until next request is allowed (0 if immediate)
   */
  public getTimeUntilNextRequest(): number {
    this.cleanupExpiredRequests();
    
    if (this.requests.length < this.config.maxRequests) {
      return 0;
    }
    
    // Find the earliest request using iterator
    let earliestTimestamp = Number.MAX_SAFE_INTEGER;
    for (const request of this) {
      if (request.timestamp < earliestTimestamp) {
        earliestTimestamp = request.timestamp;
      }
    }
    
    return Math.max(0, (earliestTimestamp + this.config.windowSize) - Date.now());
  }

  /**
   * Gets an iterator over all request records (useful for debugging).
   * 
   * @returns Iterator over request records
   * @deprecated Use direct iteration instead: `for (const request of limiter)`
   */
  public getRequestsIterator(): Iterator<RequestRecord> {
    return this[Symbol.iterator]();
  }

  /**
   * Generates a unique identifier for requests.
   * 
   * @private
   * @returns Unique string identifier
   */
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  /**
   * Resets the rate limiter by clearing all request records.
   */
  public reset(): void {
    this.requests = [];
  }

  /**
   * Updates the rate limiter configuration dynamically.
   * 
   * @param config - Partial configuration to update
   * 
   * @example
   * ```typescript
   * // Increase rate limit during peak hours
   * limiter.updateConfig({ maxRequests: 100 });
   * 
   * // Decrease window size for stricter limiting
   * limiter.updateConfig({ windowSize: 500 });
   * ```
   */
  public updateConfig(config: Partial<RateLimiterConfig>): void {
    this.config = { ...this.config, ...config };
    this.cleanupExpiredRequests();
  }

  /**
   * Gets a read-only copy of the current configuration.
   * 
   * @returns Current rate limiter configuration
   */
  public getConfig(): Readonly<RateLimiterConfig> {
    return { ...this.config };
  }
}

/**
 * Factory function for creating rate limiter instances.
 * Promotes functional programming patterns and immutability.
 * 
 * @param config - Rate limiter configuration
 * @returns New RateLimiter instance
 * 
 * @example
 * ```typescript
 * const limiter = createRateLimiter({ windowSize: 1000, maxRequests: 5 });
 * ```
 */
export function createRateLimiter(config: RateLimiterConfig): RateLimiter {
  return new RateLimiter(config);
}

/**
 * Pre-configured rate limiter presets for common use cases.
 * These demonstrate the flexibility and reusability of the rate limiter.
 */
export const RateLimiterPresets = {
  /** 5 requests per second - suitable for API endpoints */
  perSecond5: { windowSize: 1000, maxRequests: 5 },
  
  /** 10 requests per second - moderate API usage */
  perSecond10: { windowSize: 1000, maxRequests: 10 },
  
  /** 100 requests per minute - user-level limiting */
  perMinute100: { windowSize: 60000, maxRequests: 100 },
  
  /** 1000 requests per hour - application-level limiting */
  perHour1000: { windowSize: 3600000, maxRequests: 1000 },
  
  /** Very strict limiting - 1 request per second */
  strict: { windowSize: 1000, maxRequests: 1 },
  
  /** Generous limiting - 1000 requests per minute */
  generous: { windowSize: 60000, maxRequests: 1000 }
} as const;

/**
 * Type for rate limiter preset keys
 */
export type RateLimiterPresetKey = keyof typeof RateLimiterPresets;
