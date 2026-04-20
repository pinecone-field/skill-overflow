import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { initSchema } from './db.js';
import { submitSkillTool } from './tools/submit_skill.js';
import { fetchSkillsTool } from './tools/fetch_skills.js';
import { upvoteTool, downvoteTool } from './tools/upvote.js';
import { setupTool } from './tools/setup.js';

const app = express();
app.use(express.json());

const sessions = new Map();

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

app.get('/mcp', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const server = new McpServer({ name: 'skill-overflow', version: '1.0.0' });
  registerTools(server);

  const transport = new SSEServerTransport('/mcp', res);
  sessions.set(transport.sessionId, transport);

  server.connect(transport).catch((err) => {
    console.error('MCP connect error:', err);
  });

  req.on('close', () => {
    sessions.delete(transport.sessionId);
  });
});

app.post('/mcp', async (req, res) => {
  const sessionId = req.query.sessionId;
  const transport = sessions.get(sessionId);
  if (!transport) {
    return res.status(404).json({ error: 'session not found' });
  }
  await transport.handlePostMessage(req, res);
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
