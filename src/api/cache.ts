/**
 * Simple in-memory cache for API responses
 * Helps reduce API calls for frequently accessed data
 */

interface CacheEntry<T> {
    value: T;
    timestamp: number;
}

export class SimpleCache<T> {
    private cache: Map<string, CacheEntry<T>> = new Map();
    private ttl: number; // Time to live in milliseconds

    constructor(ttlMinutes: number = 60) {
        this.ttl = ttlMinutes * 60 * 1000;
    }

    set(key: string, value: T): void {
        this.cache.set(key, {
            value,
            timestamp: Date.now(),
        });
    }

    get(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check if expired
        if (Date.now() - entry.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return entry.value;
    }

    has(key: string): boolean {
        return this.get(key) !== null;
    }

    clear(): void {
        this.cache.clear();
    }

    size(): number {
        return this.cache.size;
    }
}

// Cache instances for different data types
export const geneCache = new SimpleCache<boolean>(60); // Cache gene validation for 60 minutes
export const studyCache = new SimpleCache<any>(30); // Cache study data for 30 minutes
export const profileCache = new SimpleCache<any>(30); // Cache molecular profiles for 30 minutes
