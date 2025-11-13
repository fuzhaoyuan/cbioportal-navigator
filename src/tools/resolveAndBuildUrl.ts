/**
 * MCP Tool: resolve_and_build_url
 * Main tool that resolves parameters and builds cBioPortal URLs
 */

import { z } from 'zod';
import { studyResolver } from '../resolution/studyResolver.js';
import { geneResolver } from '../resolution/geneResolver.js';
import {
    profileResolver,
    type AlterationType,
} from '../resolution/profileResolver.js';
import { buildStudyUrl } from '../urlBuilders/study.js';
import { buildPatientUrl } from '../urlBuilders/patient.js';
import { buildResultsUrl } from '../urlBuilders/results.js';

/**
 * Tool definition for MCP registration
 */
export const resolveAndBuildUrlTool = {
    name: 'resolve_and_build_url',
    title: 'Resolve and Build cBioPortal URL',
    description: `Resolve parameters and build a cBioPortal URL from structured input.

This is the main tool for generating cBioPortal URLs. It accepts structured parameters
extracted from user queries and:
1. Resolves/validates parameters against the cBioPortal database
2. Handles ambiguity (returns options if multiple matches found)
3. Infers missing required parameters
4. Builds the final URL

IMPORTANT: This tool expects structured input, not raw natural language.
You should extract entities from the user's query first, then call this tool.

Response Format:
- Success: { "success": true, "url": "...", "metadata": {...} }
- Ambiguity: { "success": false, "needsSelection": true, "message": "...", "options": [...] }
- Error: { "success": false, "error": "...", "details": {...} }

Examples:

1. Results page with keywords:
   { "targetPage": "results", "parameters": { "studyKeywords": ["TCGA", "lung"], "genes": ["TP53"] } }

2. Study view:
   { "targetPage": "study", "parameters": { "studyId": "luad_tcga" } }

3. Patient view:
   { "targetPage": "patient", "parameters": { "studyId": "luad_tcga", "patientId": "TCGA-001" } }`,
    inputSchema: {
        targetPage: z
            .enum(['study', 'patient', 'results'])
            .describe('The type of cBioPortal page to navigate to'),
        parameters: z
            .object({
                studyKeywords: z
                    .array(z.string())
                    .optional()
                    .describe(
                        'Keywords to search for studies (e.g., ["TCGA", "lung"])'
                    ),
                studyId: z
                    .string()
                    .optional()
                    .describe('Direct study ID (skips search if provided)'),
                patientId: z
                    .string()
                    .optional()
                    .describe('Patient/case identifier'),
                sampleId: z.string().optional().describe('Sample identifier'),
                genes: z
                    .array(z.string())
                    .optional()
                    .describe('Gene symbols (e.g., ["TP53", "KRAS"])'),
                alterations: z
                    .array(z.string())
                    .optional()
                    .describe(
                        'Alteration types: mutation, cna, fusion, mrna, protein'
                    ),
                caseSetId: z
                    .string()
                    .optional()
                    .describe(
                        'Case set ID (optional, will be inferred if not provided)'
                    ),
                tab: z
                    .string()
                    .optional()
                    .describe('Specific tab to navigate to'),
                filters: z
                    .record(z.any())
                    .optional()
                    .describe('Additional filters'),
            })
            .describe('Parameters for URL building'),
    },
};

// Infer type from Zod schema
type ToolInput = {
    targetPage: z.infer<typeof resolveAndBuildUrlTool.inputSchema.targetPage>;
    parameters: z.infer<typeof resolveAndBuildUrlTool.inputSchema.parameters>;
};

/**
 * Tool handler for MCP
 */
export async function handleResolveAndBuildUrl(input: ToolInput) {
    try {
        const result = await resolveAndBuildUrl(input);
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(result, null, 2),
                },
            ],
        };
    } catch (error) {
        const errorResponse = {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Unknown error occurred',
            details: error,
        };
        return {
            content: [
                {
                    type: 'text' as const,
                    text: JSON.stringify(errorResponse, null, 2),
                },
            ],
        };
    }
}

/**
 * Main resolution logic
 */
async function resolveAndBuildUrl(input: ToolInput) {
    const { targetPage, parameters } = input;

    switch (targetPage) {
        case 'study':
            return await handleStudyPage(parameters);
        case 'patient':
            return await handlePatientPage(parameters);
        case 'results':
            return await handleResultsPage(parameters);
        default:
            throw new Error(`Unknown target page: ${targetPage}`);
    }
}

/**
 * Handle Study View page
 */
