# Fluxline Kanban

A high-end Kanban Task Manager built with vanilla HTML, CSS, and JavaScript.

This implementation is mobile-first (360px baseline), fully responsive, keyboard-accessible, and designed with a unique productivity-minimal identity using:

- Primary: `#2563EB`
- Accent: `#F43F5E`

## Tech

- Vanilla HTML/CSS/JS
- SortableJS via CDN
- Day.js via CDN (optional date normalization)

## Run

Open `index.html` directly in a browser.

No build step is required.

## File Structure

- `index.html`
- `css/style.css`
- `js/app.js`
- `README.md`

## Product Features

- Columns: Backlog / In Progress / Done
- Task fields:
  - title
  - description
  - priority
  - due date
  - tags
  - subtasks checklist
- Create/Edit modal with validation
- Drag-and-drop between columns (SortableJS)
- Keyboard fallback for moving selected tasks:
  - task action buttons (`◀` and `▶`)
  - shortcuts: `Alt+Left`, `Alt+Right`, `[` and `]`
- Advanced filters:
  - priority
  - due date (`overdue`, `this week`)
  - tags
- Search across title, description, tags, subtasks
- Toast notification system
- Empty states for each lane
- Loading state on initial board render
- Dark/light toggle with persistence
- Mobile bottom-sheet filters UI
- Reduced motion support (`prefers-reduced-motion`)

## Accessibility

- Focusable task cards with keyboard interaction
- Modal focus trap with `Tab` / `Shift+Tab`
- Escape key closes active modal/sheet
- `Ctrl+Enter` (or `Cmd+Enter`) saves task from modal
- ARIA labels and live region toasts

## Keyboard Shortcuts

- `N`: New task modal
- `/`: Focus search
- `Ctrl+Enter` or `Cmd+Enter`: Save in modal
- `Alt+Left` / `Alt+Right`: Move selected task between columns
- `[` / `]`: Move selected task between columns

## localStorage Schema Versioning

Storage key:

- `fluxline-kanban-store`

Current schema:

```json
{
  "version": 1,
  "savedAt": "ISO timestamp",
  "theme": "light|dark",
  "ui": {
    "search": "string",
    "filters": {
      "priority": "all|low|medium|high",
      "due": "all|overdue|week",
      "tags": ["tag"]
    }
  },
  "tasks": [
    {
      "id": "task-...",
      "title": "string",
      "description": "string",
      "priority": "low|medium|high",
      "dueDate": "YYYY-MM-DD",
      "tags": ["tag"],
      "subtasks": [{ "id": "subtask-...", "text": "string", "done": true }],
      "status": "backlog|in-progress|done",
      "order": 1,
      "createdAt": "ISO timestamp",
      "updatedAt": "ISO timestamp"
    }
  ]
}
```

Migration behavior:

- Legacy array/object payloads are normalized.
- Invalid task fields are sanitized.
- Data is re-saved in the current version after hydration.

Author
HesamCode
Portfolio: https://hesamcode.github.io
