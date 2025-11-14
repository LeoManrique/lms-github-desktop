# Phase 7: Pull Request Management

## Overview

Implements pull request viewing, creation, and management including CI checks, reviews, and repository rules.

## Prerequisites

- Phases 1-6 completed

## Technology-Agnostic Requirements

### 1. Pull Request Model

**Reference:** `app/src/models/pull-request.ts`

```typescript
interface PullRequest {
  number: number
  title: string
  body: string
  state: 'open' | 'closed' | 'merged'
  author: Author
  createdAt: Date
  updatedAt: Date
  head: {
    ref: string        // Branch name
    sha: string        // Commit SHA
    repo: Repository
  }
  base: {
    ref: string
    sha: string
    repo: Repository
  }
  isDraft: boolean
  labels: string[]
  reviewers: Author[]
  reviewStatus: 'approved' | 'changes_requested' | 'review_required' | null
}
```

### 2. Fetch Pull Requests

**API Call:**
```http
GET /repos/:owner/:repo/pulls?state=all&per_page=100
Authorization: Bearer TOKEN
```

**Storage:**
- Cache in PullRequestDatabase (IndexedDB)
- Background refresh every 5 minutes
- Manual refresh on user action

**Reference:** `app/src/lib/stores/pull-request-store.ts`

### 3. Pull Request List UI

**Reference:** `app/src/ui/pull-request-list/`

**Features:**
- Filter by state (open/closed/all)
- Search by title/number
- Sort by updated/created date
- Show CI check status
- Show review status
- Draft PR indicator

