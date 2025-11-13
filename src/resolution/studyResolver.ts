/**
 * Study Resolver
 * Handles study ID resolution and validation
 */

import { apiClient } from '../api/client.js';
import { studyCache } from '../api/cache.js';

export interface ResolvedStudy {
    studyId: string;
    name: string;
    description?: string;
    cancerType?: string;
    allSampleCount?: number;
}

export class StudyResolver {
    /**
     * Search for studies by keywords
     * Returns studies where any keyword matches studyId, name, description, or cancer type
     */
    async search(keywords: string[]): Promise<ResolvedStudy[]> {
        const cacheKey = `search:${keywords.join(',')}`;
        const cached = studyCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const allStudies = await apiClient.getAllStudies();

        const matches = allStudies.filter((study) => {
            const searchText = [
                study.studyId,
                study.name,
                study.description,
                study.cancerType?.name,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            return keywords.some((kw) => searchText.includes(kw.toLowerCase()));
        });

        const results = matches.map((study) => ({
            studyId: study.studyId,
            name: study.name,
            description: study.description,
            cancerType: study.cancerType?.name,
            allSampleCount: study.allSampleCount,
        }));

        studyCache.set(cacheKey, results);
        return results;
    }

    /**
     * Validate if a study ID exists
     */
    async validate(studyId: string): Promise<boolean> {
        const cacheKey = `validate:${studyId}`;
        const cached = studyCache.get(cacheKey);
        if (cached !== null) {
            return cached;
        }

        try {
            await apiClient.getStudy(studyId);
            studyCache.set(cacheKey, true);
            return true;
        } catch (error) {
            studyCache.set(cacheKey, false);
            return false;
        }
    }

    /**
     * Get study details by ID
     */
    async getById(studyId: string): Promise<ResolvedStudy> {
        const cacheKey = `study:${studyId}`;
        const cached = studyCache.get(cacheKey);
        if (cached) {
            return cached;
        }

        const study = await apiClient.getStudy(studyId);
        const result = {
            studyId: study.studyId,
            name: study.name,
            description: study.description,
            cancerType: study.cancerType?.name,
            allSampleCount: study.allSampleCount,
        };

        studyCache.set(cacheKey, result);
        return result;
    }
}

export const studyResolver = new StudyResolver();