async function handleStudyPage(params: ToolInput['parameters']) {
    let studyId: string;

    // Resolve study ID
    if (params.studyId) {
        // Direct ID provided, validate it
        const isValid = await studyResolver.validate(params.studyId);
        if (!isValid) {
            return {
                success: false,
                error: `Study ID "${params.studyId}" not found`,
            };
        }
        studyId = params.studyId;
    } else if (params.studyKeywords && params.studyKeywords.length > 0) {
        // Search by keywords
        const matches = await studyResolver.search(params.studyKeywords);

        if (matches.length === 0) {
            return {
                success: false,
                error: 'No matching studies found',
                details: { searchTerms: params.studyKeywords },
            };
        }

        if (matches.length > 1) {
            // Return options for user to choose
            return {
                success: false,
                needsSelection: true,
                message: 'Multiple studies found. Please specify which one:',
                options: matches.map((s) => ({
                    studyId: s.studyId,
                    name: s.name,
                    description: s.description,
                    sampleCount: s.allSampleCount,
                })),
            };
        }

        studyId = matches[0].studyId;
    } else {
        return {
            success: false,
            error: 'Either studyId or studyKeywords must be provided',
        };
    }

    // Build URL
    const url = buildStudyUrl({
        studyIds: studyId,
        tab: params.tab,
        filters: params.filters,
    });

    // Get study details for metadata
    const studyDetails = await studyResolver.getById(studyId);

    return {
        success: true,
        url,
        metadata: {
            studyId,
            studyName: studyDetails.name,
        },
    };
}

/**
 * Handle Patient View page
 */
async function handlePatientPage(params: ToolInput['parameters']) {
    if (!params.studyId) {
        return {
            success: false,
            error: 'studyId is required for patient page',
        };
    }

    if (!params.patientId && !params.sampleId) {
        return {
            success: false,
            error: 'Either patientId or sampleId must be provided',
        };
    }

    // Validate study exists
    const isValid = await studyResolver.validate(params.studyId);
    if (!isValid) {
        return {
            success: false,
            error: `Study ID "${params.studyId}" not found`,
        };
    }

    // Build URL
    const url = buildPatientUrl({
        studyId: params.studyId,
        caseId: params.patientId,
        sampleId: params.sampleId,
        tab: params.tab,
    });

    return {
        success: true,
        url,
        metadata: {
            studyId: params.studyId,
            patientId: params.patientId,
            sampleId: params.sampleId,
        },
    };
}

/**
 * Handle Results/Query page
 */
async function handleResultsPage(params: ToolInput['parameters']) {
    let studyId: string;

    // 1. Resolve study ID
    if (params.studyId) {
        const isValid = await studyResolver.validate(params.studyId);
        if (!isValid) {
            return {
                success: false,
                error: `Study ID "${params.studyId}" not found`,
            };
        }
        studyId = params.studyId;
    } else if (params.studyKeywords && params.studyKeywords.length > 0) {
        const matches = await studyResolver.search(params.studyKeywords);

        if (matches.length === 0) {
            return {
                success: false,
                error: 'No matching studies found',
                details: { searchTerms: params.studyKeywords },
            };
        }

        if (matches.length > 1) {
            return {
                success: false,
                needsSelection: true,
                message: 'Multiple studies found. Please specify which one:',
                options: matches.map((s) => ({
                    studyId: s.studyId,
                    name: s.name,
                    description: s.description,
                    sampleCount: s.allSampleCount,
                })),
            };
        }

        studyId = matches[0].studyId;
    } else {
        return {
            success: false,
            error: 'Either studyId or studyKeywords must be provided',
        };
    }

    // 2. Validate genes
    if (!params.genes || params.genes.length === 0) {
        return {
            success: false,
            error: 'At least one gene must be provided',
        };
    }

    const validGenes = await geneResolver.validateBatch(params.genes);

    if (validGenes.length === 0) {
        return {
            success: false,
            error: 'No valid genes found',
            details: { providedGenes: params.genes },
        };
    }

    if (validGenes.length < params.genes.length) {
        const invalidGenes = params.genes.filter(
            (g) => !validGenes.includes(g)
        );
        console.warn(
            `Some genes were invalid and skipped: ${invalidGenes.join(', ')}`
        );
    }

    // 3. Get molecular profile (optional, for metadata)
    const alterationType =
        (params.alterations?.[0] as AlterationType) || 'mutation';
    const profile = await profileResolver.getForStudy(studyId, alterationType);

    // 4. Determine case set ID
    const caseSetId = params.caseSetId || `${studyId}_all`;

    // 5. Build URL
    const url = buildResultsUrl({
        studies: [studyId],
        genes: validGenes,
        caseSelection: {
            type: 'case_set',
            caseSetId,
        },
        tab: params.tab,
    });

    // Get study details for metadata
    const studyDetails = await studyResolver.getById(studyId);

    return {
        success: true,
        url,
        metadata: {
            studyId,
            studyName: studyDetails.name,
            genes: validGenes,
            caseSetId,
            molecularProfileId: profile?.molecularProfileId,
        },
    };
}
