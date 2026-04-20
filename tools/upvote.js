import { fetchVector, upsertVector } from '../pinecone.js';
import { pool } from '../db.js';

export const upvoteTool = {
  name: 'upvote',
  description: 'Mark a skill as helpful for the given attempt. Nudges the skill vector toward the query. Only call when the skill clearly succeeded.',
  inputSchema: {
    type: 'object',
    properties: {
      attempt_id: { type: 'string' },
      vector_id: { type: 'string' },
    },
    required: ['attempt_id', 'vector_id'],
  },
  async handler({ attempt_id, vector_id }) {
    return applyVote({ attempt_id, vector_id, direction: 1, vote_type: 'up' });
  },
};

export const downvoteTool = {
  name: 'downvote',
  description: 'Mark a skill as unhelpful for the given attempt. Nudges the skill vector away from the query. Only call when the skill clearly failed or was irrelevant.',
  inputSchema: {
    type: 'object',
    properties: {
      attempt_id: { type: 'string' },
      vector_id: { type: 'string' },
    },
    required: ['attempt_id', 'vector_id'],
  },
  async handler({ attempt_id, vector_id }) {
    return applyVote({ attempt_id, vector_id, direction: -1, vote_type: 'down' });
  },
};

async function applyVote({ attempt_id, vector_id, direction, vote_type }) {
  const attemptRow = await pool.query(
    'SELECT query_embedding FROM attempts WHERE attempt_id = $1',
    [attempt_id]
  );
  if (attemptRow.rowCount === 0) {
    return { success: false, error: 'attempt_id not found' };
  }

  const resultRow = await pool.query(
    'SELECT 1 FROM attempt_results WHERE attempt_id = $1 AND vector_id = $2',
    [attempt_id, vector_id]
  );
  if (resultRow.rowCount === 0) {
    return { success: false, error: 'vector_id was not returned for this attempt' };
  }

  const voteRow = await pool.query(
    'SELECT 1 FROM votes WHERE attempt_id = $1 AND vector_id = $2',
    [attempt_id, vector_id]
  );
  if (voteRow.rowCount > 0) {
    return { success: false, error: 'already voted for this skill in this attempt' };
  }

  const Y = attemptRow.rows[0].query_embedding;
  const record = await fetchVector(vector_id);
  if (!record) {
    return { success: false, error: 'vector not found in Pinecone' };
  }

  const X = record.values;
  const X_new = X.map((x, i) => x + direction * Y[i] * 0.1);
  const meta = record.metadata ?? {};
  const updatedMeta = {
    ...meta,
    [vote_type === 'up' ? 'upvotes' : 'downvotes']:
      ((meta[vote_type === 'up' ? 'upvotes' : 'downvotes'] ?? 0)) + 1,
  };

  await upsertVector(vector_id, X_new, updatedMeta);
  await pool.query(
    'INSERT INTO votes (attempt_id, vector_id, vote_type) VALUES ($1, $2, $3)',
    [attempt_id, vector_id, vote_type]
  );

  return { success: true };
}
