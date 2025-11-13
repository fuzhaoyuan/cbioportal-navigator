# cBioPortal Navigator

A Model Context Protocol (MCP) server that helps AI assistants navigate users to the right cBioPortal pages by resolving natural language queries into structured URLs.

## Overview

cBioPortal Navigator bridges the gap between natural language cancer genomics queries and cBioPortal's powerful visualization tools. It enables AI assistants like Claude to:

- Search and validate cancer studies, genes, and molecular profiles
- Resolve ambiguous queries (e.g., "TCGA lung cancer" → specific study selection)
- Build properly formatted cBioPortal URLs for study views, patient views, and results pages
- Handle complex query parameters like gene lists, alteration types, and case sets

## Features

- **Smart Study Resolution**: Search studies by keywords or validate study IDs
- **Gene Validation**: Batch validate gene symbols against cBioPortal's database
- **Ambiguity Handling**: Returns multiple options when queries match several entities
- **Unified MCP Tool**: Single powerful `resolve_and_build_url` tool that handles:
  - Study view URLs - Browse cancer study summaries
  - Patient view URLs - View individual patient/sample data
  - Results/Query URLs - Analyze gene alterations across cohorts

## Project Structure

```
cbioportal-navigator/
├── src/
│   ├── index.ts              # Entry point (stdio/HTTP mode selection)
│   ├── server.ts             # MCP server creation and tool registration
│   ├── tools/
│   │   └── resolveAndBuildUrl.ts    # Main tool: definition + handler
│   ├── resolution/           # Entity resolvers
│   │   ├── studyResolver.ts  # Study search and validation
│   │   ├── geneResolver.ts   # Gene validation
│   │   └── profileResolver.ts # Molecular profile lookup
│   ├── urlBuilders/          # URL construction logic
│   │   ├── config.ts
│   │   ├── core.ts
│   │   ├── study.ts
│   │   ├── patient.ts
│   │   └── results.ts
│   ├── api/                  # cBioPortal API client
│   │   ├── client.ts
│   │   └── cache.ts          # Response caching
│   └── types/                # TypeScript types
├── Dockerfile                # Multi-stage Docker build
├── docker-compose.example.yml
├── librechat.example.yaml
└── package.json
```

## Usage

### Option 1: Local MCP with Claude Desktop

Use this method to run the MCP server locally and connect it to Claude Desktop.

#### Prerequisites
- Node.js 18+
- npm

#### Steps

1. **Build the project**:
   ```bash
   npm install
   npm run build
   ```

2. **Configure Claude Desktop**:

   Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

   ```json
   {
     "mcpServers": {
       "cbioportal-navigator": {
         "command": "node",
         "args": [
           "/absolute/path/to/cbioportal-navigator/dist/index.js"
         ],
         "env": {
           "CBIOPORTAL_BASE_URL": "https://www.cbioportal.org"
         }
       }
     }
   }
   ```

   Replace `/absolute/path/to/cbioportal-navigator` with your actual project path.

3. **Restart Claude Desktop**

4. **Verify connection**: Look for the 🔌 icon in Claude Desktop indicating MCP servers are connected.

#### Development Mode

For development with auto-reload (stdio mode):

```bash
npm run dev
```

For HTTP mode development:

```bash
MCP_TRANSPORT=http PORT=8002 npm run dev
```

### Option 2: Server Deployment with LibreChat

Deploy as a containerized service for use with LibreChat or other MCP clients that support SSE transport.

#### Prerequisites
- Docker & Docker Compose
- LibreChat instance (or another MCP-compatible client)

#### Steps

1. **Prepare configuration files**:

   ```bash
   # Copy example files
   cp docker-compose.example.yml docker-compose.yml
   cp librechat.example.yaml librechat.yaml
   ```

2. **Update docker-compose.yml**:

   Edit line 27 to use your GitHub username:
   ```yaml
   image: ghcr.io/YOUR_USERNAME/cbioportal-navigator:latest
   ```

   Or use local build instead:
   ```yaml
   build:
     context: .
     dockerfile: Dockerfile
   ```

3. **Configure environment variables**:

   In `docker-compose.yml`, under the `cbioportal-navigator` service, set:
   ```yaml
   environment:
     - CBIOPORTAL_BASE_URL=https://www.cbioportal.org  # or your custom instance
   ```

