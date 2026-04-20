import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { initSchema } from './db.js';
import { submitSkillTool } from './tools/submit_skill.js';
import { fetchSkillsTool } from './tools/fetch_skills.js';
import { upvoteTool, downvoteTool } from './tools/upvote.js';
import { setupTool } from './tools/setup.js';

const app = express();
app.use(express.json());

// Prevents Claude Code from attempting OAuth dynamic client registration
app.get('/.well-known/oauth-authorization-server', (req, res) => {
  res.json({
    issuer: `https://${req.headers.host}`,
    authorization_endpoint: `https://${req.headers.host}/oauth/authorize`,
    token_endpoint: `https://${req.headers.host}/oauth/token`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
  });
});

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

function registerTools(server) {
  const tools = [submitSkillTool, fetchSkillsTool, upvoteTool, downvoteTool, setupTool];

  for (const tool of tools) {
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

const sessions = new Map();

app.all('/mcp', async (req, res) => {
  if (!checkAuth(req, res)) return;

  if (req.method === 'GET') {
    const server = new McpServer({ name: 'skill-overflow', version: '1.0.0' });
    registerTools(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    sessions.set(transport.sessionId, { server, transport });

    res.on('close', () => {
      sessions.delete(transport.sessionId);
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (req.method === 'POST') {
    const sessionId = req.headers['mcp-session-id'];
    let entry = sessionId ? sessions.get(sessionId) : null;

    if (!entry) {
      const server = new McpServer({ name: 'skill-overflow', version: '1.0.0' });
      registerTools(server);

      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });

      await server.connect(transport);
      entry = { server, transport };
      if (transport.sessionId) sessions.set(transport.sessionId, entry);
    }

    await entry.transport.handleRequest(req, res, req.body);
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
});

const PORT = process.env.PORT ?? 3000;

initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Skill Overflow MCP server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize schema:', err);
    process.exit(1);
  });
