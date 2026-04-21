import { v4 as uuidv4 } from 'uuid';
import { embedText, upsertVector, fetchVector } from '../pinecone.js';

const MAX_DESCRIPTION_CHARS = 8192; // ~2048 tokens at ~4 chars/token for llama-text-embed-v2

export const submitSkillTool = {
  name: 'submit_skill',
  description: 'Embed and store a skill in Skill Overflow. Call this after completing any repeatable multi-step process, and again whenever the task grows (pass the same vector_id to overwrite the previous version with more context). The description is embedded using llama-text-embed-v2 which has a 2048 token max input size — keep descriptions concise and under 2048 tokens.',
  inputSchema: {
    type: 'object',
    properties: {
      skill_text: { type: 'string', description: 'Full SKILL.md content' },
      description: { type: 'string', description: 'Plain English description of what the skill does. Must be under 2048 tokens (roughly 8000 characters).' },
      author: { type: 'string', description: 'Email address of the author submitting the skill' },
      vector_id: { type: 'string', description: 'Optional. If provided, overwrites the existing skill at this ID rather than creating a new one. Pass the vector_id returned by a previous submit_skill call to update the skill as the task evolves.' },
    },
    required: ['skill_text', 'description'],
  },
  async handler({ skill_text, description, author, vector_id }) {
    if (description.length > MAX_DESCRIPTION_CHARS) {
      return {
        success: false,
        error: `Description is too long (${description.length} chars). Keep it under ${MAX_DESCRIPTION_CHARS} characters (~2048 tokens) for llama-text-embed-v2.`,
      };
    }

    const values = await embedText(description, 'passage');

    let id = vector_id ?? uuidv4();
    let upvotes = 0;
    let downvotes = 0;
    let created_at = new Date().toISOString().split('T')[0];

    if (vector_id) {
      const existing = await fetchVector(vector_id);
      if (existing?.metadata) {
        upvotes = existing.metadata.upvotes ?? 0;
        downvotes = existing.metadata.downvotes ?? 0;
        created_at = existing.metadata.created_at ?? created_at;
      }
    }

    await upsertVector(id, values, {
      skill_text,
      description,
      author: author ?? 'unknown',
      created_at,
      upvotes,
      downvotes,
    });

    return { success: true, vector_id: id };
  },
};