4. **Add LibreChat API keys**:

   In `docker-compose.yml`, under the `librechat` service:
   ```yaml
   environment:
     - ANTHROPIC_API_KEY=your_key_here
     - OPENAI_API_KEY=your_key_here
     # ... other required keys
   ```

5. **Start services**:

   ```bash
   docker-compose up -d
   ```

6. **Verify deployment**:

   - LibreChat: http://localhost:3080
   - MCP Server endpoint: http://localhost:8002/mcp
   - Health check: http://localhost:8002/health

   Check logs:
   ```bash
   docker-compose logs -f cbioportal-navigator
   ```

#### LibreChat Configuration

The `librechat.yaml` file configures the MCP server connection:

```yaml
version: 1.1.9

mcpServers:
  cbioportal-navigator:
    type: streamable-http
    url: "http://cbioportal-navigator:8002/mcp"
    description: "Navigate to cBioPortal pages by resolving natural language queries into URLs"
```

This tells LibreChat to connect to the MCP server via Streamable HTTP transport on port 8002.

#### Using Pre-built Docker Images

If you've set up GitHub Actions (included in `.github/workflows/docker-publish.yml`), images are automatically built and pushed to GitHub Container Registry on each commit to main/master.

Pull the latest image:
```bash
docker pull ghcr.io/YOUR_USERNAME/cbioportal-navigator:latest
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CBIOPORTAL_BASE_URL` | Base URL of cBioPortal instance | `https://www.cbioportal.org` |
| `NODE_ENV` | Environment mode | `production` (in Docker) |

## Example Queries

When connected to an AI assistant:

**Query**: "Show me TP53 mutations in TCGA lung adenocarcinoma"

**What happens**:
1. AI extracts structured input: `targetPage="results"`, study keywords `["TCGA", "lung", "adenocarcinoma"]`, genes `["TP53"]`
2. Calls `resolve_and_build_url` tool with extracted parameters
3. Server searches studies → finds "luad_tcga"
4. Validates gene "TP53" ✓
5. Returns: `https://www.cbioportal.org/results/oncoprint?...`

**Query**: "Take me to patient TCGA-05-4384 in study luad_tcga"

**What happens**:
1. AI extracts: `targetPage="patient"`, `studyId="luad_tcga"`, `patientId="TCGA-05-4384"`
2. Calls `resolve_and_build_url` tool
3. Server validates study exists ✓
4. Returns: `https://www.cbioportal.org/patient?studyId=luad_tcga&caseId=TCGA-05-4384`

## Architecture

### Communication Flow

```
AI Assistant (Claude)
    ↓ MCP Protocol
MCP Server (this project)
    ↓ HTTP API
cBioPortal Public API
```

### Transport Modes

- **stdio**: For local clients like Claude Desktop (direct stdin/stdout communication)
- **Streamable HTTP**: For remote/web-based clients like LibreChat (HTTP POST with optional SSE)

The server automatically selects the transport mode based on the `MCP_TRANSPORT` environment variable:
- `MCP_TRANSPORT=stdio` (default): Uses stdio transport
- `MCP_TRANSPORT=http`: Uses Streamable HTTP transport

## Development

### Build
```bash
npm run build
```

### Watch mode (auto-rebuild)
```bash
npm run watch
```

### Run locally
```bash
npm start
# or for development:
npm run dev
```

## License

AGPL-3.0-or-later

## Contributing

Contributions welcome! Please ensure:
- TypeScript code compiles without errors
- Changes are tested with both Claude Desktop and LibreChat
- Documentation is updated accordingly

## Troubleshooting

### Claude Desktop not connecting

- Check the config path is correct (absolute path required)
- Verify `dist/index.js` exists (run `npm run build`)
- Check Claude Desktop logs: `~/Library/Logs/Claude/` (macOS)

### Docker container issues

```bash
# Check container logs
docker-compose logs cbioportal-navigator

# Restart services
docker-compose restart

# Rebuild from scratch
docker-compose down
docker-compose up --build
```

### HTTP endpoint not accessible

- Ensure port 8002 is not blocked by firewall
- Verify container is running: `docker ps`
- Test health endpoint: `curl http://localhost:8002/health`
- Test MCP endpoint: `curl -X POST http://localhost:8002/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'`

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [cBioPortal Documentation](https://docs.cbioportal.org/)
- [LibreChat Documentation](https://www.librechat.ai/)
- [Claude Desktop](https://claude.ai/download)