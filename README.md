# agent-device-mcp

MCP server that wraps [Callstack's agent-device](https://github.com/callstackincubator/agent-device) for controlling iOS simulators and Android emulators. Uses the accessibility tree for structured, parseable interaction instead of screenshot-based coordinate tapping.

Ships as a **Claude Code plugin** — install it in any project and get 14 MCP tools for device interaction.

## Why not screenshots?

`agent-device` reads the accessibility tree, which gives you structured data: element types, labels, refs, and values. That means:

- **No image processing** — messages and buttons come back as JSON, not pixels
- **Self-healing selectors** — tap by accessibility ref (`@e31`), not coordinates
- **Token-efficient** — structured text vs base64 screenshots

## Tools

| Tool | Purpose |
|------|---------|
| `device_ping` | Health check |
| `device_list` | List simulators/emulators |
| `device_boot` | Boot device by name |
| `device_open` | Open app session |
| `device_close` | Close session |
| `device_interact` | Messages + choices in one call |
| `device_messages` | Visible messages (parsed from a11y labels) |
| `device_choices` | Tappable buttons with refs |
| `device_click` | Tap by ref or coordinates |
| `device_fill` | Fill text field |
| `device_snapshot` | Full accessibility tree |
| `device_screenshot` | Capture screenshot |
| `device_swipe` | Swipe in direction |
| `device_wait` | Wait N seconds |
| `device_appstate` | App/session state |

## Setup

### Prerequisites

Install `agent-device` on the machine with your simulators/emulators:

```bash
npm install -g agent-device
```

### As a Claude Code plugin

```bash
claude plugin marketplace add <your-github-user>/agent-device-mcp
claude plugin install agent-device-mcp@agent-device-mcp
```

### As a standalone MCP server

Add to your `.mcp.json` or Claude Code settings:

```json
{
  "mcpServers": {
    "agent-device": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/agent-device-mcp/plugin/dist/server.js"],
      "env": {
        "AGENT_DEVICE_HOST": "user@remote-mac"
      }
    }
  }
}
```

## Configuration

All configuration is via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_DEVICE_HOST` | *(empty = local)* | SSH host for remote device. Leave empty to run agent-device locally |
| `AGENT_DEVICE_BIN` | `agent-device` | Path to the agent-device binary |
| `AGENT_DEVICE_PATH_PREFIX` | *(empty)* | Prepend to PATH (useful for remote: `/opt/homebrew/bin`) |
| `AGENT_DEVICE_MIN_SPACING_MS` | `1000` | Minimum ms between commands (avoids XCTest daemon timeouts) |
| `AGENT_DEVICE_RETRY_MAX` | `3` | Max retries on transient failures |
| `AGENT_DEVICE_RETRY_INITIAL_DELAY_MS` | `1000` | Initial retry delay (doubles each attempt) |

### Local vs remote

- **Local** (`AGENT_DEVICE_HOST` empty or `localhost`): runs `agent-device` directly on the same machine
- **Remote** (`AGENT_DEVICE_HOST=user@hostname`): runs `agent-device` over SSH — for setups where your dev machine and simulator host are separate

### Plugin configuration

When installed as a Claude Code plugin, set env vars in the plugin's `.mcp.json`. The plugin directory is at the installed location — or override via project-level `.mcp.json`:

```json
{
  "mcpServers": {
    "agent-device": {
      "env": {
        "AGENT_DEVICE_HOST": "admin@my-mac-mini",
        "AGENT_DEVICE_PATH_PREFIX": "/opt/homebrew/bin"
      }
    }
  }
}
```

## Usage example

```
device_ping                                    → verify connection
device_open { bundleId: "com.example.myapp" }  → open app
device_interact                                → read screen state
device_click { target: "@e31" }                → tap a button
device_interact                                → see result
device_close                                   → end session
```

## License

MIT
