<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# TypeScript Rate Limiter Project Instructions

This project implements a generic rate limiter using TypeScript with default iterators.

## Key Design Principles
- Use TypeScript default iterator pattern (`Symbol.iterator`)
- Implement sliding window rate limiting algorithm
- Provide clean, type-safe APIs
- Support both manual iteration and for...of loops
- Follow functional programming principles where possible

## Code Style Guidelines
- Use descriptive variable and function names in Chinese comments for clarity
- Implement proper error handling with typed errors
- Prefer composition over inheritance
- Use readonly properties where appropriate
- Include comprehensive JSDoc documentation

## Architecture Notes
- The `RateLimiter` class implements `Iterable<RequestRecord>`
- Request cleanup uses iterator pattern for filtering expired records
- Factory functions provide convenient instantiation
- Preset configurations for common use cases
- Support for dynamic configuration updates
