# Phase 6: UI Component Library

## Overview

This phase implements the complete reusable UI component library that provides the building blocks for all application interfaces. These components ensure consistent styling, behavior, and accessibility across the application.

## Prerequisites

- Phase 1-3 completed (foundation, git ops, basic UI)

## Component Categories

### 1. Form Controls

**Location:** `app/src/ui/lib/`

#### Button (`button.tsx`)
- Primary, secondary, destructive variants
- Disabled state
- Loading state with spinner
- Icon support
- Keyboard navigation

#### TextBox (`text-box.tsx`)
- Standard text input
- Validation states (error, warning)
- Placeholder text
- Label and caption
- Auto-focus
- Character limits

#### TextArea (`text-area.tsx`)
- Multi-line text input
- Auto-resize based on content
- Character count
- Row limits

#### Checkbox (`checkbox.tsx`)
- Checked/unchecked/indeterminate states
- Label support
- Disabled state

#### RadioButton & RadioGroup (`radio-button.tsx`, `radio-group.tsx`)
- Grouped radio selections
- Keyboard navigation (arrow keys)
- Selected state persistence

#### Select (`select.tsx`)
- Dropdown select control
- Custom styling (platform-specific)
- Keyboard navigation

#### ToggleButton (`toggle-button.tsx`)
- ON/OFF toggle switch
- Keyboard accessible
- Labeled

### 2. Advanced Input Components

#### RefNameTextBox (`ref-name-text-box.tsx`)
- Specialized for branch/tag names
- Validation (no spaces, special chars)
- Real-time error display
- Name conflict detection

#### PasswordTextBox (`password-text-box.tsx`)
- Masked password input
- Show/hide toggle
- Strength indicator (optional)

#### FancyTextBox (`fancy-text-box.tsx`)
- Enhanced text box with autocomplete
- Emoji picker integration
- @ mentions support
- Syntax highlighting

### 3. Layout Components

#### Dialog (`dialog/` directory)
- Modal dialog container
- Header, body, footer sections
- Dismiss on escape/backdrop click
- Focus trap
- Stack support (multiple dialogs)

#### Form (`form.tsx`)
- Form container with validation
- Submit handling
- Error display

#### Row (`row.tsx`)
- Horizontal layout helper
- Spacing utilities
- Alignment options

#### HorizontalRule (`horizontal-rule.tsx`)
- Visual separator
- Themed

#### FocusContainer (`focus-container.tsx`)
- Manages focus within container
- Tab trapping for modals
- Focus restoration

### 4. Interactive Components

#### Popover (`popover.tsx`)
- Floating panel attached to trigger
- Positioning (top, bottom, left, right)
- Auto-repositioning when off-screen
- Dismiss on click outside
- Arrow pointing to trigger

**Reference:** `app/src/ui/lib/popover.tsx`

**Example Use:**
```typescript
<Popover
  anchor={buttonRef}
  onClickOutside={handleClose}
>
  <PopoverContent>...</PopoverContent>
</Popover>
```

#### Tooltip (`tooltip.tsx`, `tooltipped-content.tsx`)
- Hover/focus tooltips
- Delay before showing
- Positioning
- Rich content support
- Keyboard accessible

**Reference:** `app/src/ui/lib/tooltip.tsx`

**Usage:**
```typescript
<TooltippedContent tooltip="This is a tooltip">
  <Button>Hover me</Button>
</TooltippedContent>
```

#### PopoverDropdown (`popover-dropdown.tsx`)
- Combines button + popover
- Dropdown menu pattern
- Keyboard navigation

### 5. List Components

#### FilterList (`filter-list.tsx`)
- Virtualized list with search
- Filter bar
- Empty state
- Loading state
- Selection support

**Key Features:**
- Virtual scrolling for performance
- Fuzzy search
- Custom row renderer
- Group headers

#### SectionFilterList (`section-filter-list.tsx`)
- FilterList with sections
- Collapsible sections
- Section counts

#### AugmentedFilterList (`augmented-filter-list.tsx`)
- Enhanced filter with metadata
- Score-based filtering
- Custom filter functions

### 6. Display Components

#### Avatar (`avatar.tsx`)
- User profile pictures
- Fallback to initials
- Size variants (small, medium, large)
- Loading state

**Reference:** `app/src/ui/lib/avatar.tsx`

**Usage:**
```typescript
<Avatar user={user} size={AvatarSize.Medium} />
```

#### AvatarStack (`avatar-stack.tsx`)
- Multiple overlapping avatars
- +N more indicator
- Hover to expand

#### CommitAttribution (`commit-attribution.tsx`)
- Author avatar + name
- Timestamp
- Co-authors
- Compact/expanded modes

#### PathText (`path-text.tsx`)
- File path display
- Truncation in middle
- OS-specific separators

#### PathLabel (`path-label.tsx`)
- Folder icon + path
- Click to reveal in file manager

#### HighlightText (`highlight-text.tsx`)
- Text with highlighted matches
- Used in search results

#### Ref (`ref.tsx`)
- Branch/tag visual representation
- Icon + name
- Color coding

#### RichText (`rich-text.tsx`)
- Formatted text display
- Markdown support
- Link handling
- Emoji rendering

