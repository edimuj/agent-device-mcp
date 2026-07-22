# agent-device-mcp

MCP server that wraps [Callstack's agent-device](https://github.com/callstackincubator/agent-device) for explicitly targeted iOS simulator and Android emulator control. It uses the accessibility tree for structured interaction and keeps a curated 21-tool surface instead of exposing the upstream MCP's full command catalog.

Ships as a **Claude Code plugin** or runs as a standalone stdio MCP server.

## Why accessibility trees?

- **Structured output** — messages, controls, and text fields come back as JSON.
- **Stable selectors** — interact by accessibility ref (for example `@e31`) instead of image coordinates.
- **Cross-platform targeting** — every tool accepts the same optional `platform`, `device`, `udid`, `serial`, and `session` fields.
- **Token-efficient** — the convenience tools return only messages, choices, and text inputs when a full tree is unnecessary.

## Supported agent-device version

This adapter targets and checks for **agent-device 0.20.0**. Install that exact version on every local or SSH device host:

```bash
npm install -g agent-device@0.20.0
agent-device --version
```

The first adapter command performs a cached version preflight and returns a clear error if a different upstream version is found. We bump this pin when upstream publishes a new release; update the exact install command and rerun the fixture-based unit suite as part of that change. `agent-device` 0.20.0 requires Node.js 22.12 or newer even though the adapter itself can run on Node.js 18 or newer.

## Tools

| Tool | Purpose |
|------|---------|
| `device_ping` | Verify the pinned agent-device CLI is reachable and list targets |
| `device_list` | List simulators/emulators |
| `device_boot` | Boot a named iOS simulator or Android emulator |
| `device_install` | Install an app artifact |
| `device_open` | Open or relaunch an app session |
| `device_close` | Close a session |
| `device_shutdown` | Close a session and shut down its simulator/emulator |
| `device_interact` | Return visible messages, choices, and text inputs |
| `device_messages` | Return visible chat messages |
| `device_choices` | Return tappable choice buttons and refs |
| `device_click` | Click by ref or coordinates |
| `device_press` | Press by ref or coordinates |
| `device_fill` | Focus and fill a text field |
| `device_type` | Type into the focused field |
| `device_snapshot` | Return the accessibility tree |
| `device_screenshot` | Capture a screenshot |
| `device_swipe` | Swipe on iOS; use agent-device scroll semantics on Android |
| `device_home` | Return to the device home screen |
| `device_back` | Navigate back |
| `device_wait` | Wait for a duration |
| `device_appstate` | Return current app/session state |

All tools accept these optional target fields:

| Field | Use |
|-------|-----|
| `platform` | `ios` or `android` |
| `device` | Simulator/emulator name or identifier |
| `udid` | Explicit iOS UDID |
| `serial` | Explicit Android adb serial |
| `session` | Named agent-device session |

`device_boot` requires `platform` and `device` and routes to the current upstream syntax: `boot --platform <platform> --device <name>`.

## Setup

### As a Claude Code plugin

```bash
claude plugin marketplace add <your-github-user>/agent-device-mcp
claude plugin install agent-device-mcp@agent-device-mcp
```

### As a standalone MCP server

```json
{
  "mcpServers": {
    "agent-device": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/agent-device-mcp/plugin/dist/server.js"],
      "env": {
        "AGENT_DEVICE_HOST": "user@remote-mac",
        "AGENT_DEVICE_ANDROID_SDK_ROOT": "/Users/user/Library/Android/sdk",
        "AGENT_DEVICE_STATE_DIR": "/Users/user/.agent-device-mcp"
      }
    }
  }
}
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_DEVICE_HOST` | *(empty = local)* | SSH host for remote execution; `localhost` and `127.0.0.1` also run locally |
| `AGENT_DEVICE_BIN` | `agent-device` | Local or remote agent-device binary |
| `AGENT_DEVICE_PATH_PREFIX` | *(empty)* | Additional colon-separated PATH entries; appended without replacing the host's base PATH |
| `AGENT_DEVICE_ANDROID_SDK_ROOT` | `ANDROID_HOME`, `ANDROID_SDK_ROOT`, or OS default | Android SDK root; `platform-tools` and `emulator` are appended to PATH |
| `AGENT_DEVICE_STATE_DIR` | *(agent-device default)* | Dedicated daemon state directory passed through as `--state-dir` |
| `AGENT_DEVICE_MIN_SPACING_MS` | `1000` | Minimum delay between commands |
| `AGENT_DEVICE_RETRY_MAX` | `3` | Maximum retries for transient daemon/XCTest failures |
| `AGENT_DEVICE_RETRY_INITIAL_DELAY_MS` | `1000` | Initial retry delay, doubled after each retry |

For SSH execution, the adapter preserves the remote login shell's PATH, then appends configured entries and both Android SDK tool directories. If no SDK root is configured, it checks the standard macOS (`$HOME/Library/Android/sdk`) and Linux (`$HOME/Android/Sdk`) locations. Set `AGENT_DEVICE_ANDROID_SDK_ROOT` when the SDK lives elsewhere.

Use a dedicated `AGENT_DEVICE_STATE_DIR` for this MCP instance. It prevents the adapter from reusing a daemon that was started earlier with a PATH that could not resolve `adb`.

## Examples

Android:

```text
device_ping { platform: "android", serial: "emulator-5554", session: "android-smoke" }
device_boot { platform: "android", device: "Medium_Phone_API_36.1", session: "android-smoke" }
device_open { bundleId: "com.example.app", platform: "android", serial: "emulator-5554", session: "android-smoke" }
device_interact { platform: "android", serial: "emulator-5554", session: "android-smoke" }
device_click { target: "@e31", platform: "android", serial: "emulator-5554", session: "android-smoke" }
```

iOS remains supported with the same shared target fields:

```text
device_open { bundleId: "com.example.app", platform: "ios", udid: "<simulator-udid>", session: "ios-smoke" }
device_interact { platform: "ios", udid: "<simulator-udid>", session: "ios-smoke" }
```

## License

MIT
