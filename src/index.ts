/**
 * @fileoverview Main entry point for @stevenleep/rate-limiter
 * 
 * This package provides three core utilities with iterator-first design:
 * - RateLimiter: Sliding window rate limiting with iterator protocol
 * - HandlerQueue: Concurrent task management with priority queuing
 * - ResourcePool: Generic resource lifecycle management
 * 
 * All components implement Symbol.iterator for seamless integration
 * with JavaScript's iterator protocol and functional programming patterns.
 */

// Core Rate Limiter - Sliding window algorithm with iterator support
export { RateLimiter, createRateLimiter, RateLimiterPresets } from './rateLimiter';
export type { RateLimiterConfig } from './rateLimiter';

// Handler Queue Management - Concurrent task processing with priorities
export { HandlerQueue, createHandlerQueue, HandlerQueuePresets } from './handlerQueue';
export type { HandlerQueueConfig, HandlerTask, TaskResult, TaskStatus } from './handlerQueue';

// Resource Pool Management - Generic resource lifecycle with health monitoring
export { ResourcePool, createResourcePool } from './resourcePool';
export type { ResourcePoolConfig, ResourceStatus } from './resourcePool';
