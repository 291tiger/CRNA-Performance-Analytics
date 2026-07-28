# Start Here: CRNA Performance Analytics 2.0

## Install or update

1. Build the repository with `npm ci` and `npm run build:ci`, or download the `PluginZip.zip` artifact from the GitHub Actions build.
2. In RemNote, open the plugin manager and install or update using `PluginZip.zip`.
3. Enable **CRNA Performance Analytics**.

## Use it

1. Focus the course, lecture, topic, folder, or document you want analyzed.
2. Click **CRNA Analytics** in the sidebar, or use Command-K and run **Open CRNA Performance Analytics**.
3. Click **Use as review scope** in the dashboard.
4. While answering questions, use either:
   - the **CRNA Analytics** queue-toolbar button, or
   - the compact analytics badge beside the flashcard answer controls.

The review-screen badge opens the saved topic scope and highlights the exact current question when RemNote provides its card context.

## What the scores mean

- **Mastery**: evidence-weighted performance for the questions you have reviewed.
- **Confidence**: how much review depth and spacing support that mastery estimate.
- **Coverage**: how much of the selected material has been reviewed and reinforced.
- **Exam Readiness**: mastery adjusted downward when confidence or coverage is incomplete. It is not a predicted exam grade.
- **Priority**: how urgently a question should be reviewed based on failure, evidence, recency, and due status.

## Important limitation

The Lecture / Professor Lens uses your Rem hierarchy and labels. It can identify a folder called “Lecture 6,” “Slide 42,” or “Objective 3,” but it cannot know professor emphasis unless you encode that information in the Rem structure or text.
