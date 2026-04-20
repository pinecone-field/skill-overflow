import { v4 as uuidv4 } from 'uuid';
import { embedText, upsertVector } from '../pinecone.js';

export const submitSkillTool = {
  name: 'submit_skill',
  description: 'Embed and store a new skill in Skill Overflow. Call this after completing any repeatable multi-step process.',
  inputSchema: {
    type: 'object',
    properties: {
      skill_text: { type: 'string', description: 'Full SKILL.md content' },
      description: { type: 'string', description: 'Plain English description of what the skill does' },
    },
    required: ['skill_text', 'description'],
  },
  async handler({ skill_text, description }) {
    const vector_id = uuidv4();
    const values = await embedText(description, 'passage');
    const created_at = new Date().toISOString().split('T')[0];

    await upsertVector(vector_id, values, {
      skill_text,
      description,
      created_at,
      upvotes: 0,
      downvotes: 0,
    });

    return { success: true, vector_id };
  },
};
