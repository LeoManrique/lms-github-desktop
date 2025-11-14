# Phase 4: GitHub Integration and Authentication

## Overview

This phase implements authentication with GitHub (both GitHub.com and GitHub Enterprise Server), GitHub API integration for repository operations, and association of local repositories with their GitHub counterparts. This enables features like pull requests, issues, CI checks, and collaboration.

## Prerequisites

- Phase 1 completed (IPC, window management)
- Phase 2 completed (Core Git operations)
- Phase 3 completed (UI and state management)

## Technology-Agnostic Requirements

### 1. Account Model

**Reference:** `app/src/models/account.ts:20-95`

An account represents an authenticated GitHub user.

**Account Structure:**
```typescript
class Account {
  login: string                        // GitHub username
  endpoint: string                     // API endpoint URL
  token: string                        // OAuth access token
  emails: ReadonlyArray<IAPIEmail>    // User's email addresses
  avatarURL: string                    // Profile picture URL
  id: number                          // GitHub user ID
  name: string                         // Display name
  plan?: string                        // GitHub plan (free, pro, team, etc.)
  copilotEndpoint?: string             // Copilot API endpoint
  isCopilotDesktopEnabled?: boolean    // Copilot access
  features?: ReadonlyArray<string>     // Desktop-specific features
}
```

**Two Account Types:**
1. **GitHub.com accounts** - endpoint = `https://api.github.com`
2. **GitHub Enterprise Server accounts** - endpoint = `https://your-company.github.com/api/v3`

**Equality Check** (reference: `app/src/models/account.ts:11-13`):
Two accounts are equal if they have the same endpoint and user ID:
```typescript
function accountEquals(x: Account, y: Account): boolean {
  return x.endpoint === y.endpoint && x.id === y.id
}
```

### 2. OAuth Authentication Flow

**Reference:** `app/src/lib/stores/sign-in-store.ts`

The app uses **OAuth 2.0 Web Application Flow** for authentication.

#### 2.1 OAuth Configuration

**OAuth Client Credentials:**
- Client ID - provided by GitHub (embedded in app)
- Client Secret - provided by GitHub (embedded in app)
- Reference: `app/src/lib/api.ts:127-134`

**OAuth Scopes** (reference: `app/src/lib/api.ts:139`):
```typescript
const oauthScopes = ['repo', 'user', 'workflow']
```

- `repo` - Full repository access (read/write)
- `user` - Read user profile data
- `workflow` - Update GitHub Actions workflow files

#### 2.2 Sign-In Flow States

**Reference:** `app/src/lib/stores/sign-in-store.ts:29-143`

The sign-in process has multiple steps:

**Sign-In Steps:**
```typescript
enum SignInStep {
  EndpointEntry,              // For GitHub Enterprise: enter server URL
  ExistingAccountWarning,     // Warning if account already exists
  Authentication,             // Main authentication step
  Success,                    // Authentication successful
}
```

**State Machine:**

```
GitHub.com Sign In:
  Start → Authentication → Success

GitHub Enterprise Sign In:
  Start → EndpointEntry → Authentication → Success

With existing account:
  ... → ExistingAccountWarning → ...
```

#### 2.3 GitHub.com OAuth Flow

**Step 1: User clicks "Sign in to GitHub.com"**

Frontend initiates sign-in:
```typescript
dispatcher.beginDotComSignIn()
```

**Step 2: Generate CSRF token and open browser**

Reference: `app/src/lib/stores/sign-in-store.ts:303`

```typescript
// Generate random state for CSRF protection
const csrfToken = uuid()

// Build authorization URL
const authURL = getOAuthAuthorizationURL(
  'https://api.github.com',
  csrfToken
)

// Open in default browser
shell.openExternal(authURL)
```

**Authorization URL format** (reference: `app/src/lib/api.ts:2347`):
```
https://github.com/login/oauth/authorize
  ?client_id=CLIENT_ID
  &scope=repo,user,workflow
  &state=CSRF_TOKEN
```

**Step 3: User authorizes app in browser**

GitHub redirects to callback URL:
```
x-github-desktop-auth://oauth?code=AUTH_CODE&state=CSRF_TOKEN
```

**Step 4: App receives callback**

The app registers a custom URL protocol handler: `x-github-desktop-auth://`

**URL Handler** (reference: `app/src/main-process/main.ts`):
- Listen for URL open events
- Parse OAuth callback URL
- Extract code and state parameters
- Send to renderer via IPC

**Step 5: Exchange code for access token**

