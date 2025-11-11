/**
 * Gene Resolver
 * Handles gene symbol validation
 */

import { apiClient } from '../api/client.js';
import { geneCache } from '../api/cache.js';

export class GeneResolver {
    /**
     * Validate if a gene symbol exists
     */
    async validate(geneSymbol: string): Promise<boolean> {
        const normalizedSymbol = geneSymbol.toUpperCase();

        // Check cache first
        const cached = geneCache.get(normalizedSymbol);
        if (cached !== null) {
            return cached;
        }

        try {
            await apiClient.getGene(normalizedSymbol);
            geneCache.set(normalizedSymbol, true);
            return true;
        } catch (error) {
            geneCache.set(normalizedSymbol, false);
            return false;
        }
    }

    /**
     * Validate multiple gene symbols
     * Returns only the valid genes
     */
    async validateBatch(geneSymbols: string[]): Promise<string[]> {
        const results = await Promise.all(
            geneSymbols.map(async gene => {
                const normalized = gene.toUpperCase();
                const isValid = await this.validate(normalized);
                return isValid ? normalized : null;
            })
        );

        return results.filter((g): g is string => g !== null);
    }

    /**
     * Get gene details
     */
    async getGeneInfo(geneSymbol: string) {
        const normalized = geneSymbol.toUpperCase();
        return await apiClient.getGene(normalized);
    }
}

export const geneResolver = new GeneResolver();
