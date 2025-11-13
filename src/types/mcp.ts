/**
 * MCP Tool input/output type definitions
 */

import type { AlterationType } from '../resolution/profileResolver.js';

export type TargetPage = 'study' | 'patient' | 'results';

/**
 * Input for resolve_and_build_url tool
 */
export interface ResolveAndBuildUrlInput {
    targetPage: TargetPage;
    parameters: {
        // Study-related
        studyKeywords?: string[];
        studyId?: string;

        // Patient-related
        patientId?: string;
        sampleId?: string;

        // Query/Results-related
        genes?: string[];
        alterations?: AlterationType[];
        caseSetId?: string;

        // Common
        tab?: string;
        filters?: Record<string, any>;
        options?: Record<string, any>;
    };
}

/**
 * Success response
 */
export interface SuccessResponse {
    success: true;
    url: string;
    metadata?: {
        studyId?: string;
        studyName?: string;
        genes?: string[];
        caseSetId?: string;
        [key: string]: any;
    };
}

/**
 * Error response
 */
export interface ErrorResponse {
    success: false;
    error: string;
    details?: any;
}

/**
 * Clarification needed response (when multiple matches found)
 */
export interface ClarificationResponse {
    success: false;
    needsSelection: true;
    message: string;
    options: Array<{
        studyId: string;
        name: string;
        description?: string;
        sampleCount?: number;
    }>;
    context?: any;
}

/**
 * Union type for all possible responses
 */
export type ResolveAndBuildUrlResponse =
    | SuccessResponse
    | ErrorResponse
    | ClarificationResponse;
