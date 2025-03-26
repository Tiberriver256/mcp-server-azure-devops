**AI Agent Task Prompt: Implement Automated Release Workflow**

**Persona:** Act as an expert DevOps Engineer specializing in CI/CD automation and release management.

**Context:** This repository, `azure-devops-mcp`, needs a fully automated release workflow. This workflow will leverage Conventional Commits to manage semantic versioning, generate changelogs, and create GitHub Releases. This automation will improve release consistency, reduce manual effort, and provide clear release history. The designated npm package name for this repository is **`@tiberriver256/mcp-server-azure-devops`**.

**Overall Goal:** Configure the repository to automatically handle versioning, changelog generation, and GitHub releases based on commit message conventions.

**Instructions:** Follow these steps precisely. Use the provided commands exactly unless an error occurs. Verify each step's success before proceeding. Report any errors or ambiguities immediately. Use checkboxes `[ ]` to track progress, replacing `[ ]` with `[x]` upon successful completion of each sub-task.

---

**### Phase 1: Setup Conventional Commits Standards & Enforcement (Local)**
*   **Context:** This phase installs and configures tools to ensure all future commit messages adhere to the Conventional Commits standard, which is foundational for automation.

*   **Task 1: Install Required Tooling**
    *   [x] **Sub-task 1.1:** Navigate to the project's root directory.
    *   [x] **Sub-task 1.2:** Execute the following command to install necessary development dependencies:
        ```bash
        npm install --save-dev @commitlint/cli @commitlint/config-conventional husky commitizen cz-conventional-changelog standard-version
        ```
    *   [x] **Sub-task 1.3:** Verify that the command completed successfully and the listed packages are added to `devDependencies` in `package.json`.

*   **Task 2: Configure `commitlint`**
    *   [x] **Sub-task 2.1:** Create a new file named `commitlint.config.js` in the project root directory.
    *   [x] **Sub-task 2.2:** Add the exact following content to `commitlint.config.js`:
        ```javascript
        // commitlint.config.js
        module.exports = {
          extends: ['@commitlint/config-conventional'],
        };
        ```    *   [x] **Sub-task 2.3:** Verify the file `commitlint.config.js` exists and contains the correct content.

*   **Task 3: Configure `husky` for Commit Message Linting**
    *   [x] **Sub-task 3.1:** Confirm the `prepare` script in `package.json` includes `husky install`. (It should already be present based on prior setup).
    *   [x] **Sub-task 3.2:** Confirm the `.husky/` directory exists at the project root. If not, execute `npx husky install`.
    *   [x] **Sub-task 3.3:** Add the `commit-msg` Git hook by executing the following command:
        ```bash
        npx husky add .husky/commit-msg 'npx --no -- commitlint --edit "$1"'
        ```
    *   [x] **Sub-task 3.4:** Verify the file `.husky/commit-msg` exists and its content matches the command string `'npx --no -- commitlint --edit "$1"'`.

