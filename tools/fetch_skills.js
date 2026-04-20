import { v4 as uuidv4 } from 'uuid';
import { embedText, queryIndex } from '../pinecone.js';
import { pool } from '../db.js';

export const fetchSkillsTool = {
  name: 'fetch_skills',
  description: 'Query Skill Overflow for skills relevant to the task you are about to perform. Call this before beginning any multi-step task.',
  inputSchema: {
    type: 'object',
    properties: {
      task_description: { type: 'string', description: 'Plain English description of the task you are about to do' },
    },
    required: ['task_description'],
  },
  async handler({ task_description }) {
    const queryVector = await embedText(task_description, 'query');
    const matches = await queryIndex(queryVector, 10);

    const attempt_id = uuidv4();
    const today = new Date();

    await pool.query(
      'INSERT INTO attempts (attempt_id, query_embedding) VALUES ($1, $2)',
      [attempt_id, queryVector]
    );

    const skills = matches.map((m) => {
      const meta = m.metadata ?? {};
      const createdAt = meta.created_at ? new Date(meta.created_at) : today;
      const daysSince = Math.max(0, (today - createdAt) / 86400000);
      const decayedScore = m.score - daysSince * 0.0001;

      return {
        vector_id: m.id,
        score: Math.max(0, decayedScore),
        description: meta.description ?? '',
        skill_text: meta.skill_text ?? '',
      };
    });

    if (skills.length > 0) {
      for (const skill of skills) {
        await pool.query(
          'INSERT INTO attempt_results (attempt_id, vector_id) VALUES ($1, $2)',
          [attempt_id, skill.vector_id]
        );
      }
    }

    return { attempt_id, skills };
  },
};
