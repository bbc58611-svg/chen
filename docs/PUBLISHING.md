# Publishing the prepared source to GitHub

This package is prepared for a public code repository. It does not publish a hosted website or create a GitHub repository automatically.

1. Extract `momo-github-ready.zip` into a new directory.
2. Sign in to GitHub and create a new **Public** repository, for example `momo-wish-companion`. Leave automatic README, license, and ignore-file generation disabled; this package already includes them.
3. Upload the extracted source files and directories. Do not upload the ZIP as the only repository file. `README.md`, `LICENSE`, `package.json`, `server.cjs`, `dist/`, `backend/`, `test/`, and `docs/` must be at the repository root.
4. Include `.gitignore` and `.env.example`. Do not add a real `.env`, `.local/`, private credential bundles, or old payment records from your working project.
5. Verify that GitHub renders the English README and screenshot and detects the MIT license. Check that the repository is accessible while signed out.
6. Follow `docs/LOCAL_SETUP.md` on a fresh download. Run `node --test test/*.test.cjs`.
7. Arrange private judge test access using `docs/JUDGING.md`. This bundle is not included in the public package. Confirm the handoff with organizers before submitting.
8. Use the public repository URL in the Devpost submission. Paste or adapt `docs/PROJECT_DESCRIPTION.md` for the English project description. Add the separately recorded demonstration video.

The package intentionally omits the old hosting identity, Render deployment template, local runtime data, private credentials, and unrelated workspace history. It contains the source needed for the local evaluation route.