*   **Task 4: Configure `commitizen` for Guided Commits**
    *   [x] **Sub-task 4.1:** Open `package.json`.
    *   [x] **Sub-task 4.2:** Add the following `config` block at the top level of the JSON structure (if it doesn't exist, create it):
        ```json
        // package.json
        {
          // ... other package.json content
          "config": {
            "commitizen": {
              "path": "./node_modules/cz-conventional-changelog"
            }
          }
          // ... other package.json content
        }
        ```
    *   [x] **Sub-task 4.3:** Add the following script to the `scripts` object within `package.json`:
        ```json
        // package.json -> scripts
        "commit": "cz"
        ```
    *   [x] **Sub-task 4.4:** Verify both additions in `package.json` are syntactically correct.

*   **Task 5: Verify Local Commit Enforcement and Guidance**
    *   [x] **Sub-task 5.1:** Create a temporary file (e.g., `touch temp_test.txt`) and stage it (`git add temp_test.txt`).
    *   [x] **Sub-task 5.2:** Attempt an invalid commit: `git commit -m "test setup"`. **Verify that the command fails** and output indicates a commitlint error.
    *   [x] **Sub-task 5.3:** Attempt a valid commit: `git commit -m "chore: test commitlint setup"`. **Verify that the command succeeds**.
    *   [x] **Sub-task 5.4:** Reset the successful commit: `git reset --soft HEAD~1`.
    *   [x] **Sub-task 5.5:** Clean up the temporary file: `git rm --cached temp_test.txt` and `rm temp_test.txt`.
    *   [x] **Sub-task 5.6:** Execute `npm run commit`. **Verify that an interactive prompt appears**, asking questions to build a conventional commit message. Exit the prompt without completing the commit (e.g., using Ctrl+C).

---

**### Phase 2: Setup Release Automation (`standard-version`)**
*   **Context:** This phase configures the tool (`standard-version`) that will read conventional commits, determine the next semantic version, update the package version, and generate the changelog file.

*   **Task 6: Update `package.json` with the Correct Package Name**
    *   [x] **Sub-task 6.1:** Open `package.json`.
    *   [x] **Sub-task 6.2:** Modify the `name` field to exactly match: `@tiberriver256/mcp-server-azure-devops`.
    *   [x] **Sub-task 6.3:** Verify the change is saved correctly.

*   **Task 7: Add `standard-version` Release Scripts to `package.json`**
    *   [x] **Sub-task 7.1:** Open `package.json`.
    *   [x] **Sub-task 7.2:** Add the following scripts to the `scripts` object:
        ```json
        // package.json -> scripts
        "release": "standard-version",
        "release:minor": "standard-version --release-as minor",
        "release:patch": "standard-version --release-as patch",
        "release:major": "standard-version --release-as major",
        "release:dryrun": "standard-version --dry-run"
        ```
    *   [x] **Sub-task 7.3:** Verify the additions are saved correctly.

*   **Task 8: Perform Initial Dry Run Verification**
    *   [x] **Sub-task 8.1:** Ensure there is at least one commit on your current branch with a conventional commit type (`feat:`, `fix:`, `chore:`, etc.). If unsure, create a simple `chore:` commit for testing purposes (e.g., update a comment in a file, commit with `git commit -m "chore: prepare for release dry-run"`).
    *   [x] **Sub-task 8.2:** Execute `npm run release:dryrun` in the terminal.
    *   [x] **Sub-task 8.3:** **Analyze the output:**
        *   Confirm it indicates the commits being processed.
        *   Confirm it suggests the correct next semantic version (e.g., `1.0.0` for the first release, or an appropriate bump based on commit types).
        *   Confirm it displays the content that *would* be added to `CHANGELOG.md`.
        *   Confirm it indicates that no actual changes were made to files (`--dry-run` mode).
    *   [x] **Sub-task 8.4:** Report any errors or unexpected output from the dry run.

---

**### Phase 3: Integrate into CI/CD (GitHub Actions)**
*   **Context:** This phase automates the release process using GitHub Actions. It configures a workflow that runs `standard-version`, pushes the version bump and changelog commit/tag, and creates a GitHub Release entry.

*   **Task 9: Create the Release Workflow File**
    *   [x] **Sub-task 9.1:** Create a directory path `.github/workflows/` if it doesn't exist.
    *   [x] **Sub-task 9.2:** Create a new file named `release.yml` inside `.github/workflows/`.

*   **Task 10: Define Workflow Trigger and Permissions**
    *   [x] **Sub-task 10.1:** Add the following content to `release.yml` to define the trigger and permissions:
        ```yaml
        name: Release Automation

        on:
          workflow_dispatch: # Allows manual triggering for testing

        permissions:
          contents: write # Allows pushing commits/tags and creating releases
        ```

*   **Task 11: Implement Workflow Steps for Release**
    *   [x] **Sub-task 11.1:** Add a job named `release` that runs on `ubuntu-latest`.
        ```yaml
        jobs:
          release:
            runs-on: ubuntu-latest
            steps:
        ```
    *   [x] **Sub-task 11.2:** Add the Checkout step, ensuring `fetch-depth: 0`.
        ```yaml
              - name: Checkout code
                uses: actions/checkout@v3
                with:
                  fetch-depth: 0 # Fetch all history for standard-version
                  token: ${{ secrets.GITHUB_TOKEN }}
        ```
    *   [x] **Sub-task 11.3:** Add the Setup Node.js step.
        ```yaml
              - name: Setup Node.js
                uses: actions/setup-node@v3
                with:
                  node-version: 'lts/*' # Use the project's LTS Node version
        ```
    *   [x] **Sub-task 11.4:** Add the Install Dependencies step.
        ```yaml
              - name: Install Dependencies
                run: npm ci
        ```
    *   [x] **Sub-task 11.5:** Add the Configure Git step.
        ```yaml
              - name: Configure Git
                run: |
                  git config user.name "github-actions[bot]"
                  git config user.email "github-actions[bot]@users.noreply.github.com"
        ```
    *   [x] **Sub-task 11.6:** Add the Run `standard-version` step. Decide if `--first-release` is needed based on whether tags already exist. Use a dynamic approach if possible, otherwise, you might need to manually run the first release or adjust this step. For now, use a standard release command.
        ```yaml
              - name: Create Release Bump and Changelog
                run: npm run release -- --commit-all # standard-version determines version based on commits
                # Add --first-release if this is the absolute first tag/release
        ```
    *   [x] **Sub-task 11.7:** Add the Push Changes step.
        ```yaml
              - name: Push changes and tags
                run: git push --follow-tags origin main
                # Ensure this pushes to the correct branch (e.g., main)
        ```

*   **Task 12: Add GitHub Release Creation Step**
    *   [x] **Sub-task 12.1:** Add the step using `softprops/action-gh-release@v1` after the push step. Use `generate_release_notes: true` for automatic notes based on conventional commits.
        ```yaml
              - name: Create GitHub Release
                uses: softprops/action-gh-release@v1
                # This action runs implicitly on tag push, which is handled by the previous step.
                # If you want more control, you can extract the tag version and trigger explicitly.
                env:
                  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
                with:
                  generate_release_notes: true # Use conventional commits for release notes
        ```
    *   [x] **Sub-task 12.2:** Verify the complete `release.yml` file structure and syntax.

---

**### Phase 4: Documentation & Finalization**
*   **Context:** This phase ensures that the new release process is documented for human developers and that the AI agent's own operating rules are updated.

*   **Task 13: Update Developer Documentation**
    *   [x] **Sub-task 13.1:** Locate or create a `CONTRIBUTING.md` file.
    *   [x] **Sub-task 13.2:** Add a section explaining the requirement to use **Conventional Commits** for all commit messages.
    *   [x] **Sub-task 13.3:** Explain the purpose and usage of the `npm run commit` command for guided commits.
    *   [x] **Sub-task 13.4:** Briefly describe the automated release workflow triggered by the GitHub Action (mention it's currently manual via `workflow_dispatch`, but can be changed later, e.g., on merges to `main`).

*   **Task 14: Update AI Agent Rules (`.clinerules` / `startup.xml`)**
    *   [x] **Sub-task 14.1:** Open `.clinerules` (or the relevant AI instruction file).
    *   [x] **Sub-task 14.2:** Add a prominent, **mandatory rule** stating: `All git commits MUST adhere to the Conventional Commits specification (https://www.conventionalcommits.org/). Example: 'feat: implement user login' or 'fix: resolve calculation error'.`
    *   [x] **Sub-task 14.3:** If feasible for the agent, add a recommendation or rule: `Use 'npm run commit' to create commit messages interactively, ensuring compliance.` If not feasible, emphasize strict adherence to the format in its generated messages.

*   **Task 15: Commit All Changes**
    *   [ ] **Sub-task 15.1:** Stage all the files modified or created during this process (`package.json`, `commitlint.config.js`, `.husky/commit-msg`, `.github/workflows/release.yml`, `CONTRIBUTING.md`, `.clinerules`, etc.).
    *   [ ] **Sub-task 15.2:** Create a final commit using a valid Conventional Commit message. Use `npm run commit` or `git commit -m "feat: implement automated release workflow"` (adjust type/scope if needed, e.g., `chore:` if considered maintenance).

---

**Final Verification Instruction:** After committing the changes, manually trigger the `Release Automation` workflow from the GitHub Actions UI on your branch (or `main` after merging). Confirm its successful execution, including version bump, changelog update, commit/tag push, and GitHub Release creation. Report the final status.