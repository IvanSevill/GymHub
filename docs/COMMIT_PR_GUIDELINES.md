# Git Best Practices: Commit and Pull Request Guidelines for GymHub

Adhering to these guidelines ensures a clean, understandable, and maintainable Git history, facilitating collaboration and code reviews.

## Commit Guidelines

We use **Conventional Commits** for consistent commit messages. Each commit message should be structured as follows:

```
<type>(<scope>): <short description>

[optional body]

[optional footer(s)]
```

### Type

The `type` is mandatory and should be one of the following:

*   **`feat`**: A new feature. (e.g., `feat: add user profile page`)
*   **`fix`**: A bug fix. (e.g., `fix: correct workout date parsing`)
*   **`docs`**: Documentation only changes. (e.g., `docs: update README with setup instructions`)
*   **`style`**: Changes that do not affect the meaning of the code (white-space, formatting, missing semicolons, etc.). (e.g., `style: format code with prettier`)
*   **`refactor`**: A code change that neither fixes a bug nor adds a feature. (e.g., `refactor: extract authentication logic to service`)
*   **`test`**: Adding missing tests or correcting existing tests. (e.g., `test: add unit tests for workout creation`)
*   **`chore`**: Other changes that don't modify src or test files. (e.g., `chore: update npm dependencies`)
*   **`perf`**: A code change that improves performance. (e.g., `perf: optimize database queries for analytics`)
*   **`ci`**: Changes to our CI configuration files and scripts. (e.g., `ci: add GitHub Actions workflow for linting`)
*   **`build`**: Changes that affect the build system or external dependencies (e.g., pip, npm). (e.g., `build: update FastAPI version`)
*   **`revert`**: Reverts a previous commit. (e.g., `revert: feat: add new feature`)

### Scope (Optional)

The `scope` provides additional contextual information. It can be anything specifying the place of the commit change. For example: `backend`, `frontend`, `auth`, `workouts`, `database`, `ui`, `analytics`, `deps`.

### Short Description

*   Use the imperative mood ("add", "change", "fix") not past tense ("added", "changed", "fixed").
*   Do not capitalize the first letter.
*   No period at the end.
*   Keep it concise (max 72 characters).

### Body (Optional)

*   Provide more detailed contextual information about the commit.
*   Explain *why* the change was made, *what* problem it solves, and *how* it was implemented.
*   Wrap at 72 characters.

### Footer (Optional)

*   Reference GitHub issues, e.g., `Closes #123`, `Fixes #456`, `Ref #789`.

**Example Commit Messages:**

```
feat(backend): add /health endpoint

This endpoint provides a basic health check for the FastAPI application.
It returns a JSON response with status "ok".
```

```
fix(frontend): resolve calendar event display bug

The calendar events were not displaying correctly due to an incorrect
date formatting in the frontend component. This commit updates the
formatting to match the backend ISO standard.

Closes #201
```

---

## Pull Request Guidelines

Pull Requests (PRs) are central to our collaborative development process. Follow these guidelines for effective PRs:

### 1. Descriptive Title

*   The PR title should be concise and clearly summarize the purpose of the PR. It can follow the Conventional Commit style if it represents a single, cohesive change.

### 2. Detailed Description

The PR description should include the following sections:

*   **Summary:** A high-level overview of what the PR does.
*   **Motivation:** Explain the problem this PR solves or the feature it introduces. Why is this change necessary?
*   **Changes Made:** List the specific changes, especially if they are complex or touch multiple files/components. Be explicit.
*   **Screenshots/Videos (for UI changes):** Crucial for visual changes. Provide clear images or short videos demonstrating the feature or fix.
*   **Testing Steps:** Provide clear, step-by-step instructions on how reviewers can test the changes.
*   **Related Issues:** Link to any relevant GitHub issues using keywords like `Closes #XXX`, `Fixes #YYY`, `Resolves #ZZZ`.

### 3. Small, Focused PRs

*   Aim for PRs that are easy to review. Large PRs are harder to understand and review thoroughly, increasing the risk of bugs.
*   If a feature is large, break it down into smaller, logical PRs (e.g., "backend API for feature X", "frontend UI for feature X").

### 4. Code Quality & Standards

*   Ensure your code adheres to project conventions (formatting, naming, style).
*   Run linters (`ruff check` for Python, `prettier` for JavaScript/TypeScript), type checkers (`mypy`, `tsc`), and tests locally before submitting.
*   Address any automated CI/CD checks that fail.

### 5. Code Review

*   Be open to constructive feedback during code review.
*   Address review comments promptly and update the PR as needed.
*   Avoid approving your own PRs.

### 6. Branching Strategy

We will use a **GitHub Flow**-like branching strategy:

*   **`main` branch**: Always production-ready. All features and bug fixes are branched off `main` and merged back into `main` via PRs.
*   **Feature branches**: Create a new branch for each feature or bug fix (e.g., `feat/add-dark-mode`, `fix/login-bug`).
*   **No direct commits to `main`**: All changes must go through a pull request and code review.
