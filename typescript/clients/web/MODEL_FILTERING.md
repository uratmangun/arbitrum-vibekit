# OpenRouter Model Filtering

## Overview
Added filtering to the OpenRouter model autocomplete to only show models that are compatible with tool calling and text-based interactions.

## Filter Criteria

### 1. **Tool Support** (Required)
Models must support both:
- `tool_choice` - Ability to specify which tool to use
- `tools` - Ability to define and use tools

### 2. **Input Modalities** (Required)
Models must support text input:
- `input_modalities` must include `"text"`
- Can also support other modalities like `"image"` (multimodal models are allowed)

### 3. **Output Modalities** (Required)
Models must ONLY output text:
- `output_modalities` must contain exactly one item: `["text"]`
- No audio, image, or other output types

## Implementation

### Filter Logic
```typescript
const filteredModels = models.filter((model) => {
  // Check if model has required supported parameters
  const hasToolSupport = 
    model.supported_parameters?.includes('tool_choice') &&
    model.supported_parameters?.includes('tools');
  
  // Check if input modalities include text
  const hasTextInput = model.architecture?.input_modalities?.includes('text');
  
  // Check if output modalities only include text (no other modalities)
  const hasOnlyTextOutput = 
    model.architecture?.output_modalities?.length === 1 &&
    model.architecture?.output_modalities?.includes('text');
  
  return hasToolSupport && hasTextInput && hasOnlyTextOutput;
});
```

## Example Compatible Model

```json
{
  "id": "anthropic/claude-haiku-4.5",
  "name": "Anthropic: Claude Haiku 4.5",
  "supported_parameters": [
    "include_reasoning",
    "max_tokens",
    "reasoning",
    "stop",
    "temperature",
    "tool_choice",  // ✅ Has tool_choice
    "tools",        // ✅ Has tools
    "top_k",
    "top_p"
  ],
  "architecture": {
    "modality": "text+image->text",
    "input_modalities": [
      "image",
      "text"  // ✅ Supports text input
    ],
    "output_modalities": [
      "text"  // ✅ Only text output
    ],
    "tokenizer": "Claude",
    "instruct_type": null
  }
}
```

## Example Incompatible Models

### ❌ Missing Tool Support
```json
{
  "supported_parameters": [
    "max_tokens",
    "temperature"
    // Missing "tool_choice" and "tools"
  ]
}
```

### ❌ No Text Input
```json
{
  "architecture": {
    "input_modalities": ["image"]  // No "text"
  }
}
```

### ❌ Multiple Output Modalities
```json
{
  "architecture": {
    "output_modalities": ["text", "audio"]  // More than just text
  }
}
```

### ❌ No Text Output
```json
{
  "architecture": {
    "output_modalities": ["image"]  // Not text
  }
}
```

## Benefits

✅ **Only compatible models shown** - Users can't select models that won't work with tools
✅ **Better UX** - No confusing errors from incompatible models
✅ **Cleaner list** - Fewer models to choose from, easier to find the right one
✅ **Prevents issues** - Tool calling will work reliably with selected models

## Compatible Model Examples

Models that will pass the filter:
- **Anthropic Claude** models (Opus, Sonnet, Haiku) - Full tool support
- **OpenAI GPT-4** models - Full tool support
- **Google Gemini** models - Full tool support
- **Mistral** models with tool support
- **Cohere Command** models with tool support

Models that will be filtered out:
- Image generation models (DALL-E, Stable Diffusion)
- Audio models (Whisper, TTS)
- Models without tool calling support
- Legacy models without function calling

## File Modified

- `components/openrouter-model-autocomplete.tsx` - Added filtering logic

## Testing

1. Open sidebar settings
2. Click on model selector
3. Search for models
4. Verify only compatible models appear
5. Select a model and test tool calling
6. Should work without errors

## Future Improvements

- Add visual indicator showing why a model was filtered
- Add toggle to show/hide filtered models
- Add filter presets (e.g., "coding models", "reasoning models")
- Cache filter results for better performance