Reference: `app/src/lib/stores/sign-in-store.ts:350`

```typescript
// Exchange authorization code for access token
const token = await requestOAuthToken(endpoint, authCode)
```

**Token Request** (reference: `app/src/lib/api.ts:2360-2382`):
```http
POST https://github.com/login/oauth/access_token
Content-Type: application/json

{
  "client_id": "CLIENT_ID",
  "client_secret": "CLIENT_SECRET",
  "code": "AUTH_CODE"
}
```

**Response:**
```json
{
  "access_token": "gho_xxxxxxxxxxxx",
  "token_type": "bearer",
  "scope": "repo,user,workflow"
}
```

**Step 6: Fetch user info**

```typescript
const user = await fetchUser(endpoint, token)
```

**User API Request:**
```http
GET https://api.github.com/user
Authorization: Bearer ACCESS_TOKEN
```

**Response:**
```json
{
  "login": "username",
  "id": 12345,
  "avatar_url": "https://avatars.githubusercontent.com/u/12345",
  "name": "Full Name",
  "email": "user@example.com",
  "plan": { "name": "free" }
}
```

**Step 7: Create Account object**

```typescript
const account = new Account(
  user.login,
  endpoint,
  token,
  user.emails,
  user.avatar_url,
  user.id,
  user.name,
  user.plan?.name
)
```

**Step 8: Store account**

```typescript
await accountsStore.addAccount(account)
```

Stores account in:
- Memory (AccountsStore)
- Persistent storage (secure credential store)

#### 2.4 GitHub Enterprise Sign-In

**Additional Step:** User must enter server URL first.

**Endpoint Entry UI:**
- Text input for server URL (e.g., `https://github.company.com`)
- Validate URL format
- Check if server is reachable
- Detect GitHub Enterprise version

**Validation** (reference: `app/src/ui/lib/enterprise-validate-url.ts`):
```typescript
function validateURL(url: string): string {
  // Must be HTTPS (or HTTP for localhost)
  // Must be valid URL
  // Must not be GitHub.com (use different flow)
  return normalizedURL
}
```

**Endpoint URL Construction:**

For GitHub Enterprise, construct API endpoint:
```typescript
function getEnterpriseAPIURL(serverURL: string): string {
  // https://github.company.com → https://github.company.com/api/v3
  return `${serverURL}/api/v3`
}
```

**OAuth flow is same** but uses enterprise authorization URLs:
```
https://github.company.com/login/oauth/authorize?...
https://github.company.com/login/oauth/access_token
```

### 3. Token Storage

**Security Requirement:** OAuth tokens are sensitive and must be stored securely.

**Storage Method:** Use OS credential manager

**Library:** `keytar` (Node.js module for secure credential storage)
- **macOS:** Keychain
- **Windows:** Credential Manager
- **Linux:** Secret Service API (libsecret)

**Token Storage Interface:**
```typescript
interface TokenStore {
  // Store token
  setItem(key: string, token: string): Promise<void>

  // Retrieve token
  getItem(key: string): Promise<string | null>

  // Delete token
  deleteItem(key: string): Promise<void>
}
```

**Key Format:**
```
github.com|username
github.company.com|username
```

**Implementation Pattern:**
```typescript
import * as keytar from 'keytar'

const SERVICE_NAME = 'GitHub Desktop'

async function storeToken(account: Account): Promise<void> {
  const key = `${account.endpoint}|${account.login}`
  await keytar.setPassword(SERVICE_NAME, key, account.token)
}

async function loadToken(endpoint: string, login: string): Promise<string | null> {
  const key = `${endpoint}|${login}`
  return await keytar.getPassword(SERVICE_NAME, key)
}
```

**Reference:** `app/src/lib/stores/token-store.ts`

### 4. Accounts Management

**AccountsStore Reference:** `app/src/lib/stores/accounts-store.ts`

Manages multiple accounts:

**Features:**
- Add account
- Remove account
- List all accounts
- Find account by endpoint
- Update account (refresh user data, update token)

**Multiple Accounts Support:**
- User can sign in to multiple GitHub.com accounts (with feature flag)
- User can sign in to multiple Enterprise servers
- Each repository is associated with one account

**Account Persistence:**
- Accounts saved to localStorage (without tokens)
- Tokens saved to secure credential store
- On app startup, load accounts and restore tokens

### 5. GitHub API Client

**Reference:** `app/src/lib/api.ts` (extensive API client - 2,000+ lines)

The API client provides methods for interacting with GitHub REST and GraphQL APIs.

