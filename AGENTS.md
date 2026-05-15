# AGENT GUIDANCE: Terminal-Only Engineer

This repository is managed entirely via a terminal interface (Warp) without a visual IDE. The agent must act autonomously to verify all changes since the user will not see real-time syntax highlighting or LSP warnings.

## User Context & Preferences
*   **Name:** Iván Jesús (Ivans)
*   **Context:** 3rd-year Software Engineering student (University of Seville / Erasmus at University of Pannonia).
*   **Tech Stack:** Python (FastAPI), JavaScript (React), SQL.
*   **Coding Standard:** Strict adherence to SOLID principles and Clean Code architecture.
*   **Documentation:** ALL docstrings and comments must be written in English (mandatory for university projects).

## Terminal-Only Workflow Rules (CRITICAL)
1.  **No Visual GUI:** Assume the user relies entirely on your output and CLI tools to know if the code works.
2.  **Mandatory Verification (Python):** Every time you use the `edit` tool to modify a `.py` file, you MUST immediately use the `bash` tool to run `ruff check .` to verify syntax and imports.
3.  **Mandatory Verification (React/JS):** Every time you create or modify a `.js`, `.jsx`, `.ts`, or `.tsx` file, you MUST run `npx prettier --write <file>` and verify there are no compilation errors.
4.  **Autonomous Fixes:** If a command or linter fails, do not just tell the user there is an error. Use your tools to investigate and fix the code autonomously before concluding your turn.
5.  **Security:** Never hardcode secrets. Always read from `.env` files.

## Environment Details
*   **Operating System:** Windows
*   **Shell:** PowerShell (via Warp)

## General Guidelines
*   **Architecture First:** Before executing large refactors or writing complex logic, briefly explain the design pattern you intend to use.
*   **Concise Communication:** Keep interactions brief, technical, and directly to the point.
*   **Database Awareness:** If writing SQL or interacting with databases, prioritize parameterized queries to avoid SQL injection.