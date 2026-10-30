# Elpis (LibreChat) setup for Neoma's AI passes

Neoma talks to our LibreChat deployment (**Elpis**) through its OpenAI-compatible
Agents API. The deployment lives at `https://elpis-dev.elysiaa.com`; the API
base is:

```
https://elpis-dev.elysiaa.com/api/agents/v1
```

Every AI feature is optional. With no configuration the rules card generator
still works and the assistant dock stays hidden.

## 1. Enable agents and the Agents API in Elpis

In `elpis-test/librechat.yaml`:

```yaml
interface:
  agents:
    use: true
    create: true
  remoteAgents:
    use: true
    create: true
```

`agents` is the builder (you need it once to create the agent); `remoteAgents`
exposes the API and the Agent API Keys page. If other people use Elpis, grant
these to your role only rather than all users.

The MCP server list (`config/mcp-servers.yml`) already contains `neoma-mcp`.
The assistant dock does **not** need it yet; that is for the later chat-with-
tools phase, where you also add `neoma-mcp` to a model spec's `mcpServers`.

## 2. Create the study-card agent

Create an agent in Elpis with:

- **Name:** Study card editor
- **Tools:** none. This is deliberate: a refine call must not be able to write
  to Neoma, and the answer is never model-written.
- **Model:** DeepSeek Flash (Gemini works too)
- **Instructions:** the text below, copied verbatim from
  `server/app/services/ai_services.py`.

```text
You are a study-card editor inside Neoma. You receive cards extracted by a
rules engine from a student's note. Improve the question wording without
changing the fact being tested.

Rules:
- Never change, contradict, or extend the answer.
- For kind="cloze", keep exactly one "___" where the answer belongs.
- For kind="basic", do not put the answer text in the question.
- Add 2-3 short, plausible but clearly wrong quiz options. Never include the
  answer or a paraphrase of it.
- Keep the student's language and technical terms. One fact per card.
- No yes/no questions, no preamble, no markdown.
Return only this JSON shape:
{"cards":[{"index":0,"front":"...","distractors":["...","...","..."]}]}
```

Copy the agent id from **Advanced Settings** (the copy button beside the id).
The API call puts it in the `model` field.

## 3. Create an API key

**Settings → Data & Privacy → Agent API Keys → Manage → Create API Key.** The
key is shown once. It acts as your Elpis user, so the agent must stay tool-free
and the key must stay server-side.

## 4. Configure Neoma

Local `server/.env`:

```bash
LIBRECHAT_BASE_URL=https://elpis-dev.elysiaa.com/api/agents/v1
LIBRECHAT_API_KEY=<key>
LIBRECHAT_REFINE_AGENT_ID=agent_<id>
# Used by the assistant dock in the next phase.
LIBRECHAT_CHAT_AGENT_ID=
```

Production (Cloud Run, `asia-southeast1`). Never commit the key:

```bash
gcloud run services update neoma --region=asia-southeast1 \
  --update-env-vars LIBRECHAT_BASE_URL=https://elpis-dev.elysiaa.com/api/agents/v1 \
  --update-env-vars LIBRECHAT_REFINE_AGENT_ID=agent_<id> \
  --update-env-vars LIBRECHAT_API_KEY=<key>
```

`gcloud run services update` rolls a new revision. Confirm with:

```bash
curl -s https://neoma-api.web.app/api/ai/status -H "Cookie: ..."
```

Expected with only the refine agent configured:

```json
{"configured": true, "refine": true, "chat": false}
```

## 5. What can go wrong

- **Agents API is beta.** It is isolated in `services/ai_services.py`; a change
  is one file. The rules cards are the fallback.
- **Cloud Run cannot reach Elpis.** The refine call fails and the modal shows
  "Elpis did not answer; these are the free rules-based cards."
- **The key/quota is shared.** Every Neoma user's refine bills the key owner.
  Fine for a personal deployment; gate it before opening Neoma to a cohort.
- **The agent has tools.** It should not. Remove them: the refine contract only
  needs text in and JSON out.