**List Item Display:**
- PR number (#123)
- Title
- Author avatar
- Created/updated timestamp
- CI status badge
- Review status badge
- Comment count

### 4. Pull Request Detail View

**Reference:** `app/src/ui/pull-request/`

**Sections:**

**Header:**
- PR number and title
- Author and timestamp
- State badge (open/merged/closed)
- Draft indicator

**Description:**
- Markdown-rendered body
- Edit button (if author)

**Metadata:**
- Base and head branches
- Merge status (can merge, conflicts, etc.)
- Labels
- Reviewers
- Assignees

**Checks:**
- CI/CD check runs
- Status (pending, success, failure)
- Required checks indicator
- Link to check details on GitHub
- Rerun button (if permissions)

**Review Status:**
- Approved count
- Changes requested count
- Pending reviews

**Changed Files:**
- File list with additions/deletions
- Click to view diff
- Tree view or list view

**Commits:**
- Commit list in PR
- Click to view commit details

**Actions:**
- Merge button (if can merge)
- Close button
- Reopen button (if closed)
- View on GitHub button

### 5. Create Pull Request

**Reference:** `app/src/ui/open-pull-request/`

**Flow:**

1. **Detect Branches:**
   - Current branch (head)
   - Default branch or selected base

2. **Validation:**
   - Branch has commits to push
   - Branch has upstream or can set one
   - Not already a PR for this branch

3. **PR Form:**
   - Title (auto-filled from commit message)
   - Description (template support)
   - Base branch selector
   - Draft PR checkbox
   - Reviewers selector (via API)
   - Labels selector

4. **Create:**
```http
POST /repos/:owner/:repo/pulls
{
  "title": "Fix bug in parser",
  "body": "Description...",
  "head": "feature-branch",
  "base": "main",
  "draft": false
}
```

5. **Post-Creation:**
   - Show success message
   - Navigate to PR view
   - Refresh PR list

### 6. CI/CD Check Runs

**Reference:** `app/src/lib/ci-checks/`

**Fetch Check Runs:**
```http
GET /repos/:owner/:repo/commits/:sha/check-runs
```

**Check Run Model:**
```typescript
interface IRefCheck {
  id: number
  name: string                    // "Build", "Test", "Lint"
  status: 'queued' | 'in_progress' | 'completed'
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | null
  description: string
  appName: string                 // GitHub App name
  htmlUrl: string                 // Link to details
  startedAt: Date
  completedAt: Date | null
}
```

**Combined Check Status:**
```typescript
enum CombinedCheckState {
  Success,    // All checks passed
  Failure,    // One or more failed
  Pending,    // Checks running
  None,       // No checks
}
```

**Display:**
- Check list in PR view
- Status icons (✓, ✗, ○)
- Click to open check on GitHub
- Required check indicator

**Rerun Check:**
```http
POST /repos/:owner/:repo/check-runs/:id/rererun
```

### 7. Repository Rules

**Reference:** `app/src/models/repo-rules.ts`

**Fetch Repository Rulesets:**
```http
GET /repos/:owner/:repo/rulesets
```

**Rule Types:**
- Required status checks
- Required reviews
- Restrict pushes
- Restrict deletions
- Block force pushes
- Required signatures

**Display:**
Show in repository settings and PR view when rules block actions.

### 8. Fork Contribution Workflow

**Reference:** `app/src/ui/forks/`

**Fork Detection:**
If repository is a fork, determine contribution target:
- Contribute to parent (upstream)
- Contribute to fork (own copy)

**Choose Fork Settings Dialog:**
```typescript
enum ForkContributionTarget {
  Parent,   // PRs go to upstream
  Self,     // PRs go to fork
}
```

**Impact:**
- PR base branch selection
- Push target
- Default remote

**Fetch Upstream:**
Add upstream remote and fetch:
```bash
git remote add upstream <parent-url>
git fetch upstream
```

### 9. Pull Request Suggested Next Action

**Reference:** `app/src/models/pull-request.ts`

**Heuristic for what user should do:**
```typescript
enum PullRequestSuggestedNextAction {
  ReviewChanges,       // You're a reviewer
  MergePullRequest,    // Can merge
  UpdateBranch,        // Behind base branch
  PushCommits,         // Local commits not pushed
  CreatePullRequest,   // No PR for this branch yet
}
```

**Displayed in PR banner** to guide user.

### 10. Secret Scanning & Push Protection

**Reference:** `app/src/ui/secret-scanning/`

**Push Protection Error:**
When pushing secrets, GitHub blocks:
```
remote: error: GH013: Secret detected
```

**Detected Secret Model:**
```typescript
interface ISecretScanResult {
  token: string         // Redacted token
  type: string          // "aws_access_key", "github_token", etc.
  url: string          // Link to docs
}
```

**Bypass Dialog:**
User can request bypass with reason:
- Will fix later
- False positive
- Test data
- Used in tests

**Bypass API:**
```http
POST /repos/:owner/:repo/secret-scanning/protection-bypasses
{
  "reason": "will_fix_later",
  "note": "User explanation"
}
```

After bypass approved, allow push.

### 11. Notifications

**Reference:** `app/src/lib/notifications/`

**Notification Types:**
- PR review requested
- PR approved
- PR changes requested
- PR comment
- PR merged
- PR closed
- Check failed

**Desktop Notifications:**
Show system notification with:
- Title
- Body text
- PR number
- Click action (open PR in app)

**Implementation:**
```typescript
showNotification(
  'Pull Request Review',
  'Alice approved PR #123',
  { type: 'pull-request-review', prNumber: 123 }
)
```

On click: navigate to PR view.

## Success Criteria

1. ✅ Fetch and cache pull requests
2. ✅ List pull requests with filtering/search
3. ✅ View PR details
4. ✅ View changed files and diffs
5. ✅ View CI check status
6. ✅ Rerun failed checks
7. ✅ Create new pull request
8. ✅ PR form with templates
9. ✅ Fork contribution workflow
10. ✅ Repository rules display
11. ✅ Secret scanning push protection
12. ✅ Desktop notifications for PR events

## What This Phase Does NOT Include

- Inline PR review/comments (view on GitHub)
- PR merge from Desktop (redirect to GitHub)
- Issue management (separate feature)
- Project boards
- Milestones

## Key Files

```
app/src/lib/
  ├── stores/pull-request-store.ts
  ├── ci-checks/
  ├── notifications/
  └── api.ts (PR endpoints)

app/src/ui/
  ├── pull-request/
  ├── pull-request-list/
  ├── open-pull-request/
  ├── forks/
  ├── secret-scanning/
  └── notifications/

app/src/models/
  ├── pull-request.ts
  ├── repo-rules.ts
  └── ci-checks.ts
```

## Estimated Complexity

**Time:** 8-10 days
**Difficulty:** Medium-High

## Dependencies

- Phases 1-6

## Next Phase

Phase 8: Developer Tools Integration
