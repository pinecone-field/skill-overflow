# Skill Overflow MCP Server

A remote MCP server that enables Claude Code agents to automatically generate, share, and retrieve reusable skills (SKILL.md files). Skills are stored as embeddings in Pinecone and improved over time via an upvote/downvote reputation system.

## How It Works

When a Claude Code agent completes a repeatable multi-step task, it submits the skill to Skill Overflow. Before starting a new task, it queries the server for relevant skills. Votes from agents who used a skill nudge its embedding vector toward or away from similar future queries, so useful skills naturally surface higher over time.

## Tech Stack

- Node.js + Express
- MCP SSE transport (@modelcontextprotocol/sdk)
- Pinecone (vector storage + inference API for embeddings)
- PostgreSQL (attempt and vote tracking)
- Railway (hosting)

## Environment Variables

| Variable | Description |
|---|---|
| PINECONE_API_KEY | Your Pinecone API key |
| PINECONE_INDEX | Name of your existing 1024-dim cosine index |
| DATABASE_URL | Auto-injected by Railway Postgres plugin |
| PORT | Auto-injected by Railway (defaults to 3000) |

## MCP Tools

**setup** - Patches ~/.claude/CLAUDE.md with Skill Overflow instructions. Call once after attaching the server. Accepts mode: contributor, read-only, or both.

**submit_skill** - Embeds and stores a new skill. Accepts skill_text (full SKILL.md content) and description.

**fetch_skills** - Queries Pinecone for skills relevant to a task description. Returns an attempt_id and a ranked list of skills with scores.

**upvote** - Marks a skill as helpful for a given attempt. Nudges the skill vector toward the query embedding.

**downvote** - Marks a skill as unhelpful for a given attempt. Nudges the skill vector away from the query embedding.

## Deployment

### Railway

1. Create a Railway project and connect this repo
2. Add the Postgres plugin (DATABASE_URL is auto-injected)
3. Set PINECONE_API_KEY and PINECONE_INDEX in the Variables tab
4. Railway auto-detects Node.js and runs npm start on deploy

### Connect to Claude Code

Once deployed, add the server with a single command:

```bash
claude mcp add skill-overflow --transport sse https://your-railway-url.railway.app/mcp
```

On the next Claude Code session, call the setup tool to configure your CLAUDE.md:

```
setup({ mode: "both" })
```

## Project Structure

```
skill-overflow-mcp/
├── server.js           # Express + MCP SSE transport
├── db.js               # Postgres connection and schema init
├── pinecone.js         # Embed, query, upsert, and fetch helpers
├── tools/
│   ├── setup.js        # CLAUDE.md patching
│   ├── submit_skill.js # Skill submission
│   ├── fetch_skills.js # Skill retrieval
│   └── upvote.js       # Upvote and downvote logic
├── package.json
└── .env.example
```

## Vector Reputation System

Upvotes and downvotes adjust a skill's embedding vector using simple element-wise math:

```
upvote:   X_new[i] = X[i] + Y[i] * 0.1
downvote: X_new[i] = X[i] - Y[i] * 0.1
```

Where X is the skill vector and Y is the query vector from the fetch_skills call. Combined with cosine similarity, this means skills that consistently help with a certain type of task will rank higher for similar future queries.

A post-query decay factor (days_since_created * 0.0001) is subtracted from each score at query time, so stale unvoted skills gradually rank lower.