#### SandboxedMarkdown (`sandboxed-markdown.tsx`)
- Render markdown safely
- Sanitization
- GitHub-flavored markdown
- Code syntax highlighting

### 7. Status & Feedback Components

#### Loading (`loading.tsx`)
- Spinner animation
- Size variants
- Themed colors

#### ActionStatusIcon (`action-status-icon.tsx`)
- Success/failure/pending icons
- CI check status
- Color-coded

#### Errors (`errors.tsx`)
- Error message display
- Dismissible
- Icon + message
- Action button (retry, etc.)

#### Banner (see Phase 3)
- Non-modal notifications
- Top of screen
- Auto-dismiss or sticky
- Action buttons

### 8. Specialized Components

#### Draggable (`draggable.tsx`)
- Drag and drop support
- Visual drag element
- Drop zones
- Drag preview

**Reference:** `app/src/ui/lib/draggable.tsx`

**Features:**
- Custom drag preview
- Data transfer
- Drop effects (copy, move, link)

#### ConfigureLockFileExists (`config-lock-file-exists.tsx`)
- Warning about git config lock
- Auto-resolve option

#### GitConfigUserForm (`git-config-user-form.tsx`)
- Name and email input
- Validation
- Global vs local config toggle

#### BranchNameWarnings (`branch-name-warnings.tsx`)
- Invalid branch name warnings
- Suggestions for fixes

### 9. Authentication Components

#### AuthenticationForm (`authentication-form.tsx`)
- Username/password input
- OAuth button
- Enterprise endpoint entry

#### SignIn (`sign-in.tsx`)
- Complete sign-in flow UI
- Step navigation
- Error handling

#### EnterpriseServerEntry (`enterprise-server-entry.tsx`)
- Server URL input
- Validation
- Endpoint detection

### 10. Utility Components

#### CallToAction (`call-to-action.tsx`)
- Prominent action button
- Icon + text
- Primary emphasis

#### LinkButton (`link-button.tsx`)
- Button styled as link
- External link indicator
- Opens in browser

#### DiffMode (`diff-mode.tsx`)
- Toggle between unified/split diff
- Preferences

## Styling Patterns

### BEM Methodology
**Block Element Modifier** naming:

```scss
.button {
  // Block

  &__label {
    // Element
  }

  &--primary {
    // Modifier
  }

  &--disabled {
    // Modifier
  }
}
```

### Theme Variables
All components use CSS custom properties:

```scss
.button {
  background: var(--button-background);
  color: var(--button-foreground);
  border: 1px solid var(--button-border);

  &:hover {
    background: var(--button-background-hover);
  }
}
```

**Defined in:** `app/styles/ui/_variables.scss`

### Platform-Specific Styles

**Conditional classes:**
```typescript
<div className={classNames('dialog', {
  'platform-darwin': __DARWIN__,
  'platform-win32': __WIN32__,
  'platform-linux': __LINUX__,
})} />
```

## Accessibility

### Keyboard Navigation
- All interactive elements keyboard accessible
- Tab order logical
- Focus visible
- Enter/Space to activate

### ARIA Attributes
- `aria-label` for icon-only buttons
- `aria-describedby` for field descriptions
- `aria-invalid` for validation errors
- `role` attributes for custom controls

### Screen Reader Support
- Semantic HTML
- Live regions for dynamic updates
- Descriptive labels

## Reusable Patterns

### Controlled Components
```typescript
interface ITextBoxProps {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (event: React.KeyboardEvent) => void
}

<TextBox
  value={this.state.name}
  onChange={name => this.setState({ name })}
/>
```

### Ref Forwarding
```typescript
const TextBox = React.forwardRef<HTMLInputElement, ITextBoxProps>(
  (props, ref) => {
    return <input ref={ref} {...props} />
  }
)
```

### Compound Components
```typescript
<Dropdown>
  <DropdownButton>Select...</DropdownButton>
  <DropdownMenu>
    <DropdownItem>Option 1</DropdownItem>
    <DropdownItem>Option 2</DropdownItem>
  </DropdownMenu>
</Dropdown>
```

## Component Documentation Pattern

Each component should document:
- Purpose and usage
- Props interface
- Examples
- Accessibility considerations
- Platform differences

## Success Criteria

1. ✅ Complete set of form controls
2. ✅ Consistent styling across all components
3. ✅ Theme support (light/dark)
4. ✅ Keyboard accessibility
5. ✅ ARIA attributes
6. ✅ Reusable and composable
7. ✅ TypeScript types for all props
8. ✅ Loading and error states
9. ✅ Platform-specific adaptations

## Key Files

```
app/src/ui/lib/
  ├── button.tsx
  ├── text-box.tsx
  ├── checkbox.tsx
  ├── select.tsx
  ├── dialog/
  ├── popover.tsx
  ├── tooltip.tsx
  ├── filter-list.tsx
  ├── avatar.tsx
  ├── loading.tsx
  └── [45+ component files]

app/styles/ui/
  ├── _variables.scss
  ├── _mixins.scss
  └── [component styles]
```

## Estimated Complexity

**Time:** 7-10 days
**Difficulty:** Medium

## Dependencies

- Phase 1-3

## Next Phase

Phase 7: Pull Request Management
