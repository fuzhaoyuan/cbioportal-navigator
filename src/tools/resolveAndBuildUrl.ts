/**
 * MCP Tool: resolve_and_build_url
 * Main tool that resolves parameters and builds cBioPortal URLs
 */

import {
    studyResolver,
    geneResolver,
    profileResolver,
} from '../resolution/index.js';
import { buildStudyUrl } from '../urlBuilders/study.js';
import { buildPatientUrl } from '../urlBuilders/patient.js';
import { buildResultsUrl } from '../urlBuilders/results.js';
import type {
    ResolveAndBuildUrlInput,
    ResolveAndBuildUrlResponse,
    SuccessResponse,
    ErrorResponse,
    ClarificationResponse,
} from '../types/mcp.js';

export const resolveAndBuildUrlTool = {
    name: 'resolve_and_build_url',
    description: `Resolve parameters and build a cBioPortal URL from structured input.

This is the main tool for generating cBioPortal URLs. It accepts structured parameters
extracted from user queries and:
1. Resolves/validates parameters against the cBioPortal database
2. Handles ambiguity (returns options if multiple matches found)
3. Infers missing required parameters
4. Builds the final URL

IMPORTANT: This tool expects structured input, not raw natural language.
You should extract entities from the user's query first, then call this tool.

Input Structure:
{
  "targetPage": "study" | "patient" | "results",
  "parameters": {
    // For study page:
    "studyKeywords": ["TCGA", "lung"],      // Search keywords
    "studyId": "luad_tcga",                 // Or direct study ID (skips search)

    // For patient page:
    "studyId": "luad_tcga",                 // Required
    "patientId": "TCGA-001",                // Patient identifier

    // For results page:
    "studyKeywords": ["TCGA", "lung"],      // Search keywords OR
    "studyId": "luad_tcga",                 // Direct study ID
    "genes": ["TP53", "KRAS"],              // Gene symbols
    "alterations": ["mutation"],            // Optional: mutation, cna, fusion, etc.
    "caseSetId": "luad_tcga_all",           // Optional: will infer if missing

    // Common:
    "tab": "mutations"                      // Optional: specific tab to navigate to
  }
}

Response Types:

1. Success:
{
  "success": true,
  "url": "https://www.cbioportal.org/...",
  "metadata": { ... }
}

2. Ambiguity (multiple matches):
{
  "success": false,
  "needsSelection": true,
  "message": "Multiple studies found. Please specify:",
  "options": [
    { "studyId": "...", "name": "...", "sampleCount": 123 },
    ...
  ]
}

3. Error:
{
  "success": false,
  "error": "Error message",
  "details": { ... }
}

Examples:

1. Results page with keywords:
Input: {
  "targetPage": "results",
  "parameters": {
    "studyKeywords": ["TCGA", "lung", "adenocarcinoma"],
    "genes": ["TP53"],
    "alterations": ["mutation"]
  }
}

2. Results page with direct study ID:
Input: {
  "targetPage": "results",
  "parameters": {
    "studyId": "luad_tcga",
    "genes": ["TP53", "KRAS"]
  }
}

3. Study view:
Input: {
  "targetPage": "study",
  "parameters": {
    "studyId": "luad_tcga"
  }
}`,
    inputSchema: {
        type: 'object',
        properties: {
            targetPage: {
                type: 'string',
                enum: ['study', 'patient', 'results'],
                description: 'The type of cBioPortal page to navigate to',
            },
            parameters: {
                type: 'object',
                properties: {
                    studyKeywords: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                            'Keywords to search for studies (e.g., ["TCGA", "lung"])',
                    },
                    studyId: {
                        type: 'string',
                        description: 'Direct study ID (skips search if provided)',
                    },
                    patientId: {
                        type: 'string',
                        description: 'Patient/case identifier',
                    },
                    sampleId: {
                        type: 'string',
                        description: 'Sample identifier',
                    },
                    genes: {
                        type: 'array',
                        items: { type: 'string' },
                        description: 'Gene symbols (e.g., ["TP53", "KRAS"])',
                    },
                    alterations: {
                        type: 'array',
                        items: { type: 'string' },
                        description:
                            'Alteration types: mutation, cna, fusion, mrna, protein',
                    },
                    caseSetId: {
                        type: 'string',
                        description:
                            'Case set ID (optional, will be inferred if not provided)',
                    },
                    tab: {
                        type: 'string',
                        description: 'Specific tab to navigate to',
                    },
                    filters: {
                        type: 'object',
                        description: 'Additional filters',
                    },
                },
            },
        },
        required: ['targetPage', 'parameters'],
    },
};

export async function handleResolveAndBuildUrl(
    input: ResolveAndBuildUrlInput
): Promise<string> {
    try {
        const result = await resolveAndBuildUrl(input);

        // Format response as JSON string
        return JSON.stringify(result, null, 2);
    } catch (error) {
        const errorResponse: ErrorResponse = {
            success: false,
            error:
                error instanceof Error
                    ? error.message
                    : 'Unknown error occurred',
            details: error,
        };
        return JSON.stringify(errorResponse, null, 2);
    }
}

async function resolveAndBuildUrl(
    input: ResolveAndBuildUrlInput
): Promise<ResolveAndBuildUrlResponse> {
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
async function handleStudyPage(
    params: ResolveAndBuildUrlInput['parameters']
): Promise<ResolveAndBuildUrlResponse> {
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
                options: matches.map(s => ({
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
async function handlePatientPage(
    params: ResolveAndBuildUrlInput['parameters']
): Promise<ResolveAndBuildUrlResponse> {
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
async function handleResultsPage(
    params: ResolveAndBuildUrlInput['parameters']
): Promise<ResolveAndBuildUrlResponse> {
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
                options: matches.map(s => ({
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
        const invalidGenes = params.genes.filter(g => !validGenes.includes(g));
        console.warn(`Some genes were invalid and skipped: ${invalidGenes.join(', ')}`);
    }

    // 3. Get molecular profile (optional, for metadata)
    const alterationType = params.alterations?.[0] || 'mutation';
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