#### 5.1 HTTP Request Function

**Base Request Function:**
```typescript
async function request(
  endpoint: string,
  path: string,
  token: string | null,
  method: HTTPMethod,
  body?: any,
  customHeaders?: Record<string, string>
): Promise<Response>
```

**Features:**
- Automatic authentication header (`Authorization: Bearer TOKEN`)
- User-Agent header
- Accept header for API version
- JSON body encoding
- Error handling
- Retry logic
- Certificate error handling

**Example:**
```http
GET https://api.github.com/user/repos
Authorization: Bearer gho_xxxxxxxxxxxx
User-Agent: GitHub-Desktop/3.5.4
Accept: application/vnd.github.v3+json
```

#### 5.2 Common API Methods

**Fetch User Info:**
```typescript
function fetchUser(
  endpoint: string,
  token: string
): Promise<IAPIIdentity>

// GET /user
```

**Fetch Repositories:**
```typescript
function fetchRepositories(
  endpoint: string,
  token: string,
  account: Account
): Promise<ReadonlyArray<IAPIRepository>>

// GET /user/repos?affiliation=owner,collaborator,organization_member&per_page=100
```

**Fetch Repository Details:**
```typescript
function fetchRepository(
  endpoint: string,
  token: string,
  owner: string,
  name: string
): Promise<IAPIFullRepository>

// GET /repos/:owner/:name
```

**Fetch Pull Requests:**
```typescript
function fetchPullRequests(
  endpoint: string,
  token: string,
  owner: string,
  name: string
): Promise<ReadonlyArray<IAPIPullRequest>>

// GET /repos/:owner/:name/pulls?state=all
```

**Create Repository:**
```typescript
function createRepository(
  endpoint: string,
  token: string,
  org: string | null,
  name: string,
  description: string,
  isPrivate: boolean
): Promise<IAPIRepository>

// POST /user/repos (personal)
// POST /orgs/:org/repos (organization)
```

**Fork Repository:**
```typescript
function forkRepository(
  endpoint: string,
  token: string,
  owner: string,
  name: string,
  org?: string
): Promise<IAPIRepository>

// POST /repos/:owner/:name/forks
```

#### 5.3 GraphQL API

For complex queries, use GraphQL:

**GraphQL Request:**
```typescript
async function graphql(
  endpoint: string,
  token: string,
  query: string,
  variables?: Record<string, any>
): Promise<any>

// POST /graphql
```

**Example Query - Fetch Pull Request Details:**
```graphql
query($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      title
      body
      state
      author {
        login
        avatarUrl
      }
      commits(last: 1) {
        nodes {
          commit {
            statusCheckRollup {
              state
            }
          }
        }
      }
    }
  }
}
```

**Used for:**
- Pull request details with checks
- Organization members
- Repository permissions
- Complex nested data

### 6. API Response Models

**IAPIRepository** (reference: `app/src/lib/api.ts:144-156`):
```typescript
{
  clone_url: string           // HTTPS clone URL
  ssh_url: string             // SSH clone URL
  html_url: string            // Web URL
  name: string                // Repository name
  owner: IAPIIdentity         // Owner info
  private: boolean            // Private/public
  fork: boolean               // Is fork?
  default_branch: string      // Default branch name
  pushed_at: string           // Last push timestamp
  has_issues: boolean         // Issues enabled?
  archived: boolean           // Archived?
}
```

**IAPIFullRepository** - Extends IAPIRepository:
```typescript
{
  parent: IAPIRepository | undefined  // Parent repo for forks
  permissions: {
    admin: boolean
    push: boolean
    pull: boolean
  }
}
```

**IAPIPullRequest:**
```typescript
{
  number: number
  title: string
  state: 'open' | 'closed'
  author: IAPIIdentity
  created_at: string
  updated_at: string
  head: {
    ref: string              // Branch name
    sha: string              // Commit SHA
    repo: IAPIRepository
  }
  base: {
    ref: string
    sha: string
    repo: IAPIRepository
  }
}
```

### 7. Linking Local Repository to GitHub

When a local repository is cloned from GitHub or has a GitHub remote, link it to GitHub repository.

**GitHub Repository Model** (reference: `app/src/models/github-repository.ts`):
```typescript
class GitHubRepository {
  name: string                // Repository name
  owner: string               // Owner/organization name
  endpoint: string            // API endpoint
  private: boolean | null     // Private/public (null if unknown)
  fork: boolean               // Is fork?
  htmlURL: string | null      // Web URL
  defaultBranch: string       // Default branch name
  cloneURL: string | null     // Clone URL
  parent: GitHubRepository | null  // Parent for forks
  permissions: {
    admin: boolean
    push: boolean
    pull: boolean
  }
}
```

