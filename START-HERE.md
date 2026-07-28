# Start Here: Browser-Only Installation

You do not need Node.js or a coding program. GitHub Actions will build the plugin online.

1. Create an empty private GitHub repository.
2. Upload every visible project file and folder from this project.
3. GitHub's browser uploader may ignore the hidden `.github` folder. If that happens, create this file directly on GitHub:

   `.github/workflows/build-plugin.yml`

4. Copy and paste the full contents of `BUILD-WORKFLOW-BACKUP.yml` into that GitHub file and commit it.
5. Open the repository's **Actions** tab.
6. Open **Build RemNote Plugin**, then click **Run workflow**.
7. When the run shows a green checkmark, open it and download the artifact named **CRNA-Performance-Analytics-Plugin**.
8. Unzip the downloaded GitHub artifact once. Inside it is `PluginZip.zip`.
9. In RemNote, open Settings → Plugins → Build/Upload Plugin and upload `PluginZip.zip`.
10. Focus a parent Rem and run **Open CRNA Performance Analytics** from RemNote's command menu.

A green GitHub build verifies that the project compiled and produced the expected plugin package. Final runtime verification still occurs when RemNote accepts and opens the plugin.
