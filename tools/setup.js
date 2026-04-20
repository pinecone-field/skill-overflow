function contributorBlock(email) {
  return `
## Skill Overflow — Skill Submission
After completing any multi-step process (whether it succeeded on the first
attempt or required fixes), generate the full SKILL.md text in memory
(do NOT save it to disk), then immediately call
mcp__skill-overflow__submit_skill with:
- skill_text: the full SKILL.md content including any fixes or extra steps
  you needed (e.g. auth checks, environment setup, error handling)
- description: a plain English description of what the skill does
- author: "${email}"

The description is embedded using llama-text-embed-v2, which has a max input
size of 2048 tokens. Keep descriptions concise and under 2048 tokens (roughly
8000 characters). Do not paste code or full file contents into the description.

Always submit a new skill after completing a task — even if you used a fetched
skill. The submitted skill should represent the complete, working version
including any corrections you made during execution.
Do not wait for the user to ask you to do this.
`;
}

const RETRIEVAL_BLOCK = `
## Skill Overflow — Skill Retrieval (Required)
Before beginning ANY multi-step task, you MUST do the following. Do not skip
this even if you think you already know how to proceed.

1. If mcp__skill-overflow__fetch_skills is not yet loaded, call ToolSearch
   with query "select:mcp__skill-overflow__fetch_skills" to load its schema.
2. Call mcp__skill-overflow__fetch_skills with a plain English description
   of what you are about to do.
3. If relevant skills are returned, use them to guide your approach.

After completing the task:
- If a fetched skill was used and the task succeeded without needing fixes,
  call mcp__skill-overflow__upvote with the attempt_id and vector_id.
- If a fetched skill was used but the task failed or required fixes to
  complete (for any reason, including missing auth, environment issues, or
  wrong steps), call mcp__skill-overflow__downvote with the attempt_id and
  vector_id. Then submit a new skill via submit_skill that includes the
  corrected steps.
- Only send one vote per skill per attempt.
`;

export const setupTool = {
  name: 'setup',
  description: 'Returns the CLAUDE.md blocks to add for Skill Overflow. After calling this tool, write the returned content to ~/.claude/CLAUDE.md using your local file tools. This must be done locally — do not attempt to write it on the server.',
  inputSchema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['contributor', 'read-only', 'both'],
        description: 'contributor = submit skills only, read-only = fetch/vote only, both = full participation',
      },
      email: {
        type: 'string',
        description: 'Email address of the user setting up Skill Overflow. Will be stored as the author on every skill submission.',
      },
    },
    required: ['mode', 'email'],
  },
  async handler({ mode, email }) {
    let content = '';
    if (mode === 'contributor' || mode === 'both') content += contributorBlock(email);
    if (mode === 'read-only' || mode === 'both') content += RETRIEVAL_BLOCK;

    return {
      success: true,
      instructions: 'Append the content below to ~/.claude/CLAUDE.md using your local Write or Edit tool. Create the file if it does not exist.',
      content,
    };
  },
};
