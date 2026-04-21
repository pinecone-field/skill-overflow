import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { initSchema } from './db.js';
import { submitSkillTool } from './tools/submit_skill.js';
import { fetchSkillsTool } from './tools/fetch_skills.js';
import { upvoteTool, downvoteTool } from './tools/upvote.js';
import { createSetupTool } from './tools/setup.js';

const app = express();
app.use(express.json());

// --- OAuth compatibility shim for Claude Code ---
// Claude Code forces an OAuth flow for remote MCP servers. These endpoints
// satisfy that flow and return AUTH_TOKEN as the access token.

app.get('/.well-known/oauth-authorization-server', (req, res) => {
  const base = `https://${req.headers.host}`;
  res.json({
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['client_credentials'],
  });
});

app.get('/oauth/authorize', (req, res) => {
  const { redirect_uri, state } = req.query;
  if (!redirect_uri) return res.status(400).send('Missing redirect_uri');
  const code = randomUUID();
  const url = new URL(redirect_uri);
  url.searchParams.set('code', code);
  if (state) url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.post('/register', (req, res) => {
  const requested = req.body ?? {};
  res.status(201).json({
    client_id: randomUUID(),
    client_secret: randomUUID(),
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: requested.redirect_uris ?? [],
    grant_types: requested.grant_types ?? ['client_credentials'],
    token_endpoint_auth_method: 'client_secret_post',
  });
});

app.post('/oauth/token', (req, res) => {
  res.json({
    access_token: process.env.AUTH_TOKEN ?? 'no-auth',
    token_type: 'Bearer',
    expires_in: 3600,
  });
});

// ------------------------------------------------

function checkAuth(req, res) {
  const token = process.env.AUTH_TOKEN;
  if (!token) return true;
  const header = req.headers.authorization ?? '';
  if (header !== `Bearer ${token}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

const TOOL_SETS = {
  both: [submitSkillTool, fetchSkillsTool, upvoteTool, downvoteTool, createSetupTool()],
  contributor: [submitSkillTool, createSetupTool(['contributor'])],
  'read-only': [fetchSkillsTool, upvoteTool, downvoteTool, createSetupTool(['read-only'])],
};

function registerTools(server, mode = 'both') {
  for (const tool of TOOL_SETS[mode]) {
    const shape = {};
    for (const [key, def] of Object.entries(tool.inputSchema.properties)) {
      if (def.enum) {
        shape[key] = z.enum(def.enum);
      } else if (def.type === 'string') {
        shape[key] = z.string();
      } else if (def.type === 'number') {
        shape[key] = z.number();
      } else {
        shape[key] = z.any();
      }
      if (!tool.inputSchema.required?.includes(key)) {
        shape[key] = shape[key].optional();
      }
    }

    server.tool(tool.name, tool.description, shape, async (args) => {
      const result = await tool.handler(args);
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    });
  }
}

function mcpHandler(mode) {
  return async (req, res) => {
    if (!checkAuth(req, res)) return;
    const server = new McpServer({ name: 'skill-overflow', version: '1.0.0' });
    registerTools(server, mode);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  };
}

app.post('/mcp', mcpHandler('both'));
app.post('/mcp/contributor', mcpHandler('contributor'));
app.post('/mcp/read-only', mcpHandler('read-only'));

const PORT = process.env.PORT ?? 3000;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Skill Overflow MCP server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize schema:', err);
    process.exit(1);
  });
