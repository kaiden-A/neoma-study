# Neoma MCP (Elpis) — endpoint, auth, tools

Neoma exposes the same services the web app uses as MCP tools at **`/mcp`** on
the FastAPI app (streamable HTTP, **stateless + JSON**). A request is one
independent POST; `GET /mcp` is answered with **405** on purpose so no client
holds an idle SSE stream open.

## Auth

Two paths, both fail closed:

1. **Static key** — `Authorization: Bearer $MCP_API_KEY`. It acts as the member
   whose email is `MCP_OWNER_EMAIL`. Use it for a personal assistant.
2. **Zitadel access token** — verified against the issuer's JWKS
   (`MCP_JWKS_URL`, default `{issuer}/oauth/v2/keys`), `exp`/`sub` required, and
   the subject mapped through `(idp_issuer, zitadel_sub)` to an active member.
   Set `MCP_AUDIENCE` to require an audience.

Unauthenticated calls get `401` with the `WWW-Authenticate` challenge pointing
at `/.well-known/oauth-protected-resource/mcp`.

## Trying it

```bash
curl -sS http://localhost:8000/mcp \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Or run the Inspector:

```bash
npx @modelcontextprotocol/inspector   # transport: Streamable HTTP, URL: http://localhost:8000/mcp
```

## Tools

| Tool | Does | Notes |
| --- | --- | --- |
| `list_groups` | Groups with members, topics, links | member-scoped |
| `list_tasks` | Filter by group, status, due date | personal + member groups |
| `create_task` | New task, optionally on a group | assignees must be members |
| `update_task` | Title, status, due date, priority | |
| `delete_task` | Deletes a task | destructive |
| `upcoming` | Merged deadlines + events, soonest first | |
| `search_vault` | Search personal notes (title, body, URL, tags) | |
| `get_note` | One note in full, with topic | |
| `create_note` | Personal note, or post into a group | |
| `update_note` | Title, body, pinned | |
| `list_events` | Calendar events in a range | |
| `daily_brief` | Overdue, due today, this week, events | |

Tools return `structuredContent` from the same Pydantic schemas the web API
uses, so ids and field names match. User-recoverable problems come back as
`ToolError` sentences ("That item is gone."), not stack traces.

## Adding a tool

1. Put the logic in `app/services/*` (never in the tool).
2. Add a thin wrapper in `app/mcp_tools.py`:

```python
@mcp.tool(annotations=READ_ONLY)
def my_tool(group_id: Annotated[str, Field(description="The group's id.")]) -> GroupOut:
    """One sentence an LLM can act on."""
    with get_session() as db:
        user = current_user(db)
        return group_services.get_group(db, user, _uuid(group_id, "group"))
```

3. Annotate with `ToolAnnotations` (`READ_ONLY`, `MUTATING`, `DESTRUCTIVE`) so
   hosts can ask for confirmation before irreversible calls.
4. Every tool opens its own session and resolves `current_user(db)` — the
   caller comes from the verified token, never from tool arguments.
