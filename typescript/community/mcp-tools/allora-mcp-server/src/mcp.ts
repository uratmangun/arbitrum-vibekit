import type { AlloraAPIClient } from '@alloralabs/allora-sdk'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import pRetry, { AbortError } from 'p-retry'
import { z } from 'zod'

// Retry configuration for rate limiting
const RETRY_CONFIG = {
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 60000,
    randomize: true,
}

// Check if error is a rate limit error (403) based on actual runtime structure
function isRateLimitError(error: unknown): boolean {
    // From runtime inspection, we know the Allora SDK returns standard Error objects
    // with HTTP status embedded in the message string in the format:
    // "Failed to fetch from Allora API:  url=... status=403 body={...}"
    if (!(error instanceof Error)) {
        return false;
    }

    return error.message.includes('status=403');
}

async function getAllTopicsWithRetry(alloraClient: AlloraAPIClient) {
    return pRetry(
        async () => {
            try {
                return await alloraClient.getAllTopics()
            } catch (error) {
                if (isRateLimitError(error)) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error(`Rate limit hit, retrying... Error: ${errorMessage}`)
                    throw error // This will trigger a retry
                }
                // For non-rate-limit errors, don't retry
                throw new AbortError(error as Error)
            }
        },
        {
            ...RETRY_CONFIG,
            onFailedAttempt: (error) => {
                console.error(
                    `getAllTopics attempt ${error.attemptNumber} failed (${error.retriesLeft} retries left): ${error.message}`
                )
            },
        }
    )
}

async function getInferenceByTopicIDWithRetry(alloraClient: AlloraAPIClient, topicID: number) {
    return pRetry(
        async () => {
            try {
                return await alloraClient.getInferenceByTopicID(topicID)
            } catch (error) {
                if (isRateLimitError(error)) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    console.error(`Rate limit hit for topic ${topicID}, retrying... Error: ${errorMessage}`)
                    throw error // This will trigger a retry
                }
                // For non-rate-limit errors, don't retry
                throw new AbortError(error as Error)
            }
        },
        {
            ...RETRY_CONFIG,
            onFailedAttempt: (error) => {
                console.error(
                    `getInferenceByTopicID(${topicID}) attempt ${error.attemptNumber} failed (${error.retriesLeft} retries left): ${error.message}`
                )
            },
        }
    )
}

export function createServer(alloraClient: AlloraAPIClient) {
    const server = new McpServer({
        name: 'allora-mcp-server',
        version: '1.0.0'
    })

    //
    // Tool definitions
    //

    const GetAllTopicsSchema = z.object({})

    server.tool(
        'list_all_topics',
        'List the full set of predictions and inferences about the future that can be obtained, which will be provided by the Allora network',
        GetAllTopicsSchema.shape,
        async (_args) => {
            try {
                const topics = await getAllTopicsWithRetry(alloraClient)
                return {
                    content: [
                        {
                            type: 'text',
                            text: `${JSON.stringify(topics, null, 4)}`,
                        },
                    ],
                }
            } catch (error) {
                console.error(`list_all_topics: failed to fetch topics: ${(error as Error).message}`)
                throw new Error(`failed to fetch topics: ${(error as Error).message}`)
            }
        },
    )

    const GetInferenceByTopicIDSchema = z.object({
        topicID: z.number().int().describe('The topic ID to fetch inference for'),
    })

    server.tool(
        'get_inference_by_topic_id',
        'Fetch prediction/inference data for a specific Allora topic ID',
        GetInferenceByTopicIDSchema.shape,
        async ({ topicID }: { topicID: number }) => {
            try {
                const inference = await getInferenceByTopicIDWithRetry(alloraClient, Number(topicID))
                return {
                    content: [
                        {
                            type: 'text',
                            text: `${JSON.stringify(inference, null, 4)}`,
                        },
                    ],
                }
            } catch (error) {
                throw new Error(`Failed to fetch inference for topic ${topicID}: ${(error as Error).message}`)
            }
        },
    )

    return server
}


