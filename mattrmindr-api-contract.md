# MattrMindr External API Contract for MattrMindrScribe Integration

This document defines the API endpoints that MattrMindr must implement to allow MattrMindrScribe (a legal transcription tool) to integrate with it. MattrMindrScribe will call these endpoints to authenticate users, search for cases, and send transcription files to cases.

## Base Configuration

All endpoints live under the `/api/external/` path on the MattrMindr server. MattrMindrScribe stores the user's MattrMindr base URL (e.g. `https://mattrmindr.example.com`) and will prepend it to all paths below.

## Authentication

### POST /api/external/auth

Authenticate a MattrMindr user from MattrMindrScribe. This should validate the user's credentials and return a long-lived token that MattrMindrScribe will store and use for subsequent API calls.

**Request:**
```json
{
  "email": "user@lawfirm.com",
  "password": "their-mattrmindr-password"
}
```

**Success Response (200):**
```json
{
  "token": "jwt-or-session-token-string",
  "user": {
    "id": "uuid-of-user",
    "email": "user@lawfirm.com",
    "fullName": "Jane Doe"
  }
}
```

**Error Response (401):**
```json
{
  "error": "Invalid email or password"
}
```

**Notes:**
- The token should be long-lived (at least 30 days) since the user connects once and expects it to stay connected.
- If your system uses JWT, consider issuing a special "integration" token type that doesn't expire as quickly as normal session tokens.
- MattrMindrScribe will send this token as `Authorization: Bearer <token>` on all subsequent requests.

---

## Case Search

### GET /api/external/cases

Search for cases where the authenticated user is a team member. Used when a MattrMindrScribe user wants to link a folder to a MattrMindr case.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| q         | string | No       | Search query to filter cases by name or case number. If empty, return all accessible cases. |

**Success Response (200):**
```json
{
  "cases": [
    {
      "id": "case-uuid-1",
      "name": "Smith v. Johnson",
      "caseNumber": "2024-CV-1234",
      "pinned": true
    },
    {
      "id": "case-uuid-2",
      "name": "Estate of Williams",
      "caseNumber": "2024-PR-5678",
      "pinned": false
    }
  ]
}
```

**Requirements:**
- Only return cases where the authenticated user is on the case team (has access).
- Sort results with `pinned: true` cases first, then alphabetically by name.
- Filter by `q` parameter: match against case name and case number (case-insensitive, partial match).
- If `q` is empty or not provided, return all accessible cases (pinned first).

---

## File Management

### GET /api/external/cases/:caseId/files

Check if a file with a given name already exists in a case. MattrMindrScribe uses this before sending files to detect conflicts.

**Headers:**
```
Authorization: Bearer <token>
```

**Query Parameters:**
| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| filename  | string | Yes      | The exact filename to check for |

**Success Response (200):**
```json
{
  "exists": true,
  "fileId": "existing-file-uuid"
}
```

Or if not found:
```json
{
  "exists": false
}
```

---

### POST /api/external/cases/:caseId/files

Send a transcription file and its associated data to a MattrMindr case. This is the main integration endpoint.

**Headers:**
```
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "filename": "Deposition - John Smith.mp3",
  "description": "Deposition taken on 2024-01-15",
  "type": "audio",
  "duration": 3600.5,
  "replaceFileId": null,
  "transcript": {
    "segments": [
      {
        "startTime": 0.0,
        "endTime": 5.2,
        "speaker": "Attorney Rodriguez",
        "text": "Please state your name for the record."
      },
      {
        "startTime": 5.5,
        "endTime": 8.1,
        "speaker": "Witness Smith",
        "text": "My name is John Smith."
      }
    ],
    "versions": [
      {
        "changeDescription": "Initial transcription",
        "createdAt": "2024-01-15T10:30:00Z",
        "segments": [
          {
            "startTime": 0.0,
            "endTime": 5.2,
            "speaker": "Speaker 1",
            "text": "Please state your name for the record."
          }
        ]
      },
      {
        "changeDescription": "Speaker names updated",
        "createdAt": "2024-01-15T11:00:00Z",
        "segments": [
          {
            "startTime": 0.0,
            "endTime": 5.2,
            "speaker": "Attorney Rodriguez",
            "text": "Please state your name for the record."
          }
        ]
      }
    ],
    "summaries": [
      {
        "agentType": "deposition_analyst",
        "summary": "Key testimony regarding the incident on March 5th...",
        "modelUsed": "gpt-4o-mini",
        "createdAt": "2024-01-15T12:00:00Z"
      }
    ],
    "pipelineLog": {
      "whisper": { "status": "success", "segments": 142 },
      "diarization": { "status": "success", "speakersDetected": 3 },
      "refinement": { "status": "success", "speakersAfterRefinement": 3 },
      "startedAt": "2024-01-15T10:00:00Z",
      "completedAt": "2024-01-15T10:05:00Z"
    }
  }
}
```

**Field Descriptions:**

| Field | Type | Description |
|-------|------|-------------|
| filename | string | The user-given name of the file in MattrMindrScribe |
| description | string | Optional description of the media file |
| type | string | `"audio"` or `"video"` |
| duration | number | Duration of the media file in seconds |
| replaceFileId | string/null | If replacing an existing file, provide its ID (from the conflict check). If null, creates a new file. |
| transcript.segments | array | The current transcript segments with speaker labels and timestamps |
| transcript.versions | array | Full version history (change log). Each version contains the complete segment state at that point in time. |
| transcript.summaries | array | AI-generated summaries from various legal analysis agents |
| transcript.pipelineLog | object | Technical metadata about the transcription pipeline steps |

**Success Response (201 for new, 200 for replaced):**
```json
{
  "fileId": "new-or-updated-file-uuid",
  "replaced": false
}
```

**Error Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| 400 | `{ "error": "Filename is required" }` | Missing required fields |
| 401 | `{ "error": "Invalid or expired token" }` | Bad auth token |
| 403 | `{ "error": "No access to this case" }` | User not on case team |
| 404 | `{ "error": "Case not found" }` | Invalid caseId |

---

## Error Format

All error responses should follow this format:

```json
{
  "error": "Human-readable error message"
}
```

## CORS

If MattrMindrScribe and MattrMindr are on different domains, MattrMindr must allow CORS from the MattrMindrScribe origin. However, since MattrMindrScribe proxies all requests through its own backend server (not the browser), CORS is not strictly required. The requests will be server-to-server.

## Implementation Checklist

1. [ ] `POST /api/external/auth` — User authentication, returns long-lived token
2. [ ] `GET /api/external/cases` — Case search with team filtering and pin sorting
3. [ ] `GET /api/external/cases/:caseId/files` — Check file existence by filename
4. [ ] `POST /api/external/cases/:caseId/files` — Receive and store transcription data
5. [ ] Ensure the token from step 1 is validated on all other endpoints
6. [ ] Only return cases where the authenticated user is a team member
7. [ ] Sort case search results with pinned cases first