**Repository Model Update** (from Phase 2):
```typescript
class Repository {
  // ... existing fields
  gitHubRepository: GitHubRepository | null  // GitHub association
}
```

**Linking Process:**

1. **Detect GitHub Remote:**
   ```typescript
   const remotes = await getRemotes(repository)
   const remote = remotes.find(r => r.name === 'origin')

   if (isGitHubRemote(remote.url)) {
     const { owner, name } = parseGitHubURL(remote.url)
     // ...
   }
   ```

2. **Parse GitHub URL:**
   ```
   https://github.com/owner/repo.git → owner: "owner", name: "repo"
   git@github.com:owner/repo.git → owner: "owner", name: "repo"
   ```

3. **Fetch Repository from API:**
   ```typescript
   const apiRepo = await fetchRepository(endpoint, token, owner, name)
   ```

4. **Create GitHubRepository object:**
   ```typescript
   const ghRepo = new GitHubRepository(
     apiRepo.name,
     apiRepo.owner.login,
     endpoint,
     apiRepo.private,
     apiRepo.fork,
     apiRepo.html_url,
     apiRepo.default_branch,
     apiRepo.clone_url,
     apiRepo.parent ? new GitHubRepository(...) : null
   )
   ```

5. **Update Repository:**
   ```typescript
   const updatedRepo = new Repository(
     repository.path,
     repository.id,
     ghRepo,  // Associate GitHub repo
     repository.missing
   )

   await repositoriesStore.updateRepository(updatedRepo)
   ```

### 8. Account-Repository Association

**Determine which account to use for repository:**

**Function:** `getAccountForRepository` (reference: `app/src/lib/get-account-for-repository.ts`)

**Logic:**
```typescript
function getAccountForRepository(
  accounts: ReadonlyArray<Account>,
  repository: Repository
): Account | null {
  if (!repository.gitHubRepository) {
    return null  // Not a GitHub repository
  }

  const endpoint = repository.gitHubRepository.endpoint

  // Find account for this endpoint
  return accounts.find(a => a.endpoint === endpoint) || null
}
```

**Usage:**
- When fetching pull requests: use repository's account
- When pushing: use repository's account credentials
- When creating issues: use repository's account

### 9. Sign-In UI Components

**Sign-In Dialog Reference:** `app/src/ui/sign-in/`

**Main Components:**

**SignIn.tsx** - Container component
- Renders appropriate step component
- Handles state transitions
- Passes callbacks to dispatcher

**EndpointEntry.tsx** - For GitHub Enterprise
- Text input for server URL
- Validation and error display
- "Continue" button

**Authentication.tsx** - OAuth flow
- "Sign in using your browser" button
- Waiting indicator during OAuth
- Error display
- Cancel button

**Existing Account Warning** - shown if account already exists
- Message about existing account
- Choice to continue or cancel

**Success** - Authentication succeeded
- Success message
- Automatically closes dialog

### 10. Sign-Out Flow

**User clicks "Sign Out"**

```typescript
dispatcher.removeAccount(account)
```

**Process:**
1. Remove account from AccountsStore
2. Delete token from credential store
3. Update repositories (unlink from account)
4. Refresh UI

**For repositories using this account:**
- GitHub features disabled
- Can still use git operations (if public repo or SSH keys)
- Pull requests unavailable
- Issues unavailable

### 11. Token Refresh and Invalidation

**Token Expiration:**
GitHub OAuth tokens don't expire, but can be revoked.

**Detecting Invalid Token:**
When API request returns `401 Unauthorized`:
```typescript
if (response.status === 401) {
  // Token invalid
  throw new InvalidTokenError()
}
```

**Handling Invalid Token:**
```typescript
// Error handler in dispatcher
async function invalidatedTokenHandler(error: Error, dispatcher: Dispatcher) {
  if (error instanceof InvalidTokenError) {
    // Show dialog asking user to sign in again
    dispatcher.showPopup({
      type: PopupType.InvalidatedToken,
      account: affectedAccount
    })
    return null  // Error handled
  }
  return error
}
```

**User Actions:**
- Sign in again (starts OAuth flow)
- Remove account

### 12. API Error Handling

**API Error Types:**
- `401 Unauthorized` - Invalid/missing token
- `403 Forbidden` - Rate limit, insufficient permissions
- `404 Not Found` - Resource doesn't exist
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - GitHub server error

