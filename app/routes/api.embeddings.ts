/**
 * Embeddings API Route
 * 
 * Provides embedding generation using the configured LLM provider.
 * Currently uses simple fallback embeddings as most LLM providers
 * don't expose embedding APIs through the standard SDK.
 * 
 * Future: Add OpenAI embeddings API integration
 */

import { json } from '@remix-run/cloudflare';
import type { ActionFunctionArgs } from '@remix-run/cloudflare';
import { EmbeddingGenerator } from '~/lib/memory/EmbeddingGenerator';

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { text, texts, model } = await request.json();

    const generator = new EmbeddingGenerator({
      enableCache: true,
      maxCacheSize: 1000,
      dimension: 1536,
    });

    // Single embedding
    if (text) {
      const result = await generator.generateEmbedding(text, model);
      return json({
        embedding: result.embedding,
        model: result.model,
        cached: result.cached,
      });
    }

    // Batch embeddings
    if (texts && Array.isArray(texts)) {
      const results = await generator.generateBatch(texts, model);
      return json({
        embeddings: results.map(r => r.embedding),
        model: results[0]?.model || 'unknown',
        cached: results.every(r => r.cached),
      });
    }

    return json({ error: 'Missing text or texts parameter' }, { status: 400 });
  } catch (error) {
    console.error('Embeddings API error:', error);
    return json(
      { error: 'Failed to generate embeddings', details: (error as Error).message },
      { status: 500 }
    );
  }
}
