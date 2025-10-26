import { NextResponse } from 'next/server';
import type { OpenRouterModelsResponse } from '@/lib/ai/openrouter-types';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Cache for 1 hour

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search') || '';
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    
    // Get custom API key from header if provided
    const customApiKey = request.headers.get('x-openrouter-api-key');
    const apiKey = customApiKey || process.env.OPENROUTER_API_KEY;

    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data: OpenRouterModelsResponse = await response.json();

    // Filter models based on search query
    let filteredModels = data.data;
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredModels = filteredModels.filter(
        (model) =>
          model.id.toLowerCase().includes(searchLower) ||
          model.name.toLowerCase().includes(searchLower) ||
          model.description?.toLowerCase().includes(searchLower)
      );
    }

    // Limit results
    filteredModels = filteredModels.slice(0, limit);

    return NextResponse.json({
      data: filteredModels,
      total: data.data.length,
      filtered: filteredModels.length,
    });
  } catch (error) {
    console.error('Error fetching OpenRouter models:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models' },
      { status: 500 }
    );
  }
}