**Error Interface:**
```typescript
class APIError extends Error {
  statusCode: number
  response: Response
}
```

**Rate Limiting:**

GitHub rate limits:
- **Authenticated:** 5,000 requests/hour
- **Unauthenticated:** 60 requests/hour

**Rate Limit Headers:**
```http
X-RateLimit-Limit: 5000
X-RateLimit-Remaining: 4999
X-RateLimit-Reset: 1234567890
```

**Handling Rate Limit:**
```typescript
if (response.status === 403) {
  const remaining = response.headers.get('X-RateLimit-Remaining')
  if (remaining === '0') {
    const reset = response.headers.get('X-RateLimit-Reset')
    const resetDate = new Date(parseInt(reset) * 1000)
    throw new RateLimitError(resetDate)
  }
}
```

**Show banner to user:**
```typescript
dispatcher.setBanner({
  type: BannerType.RateLimited,
  resetTime: resetDate
})
```

## Success Criteria

At the end of Phase 4, you should have:

1. ✅ OAuth authentication for GitHub.com
2. ✅ OAuth authentication for GitHub Enterprise
3. ✅ Secure token storage
4. ✅ Sign-in UI flow
5. ✅ Sign-out functionality
6. ✅ Multiple accounts support
7. ✅ Account management (add, remove, switch)
8. ✅ GitHub API client for REST endpoints
9. ✅ GitHub API client for GraphQL
10. ✅ Repository metadata fetching
11. ✅ Link local repository to GitHub repository
12. ✅ Account-repository association
13. ✅ API error handling
14. ✅ Rate limit detection
15. ✅ Invalid token handling

## What This Phase Does NOT Include

- Pull request creation/management (Phase 7)
- Issue management (Phase 7)
- CI/CD checks (Phase 7)
- Repository rules (Phase 7)
- Fork management (Phase 7)
- Publishing repositories
- Organization repository browsing

## Key Files to Reference

```
app/src/lib/
  ├── api.ts                           (GitHub API client - 2,000+ lines)
  ├── stores/
  │   ├── accounts-store.ts            (Account management)
  │   ├── sign-in-store.ts             (OAuth flow - 150+ lines)
  │   └── token-store.ts               (Secure token storage)
  │
  ├── get-account-for-repository.ts    (Account association)
  └── endpoint-capabilities.ts         (Endpoint detection)

app/src/models/
  ├── account.ts                       (Account model - 100 lines)
  └── github-repository.ts             (GitHub repo model)

app/src/ui/
  ├── sign-in/                         (Sign-in UI components)
  └── invalidated-token/               (Token error handling)
```

## Technology-Specific Implementation Notes

### OAuth Callback URL

**Electron:**
- Register custom protocol: `x-github-desktop-auth://`
- Use `app.setAsDefaultProtocolClient('x-github-desktop-auth')`
- Listen for `open-url` event

**Tauri:**
- Register custom protocol in `tauri.conf.json`
- Use deep linking API
- Handle in Rust backend

**Wails:**
- Platform-specific protocol registration
- Handle in Go backend

**Web-based:**
- Use standard OAuth redirect URL
- Redirect to `/auth/callback` route
- Extract code from URL parameters

### Secure Storage

**Electron (current):**
- Use `keytar` library

**Tauri:**
- Use `tauri-plugin-keyring` or similar
- Platform-specific secure storage

**Wails:**
- Use Go keyring library
- Platform-specific implementation

**Web-based:**
- **Cannot store tokens securely client-side**
- Must use backend API
- Store tokens server-side
- Use HTTP-only secure cookies

## Security Considerations

**Token Handling:**
- Never log tokens
- Never expose tokens in UI
- Clear tokens from memory after use
- Use HTTPS for all API requests

**CSRF Protection:**
- Generate random state for OAuth
- Validate state in callback
- Reject mismatched state

**Certificate Validation:**
- Validate SSL certificates
- Allow user to bypass for self-signed certs (Enterprise)
- Store bypass decisions per-endpoint

## Estimated Complexity

**Time Estimate:** 5-7 days for experienced developer
**Difficulty:** Medium-High
**Critical Path:** OAuth flow must work correctly; token storage must be secure

## Dependencies

- **Phase 1** - IPC foundation
- **Phase 2** - Git operations (for remote detection)
- **Phase 3** - UI and state management

## Next Phase Preview

Phase 5 will implement advanced Git operations including merge conflict resolution, rebasing, cherry-picking, stashing, and tagging.
