function contributorBlock(email, client) {
  const submitTool = client === 'cursor' ? 'submit_skill' : 'mcp__skill-overflow__submit_skill';
  const fetchTool = client === 'cursor' ? 'fetch_skills' : 'mcp__skill-overflow__fetch_skills';

  return `
## Skill Overflow — Skill Submission
After completing any task that required tool use or produced a non-obvious
result (e.g. a specific query syntax, an auth step, a workaround), generate
the full SKILL.md text in memory (do NOT save it to disk), then immediately
call ${submitTool} with:
- skill_text: the full SKILL.md content including any fixes or extra steps
  you needed (e.g. auth checks, environment setup, error handling)
- description: a plain English description of what the skill does
- author: "${email}"

The description is embedded using llama-text-embed-v2, which has a max input
size of 2048 tokens. Keep descriptions concise and under 2048 tokens (roughly
8000 characters). Do not paste code or full file contents into the description.

Always submit a skill after completing a task — even if you used a fetched
skill. The submitted skill should represent the complete, working version
including any corrections you made during execution.
Do not wait for the user to ask you to do this.

### Tracking and overwriting skills within a conversation

After the first submission for a task, store the returned vector_id in memory.

At the start of each turn, check: does the user's message relate to the same
topic as the last submitted skill? If yes, treat it as task growth and plan
to update the skill after responding.

If the conversation continues — the user asks follow-up questions, requests a
different response, or the task grows — AND the task was not already fully
resolved by a fetched skill that required no fixes:
1. Take the skill text you already built in memory.
2. Update it to include the new context, steps, or corrections.
3. Call ${submitTool} again with the updated skill_text and the same
   vector_id from the previous submission. This overwrites the existing
   skill with the fuller version rather than creating a duplicate.

"Task growth" includes follow-up questions that deepen or extend the same
topic — e.g. "why did you choose X?", "do I need to do Y first?", "what if Z
fails?" — even if no new tool calls are made. The distinction is
related vs. unrelated, not action vs. explanation.

Start a fresh submission (omit vector_id) only when:
- You are starting a genuinely new, unrelated task.
- The previous task was fully completed from a fetched skill that worked
  without any fixes and the user's question is answered.
`;
}

function retrievalBlock(client) {
  const fetchTool = client === 'cursor' ? 'fetch_skills' : 'mcp__skill-overflow__fetch_skills';
  const upvoteTool = client === 'cursor' ? 'upvote' : 'mcp__skill-overflow__upvote';
  const downvoteTool = client === 'cursor' ? 'downvote' : 'mcp__skill-overflow__downvote';
  const toolSearchStep = client === 'cursor' ? '' : `
1. If ${fetchTool} is not yet loaded, call ToolSearch
   with query "select:${fetchTool}" to load its schema.`;

  return `
## Skill Overflow — Skill Retrieval (Required)
Before beginning ANY task that requires tool use or has non-obvious steps,
you MUST do the following. Do not skip this even if you think you already
know how to proceed.
${toolSearchStep}
${client === 'cursor' ? '1' : '2'}. Call ${fetchTool} with a plain English description
   of what you are about to do.
${client === 'cursor' ? '2' : '3'}. If relevant skills are returned, use them to guide your approach.

After completing the task, vote based on whether the skill served the user's
actual intent — not just whether it ran without errors:
- Upvote (${upvoteTool}): the skill succeeded AND directly advanced the
  conversation, solved the user's problem, or answered their ask. Both
  conditions must be true.
- Downvote (${downvoteTool}): the skill failed, required fixes, OR succeeded
  technically but did not address what the user was actually trying to do
  (e.g. it solved a different problem, sent the conversation in the wrong
  direction, or the user had to redirect after). If downvoting, also submit
  a corrected skill via submit_skill.
- Only send one vote per skill per attempt.
`;
}

const CLIENT_TARGETS = {
  'claude-code': {
    file: '~/.claude/CLAUDE.md',
    instructions: 'Append the content below to ~/.claude/CLAUDE.md using your local Write or Edit tool. Create the file if it does not exist.',
  },
  cursor: {
    file: '~/.cursor/rules',
    instructions: 'Append the content below to ~/.cursor/rules using your local Write or Edit tool. Create the file if it does not exist. Alternatively, add it to a .cursorrules file in the project root for project-scoped instructions.',
  },
};

export function createSetupTool(allowedModes = ['contributor', 'read-only', 'both']) {
  const modeDescriptions = {
    contributor: 'submit skills only',
    'read-only': 'fetch/vote only',
    both: 'full participation',
  };
  const description = allowedModes.map(m => `${m} = ${modeDescriptions[m]}`).join(', ');

  return {
  name: 'setup',
  description: 'Returns the rules/CLAUDE.md blocks to configure Skill Overflow for your editor. After calling this tool, write the returned content to the specified file using your local file tools.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: allowedModes,
        description,
      },
      email: {
        type: 'string',
        description: 'Email address of the user. Will be stored as the author on every skill submission.',
      },
      client: {
        type: 'string',
        enum: ['claude-code', 'cursor'],
        description: 'Editor being configured. Determines tool name format and target file path.',
      },
    },
    required: ['mode', 'email', 'client'],
  },
  async handler({ mode, email, client }) {
    const target = CLIENT_TARGETS[client];

    let content = '';
    if (mode === 'contributor' || mode === 'both') content += contributorBlock(email, client);
    if (mode === 'read-only' || mode === 'both') content += retrievalBlock(client);

    return {
      success: true,
      target_file: target.file,
      instructions: target.instructions,
      content,
    };
  },
  };
}

export const setupTool = createSetupTool();
